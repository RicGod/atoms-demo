import request from 'supertest'
import { describe, expect, it } from 'vitest'
import { createApp } from './app.js'

/**
 * S1 seam：GET /api/health
 * 验证 ok / bailianConfigured / tursoConfigured / storage 形状（不暴露密钥）
 */
describe('GET /api/health', () => {
  it('返回 ok 与配置布尔、storage 形状', async () => {
    const app = createApp()
    const res = await request(app).get('/api/health')

    expect(res.status).toBe(200)
    expect(res.body.ok).toBe(true)
    expect(typeof res.body.bailianConfigured).toBe('boolean')
    expect(typeof res.body.tursoConfigured).toBe('boolean')
    // 已取消内存降级：storage 仅 turso | unconfigured
    expect(['turso', 'unconfigured']).toContain(res.body.storage)
    expect(res.body.storage).toBe(
      res.body.tursoConfigured ? 'turso' : 'unconfigured',
    )
    // 响应不得夹带密钥字段
    expect(res.body).not.toHaveProperty('apiKey')
    expect(JSON.stringify(res.body)).not.toMatch(/sk-|Bearer /i)
  })
})
