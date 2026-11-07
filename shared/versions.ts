/** Task 内线性 Version 快照（与 ADR-0003 / Glossary 对齐） */

export const VERSION_PROMPT_TRUNCATE = 40
export const VERSION_MAX_SNAPSHOTS = 20

export type TaskVersionSnapshot = {
  /** Task 内单调递增序号 */
  n: number
  /**
   * 本轮改动短摘要（优先模型生成；失败时回退 Prompt 截断）
   * 字段名历史兼容仍叫 promptSummary
   */
  promptSummary: string
  /** 完整单文件 HTML */
  html: string
  createdAt: string
}

/** 截断文本供版本说明（超出加 …） */
export function truncatePromptSummary(
  prompt: string,
  max = VERSION_PROMPT_TRUNCATE,
): string {
  const t = prompt.trim().replace(/\s+/g, ' ')
  if (!t) return '（无说明）'
  return t.length <= max ? t : `${t.slice(0, max)}…`
}

/**
 * 规范化模型吐出的改动摘要：去引号/换行/前缀，截断到上限
 * @param raw 模型原文
 * @param fallbackPrompt 失败或空时回退的用户 Prompt
 */
export function sanitizeChangeSummary(
  raw: string | undefined | null,
  fallbackPrompt: string,
  max = VERSION_PROMPT_TRUNCATE,
): string {
  let t = String(raw ?? '')
    .trim()
    .replace(/\s+/g, ' ')
    // 步骤：去掉常见包装，避免卡片出现「摘要：」「"…"」
    .replace(/^["「『]+|["」』]+$/g, '')
    .replace(/^(摘要|改动|本轮|版本)[:：\s]*/u, '')
  if (!t) return truncatePromptSummary(fallbackPrompt, max)
  return t.length <= max ? t : `${t.slice(0, max)}…`
}

/** 对话版本卡文案：版本 N · 改动短摘要（摘要应已 sanitize） */
export function versionCardLabel(n: number, changeSummary: string): string {
  const s = changeSummary.trim() || '（无说明）'
  return `版本 ${n} · ${s}`
}

/** 校验并裁剪版本列表；永不丢掉 currentVersionN 对应快照 */
export function normalizeVersions(
  raw: unknown,
  currentVersionN: number,
): TaskVersionSnapshot[] {
  if (!Array.isArray(raw)) return []
  const byN = new Map<number, TaskVersionSnapshot>()
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const o = item as Record<string, unknown>
    const n = typeof o.n === 'number' && Number.isFinite(o.n) ? Math.floor(o.n) : 0
    if (n < 1) continue
    const html = typeof o.html === 'string' ? o.html : ''
    if (!html.trim()) continue
    const promptSummary = truncatePromptSummary(
      typeof o.promptSummary === 'string' ? o.promptSummary : '',
    )
    const createdAt =
      typeof o.createdAt === 'string' && o.createdAt
        ? o.createdAt
        : new Date().toISOString()
    byN.set(n, { n, promptSummary, html, createdAt })
  }
  let list = [...byN.values()].sort((a, b) => a.n - b.n)
  // 步骤：超出上限时丢最旧且非 Current 的快照
  while (list.length > VERSION_MAX_SNAPSHOTS) {
    const dropIdx = list.findIndex((v) => v.n !== currentVersionN)
    if (dropIdx < 0) break
    list.splice(dropIdx, 1)
  }
  return list
}

/**
 * 旧 Task 仅有 html、无 versions 时惰性收成 Version 1
 */
export function migrateVersionsIfNeeded(input: {
  html: string
  prompt: string
  versions: TaskVersionSnapshot[]
  currentVersionN: number
}): { versions: TaskVersionSnapshot[]; currentVersionN: number; html: string } {
  const html = input.html || ''
  let versions = normalizeVersions(input.versions, input.currentVersionN)
  let currentVersionN = input.currentVersionN

  if (versions.length === 0 && html.trim()) {
    versions = [
      {
        n: 1,
        promptSummary: truncatePromptSummary(input.prompt || '当前保存版本'),
        html,
        createdAt: new Date().toISOString(),
      },
    ]
    currentVersionN = 1
  }

  if (versions.length > 0) {
    const cur =
      versions.find((v) => v.n === currentVersionN) ||
      versions[versions.length - 1]
    currentVersionN = cur.n
    return { versions, currentVersionN, html: cur.html }
  }

  return { versions: [], currentVersionN: 0, html }
}

/** 追加新 Version（线性 maxN+1），并设为 Current */
export function appendVersionSnapshot(input: {
  versions: TaskVersionSnapshot[]
  prompt: string
  html: string
  /** 模型改动摘要；缺省则用 Prompt 截断 */
  changeSummary?: string
  now?: string
}): { versions: TaskVersionSnapshot[]; currentVersionN: number } {
  const maxN = input.versions.reduce((m, v) => Math.max(m, v.n), 0)
  const nextN = maxN + 1
  const snap: TaskVersionSnapshot = {
    n: nextN,
    promptSummary: sanitizeChangeSummary(input.changeSummary, input.prompt),
    html: input.html,
    createdAt: input.now ?? new Date().toISOString(),
  }
  const versions = normalizeVersions(
    [...input.versions, snap],
    nextN,
  )
  return { versions, currentVersionN: nextN }
}

/** 安全文件名：项目标题-v{N}.html */
export function exportFilename(title: string, n: number): string {
  const base = (title.trim() || 'index')
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, '_')
    .replace(/\s+/g, '-')
    .slice(0, 60)
  const ver = n >= 1 ? n : 1
  return `${base}-v${ver}.html`
}
