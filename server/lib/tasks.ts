import { createClient, type Client } from '@libsql/client'
import { randomUUID } from 'node:crypto'
import type { GenerationMode, TaskSource } from '../../shared/constants.js'
import {
  migrateVersionsIfNeeded,
  normalizeVersions,
  type TaskVersionSnapshot,
} from '../../shared/versions.js'

/** 与前端工作区对齐的可持久化对话条目 */
export type PersistedChatItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'version'; id: string; n: number; label: string }
  | { kind: 'error'; id: string; text: string }
  | { kind: 'system'; id: string; text: string }

export type TaskRecord = {
  id: string
  email: string
  title: string
  prompt: string
  html: string
  /** 线性 Version 快照（含历史 HTML） */
  versions: TaskVersionSnapshot[]
  /** 当前 Version 序号；0 表示尚无 */
  currentVersionN: number
  /** 对话时间线 JSON */
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
    client = createClient({ url, authToken })
  }
  return client
}

/** 建表 + 轻量迁移：chat_json / versions_json / current_version_n */
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
      versions_json TEXT NOT NULL DEFAULT '[]',
      current_version_n INTEGER NOT NULL DEFAULT 0,
      generation_mode TEXT NOT NULL,
      source TEXT NOT NULL,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    )
  `)
  // 步骤：旧库逐列补齐（已存在则忽略）
  for (const sql of [
    `ALTER TABLE tasks ADD COLUMN chat_json TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE tasks ADD COLUMN versions_json TEXT NOT NULL DEFAULT '[]'`,
    `ALTER TABLE tasks ADD COLUMN current_version_n INTEGER NOT NULL DEFAULT 0`,
  ]) {
    try {
      await db.execute(sql)
    } catch {
      /* duplicate column — ok */
    }
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
  const forbidden = [
    'apiKey',
    'api_key',
    'BAILIAN_API_KEY',
    'aliQwen-api',
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
    if (
      kind === 'user' ||
      kind === 'assistant' ||
      kind === 'error' ||
      kind === 'system'
    ) {
      const text = typeof o.text === 'string' ? o.text : ''
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
    versions: [],
    currentVersionN: 0,
    chat: [],
    generationMode: 'builtin',
    source: 'single',
    createdAt: now,
    updatedAt: now,
  }
  assertNoSecrets(record as unknown as Record<string, unknown>)

  const db = requireClient()
  await db.execute({
    sql: `INSERT INTO tasks (id, email, title, prompt, html, chat_json, versions_json, current_version_n, generation_mode, source, created_at, updated_at)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    args: [
      record.id,
      record.email,
      record.title,
      record.prompt,
      record.html,
      JSON.stringify(record.chat),
      JSON.stringify(record.versions),
      record.currentVersionN,
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
  // 步骤：打开时惰性迁移旧数据（仅有 html、无 versions）
  const task = rowToTask(rs.rows[0])
  return persistLazyMigration(task)
}

/** 若发生惰性升级则写回 DB，保证下次打开一致 */
async function persistLazyMigration(task: TaskRecord): Promise<TaskRecord> {
  const migrated = migrateVersionsIfNeeded({
    html: task.html,
    prompt: task.prompt,
    versions: task.versions,
    currentVersionN: task.currentVersionN,
  })
  const changed =
    migrated.versions.length !== task.versions.length ||
    migrated.currentVersionN !== task.currentVersionN ||
    migrated.html !== task.html
  if (!changed) return task

  const updated: TaskRecord = {
    ...task,
    html: migrated.html,
    versions: migrated.versions,
    currentVersionN: migrated.currentVersionN,
    updatedAt: new Date().toISOString(),
  }
  const db = requireClient()
  await db.execute({
    sql: `UPDATE tasks SET html = ?, versions_json = ?, current_version_n = ?, updated_at = ?
          WHERE id = ? AND email = ?`,
    args: [
      updated.html,
      JSON.stringify(updated.versions),
      updated.currentVersionN,
      updated.updatedAt,
      updated.id,
      updated.email,
    ],
  })
  return updated
}

/** 保存当前 Artifact + Version 列表 + 对话 */
export async function saveTaskArtifact(input: {
  id: string
  email: string
  prompt: string
  html: string
  generationMode: GenerationMode
  source?: TaskSource
  title?: string
  chat?: PersistedChatItem[]
  versions?: TaskVersionSnapshot[]
  currentVersionN?: number
}): Promise<TaskRecord> {
  await ensureSchema()
  const existing = await getTask(input.id, input.email)
  if (!existing) throw new Error('任务不存在或无权访问')

  const chat =
    input.chat !== undefined ? normalizeChat(input.chat) : existing.chat

  // 步骤：客户端若带 versions 则规范化；否则在现有基础上用 html 兜底迁移
  let versions: TaskVersionSnapshot[]
  let currentVersionN: number
  let html: string

  if (input.versions !== undefined) {
    currentVersionN =
      typeof input.currentVersionN === 'number' &&
      Number.isFinite(input.currentVersionN)
        ? Math.floor(input.currentVersionN)
        : existing.currentVersionN
    versions = normalizeVersions(input.versions, currentVersionN)
    const synced = migrateVersionsIfNeeded({
      html: input.html,
      prompt: input.prompt,
      versions,
      currentVersionN,
    })
    versions = synced.versions
    currentVersionN = synced.currentVersionN
    html = synced.html || input.html
  } else {
    const synced = migrateVersionsIfNeeded({
      html: input.html,
      prompt: input.prompt,
      versions: existing.versions,
      currentVersionN: existing.currentVersionN,
    })
    // 步骤：未传 versions 时，用新 html 更新 Current 快照内容（兼容旧客户端）
    if (synced.versions.length > 0 && synced.currentVersionN >= 1) {
      versions = synced.versions.map((v) =>
        v.n === synced.currentVersionN
          ? { ...v, html: input.html, promptSummary: v.promptSummary }
          : v,
      )
      currentVersionN = synced.currentVersionN
      html = input.html
    } else {
      versions = synced.versions
      currentVersionN = synced.currentVersionN
      html = input.html
    }
    versions = normalizeVersions(versions, currentVersionN)
  }

  const updated: TaskRecord = {
    ...existing,
    prompt: input.prompt,
    html,
    versions,
    currentVersionN,
    chat,
    generationMode: input.generationMode,
    source: input.source ?? existing.source,
    title:
      input.title !== undefined
        ? input.title.trim() || existing.title || truncate(input.prompt, 40)
        : existing.title,
    updatedAt: new Date().toISOString(),
  }
  assertNoSecrets(updated as unknown as Record<string, unknown>)

  const db = requireClient()
  await db.execute({
    sql: `UPDATE tasks SET title = ?, prompt = ?, html = ?, chat_json = ?, versions_json = ?, current_version_n = ?, generation_mode = ?, source = ?, updated_at = ?
          WHERE id = ? AND email = ?`,
    args: [
      updated.title,
      updated.prompt,
      updated.html,
      JSON.stringify(updated.chat),
      JSON.stringify(updated.versions),
      updated.currentVersionN,
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

  let versionsRaw: unknown = []
  try {
    const raw = row.versions_json
    versionsRaw =
      typeof raw === 'string' ? JSON.parse(raw || '[]') : raw ?? []
  } catch {
    versionsRaw = []
  }

  const currentVersionNRaw = Number(row.current_version_n ?? 0)
  const currentVersionN = Number.isFinite(currentVersionNRaw)
    ? Math.floor(currentVersionNRaw)
    : 0
  const versions = normalizeVersions(versionsRaw, currentVersionN)

  return {
    id: String(row.id),
    email: String(row.email),
    title: String(row.title),
    prompt: String(row.prompt),
    html: String(row.html),
    versions,
    currentVersionN,
    chat,
    generationMode: String(row.generation_mode) as GenerationMode,
    source: String(row.source) as TaskSource,
    createdAt: String(row.created_at),
    updatedAt: String(row.updated_at),
  }
}
