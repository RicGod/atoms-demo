import request from 'supertest'
import { afterEach, describe, expect, it } from 'vitest'
import { createApp, type StreamHtmlFn } from './app.js'
import { ALIQWEN_API_ENV, BAILIAN_API_ENV } from './lib/bailian-env.js'
import type { StreamResult } from './lib/bailian.js'

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
