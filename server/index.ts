import 'dotenv/config'
import { config } from 'dotenv'
import { createApp } from './app.js'
import { bailianKeyPresenceLabel } from './lib/bailian-env.js'

// 优先加载 .env.local（本地密钥），不覆盖已有 process.env
// 系统/用户环境变量（如 aliQwen-api）已在 process.env 中，不会被空的 .env 覆盖
config({ path: '.env.local', override: false })

const port = Number(process.env.API_PORT || 3001)
const app = createApp()

app.listen(port, () => {
  // 启动日志只打印 present/missing，绝不打印 Key 本体
  console.log(`[api] listening on http://127.0.0.1:${port}`)
  console.log(`[api] bailian key: ${bailianKeyPresenceLabel()}`)
  console.log(
    `[api] Turso: ${process.env.TURSO_DATABASE_URL?.trim() && process.env.TURSO_AUTH_TOKEN?.trim() ? 'configured' : 'memory fallback'}`,
  )
})
