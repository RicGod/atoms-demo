import {
  BAILIAN_BASE_URL,
  FIRST_BYTE_TIMEOUT_MS,
  HARD_CAP_TIMEOUT_MS,
  IDLE_TIMEOUT_MS,
  type BuiltinModel,
} from '../../shared/constants.js'
import { isQuotaOrAuthFailure } from './quota.js'

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

const SYSTEM_PROMPT = `你是一个单文件 HTML 生成器。根据用户需求，输出一份可独立运行的完整 HTML 文档。
要求：
1. 只输出 HTML（可含内联 CSS/JS），不要 Markdown 代码围栏，不要解释。
2. 样式与脚本必须自包含，无需外部资源（可用 CDN 字体也可，但优先内联）。
3. 页面必须可交互（按钮、输入、动画等至少一种真实交互）。
4. 视觉有明确风格，避免空白模板感。
5. 若提供了「当前 HTML」与历史对话，请在现有页面基础上按最新用户意图整页覆盖改写，输出完整新文档（不是补丁片段）。`

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
    // 步骤：附带当前整页 HTML，要求整页覆盖生成
    const clipped =
      html.length > 24_000 ? `${html.slice(0, 24_000)}\n<!-- truncated -->` : html
    parts.push(`【当前 HTML】\n${clipped}`)
  }

  parts.push(`【本轮需求】\n${options.prompt.trim()}`)
  return parts.join('\n\n')
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
  onChunk?: (text: string) => void
  signal?: AbortSignal
}): Promise<StreamResult> {
  const { prompt, model, apiKey, messages, currentHtml, onChunk, signal } =
    options
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
          // 思考类内容也算「有 chunk」，避免误触空闲超时
          const delta =
            json.choices?.[0]?.delta?.content ??
            json.choices?.[0]?.delta?.reasoning_content ??
            ''
          if (delta) {
            full += delta
            onChunk?.(delta)
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
