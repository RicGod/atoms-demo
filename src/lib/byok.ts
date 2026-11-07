import { HTML_GENERATOR_SYSTEM_PROMPT } from '../../shared/ui-ux-skill'
import { extractHtmlClient } from './html'
import type { ChatTurn } from './api'
import type { ByokConfig, ByokProfile, ByokStore } from './types'
import { BUILTIN_PLATFORM_MODELS, BYOK_STORAGE_KEY } from './types'

const emptyStore = (): ByokStore => ({ profiles: [], activeId: null })

const BUILTIN_ID_SET = new Set<string>(
  BUILTIN_PLATFORM_MODELS.map((m) => m.id),
)

/** 生成稳定 id（浏览器 crypto；降级到时间戳） */
export function newByokId(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }
  return `byok-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
}

/** 是否为平台预置模型（不可编辑/删除） */
export function isBuiltinProfile(p: Pick<ByokProfile, 'id' | 'builtin'>): boolean {
  // 步骤：含历史已下线的 builtin:* 条目，避免残留在自配列表里
  return (
    Boolean(p.builtin) ||
    BUILTIN_ID_SET.has(p.id) ||
    p.id.startsWith('builtin:')
  )
}

/** 构造单条平台预置（走服务端，无本机 Key） */
export function createBuiltinPlatformProfile(
  id: string,
  model: string,
  name?: string,
): ByokProfile {
  return {
    id,
    // 步骤：展示名与真实 model id 分离，提示额度有限且可自配
    name: name || model,
    model,
    // 步骤：占位展示用；真正调用走 /api/generate，不读这两项
    baseUrl: 'platform',
    apiKey: '',
    builtin: true,
  }
}

/** @deprecated 兼容旧调用；请用 createBuiltinPlatformProfiles */
export function createBuiltinFlashProfile(): ByokProfile {
  const first = BUILTIN_PLATFORM_MODELS[0]
  return createBuiltinPlatformProfile(first.id, first.model)
}

/** 全部平台默认条目（当前：qwen3.8-flash） */
export function createBuiltinPlatformProfiles(): ByokProfile[] {
  return BUILTIN_PLATFORM_MODELS.map((m) =>
    createBuiltinPlatformProfile(m.id, m.model, m.name),
  )
}

/**
 * 保证仓库含全部平台默认模型，且排在列表最前。
 * 清除自配后仍会保留这些条目。
 */
export function ensureBuiltinProfiles(store: ByokStore): ByokStore {
  const userProfiles = store.profiles.filter((p) => !isBuiltinProfile(p))
  const builtins = createBuiltinPlatformProfiles()
  const profiles = [...builtins, ...userProfiles]
  const activeId =
    store.activeId && profiles.some((p) => p.id === store.activeId)
      ? store.activeId
      : builtins[0]?.id ?? null
  return { profiles, activeId }
}

/** 从旧版单配置迁移到多配置仓库 */
function migrateLegacy(raw: unknown): ByokStore | null {
  if (!raw || typeof raw !== 'object') return null
  const o = raw as Record<string, unknown>
  // 新格式：已有 profiles
  if (Array.isArray(o.profiles)) {
    const profiles = (o.profiles as ByokProfile[]).filter((p) => {
      if (!p || !p.id || !p.model) return false
      // 步骤：预置可无 Key；自配仍需 baseUrl + apiKey
      if (isBuiltinProfile(p)) return true
      return Boolean(p.baseUrl && p.apiKey)
    })
    // 步骤：去掉预置，后面由 ensureBuiltinProfiles 统一插入官方默认
    const userOnly = profiles.filter((p) => !isBuiltinProfile(p))
    const activeId =
      typeof o.activeId === 'string' &&
      (userOnly.some((p) => p.id === o.activeId) ||
        BUILTIN_ID_SET.has(o.activeId))
        ? (o.activeId as string)
        : userOnly[0]?.id ?? null
    return { profiles: userOnly, activeId }
  }
  // 旧格式：单条 { baseUrl, apiKey, model }
  if (o.baseUrl && o.apiKey && o.model) {
    const id = newByokId()
    const profile: ByokProfile = {
      id,
      name: String(o.model),
      baseUrl: String(o.baseUrl),
      apiKey: String(o.apiKey),
      model: String(o.model),
    }
    return { profiles: [profile], activeId: id }
  }
  return null
}

/** 读取本机模型仓库（含旧数据迁移 + 注入平台默认） */
export function loadByokStore(): ByokStore {
  try {
    const raw = localStorage.getItem(BYOK_STORAGE_KEY)
    if (!raw) return ensureBuiltinProfiles(emptyStore())
    const parsed = migrateLegacy(JSON.parse(raw))
    if (!parsed) return ensureBuiltinProfiles(emptyStore())
    const ensured = ensureBuiltinProfiles(parsed)
    // 步骤：缺预置或旧格式时写回，确保 deepseek 等新默认也被注入
    const missingBuiltin = BUILTIN_PLATFORM_MODELS.some(
      (m) => !raw.includes(m.id),
    )
    if (!raw.includes('"profiles"') || missingBuiltin) {
      saveByokStore(ensured)
    }
    return ensured
  } catch {
    return ensureBuiltinProfiles(emptyStore())
  }
}

export function saveByokStore(store: ByokStore) {
  // 步骤：落盘前再保证预置存在，防止被误删后状态漂移
  localStorage.setItem(
    BYOK_STORAGE_KEY,
    JSON.stringify(ensureBuiltinProfiles(store)),
  )
}

/** 清除用户自配，保留平台默认模型 */
export function clearByok() {
  const kept = ensureBuiltinProfiles(emptyStore())
  saveByokStore(kept)
}

/** 当前选用配置；无则 null（兼容旧调用） */
export function loadByok(): ByokConfig | null {
  const store = loadByokStore()
  return getActiveByok(store)
}

/** 兼容：保存单条时写入/更新仓库并设为当前 */
export function saveByok(config: ByokConfig) {
  const store = loadByokStore()
  const active = getActiveProfile(store)
  // 步骤：当前为预置时追加新自配，绝不覆盖平台默认
  const id =
    active && !isBuiltinProfile(active)
      ? active.id
      : store.profiles.find((p) => !isBuiltinProfile(p))?.id ?? newByokId()
  const existing = store.profiles.find((p) => p.id === id && !isBuiltinProfile(p))
  const profile: ByokProfile = {
    id,
    name: existing?.name || config.model,
    baseUrl: config.baseUrl,
    apiKey: config.apiKey,
    model: config.model,
  }
  const profiles = existing
    ? store.profiles.map((p) => (p.id === id ? profile : p))
    : [...store.profiles, profile]
  saveByokStore({ profiles, activeId: id })
}

/** 取当前选用的完整 profile（含预置） */
export function getActiveProfile(store: ByokStore): ByokProfile | null {
  if (!store.activeId) return null
  return store.profiles.find((x) => x.id === store.activeId) ?? null
}

/**
 * 取当前选用的「自配」连接参数。
 * 平台预置（builtin）返回 null——应走服务端 /api/generate。
 */
export function getActiveByok(store: ByokStore): ByokConfig | null {
  const p = getActiveProfile(store)
  if (!p || isBuiltinProfile(p)) return null
  return { baseUrl: p.baseUrl, apiKey: p.apiKey, model: p.model }
}

/** 与服务端一致：拼装迭代上下文进单条 user 内容 */
function buildByokUserContent(options: {
  prompt: string
  messages?: ChatTurn[]
  currentHtml?: string
}): string {
  const parts: string[] = []
  const history = (options.messages ?? []).slice(-8)
  if (history.length) {
    parts.push(
      `【对话历史摘要】\n${history
        .map((m) => `- ${m.role === 'user' ? '用户' : '助手'}: ${m.content.slice(0, 400)}`)
        .join('\n')}`,
    )
  }
  if (options.currentHtml?.trim()) {
    const html = options.currentHtml
    const clipped =
      html.length > 24_000 ? `${html.slice(0, 24_000)}\n<!-- truncated -->` : html
    parts.push(`【当前 HTML】\n${clipped}`)
    // 步骤：与服务端一致——迭代时强调针对性增量，而非推倒重来
    parts.push(
      `【迭代约束】本轮是在当前 HTML 上的增量修改：只实现【本轮需求】，其余保持原样；输出修改后的完整 HTML，不要无关重写。`,
    )
  }
  parts.push(`【本轮需求】\n${options.prompt.trim()}`)
  return parts.join('\n\n')
}

/** 从兼容接口的一条 JSON 里抽出正文 / 思考增量 */
function pickDelta(json: Record<string, unknown>): {
  content: string
  thinking: string
} {
  const choices = json.choices as
    | Array<{
        delta?: { content?: string; reasoning_content?: string }
        message?: { content?: string; reasoning_content?: string }
        text?: string
      }>
    | undefined
  const choice = choices?.[0]
  const delta = choice?.delta
  const message = choice?.message
  // 步骤：兼容 OpenAI / 部分国产网关字段差异
  const content =
    (typeof delta?.content === 'string' && delta.content) ||
    (typeof message?.content === 'string' && message.content) ||
    (typeof choice?.text === 'string' && choice.text) ||
    (typeof json.text === 'string' && json.text) ||
    ''
  const thinking =
    (typeof delta?.reasoning_content === 'string' && delta.reasoning_content) ||
    (typeof message?.reasoning_content === 'string' &&
      message.reasoning_content) ||
    ''
  return { content, thinking }
}

/**
 * 浏览器直连自配 OpenAI 兼容端点（流式）
 * Key 只在浏览器本地使用，不会发到本应用服务端
 */
export async function streamByokHtml(options: {
  prompt: string
  config: ByokConfig
  messages?: ChatTurn[]
  currentHtml?: string
  onChunk?: (text: string) => void
  onThinking?: (text: string) => void
  /** 累计正文变化后的展示快照（已尽力抽 HTML） */
  onHtml?: (html: string) => void
  signal?: AbortSignal
}): Promise<{ ok: true; html: string } | { ok: false; message: string }> {
  const {
    prompt,
    config,
    messages,
    currentHtml,
    onChunk,
    onThinking,
    onHtml,
    signal,
  } = options
  const base = config.baseUrl.replace(/\/$/, '')
  const userContent = buildByokUserContent({ prompt, messages, currentHtml })

  let res: Response
  try {
    res = await fetch(`${base}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${config.apiKey}`,
      },
      body: JSON.stringify({
        model: config.model,
        stream: true,
        messages: [
          {
            role: 'system',
            // 步骤：与服务端内置生成共用 ui-ux-pro-max 约束
            content: HTML_GENERATOR_SYSTEM_PROMPT,
          },
          { role: 'user', content: userContent },
        ],
      }),
      signal,
    })
  } catch (e) {
    return {
      ok: false,
      message:
        e instanceof Error
          ? e.message
          : '无法连接模型服务（请检查 Base URL / CORS / 网络）',
    }
  }

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    return { ok: false, message: text || `HTTP ${res.status}` }
  }
  if (!res.body) return { ok: false, message: '响应无 body' }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  const pushContent = (piece: string) => {
    if (!piece) return
    full += piece
    onChunk?.(piece)
    // 步骤：右侧代码区用累计文本实时刷新（含未闭合 markdown 时仍可见）
    onHtml?.(full)
  }

  const pushThinking = (piece: string) => {
    if (!piece) return
    onThinking?.(piece)
  }

  const consumeDataPayload = (data: string) => {
    if (!data || data === '[DONE]') return
    try {
      const json = JSON.parse(data) as Record<string, unknown>
      const { content, thinking } = pickDelta(json)
      pushThinking(thinking)
      pushContent(content)
    } catch {
      /* 非 JSON 行忽略 */
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })

    // 步骤：按 SSE 空行分帧；兼容 \r\n
    const parts = buffer.split(/\r?\n\r?\n/)
    buffer = parts.pop() ?? ''
    for (const part of parts) {
      for (const line of part.split(/\r?\n/)) {
        const trimmed = line.trim()
        if (!trimmed.startsWith('data:')) continue
        consumeDataPayload(trimmed.slice(5).trim())
      }
    }
  }

  // 步骤：冲刷尾部残留（无空行结尾时）
  if (buffer.trim()) {
    for (const line of buffer.split(/\r?\n/)) {
      const trimmed = line.trim()
      if (trimmed.startsWith('data:')) {
        consumeDataPayload(trimmed.slice(5).trim())
      } else if (trimmed.startsWith('{')) {
        // 步骤：部分网关在 stream=true 时仍回一整段 JSON
        try {
          const json = JSON.parse(trimmed) as Record<string, unknown>
          const { content, thinking } = pickDelta(json)
          pushThinking(thinking)
          pushContent(content)
        } catch {
          /* ignore */
        }
      }
    }
  }

  // 步骤：若流式未解析出内容，再尝试把整包当非流式 JSON
  if (!full.trim()) {
    try {
      const maybe = JSON.parse(buffer || '') as Record<string, unknown>
      const { content, thinking } = pickDelta(maybe)
      pushThinking(thinking)
      pushContent(content)
    } catch {
      /* ignore */
    }
  }

  if (!full.trim()) {
    return {
      ok: false,
      message:
        '自配模型返回空内容（请确认 Model 名、是否支持 stream，以及浏览器 CORS）',
    }
  }
  const html = extractHtmlClient(full)
  onHtml?.(html)
  return { ok: true, html }
}
