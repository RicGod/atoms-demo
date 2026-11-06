import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, type StreamHtmlFn } from './app.js'
import { ALIQWEN_API_ENV, BAILIAN_API_ENV } from './lib/bailian-env.js'
import { buildUserContent, type StreamResult } from './lib/bailian.js'

/**
 * 解析 SSE 文本为事件列表（event + data JSON）
 * 仅用于测试断言，不依赖生产解析器
 */
function parseSse(raw: string): Array<{ event: string; data: unknown }> {
  const events: Array<{ event: string; data: unknown }> = []
  const blocks = raw.split(/\n\n/).map((b) => b.trim()).filter(Boolean)
  for (const block of blocks) {
    let event = 'message'
    let dataLine = ''
    for (const line of block.split('\n')) {
      if (line.startsWith('event:')) event = line.slice(6).trim()
      if (line.startsWith('data:')) dataLine = line.slice(5).trim()
    }
    if (!dataLine) continue
    events.push({ event, data: JSON.parse(dataLine) })
  }
  return events
}

describe('buildUserContent', () => {
  it('拼装历史摘要与当前 HTML', () => {
    const text = buildUserContent({
      prompt: '加个计分板',
      messages: [
        { role: 'user', content: '做个贪吃蛇' },
        { role: 'assistant', content: '已完成基础版' },
      ],
      currentHtml: '<html><body>snake</body></html>',
    })
    expect(text).toContain('对话历史摘要')
    expect(text).toContain('当前 HTML')
    expect(text).toContain('加个计分板')
    expect(text).toContain('snake')
  })
})

describe('POST /api/generate', () => {
  const savedAli = process.env[ALIQWEN_API_ENV]
  const savedBailian = process.env[BAILIAN_API_ENV]

  afterEach(() => {
    if (savedAli === undefined) delete process.env[ALIQWEN_API_ENV]
    else process.env[ALIQWEN_API_ENV] = savedAli
    if (savedBailian === undefined) delete process.env[BAILIAN_API_ENV]
    else process.env[BAILIAN_API_ENV] = savedBailian
  })

  it('无 Key 时 SSE 引导 no_key 且 suggestByok，不调用 LLM', async () => {
    delete process.env[ALIQWEN_API_ENV]
    delete process.env[BAILIAN_API_ENV]

    let called = false
    const streamHtml: StreamHtmlFn = async () => {
      called = true
      return { ok: true, html: '<html></html>' }
    }

    const app = createApp({ streamHtml })
    const res = await request(app)
      .post('/api/generate')
      .send({ prompt: '做一个计数器' })

    expect(res.status).toBe(200)
    expect(res.headers['content-type']).toMatch(/text\/event-stream/)
    const events = parseSse(res.text)
    expect(events.some((e) => e.event === 'meta')).toBe(true)
    const err = events.find((e) => e.event === 'error')
    expect(err?.data).toMatchObject({
      kind: 'no_key',
      suggestByok: true,
    })
    expect(events.at(-1)?.event).toBe('done')
    expect(called).toBe(false)
  })

  it('注入 mock LLM 时流式 chunk 并以 builtin mode 结束', async () => {
    process.env[BAILIAN_API_ENV] = 'test-fake-key-not-real'

    const streamHtml: StreamHtmlFn = async ({ onChunk }) => {
      onChunk?.('<!DOCTYPE html>')
      onChunk?.('<html><body>ok</body></html>')
      return {
        ok: true,
        html: '<!DOCTYPE html><html><body>ok</body></html>',
      }
    }

    const app = createApp({ streamHtml })
    const res = await request(app)
      .post('/api/generate')
      .send({ prompt: '霓虹按钮', model: 'qwen3.8-flash' })

    const events = parseSse(res.text)
    const meta = events.find((e) => e.event === 'meta')
    expect(meta?.data).toMatchObject({ mode: 'builtin', model: 'qwen3.8-flash' })

    const chunks = events.filter((e) => e.event === 'chunk')
    expect(chunks.length).toBeGreaterThanOrEqual(2)

    const result = events.find((e) => e.event === 'result')
    expect(result?.data).toMatchObject({
      mode: 'builtin',
      html: expect.stringContaining('<html>'),
    })
    expect(events.at(-1)?.data).toMatchObject({ ok: true, mode: 'builtin' })
  })

  it('传递 messages 与 currentHtml 给 streamHtml（迭代）', async () => {
    process.env[BAILIAN_API_ENV] = 'test-fake-key-not-real'

    let seen: {
      messages?: { role: string; content: string }[]
      currentHtml?: string
      prompt?: string
    } = {}

    const streamHtml: StreamHtmlFn = async (opts) => {
      seen = {
        messages: opts.messages,
        currentHtml: opts.currentHtml,
        prompt: opts.prompt,
      }
      return { ok: true, html: '<html><body>iter</body></html>' }
    }

    const app = createApp({ streamHtml })
    const res = await request(app)
      .post('/api/generate')
      .send({
        prompt: '加排行榜',
        messages: [
          { role: 'user', content: '做贪吃蛇' },
          { role: 'assistant', content: '完成' },
        ],
        currentHtml: '<html>old</html>',
      })

    expect(res.status).toBe(200)
    expect(seen.prompt).toBe('加排行榜')
    expect(seen.currentHtml).toBe('<html>old</html>')
    expect(seen.messages?.[0]?.content).toBe('做贪吃蛇')
  })

  it('mock LLM 返回额度错误时 error.kind=quota 且 suggestByok', async () => {
    process.env[BAILIAN_API_ENV] = 'test-fake-key-not-real'

    const streamHtml: StreamHtmlFn = async (): Promise<StreamResult> => ({
      ok: false,
      kind: 'quota',
      message: 'insufficient quota',
      status: 429,
    })

    const app = createApp({ streamHtml })
    const res = await request(app)
      .post('/api/generate')
      .send({ prompt: '任意需求', guest: true })

    const events = parseSse(res.text)
    const err = events.find((e) => e.event === 'error')
    expect(err?.data).toMatchObject({
      kind: 'quota',
      suggestByok: true,
      status: 429,
    })
    expect(events.at(-1)?.data).toMatchObject({ ok: false, kind: 'quota' })
  })

  it('访客 guest=true 仍可走注入 LLM 流式成功路径', async () => {
    process.env[BAILIAN_API_ENV] = 'test-fake-key-not-real'

    const streamHtml: StreamHtmlFn = async () => ({
      ok: true,
      html: '<!DOCTYPE html><html><body>guest</body></html>',
    })

    const app = createApp({ streamHtml })
    const res = await request(app)
      .post('/api/generate')
      .send({ prompt: '访客试试', guest: true })

    const events = parseSse(res.text)
    expect(events.find((e) => e.event === 'result')?.data).toMatchObject({
      mode: 'builtin',
    })
    expect(events.at(-1)?.data).toMatchObject({ ok: true })
  })

  it('空 Prompt 返回 400', async () => {
    const app = createApp()
    const res = await request(app).post('/api/generate').send({ prompt: '  ' })
    expect(res.status).toBe(400)
    expect(res.body.ok).toBe(false)
  })
})

describe('POST /api/race', () => {
  const savedAli = process.env[ALIQWEN_API_ENV]
  const savedBailian = process.env[BAILIAN_API_ENV]

  afterEach(() => {
    if (savedAli === undefined) delete process.env[ALIQWEN_API_ENV]
    else process.env[ALIQWEN_API_ENV] = savedAli
    if (savedBailian === undefined) delete process.env[BAILIAN_API_ENV]
    else process.env[BAILIAN_API_ENV] = savedBailian
  })

  it('无 Key 时 503', async () => {
    delete process.env[ALIQWEN_API_ENV]
    delete process.env[BAILIAN_API_ENV]
    const app = createApp({
      streamHtml: async () => ({ ok: true, html: '<html/>' }),
    })
    const res = await request(app).post('/api/race').send({ prompt: '赛马' })
    expect(res.status).toBe(503)
    expect(res.body.suggestByok).toBe(true)
  })

  it('并行两路不同模型并返回 candidates', async () => {
    process.env[BAILIAN_API_ENV] = 'test-fake-key-not-real'
    const modelsSeen: string[] = []

    const streamHtml: StreamHtmlFn = async ({ model }) => {
      modelsSeen.push(model)
      return {
        ok: true,
        html: `<html><body>${model}</body></html>`,
      }
    }

    const app = createApp({ streamHtml })
    const res = await request(app)
      .post('/api/race')
      .send({ prompt: '做一个时钟' })

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(res.body.candidates).toHaveLength(2)
    expect(res.body.candidates[0].ok).toBe(true)
    expect(res.body.candidates[1].ok).toBe(true)
    expect(modelsSeen[0]).not.toBe(modelsSeen[1])
  })

  it('一路失败时仍 ok=true 并保留成功候选', async () => {
    process.env[BAILIAN_API_ENV] = 'test-fake-key-not-real'
    let n = 0
    const streamHtml: StreamHtmlFn = async () => {
      n += 1
      if (n === 1) {
        return { ok: false, kind: 'error', message: 'lane A fail' }
      }
      return { ok: true, html: '<html><body>B</body></html>' }
    }

    const app = createApp({ streamHtml })
    const res = await request(app).post('/api/race').send({ prompt: '半失败' })
    expect(res.body.ok).toBe(true)
    const okCount = res.body.candidates.filter(
      (c: { ok: boolean }) => c.ok,
    ).length
    expect(okCount).toBe(1)
  })
})
