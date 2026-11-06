import { createClient, type Client } from '@libsql/client'
import { randomUUID } from 'node:crypto'
import type { GenerationMode, TaskSource } from '../../shared/constants.js'

/** 与前端工作区对齐的可持久化对话条目 */
export type PersistedChatItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'version'; id: string; n: number; label: string }
  | { kind: 'error'; id: string; text: string }

export type TaskRecord = {
  id: string
  email: string
  title: string
  prompt: string
  html: string
  /** 对话时间线 JSON（覆盖写） */
  chat: PersistedChatItem[]
  generationMode: GenerationMode
  source: TaskSource
  createdAt: string
  updatedAt: string
}

let client: Client | null = null
let schemaReady = false

function getTursoEnv() {
  return {
    url: process.env.TURSO_DATABASE_URL?.trim() ?? '',
    authToken: process.env.TURSO_AUTH_TOKEN?.trim() ?? '',
  }
}

/** 是否已配置 Turso（本地与 Render 均要求 URL + Token） */
export function isTursoConfigured(): boolean {
  const { url, authToken } = getTursoEnv()
  return Boolean(url && authToken)
}

/**
 * 测试专用：关闭并丢弃单例客户端与 schema 标记。
 * 用例切换 env / 换 :memory: 库后必须调用，避免连到旧连接。
 */
export function resetTasksClientForTests(): void {
  // Windows 下不 close 再删 file DB 会 EBUSY；:memory: 也需释放连接
  if (client && !client.closed) {
    client.close()
  }
  client = null
  schemaReady = false
}

/** 未配置时直接失败，不再降级内存 */
function requireClient(): Client {
  if (!isTursoConfigured()) {
    throw new Error(
      '未配置 Turso：请设置 TURSO_DATABASE_URL 与 TURSO_AUTH_TOKEN',
    )
  }
  if (!client) {
    const { url, authToken } = getTursoEnv()
    // authToken 对远程 libsql 必需；本地 file: 测试库也会传入占位值
    client = createClient({ url, authToken })
  }
  return client
}

/** 建表 + 轻量迁移：补 chat_json 列 */
async function ensureSchema(): Promise<void> {
  if (schemaReady) return
  const db = requireClient()
  await db.execute(`
    CREATE TABLE IF NOT EXISTS tasks (
      id TEXT PRIMARY KEY,
      email TEXT NOT NULL,
      title TEXT NOT NULL,
      prompt TEXT NOT NULL,
      html TEXT NOT NULL,
      chat_json TEXT NOT NULL DEFAULT '[]',
      generation_mode TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
  // 步骤：旧库无 chat_json 时补列（已存在则忽略）
  try {
    await db.execute(
      `ALTER TABLE tasks ADD COLUMN chat_json TEXT NOT NULL DEFAULT '[]'`,
    )
  } catch {
    /* duplicate column — ok */
  }
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

/** 校验并裁剪对话，避免脏数据 / 无限膨胀 */
export function normalizeChat(raw: unknown): PersistedChatItem[] {
  if (!Array.isArray(raw)) return []
  const out: PersistedChatItem[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const kind = o.kind
    const id = typeof o.id === 'string' && o.id ? o.id : randomUUID()
    if (kind === 'user' || kind === 'assistant' || kind === 'error') {
      const text = typeof o.text === 'string' ? o.text : ''
      // 步骤：单条过长则截断，防止异常 payload
      out.push({
        kind,
        id,
        text: text.length > 20_000 ? `${text.slice(0, 20_000)}…` : text,
      })
    } else if (kind === 'version') {
      const n = typeof o.n === 'number' && Number.isFinite(o.n) ? o.n : 0
      const label = typeof o.label === 'string' ? o.label : `版本 ${n}`
      out.push({ kind: 'version', id, n, label: label.slice(0, 200) })
    }
  }
  // 步骤：最多保留最近 120 条，控制行体积
  return out.length > 120 ? out.slice(-120) : out
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
    chat: [],
    generationMode: 'builtin',
    source: 'single',
    createdAt: now,
    updatedAt: now,
  }
  assertNoSecrets(record as unknown as Record<string, unknown>)

  const db = requireClient()
  await db.execute({
    sql: `INSERT INTO tasks (id, email, title, prompt, html, chat_json, generation_mode, source, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      record.id,
      record.email,
      record.title,
      record.prompt,
      record.html,
      JSON.stringify(record.chat),
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

  const db = requireClient()
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
  const db = requireClient()
  const rs = await db.execute({
    sql: `SELECT * FROM tasks WHERE id = ? AND email = ? LIMIT 1`,
    args: [id, normalized],
  })
  if (!rs.rows[0]) return null
  return rowToTask(rs.rows[0])
}

/** 覆盖写当前 Artifact + 对话（无版本树） */
export async function saveTaskArtifact(input: {
  id: string
  email: string
  prompt: string
  html: string
  generationMode: GenerationMode
  source?: TaskSource
  title?: string
  chat?: PersistedChatItem[]
}): Promise<TaskRecord> {
  await ensureSchema()
  const existing = await getTask(input.id, input.email)
  if (!existing) throw new Error('任务不存在或无权访问')

  const chat =
    input.chat !== undefined ? normalizeChat(input.chat) : existing.chat

  const updated: TaskRecord = {
    ...existing,
    prompt: input.prompt,
    html: input.html,
    chat,
    generationMode: input.generationMode,
    source: input.source ?? existing.source,
    // 步骤：未显式传 title 时保留原标题，避免被本轮 prompt 覆盖
    title:
      input.title !== undefined
        ? input.title.trim() || existing.title || truncate(input.prompt, 40)
        : existing.title,
    updatedAt: new Date().toISOString(),
  }
  assertNoSecrets(updated as unknown as Record<string, unknown>)

  const db = requireClient()
  await db.execute({
    sql: `UPDATE tasks SET title = ?, prompt = ?, html = ?, chat_json = ?, generation_mode = ?, source = ?, updated_at = ?
          WHERE id = ? AND email = ?`,
    args: [
      updated.title,
      updated.prompt,
      updated.html,
      JSON.stringify(updated.chat),
      updated.generationMode,
      updated.source,
      updated.updatedAt,
      updated.id,
      updated.email,
    ],
  })
  return updated
}

/** 按邮箱删除项目；无权或不存在则抛错 */
export async function deleteTask(id: string, emailRaw: string): Promise<void> {
  await ensureSchema()
  const email = normalizeEmail(emailRaw)
  if (!email) throw new Error('邮箱不能为空')
  const existing = await getTask(id, email)
  if (!existing) throw new Error('任务不存在或无权访问')
  const db = requireClient()
  await db.execute({
    sql: `DELETE FROM tasks WHERE id = ? AND email = ?`,
    args: [id, email],
  })
}

function truncate(s: string, n: number) {
  const t = s.trim()
  return t.length <= n ? t || '未命名任务' : `${t.slice(0, n)}…`
}

function rowToTask(row: Record<string, unknown>): TaskRecord {
  let chat: PersistedChatItem[] = []
  try {
    const raw = row.chat_json
    chat = normalizeChat(
      typeof raw === 'string' ? JSON.parse(raw || '[]') : raw ?? [],
    )
  } catch {
    chat = []
  }
  return {
    id: String(row.id),
    email: String(row.email),
    title: String(row.title),
    prompt: String(row.prompt),
    html: String(row.html),
    chat,
    generationMode: String(row.generation_mode) as GenerationMode,
    source: String(row.source) as TaskSource,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}
