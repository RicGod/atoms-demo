import { HTML_GENERATOR_SYSTEM_PROMPT } from '../../shared/ui-ux-skill'
import { extractHtmlClient } from './html'
import type { ChatTurn } from './api'
import type { ByokConfig } from './types'
import { BYOK_STORAGE_KEY } from './types'

/** 自配模型仅存浏览器 localStorage，服务端永不持久化 */
export function loadByok(): ByokConfig | null {
  try {
    const raw = localStorage.getItem(BYOK_STORAGE_KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as ByokConfig
    if (!parsed.baseUrl || !parsed.apiKey || !parsed.model) return null
    return parsed
  } catch {
    return null
  }
}

export function saveByok(config: ByokConfig) {
  localStorage.setItem(BYOK_STORAGE_KEY, JSON.stringify(config))
}

export function clearByok() {
  localStorage.removeItem(BYOK_STORAGE_KEY)
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
  }
  parts.push(`【本轮需求】\n${options.prompt.trim()}`)
  return parts.join('\n\n')
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
  signal?: AbortSignal
}): Promise<{ ok: true; html: string } | { ok: false; message: string }> {
  const { prompt, config, messages, currentHtml, onChunk, signal } = options
  const base = config.baseUrl.replace(/\/$/, '')
  const userContent = buildByokUserContent({ prompt, messages, currentHtml })

  const res = await fetch(`${base}/chat/completions`, {
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

  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText)
    return { ok: false, message: text || `HTTP ${res.status}` }
  }
  if (!res.body) return { ok: false, message: '响应无 body' }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let full = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''
    for (const line of lines) {
      const trimmed = line.trim()
      if (!trimmed.startsWith('data:')) continue
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') continue
      try {
        const json = JSON.parse(data) as {
          choices?: Array<{ delta?: { content?: string } }>
        }
        const delta = json.choices?.[0]?.delta?.content ?? ''
        if (delta) {
          full += delta
          onChunk?.(delta)
        }
      } catch {
        /* ignore */
      }
    }
  }

  if (!full.trim()) return { ok: false, message: '自配模型返回空内容' }
  return { ok: true, html: extractHtmlClient(full) }
}
