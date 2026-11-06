import { createClient } from '@libsql/client'
import { expect, test, type APIRequestContext } from '@playwright/test'
import { config as loadDotenv } from 'dotenv'

/**
 * 完整 UI 流程 + 真写 Turso：
 * - 仅 mock /api/generate（假 HTML），Task CRUD 必须打真实 /api/tasks
 * - 启动依赖 webServer（npm run dev）；server/index.ts 加载 .env.local → storage=turso
 * - 勿在本文件打印 TURSO_AUTH_TOKEN / 密钥
 */

loadDotenv({ path: '.env.local', override: false })

const API = 'http://127.0.0.1:3001'

/** 用 @libsql/client 直查一行，证明落库（不经 Express） */
async function countTasksByEmail(email: string): Promise<number> {
  const url = process.env.TURSO_DATABASE_URL?.trim()
  const authToken = process.env.TURSO_AUTH_TOKEN?.trim()
  if (!url || !authToken) {
    throw new Error('缺少 TURSO_DATABASE_URL / TURSO_AUTH_TOKEN（请检查 .env.local）')
  }
  const db = createClient({ url, authToken })
  const rs = await db.execute({
    sql: 'SELECT COUNT(*) AS c FROM tasks WHERE email = ?',
    args: [email.trim().toLowerCase()],
  })
  return Number(rs.rows[0]?.c ?? 0)
}

async function assertHealthTurso(request: APIRequestContext) {
  const res = await request.get(`${API}/api/health`)
  expect(res.ok()).toBeTruthy()
  const body = (await res.json()) as {
    storage?: string
    tursoConfigured?: boolean
  }
  // 证据：当前 API 进程已接 Turso，而非内存降级
  expect(body.tursoConfigured).toBe(true)
  expect(body.storage).toBe('turso')
}

test.describe('完整流程 → 真写 Turso', () => {
  const marker = `turso-e2e-${Date.now()}`
  const email = `e2e-${Date.now()}@atoms-demo.local`
  const fakeHtml = `<!DOCTYPE html><html><body data-e2e="${marker}">turso-flow-ok</body></html>`

  test.beforeEach(async ({ page }) => {
    // 只拦截 LLM 生成；绝不 mock /api/tasks*
    await page.route('**/api/generate', async (route) => {
      const body =
        `event: meta\ndata: ${JSON.stringify({ mode: 'builtin', model: 'qwen3.8-omni-flash' })}\n\n` +
        `event: chunk\ndata: ${JSON.stringify({ text: fakeHtml })}\n\n` +
        `event: result\ndata: ${JSON.stringify({ html: fakeHtml, mode: 'builtin' })}\n\n` +
        `event: done\ndata: ${JSON.stringify({ ok: true, mode: 'builtin' })}\n\n`
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream; charset=utf-8',
        body,
      })
    })
  })

  test('首页 → 登录 → 建 Task → 生成(mock) → 保存 → 刷新仍在 + 直查 Turso', async ({
    page,
    request,
  }) => {
    // 1) 证明 API 真是 turso 后端（未加载 .env.local 时会是 memory）
    await assertHealthTurso(request)

    // 2) UI：从访客态开始
    await page.goto('/')
    await page.evaluate(() => localStorage.removeItem('mini-atoms-email'))
    await page.reload()

    await expect(page.getByRole('heading', { name: 'Mini Atoms' })).toBeVisible()
    await expect(page.getByText(/访客模式/)).toBeVisible()

    await page.getByLabel(/邮箱登记/).fill(email)
    await page.getByRole('button', { name: '登录' }).click()
    await expect(page.getByText(/已登记邮箱/)).toBeVisible()

    // 3) 新建 Task（真实 POST /api/tasks）
    const createRespPromise = page.waitForResponse(
      (r) =>
        r.url().includes('/api/tasks') &&
        r.request().method() === 'POST' &&
        r.status() === 201,
    )
    await page.getByRole('button', { name: '新建 Task' }).click()
    const createResp = await createRespPromise
    const created = (await createResp.json()) as {
      ok: boolean
      task?: { id: string; title: string }
    }
    expect(created.ok).toBe(true)
    expect(created.task?.id).toBeTruthy()
    const taskId = created.task!.id
    await expect(page.getByText(/已新建 Task/)).toBeVisible()

    // 4) Prompt + 生成（mock generate，不打百炼）
    await page.getByLabel('Prompt').fill(`E2E 持久化验证 ${marker}`)
    await page.getByRole('button', { name: '生成' }).click()
    await expect(page.getByText(/内置模型生成完成/)).toBeVisible({
      timeout: 15_000,
    })
    const srcAfterGen = await page
      .locator('iframe[title="preview"]')
      .getAttribute('srcdoc')
    expect(srcAfterGen).toContain(marker)

    // 5) 保存到 Task（真实 PUT /api/tasks/:id）
    const saveRespPromise = page.waitForResponse(
      (r) =>
        r.url().includes(`/api/tasks/${taskId}`) &&
        r.request().method() === 'PUT' &&
        r.ok(),
    )
    await page.getByRole('button', { name: '保存到 Task' }).click()
    await saveRespPromise
    await expect(page.getByText(/已覆盖保存到 Task/)).toBeVisible()

    // 6) API 侧证据：list + get 有数据
    const listRes = await request.get(
      `${API}/api/tasks?email=${encodeURIComponent(email)}`,
    )
    expect(listRes.ok()).toBeTruthy()
    const listed = (await listRes.json()) as {
      ok: boolean
      tasks: Array<{ id: string; hasHtml?: boolean }>
    }
    expect(listed.ok).toBe(true)
    expect(listed.tasks.some((t) => t.id === taskId)).toBe(true)
    const summary = listed.tasks.find((t) => t.id === taskId)!
    expect(summary.hasHtml).toBe(true)

    const getRes = await request.get(
      `${API}/api/tasks/${taskId}?email=${encodeURIComponent(email)}`,
    )
    expect(getRes.ok()).toBeTruthy()
    const got = (await getRes.json()) as {
      ok: boolean
      task?: { id: string; html: string; prompt: string }
    }
    expect(got.ok).toBe(true)
    expect(got.task?.html).toContain(marker)
    expect(got.task?.prompt).toContain(marker)

    // 7) SDK 直查 Turso：该邮箱至少一行（不经 Express，证明落库）
    const count = await countTasksByEmail(email)
    expect(count).toBeGreaterThanOrEqual(1)

    // 8) 刷新页面：localStorage 恢复邮箱后列表仍能看到并打开
    // 标题在创建时取自当时 Prompt 前 40 字，保存不一定改 title → 用接口返回的 title 定位
    const titleHint = (created.task!.title || '').slice(0, 12)
    await page.reload()
    await expect(page.getByRole('button', { name: /退出/ })).toBeVisible()
    const taskBtn = page.locator('.task-list button').first()
    await expect(taskBtn).toBeVisible({ timeout: 10_000 })
    if (titleHint) {
      await expect(taskBtn).toContainText(titleHint)
    }

    await taskBtn.click()
    await expect(page.getByText(/已打开 Task/)).toBeVisible()
    const srcAfterReload = await page
      .locator('iframe[title="preview"]')
      .getAttribute('srcdoc')
    expect(srcAfterReload).toContain(marker)
  })
})
