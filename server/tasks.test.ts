import request from 'supertest'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { createApp } from './app.js'
import { resetTasksClientForTests } from './lib/tasks.js'

/**
 * S4 seam：tasks API
 * 无邮箱 403；邮箱 create→save→list→get；邮箱隔离；强制 libSQL（无内存 Map）
 */
describe('tasks API（libSQL）', () => {
  beforeEach(() => {
    // 每个用例独立 :memory: 库，避免互相污染、也不碰 Windows 文件锁
    resetTasksClientForTests()
    process.env.TURSO_DATABASE_URL = ':memory:'
    process.env.TURSO_AUTH_TOKEN = 'local-test-token'
  })

  afterEach(() => {
    resetTasksClientForTests()
  })

  it('无邮箱时 create / save / list / get 均 403', async () => {
    const app = createApp()

    const createRes = await request(app).post('/api/tasks').send({})
    expect(createRes.status).toBe(403)

    const saveRes = await request(app)
      .put('/api/tasks/any-id')
      .send({ html: '<p>x</p>', prompt: 'p' })
    expect(saveRes.status).toBe(403)

    const listRes = await request(app).get('/api/tasks')
    expect(listRes.status).toBe(403)

    const getRes = await request(app).get('/api/tasks/any-id')
    expect(getRes.status).toBe(403)
  })

  it('未配置 Turso 时 Task 写操作失败', async () => {
    delete process.env.TURSO_DATABASE_URL
    delete process.env.TURSO_AUTH_TOKEN
    resetTasksClientForTests()

    const app = createApp()
    const res = await request(app)
      .post('/api/tasks')
      .send({ email: 'x@ex.com', title: 't' })
    expect(res.status).toBe(500)
    expect(res.body.error).toMatch(/未配置 Turso/)
  })

  it('邮箱 create → save → list → get 闭环', async () => {
    const app = createApp()
    const email = 'alice@example.com'

    const created = await request(app)
      .post('/api/tasks')
      .send({ email, title: '霓虹', prompt: '做一个按钮' })
    expect(created.status).toBe(201)
    expect(created.body.ok).toBe(true)
    const id = created.body.task.id as string
    expect(id).toBeTruthy()

    const saved = await request(app)
      .put(`/api/tasks/${id}`)
      .send({
        email,
        prompt: '做一个按钮',
        html: '<!DOCTYPE html><html><body>hi</body></html>',
        generationMode: 'builtin',
        source: 'single',
      })
    expect(saved.status).toBe(200)
    expect(saved.body.task.html).toContain('<body>hi</body>')

    const listed = await request(app)
      .get('/api/tasks')
      .query({ email })
    expect(listed.status).toBe(200)
    expect(listed.body.tasks).toHaveLength(1)
    expect(listed.body.tasks[0].id).toBe(id)
    expect(listed.body.tasks[0].hasHtml).toBe(true)
    // 列表不回完整 html
    expect(listed.body.tasks[0]).not.toHaveProperty('html')

    const got = await request(app)
      .get(`/api/tasks/${id}`)
      .query({ email })
    expect(got.status).toBe(200)
    expect(got.body.task.html).toContain('<body>hi</body>')
  })

  it('按邮箱隔离：A 不可见 B 的任务', async () => {
    const app = createApp()

    const a = await request(app)
      .post('/api/tasks')
      .send({ email: 'a@ex.com', title: 'A 的任务' })
    const aId = a.body.task.id as string

    await request(app)
      .put(`/api/tasks/${aId}`)
      .send({
        email: 'a@ex.com',
        prompt: 'a',
        html: '<html>a</html>',
        generationMode: 'builtin',
      })

    const bList = await request(app)
      .get('/api/tasks')
      .query({ email: 'b@ex.com' })
    expect(bList.body.tasks).toEqual([])

    const bGet = await request(app)
      .get(`/api/tasks/${aId}`)
      .query({ email: 'b@ex.com' })
    expect(bGet.status).toBe(404)
  })
})
