import {
  BAILIAN_BASE_URL,
  FIRST_BYTE_TIMEOUT_MS,
  HARD_CAP_TIMEOUT_MS,
  IDLE_TIMEOUT_MS,
  type BuiltinModel,
} from '../../shared/constants.js'
import { HTML_GENERATOR_SYSTEM_PROMPT } from '../../shared/ui-ux-skill.js'
import { sanitizeChangeSummary } from '../../shared/versions.js'
import { isQuotaOrAuthFailure } from './quota.js'

/** 版本改动摘要：短超时，失败由调用方回退 Prompt 截断 */
const SUMMARY_TIMEOUT_MS = 12_000
const SUMMARY_MODEL: BuiltinModel = 'qwen3.8-flash'

export type StreamResult =
  | { ok: true; html: string }
  | {
      ok: false
      kind: 'timeout' | 'quota' | 'error' | 'no_key'
      message: string
      status?: number
    }

/** 对话轮次（用于迭代摘要，role 仅 user/assistant） */
export type ChatTurn = {
  role: 'user' | 'assistant'
  content: string
}

/** 导出供单测断言：system prompt 已内嵌 ui-ux skill */
export const SYSTEM_PROMPT = HTML_GENERATOR_SYSTEM_PROMPT

/**
 * 组装发给模型的 user 内容：可选历史摘要 + 当前 HTML + 本轮 Prompt
 * 历史只取最近若干轮，避免上下文过长
 */
export function buildUserContent(options: {
  prompt: string
  messages?: ChatTurn[]
  currentHtml?: string
}): string {
  const parts: string[] = []
  const history = (options.messages ?? [])
    .filter((m) => m.content?.trim())
    .slice(-8)

  if (history.length > 0) {
    // 步骤：压缩对话历史为可读摘要，供模型理解迭代意图
    const lines = history.map((m) => {
      const tag = m.role === 'user' ? '用户' : '助手'
      const text =
        m.content.length > 400 ? `${m.content.slice(0, 400)}…` : m.content
      return `- ${tag}: ${text}`
    })
    parts.push(`【对话历史摘要】\n${lines.join('\n')}`)
  }

  const html = options.currentHtml?.trim()
  if (html) {
    // 步骤：附带当前整页，要求增量针对性修改（仍输出完整文档）
    const clipped =
      html.length > 24_000 ? `${html.slice(0, 24_000)}\n<!-- truncated -->` : html
    parts.push(`【当前 HTML】\n${clipped}`)
    parts.push(
      `【迭代约束】本轮是在当前 HTML 上的增量修改：只实现【本轮需求】，其余保持原样；输出修改后的完整 HTML，不要无关重写。`,
    )
  }

  parts.push(`【本轮需求】\n${options.prompt.trim()}`)
  return parts.join('\n\n')
}

/**
 * 为本轮生成另要一句短摘要（非流式），供版本卡展示
 * 失败返回 ok:false，由前端/调用方回退到 Prompt 截断
 */
export async function summarizeVersionChange(options: {
  prompt: string
  apiKey: string
  /** 是否在已有页面上迭代 */
  isIteration?: boolean
  model?: BuiltinModel
  signal?: AbortSignal
}): Promise<
  | { ok: true; summary: string }
  | { ok: false; message: string }
> {
  const apiKey = options.apiKey.trim()
  if (!apiKey) {
    return { ok: false, message: '未配置百炼 Key' }
  }
  const prompt = options.prompt.trim()
  if (!prompt) {
    return { ok: false, message: 'Prompt 为空' }
  }

  const controller = new AbortController()
  const onAbort = () => controller.abort()
  options.signal?.addEventListener('abort', onAbort)
  const timer = setTimeout(() => controller.abort(), SUMMARY_TIMEOUT_MS)

  const model = options.model ?? SUMMARY_MODEL
  const iterHint = options.isIteration
    ? '这是在已有页面上的增量修改。'
    : '这是从零生成的新页面。'

  try {
    const res = await fetch(`${BAILIAN_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        stream: false,
        temperature: 0.3,
        max_tokens: 80,
        messages: [
          {
            role: 'system',
            content:
              '你是产品文案助手。把用户本轮需求改写成一句≤40字的简体中文「改动摘要」，供版本卡片展示。必须保留需求里的具体对象与动作（如颜色、按钮、布局），改写成「做了X」口吻。只输出摘要正文。禁止空泛套话（如「完成调整」「优化页面」「增量修改」「按需求更新」）；禁止说需求不明确。\n示例：需求「把按钮改成红色」→「按钮改为红色」。',
          },
          {
            role: 'user',
            content: `${iterHint}\n用户需求：\n${prompt.slice(0, 500)}`,
          },
        ],
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText)
      return { ok: false, message: errText || `HTTP ${res.status}` }
    }

    const json = (await res.json()) as {
      choices?: Array<{ message?: { content?: string } }>
    }
    const raw = json.choices?.[0]?.message?.content ?? ''
    const summary = sanitizeChangeSummary(raw, prompt)
    if (!summary || summary === '（无说明）') {
      return { ok: false, message: '摘要为空' }
    }
    return { ok: true, summary }
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    return { ok: false, message }
  } finally {
    options.signal?.removeEventListener('abort', onAbort)
    clearTimeout(timer)
  }
}

/** 从模型文本中剥离可能的 markdown 围栏，尽量得到纯 HTML */
export function extractHtml(raw: string): string {
  const trimmed = raw.trim()
  const fenced = trimmed.match(/```(?:html)?\s*([\s\S]*?)```/i)
  if (fenced?.[1]) return fenced[1].trim()
  if (trimmed.includes('<html') || trimmed.includes('<!DOCTYPE')) {
    return trimmed
  }
  // 无完整文档时包一层，保证 iframe 可渲染
  return `<!DOCTYPE html><html lang="zh-CN"><head><meta charset="UTF-8"/><meta name="viewport" content="width=device-width, initial-scale=1.0"/><title>Generated</title></head><body>${trimmed}</body></html>`
}

/**
 * 调用百炼兼容 chat/completions 流式接口
 * 超时策略：首包 ~30s、空闲 ~60s、保底 ~10min（非墙钟硬掐总时长）
 */
export async function streamBuiltinHtml(options: {
  prompt: string
  model: BuiltinModel
  apiKey: string
  /** 可选：对话历史（摘要进 user 内容） */
  messages?: ChatTurn[]
  /** 可选：当前 Artifact HTML，用于整页覆盖迭代 */
  currentHtml?: string
  /** 兼容：HTML 正文 delta（不含思考链） */
  onChunk?: (text: string) => void
  /** 模型思考/推理过程（若有） */
  onThinking?: (text: string) => void
  signal?: AbortSignal
}): Promise<StreamResult> {
  const {
    prompt,
    model,
    apiKey,
    messages,
    currentHtml,
    onChunk,
    onThinking,
    signal,
  } = options
  // 调用方应已用 getBailianApiKey()；此处再防一手空 Key
  if (!apiKey.trim()) {
    return {
      ok: false,
      kind: 'no_key',
      message: '未配置百炼 Key（aliQwen-api 或 BAILIAN_API_KEY）',
    }
  }

  const controller = new AbortController()
  const onAbort = () => controller.abort()
  signal?.addEventListener('abort', onAbort)

  const hardCap = setTimeout(() => controller.abort(), HARD_CAP_TIMEOUT_MS)
  let firstByteTimer: ReturnType<typeof setTimeout> | undefined = setTimeout(
    () => controller.abort(),
    FIRST_BYTE_TIMEOUT_MS,
  )
  let idleTimer: ReturnType<typeof setTimeout> | undefined
  let gotFirstByte = false

  const bumpIdle = () => {
    if (idleTimer) clearTimeout(idleTimer)
    idleTimer = setTimeout(() => controller.abort(), IDLE_TIMEOUT_MS)
  }

  // 步骤：把历史与当前 HTML 拼进单条 user message，保持 chat/completions 兼容
  const userContent = buildUserContent({ prompt, messages, currentHtml })

  try {
    const res = await fetch(`${BAILIAN_BASE_URL}/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model,
        stream: true,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent },
        ],
      }),
      signal: controller.signal,
    })

    if (!res.ok) {
      const errText = await res.text().catch(() => res.statusText)
      if (isQuotaOrAuthFailure(res.status, errText)) {
        return {
          ok: false,
          kind: 'quota',
          message: errText || `HTTP ${res.status}`,
          status: res.status,
        }
      }
      return {
        ok: false,
        kind: 'error',
        message: errText || `HTTP ${res.status}`,
        status: res.status,
      }
    }

    if (!res.body) {
      return { ok: false, kind: 'error', message: '响应无 body' }
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let full = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      if (!gotFirstByte) {
        gotFirstByte = true
        if (firstByteTimer) {
          clearTimeout(firstByteTimer)
          firstByteTimer = undefined
        }
        bumpIdle()
      } else {
        bumpIdle()
      }

      buffer += decoder.decode(value, { stream: true })
      const lines = buffer.split('\n')
      buffer = lines.pop() ?? ''

      for (const line of lines) {
        const trimmed = line.trim()
        if (!trimmed || !trimmed.startsWith('data:')) continue
        const data = trimmed.slice(5).trim()
        if (data === '[DONE]') continue
        try {
          const json = JSON.parse(data) as {
            choices?: Array<{
              delta?: { content?: string; reasoning_content?: string }
            }>
          }
          const delta = json.choices?.[0]?.delta
          // 步骤：思考链与正文分离；思考也算活跃，避免误触空闲超时
          const thinking = delta?.reasoning_content ?? ''
          const content = delta?.content ?? ''
          if (thinking) {
            onThinking?.(thinking)
          }
          if (content) {
            full += content
            onChunk?.(content)
          }
        } catch {
          // 忽略无法解析的 SSE 行
        }
      }
    }

    if (!full.trim()) {
      return { ok: false, kind: 'error', message: '模型返回空内容' }
    }
    return { ok: true, html: extractHtml(full) }
  } catch (err) {
    const aborted = controller.signal.aborted
    const message = err instanceof Error ? err.message : String(err)
    if (aborted || /abort/i.test(message)) {
      return {
        ok: false,
        kind: 'timeout',
        message: gotFirstByte
          ? '流式空闲超时或达到保底上限'
          : '首包超时（约 30 秒内未收到数据）',
      }
    }
    if (isQuotaOrAuthFailure(0, message)) {
      return { ok: false, kind: 'quota', message }
    }
    return { ok: false, kind: 'error', message }
  } finally {
    signal?.removeEventListener('abort', onAbort)
    clearTimeout(hardCap)
    if (firstByteTimer) clearTimeout(firstByteTimer)
    if (idleTimer) clearTimeout(idleTimer)
  }
}
