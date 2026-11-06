import { expect, test } from '@playwright/test'

/**
 * 最少关键路径：首页 → 访客可见 → 登记邮箱 → 新建 Task
 * /api/generate 一律 route mock，CI 友好、不依赖真实百炼 Key
 * 注意：本用例不校验刷新后仍在、也不断言 storage=turso；
 * 真写 Turso 的完整流程见 full-flow-turso.spec.ts
 */
test.describe('访客 → 登录 → 建任务', () => {
  test.beforeEach(async ({ page }) => {
    // 拦截生成接口：返回伪造 SSE，永不打真 LLM
    await page.route('**/api/generate', async (route) => {
      const body =
        `event: meta\ndata: ${JSON.stringify({ mode: 'builtin', model: 'qwen3.8-omni-flash' })}\n\n` +
        `event: chunk\ndata: ${JSON.stringify({ text: '<html><body>e2e</body></html>' })}\n\n` +
        `event: result\ndata: ${JSON.stringify({ html: '<!DOCTYPE html><html><body>e2e</body></html>', mode: 'builtin' })}\n\n` +
        `event: done\ndata: ${JSON.stringify({ ok: true, mode: 'builtin' })}\n\n`
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream; charset=utf-8',
        body,
      })
    })
  })

  test('打开首页可见访客提示，登记邮箱后可新建 Task', async ({ page }) => {
    await page.goto('/')
    // 清掉可能残留的邮箱，保证从访客态开始
    await page.evaluate(() => localStorage.removeItem('mini-atoms-email'))
    await page.reload()

    await expect(page.getByRole('heading', { name: 'Mini Atoms' })).toBeVisible()
    await expect(page.getByText(/访客模式/)).toBeVisible()

    await page.getByLabel(/邮箱登记/).fill('e2e@example.com')
    await page.getByRole('button', { name: '登录' }).click()

    await expect(page.getByText(/已登记邮箱/)).toBeVisible()
    await expect(page.getByRole('button', { name: '新建 Task' })).toBeVisible()

    await page.getByRole('button', { name: '新建 Task' }).click()
    await expect(page.getByText(/已新建 Task/)).toBeVisible()
  })
})
