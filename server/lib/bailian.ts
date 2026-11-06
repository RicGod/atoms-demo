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

const SYSTEM_PROMPT = `你是一个单文件 HTML 生成器。根据用户一句话需求，输出一份可独立运行的完整 HTML 文档。
要求：
1. 只输出 HTML（可含内联 CSS/JS），不要 Markdown 代码围栏，不要解释。
2. 样式与脚本必须自包含，无需外部资源（可用 CDN 字体也可，但优先内联）。
3. 页面必须可交互（按钮、输入、动画等至少一种真实交互）。
4. 视觉有明确风格，避免空白模板感。`

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
  onChunk?: (text: string) => void
  signal?: AbortSignal
}): Promise<StreamResult> {
  const { prompt, model, apiKey, onChunk, signal } = options
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
          { role: 'user', content: prompt },
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
