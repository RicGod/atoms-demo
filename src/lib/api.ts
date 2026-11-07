import type {
  GenerationMode,
  PersistedChatItem,
  TaskDetail,
  TaskSummary,
  TaskVersionSnapshot,
} from './types'

export type ChatTurn = { role: 'user' | 'assistant'; content: string }

export type RaceCandidate =
  | {
      lane: 'A' | 'B'
      model: string
      ok: true
      html: string
      mode: GenerationMode
    }
  | {
      lane: 'A' | 'B'
      model: string
      ok: false
      kind?: string
      message: string
    }

/** 解析服务端 SSE（内置生成） */
export async function generateBuiltin(options: {
  prompt: string
  model: string
  /** 对话历史，供服务端摘要进迭代上下文 */
  messages?: ChatTurn[]
  /** 当前 HTML，整页覆盖生成 */
  currentHtml?: string
  /** 兼容：正文 chunk / delta */
  onChunk?: (text: string) => void
  /** 思考过程增量 */
  onThinking?: (text: string) => void
  /** 流式 HTML 快照（右侧代码/尽力预览） */
  onHtml?: (html: string) => void
  signal?: AbortSignal
}): Promise<
  | { ok: true; html: string; mode: GenerationMode }
  | {
      ok: false
      kind?: string
      message: string
      suggestByok?: boolean
    }
> {
  const res = await fetch('/api/generate', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: options.prompt,
      model: options.model,
      messages: options.messages,
      currentHtml: options.currentHtml,
    }),
    signal: options.signal,
  })

  if (!res.ok || !res.body) {
    const text = await res.text().catch(() => '')
    return { ok: false, message: text || `HTTP ${res.status}` }
  }

  const reader = res.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''
  let html = ''
  let mode: GenerationMode = 'builtin'
  let error:
    | { kind?: string; message: string; suggestByok?: boolean }
    | undefined
  // 兼容旧 mock：仅有 chunk 时本地累加，供 onHtml 尽力预览
  let chunkAccum = ''

  const handleEvent = (event: string, dataRaw: string) => {
    let data: unknown
    try {
      data = JSON.parse(dataRaw)
    } catch {
      return
    }
    if (event === 'thinking') {
      const text = (data as { text?: string }).text ?? ''
      if (text) options.onThinking?.(text)
    } else if (event === 'chunk' || event === 'delta') {
      const text = (data as { text?: string }).text ?? ''
      if (text) {
        // delta 与 chunk 内容相同；只对 chunk 回调 onChunk，避免双倍累加
        if (event === 'chunk') {
          options.onChunk?.(text)
          chunkAccum += text
          // 无 html 事件时（旧 mock）仍推预览快照
          options.onHtml?.(chunkAccum)
        }
      }
    } else if (event === 'html') {
      const h = (data as { html?: string }).html ?? ''
      if (h) {
        html = h
        options.onHtml?.(h)
      }
    } else if (event === 'result') {
      const d = data as { html?: string; mode?: GenerationMode }
      html = d.html ?? ''
      mode = d.mode ?? 'builtin'
      if (html) options.onHtml?.(html)
    } else if (event === 'error') {
      const d = data as {
        kind?: string
        message?: string
        suggestByok?: boolean
      }
      error = {
        kind: d.kind,
        message: d.message || '生成失败',
        suggestByok: d.suggestByok,
      }
    }
  }

  while (true) {
    const { done, value } = await reader.read()
    if (done) break
    buffer += decoder.decode(value, { stream: true })
    const parts = buffer.split('\n\n')
    buffer = parts.pop() ?? ''
    for (const part of parts) {
      const lines = part.split('\n')
      let event = 'message'
      const dataLines: string[] = []
      for (const line of lines) {
        if (line.startsWith('event:')) event = line.slice(6).trim()
        else if (line.startsWith('data:')) dataLines.push(line.slice(5).trim())
      }
      if (dataLines.length) handleEvent(event, dataLines.join('\n'))
    }
  }

  if (html) return { ok: true, html, mode }
  return {
    ok: false,
    kind: error?.kind,
    message: error?.message || '生成失败',
    suggestByok: error?.suggestByok,
  }
}

/**
 * 赛马：服务端并行两次 generate，返回两路候选（无自动打分）
 * 仅登录用户应调用；访客前端禁用
 */
export async function raceBuiltin(options: {
  prompt: string
  messages?: ChatTurn[]
  currentHtml?: string
  models?: [string, string]
}): Promise<
  | { ok: true; candidates: RaceCandidate[] }
  | { ok: false; message: string; suggestByok?: boolean; candidates?: RaceCandidate[] }
> {
  const res = await fetch('/api/race', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: options.prompt,
      messages: options.messages,
      currentHtml: options.currentHtml,
      models: options.models,
    }),
  })
  const json = (await res.json()) as {
    ok: boolean
    candidates?: RaceCandidate[]
    error?: string
    suggestByok?: boolean
  }
  if (!res.ok) {
    return {
      ok: false,
      message: json.error || `HTTP ${res.status}`,
      suggestByok: json.suggestByok,
      candidates: json.candidates,
    }
  }
  const candidates = json.candidates ?? []
  if (!candidates.some((c) => c.ok)) {
    return {
      ok: false,
      message: '两路赛马均失败',
      candidates,
    }
  }
  return { ok: true, candidates }
}

export async function fetchTasks(email: string): Promise<TaskSummary[]> {
  const res = await fetch(`/api/tasks?email=${encodeURIComponent(email)}`)
  const json = (await res.json()) as {
    ok: boolean
    tasks?: TaskSummary[]
    error?: string
  }
  if (!json.ok) throw new Error(json.error || '加载项目失败')
  return json.tasks ?? []
}

export async function createTask(
  email: string,
  title?: string,
  prompt?: string,
) {
  const res = await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, title, prompt }),
  })
  const json = (await res.json()) as {
    ok: boolean
    task?: TaskDetail
    error?: string
  }
  if (!json.ok || !json.task) throw new Error(json.error || '创建失败')
  return json.task
}

export async function openTask(email: string, id: string) {
  const res = await fetch(
    `/api/tasks/${encodeURIComponent(id)}?email=${encodeURIComponent(email)}`,
  )
  const json = (await res.json()) as {
    ok: boolean
    task?: TaskDetail
    error?: string
  }
  if (!json.ok || !json.task) throw new Error(json.error || '打开失败')
  return json.task
}

/**
 * 请服务端用内置模型为本轮改动写一句短摘要（版本卡）
 * 网络/模型失败时抛错，由调用方回退 Prompt 截断
 */
export async function summarizeVersionChange(input: {
  prompt: string
  isIteration?: boolean
}): Promise<string> {
  const res = await fetch('/api/summarize-version', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      prompt: input.prompt,
      isIteration: Boolean(input.isIteration),
    }),
  })
  const json = (await res.json()) as {
    ok?: boolean
    summary?: string
    error?: string
  }
  const summary = typeof json.summary === 'string' ? json.summary.trim() : ''
  if (summary) return summary
  throw new Error(json.error || '摘要失败')
}

export async function saveTask(input: {
  id: string
  email: string
  prompt: string
  html: string
  generationMode: GenerationMode
  source?: 'single' | 'horse-race'
  title?: string
  /** 步骤：与 HTML 一并覆盖保存的对话时间线 */
  chat?: PersistedChatItem[]
  /** 线性 Version 快照 */
  versions?: TaskVersionSnapshot[]
  currentVersionN?: number
}) {
  const res = await fetch(`/api/tasks/${encodeURIComponent(input.id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  })
  const json = (await res.json()) as {
    ok: boolean
    task?: TaskDetail
    error?: string
  }
  if (!json.ok || !json.task) throw new Error(json.error || '保存失败')
  return json.task
}

/** 删除项目；邮箱隔离由服务端校验 */
export async function deleteTask(email: string, id: string) {
  const res = await fetch(
    `/api/tasks/${encodeURIComponent(id)}?email=${encodeURIComponent(email)}`,
    { method: 'DELETE' },
  )
  const json = (await res.json()) as { ok: boolean; error?: string }
  if (!json.ok) throw new Error(json.error || '删除失败')
}
