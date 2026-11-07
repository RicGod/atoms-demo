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

  it('无邮箱时 create / save / list / get / delete 均 403', async () => {
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

    const delRes = await request(app).delete('/api/tasks/any-id')
    expect(delRes.status).toBe(403)
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
    expect(got.body.task.chat).toEqual([])
  })

  it('保存并可回读对话记录', async () => {
    const app = createApp()
    const email = 'chat@example.com'

    const created = await request(app)
      .post('/api/tasks')
      .send({ email, title: '对话项目' })
    const id = created.body.task.id as string

    const chat = [
      { kind: 'user', id: 'u1', text: '做一个计数器' },
      { kind: 'assistant', id: 'a1', text: '好的，已生成' },
      { kind: 'version', id: 'v1', n: 1, label: '本轮生成完成' },
    ]

    const saved = await request(app)
      .put(`/api/tasks/${id}`)
      .send({
        email,
        prompt: '做一个计数器',
        html: '<!DOCTYPE html><html><body>1</body></html>',
        generationMode: 'byok',
        source: 'single',
        chat,
      })
    expect(saved.status).toBe(200)
    expect(saved.body.task.chat).toHaveLength(3)
    expect(saved.body.task.chat[0].text).toBe('做一个计数器')

    const got = await request(app).get(`/api/tasks/${id}`).query({ email })
    expect(got.status).toBe(200)
    expect(got.body.task.chat).toEqual(chat)
    // 步骤：未传 versions 时，用 html 惰性收成 Version 1
    expect(got.body.task.versions).toHaveLength(1)
    expect(got.body.task.currentVersionN).toBe(1)

    // 列表不回完整 chat / versions
    const listed = await request(app).get('/api/tasks').query({ email })
    expect(listed.body.tasks[0]).not.toHaveProperty('chat')
    expect(listed.body.tasks[0]).not.toHaveProperty('versions')
  })

  it('保存 versions 后可回读并支持回滚指针', async () => {
    const app = createApp()
    const email = 'ver@example.com'
    const created = await request(app)
      .post('/api/tasks')
      .send({ email, title: '版本项目' })
    const id = created.body.task.id as string

    const versions = [
      {
        n: 1,
        promptSummary: '第一版',
        html: '<html>v1</html>',
        createdAt: '2026-01-01T00:00:00.000Z',
      },
      {
        n: 2,
        promptSummary: '第二版',
        html: '<html>v2</html>',
        createdAt: '2026-01-01T00:01:00.000Z',
      },
    ]

    const saved = await request(app)
      .put(`/api/tasks/${id}`)
      .send({
        email,
        prompt: '第二版',
        html: '<html>v2</html>',
        generationMode: 'builtin',
        versions,
        currentVersionN: 2,
        chat: [
          { kind: 'system', id: 's1', text: '已回滚到版本 1' },
        ],
      })
    expect(saved.status).toBe(200)
    expect(saved.body.task.versions).toHaveLength(2)
    expect(saved.body.task.currentVersionN).toBe(2)

    // 回滚：Current=1，html 应对齐 v1
    const rolled = await request(app)
      .put(`/api/tasks/${id}`)
      .send({
        email,
        prompt: '第二版',
        html: '<html>v1</html>',
        generationMode: 'builtin',
        versions,
        currentVersionN: 1,
        chat: [
          { kind: 'system', id: 's1', text: '已回滚到版本 1' },
        ],
      })
    expect(rolled.status).toBe(200)
    expect(rolled.body.task.currentVersionN).toBe(1)
    expect(rolled.body.task.html).toContain('v1')
    expect(rolled.body.task.chat[0].kind).toBe('system')
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

    // 步骤：B 也不能删除 A 的任务
    const bDel = await request(app)
      .delete(`/api/tasks/${aId}`)
      .query({ email: 'b@ex.com' })
    expect(bDel.status).toBe(404)
  })

  it('邮箱可删除自己的任务', async () => {
    const app = createApp()
    const email = 'del@example.com'

    const created = await request(app)
      .post('/api/tasks')
      .send({ email, title: '待删' })
    const id = created.body.task.id as string

    const deleted = await request(app)
      .delete(`/api/tasks/${id}`)
      .query({ email })
    expect(deleted.status).toBe(200)
    expect(deleted.body.ok).toBe(true)

    const listed = await request(app).get('/api/tasks').query({ email })
    expect(listed.body.tasks).toHaveLength(0)

    const got = await request(app).get(`/api/tasks/${id}`).query({ email })
    expect(got.status).toBe(404)
  })
})
