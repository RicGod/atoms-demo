import { createClient, type Client } from '@libsql/client'
import { randomUUID } from 'node:crypto'
import type { GenerationMode, TaskSource } from '../../shared/constants.js'

export type TaskRecord = {
  id: string
  email: string
  title: string
  prompt: string
  html: string
  generationMode: GenerationMode
  source: TaskSource
  createdAt: string
  updatedAt: string
}

/** 内存降级存储：未配置 Turso 时仍可本地联调 */
const memory = new Map<string, TaskRecord>()

let client: Client | null = null
let schemaReady = false

/** 测试专用：清空内存仓储，避免用例互相污染 */
export function clearMemoryTasks(): void {
  memory.clear()
}

function getTursoEnv() {
  return {
    url: process.env.TURSO_DATABASE_URL?.trim() ?? '',
    authToken: process.env.TURSO_AUTH_TOKEN?.trim() ?? '',
  }
}

export function isTursoConfigured(): boolean {
  const { url, authToken } = getTursoEnv()
  return Boolean(url && authToken)
}

function getClient(): Client | null {
  if (!isTursoConfigured()) return null
  if (!client) {
    const { url, authToken } = getTursoEnv()
    client = createClient({ url, authToken })
  }
  return client
}

/** 建表：仅存业务字段，禁止密钥 / Score */
async function ensureSchema(): Promise<void> {
  if (schemaReady) return
  const db = getClient()
  if (!db) {
    schemaReady = true
    return
  }
  await db.execute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      title TEXT NOT NULL,
      prompt TEXT NOT NULL,
      html TEXT NOT NULL,
      generation_mode TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
  await db.execute(
    `CREATE INDEX IF NOT EXISTS idx_tasks_email ON tasks(email)`,
  )
  schemaReady = true
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase()
}

function assertNoSecrets(payload: Record<string, unknown>) {
  // 防御：持久化路径不得夹带密钥字段
  const forbidden = [
    'apiKey',
    'api_key',
    'BAILIAN_API_KEY',
    'aliQwen-api', // 本地系统环境变量名，同样禁止入库
    'authToken',
    'TURSO_AUTH_TOKEN',
    'score',
  ]
  for (const key of Object.keys(payload)) {
    if (forbidden.includes(key)) {
      throw new Error(`禁止持久化敏感字段: ${key}`)
    }
  }
}

export async function createTask(input: {
  email: string
  title?: string
  prompt?: string
}): Promise<TaskRecord> {
  await ensureSchema()
  const email = normalizeEmail(input.email)
  if (!email) throw new Error('邮箱不能为空')
  const now = new Date().toISOString()
  const record: TaskRecord = {
    id: randomUUID(),
    email,
    title: input.title?.trim() || '未命名任务',
    prompt: input.prompt?.trim() || '',
    html: '',
    generationMode: 'builtin',
    source: 'single',
    createdAt: now,
    updatedAt: now,
  }
  assertNoSecrets(record as unknown as Record<string, unknown>)

  const db = getClient()
  if (!db) {
    memory.set(record.id, record)
    return record
  }
  await db.execute({
    sql: `INSERT INTO tasks (id, email, title, prompt, html, generation_mode, source, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      record.id,
      record.email,
      record.title,
      record.prompt,
      record.html,
      record.generationMode,
      record.source,
      record.createdAt,
      record.updatedAt,
    ],
  })
  return record
}

export async function listTasks(email: string): Promise<TaskRecord[]> {
  await ensureSchema()
  const normalized = normalizeEmail(email)
  if (!normalized) return []

  const db = getClient()
  if (!db) {
    return [...memory.values()]
      .filter((t) => t.email === normalized)
      .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  }

  const rs = await db.execute({
    sql: `SELECT * FROM tasks WHERE email = ? ORDER BY updated_at DESC`,
    args: [normalized],
  })
  return rs.rows.map(rowToTask)
}

export async function getTask(
  id: string,
  email: string,
): Promise<TaskRecord | null> {
  await ensureSchema()
  const normalized = normalizeEmail(email)
  const db = getClient()
  if (!db) {
    const t = memory.get(id)
    if (!t || t.email !== normalized) return null
    return t
  }
  const rs = await db.execute({
    sql: `SELECT * FROM tasks WHERE id = ? AND email = ? LIMIT 1`,
    args: [id, normalized],
  })
  if (!rs.rows[0]) return null
  return rowToTask(rs.rows[0])
}

/** 覆盖写当前 Artifact（无版本树） */
export async function saveTaskArtifact(input: {
  id: string
  email: string
  prompt: string
  html: string
  generationMode: GenerationMode
  source?: TaskSource
  title?: string
}): Promise<TaskRecord> {
  await ensureSchema()
  const existing = await getTask(input.id, input.email)
  if (!existing) throw new Error('任务不存在或无权访问')

  const updated: TaskRecord = {
    ...existing,
    prompt: input.prompt,
    html: input.html,
    generationMode: input.generationMode,
    source: input.source ?? existing.source,
    title: input.title?.trim() || existing.title || truncate(input.prompt, 40),
    updatedAt: new Date().toISOString(),
  }
  assertNoSecrets(updated as unknown as Record<string, unknown>)

  const db = getClient()
  if (!db) {
    memory.set(updated.id, updated)
    return updated
  }
  await db.execute({
    sql: `UPDATE tasks SET title = ?, prompt = ?, html = ?, generation_mode = ?, source = ?, updated_at = ?
          WHERE id = ? AND email = ?`,
    args: [
      updated.title,
      updated.prompt,
      updated.html,
      updated.generationMode,
      updated.source,
      updated.updatedAt,
      updated.id,
      updated.email,
    ],
  })
  return updated
}

function truncate(s: string, n: number) {
  const t = s.trim()
  return t.length <= n ? t || '未命名任务' : `${t.slice(0, n)}…`
}

function rowToTask(row: Record<string, unknown>): TaskRecord {
  return {
    id: String(row.id),
    email: String(row.email),
    title: String(row.title),
    prompt: String(row.prompt),
    html: String(row.html),
    generationMode: String(row.generation_mode) as GenerationMode,
    source: String(row.source) as TaskSource,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}
