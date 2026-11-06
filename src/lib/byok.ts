import { extractHtmlClient } from './html'
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

/**
 * 浏览器直连自配 OpenAI 兼容端点（流式）
 * Key 只在浏览器本地使用，不会发到本应用服务端
 */
export async function streamByokHtml(options: {
  prompt: string
  config: ByokConfig
  onChunk?: (text: string) => void
  signal?: AbortSignal
}): Promise<{ ok: true; html: string } | { ok: false; message: string }> {
  const { prompt, config, onChunk, signal } = options
  const base = config.baseUrl.replace(/\/$/, '')
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
          content:
            '你是单文件 HTML 生成器。只输出完整可交互 HTML，不要 Markdown 围栏与解释。样式脚本自包含。',
        },
        { role: 'user', content: prompt },
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
