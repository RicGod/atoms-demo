import type { GenerationMode, TaskDetail, TaskSummary } from './types'

/** 解析服务端 SSE（内置生成） */
export async function generateBuiltin(options: {
  prompt: string
  model: string
  onChunk?: (text: string) => void
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
    body: JSON.stringify({ prompt: options.prompt, model: options.model }),
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

  const handleEvent = (event: string, dataRaw: string) => {
    let data: unknown
    try {
      data = JSON.parse(dataRaw)
    } catch {
      return
    }
    if (event === 'chunk') {
      const text = (data as { text?: string }).text ?? ''
      options.onChunk?.(text)
    } else if (event === 'result') {
      const d = data as { html?: string; mode?: GenerationMode }
      html = d.html ?? ''
      mode = d.mode ?? 'builtin'
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

export async function fetchTasks(email: string): Promise<TaskSummary[]> {
  const res = await fetch(`/api/tasks?email=${encodeURIComponent(email)}`)
  const json = (await res.json()) as {
    ok: boolean
    tasks?: TaskSummary[]
    error?: string
  }
  if (!json.ok) throw new Error(json.error || '加载任务失败')
  return json.tasks ?? []
}

export async function createTask(email: string, title?: string) {
  const res = await fetch('/api/tasks', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, title }),
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

export async function saveTask(input: {
  id: string
  email: string
  prompt: string
  html: string
  generationMode: GenerationMode
  source?: 'single' | 'horse-race'
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
