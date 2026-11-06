import { defineConfig, devices } from '@playwright/test'

/**
 * E2E：经 Vite 代理打本地 API。
 * - generate 可在用例内 page.route mock（不依赖真百炼 Key）
 * - Task CRUD 默认打真实 /api/tasks；full-flow-turso 要求 storage=turso
 * - webServer 在仓库根执行 npm run dev → server/index.ts 加载 .env.local
 */
export default defineConfig({
  testDir: 'e2e',
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: process.env.CI ? 1 : 0,
  workers: 1,
  timeout: 90_000,
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'on-first-retry',
  },
  // 使用本机 Chrome，避免 CI/本机下载 Playwright 自带 Chromium（体积大）
  projects: [
    {
      name: 'chromium',
      use: { ...devices['Desktop Chrome'], channel: 'chrome' },
    },
  ],
  webServer: {
    // 同时起 web + api；cwd 默认为配置文件所在目录（仓库根），以便加载 .env.local
    command: 'npm run dev',
    url: 'http://127.0.0.1:5173',
    // 本地可复用已起的 dev；请确认该进程 health.storage === "turso"
    reuseExistingServer: !process.env.CI,
    timeout: 120_000,
  },
})
