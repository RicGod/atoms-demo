import 'dotenv/config'
import { config } from 'dotenv'
import { existsSync } from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import express from 'express'
import { createApp } from './app.js'
import { bailianKeyPresenceLabel } from './lib/bailian-env.js'

// 优先加载 .env.local（本地密钥），不覆盖已有 process.env
// 系统/用户环境变量（如 aliQwen-api）已在 process.env 中，不会被空的 .env 覆盖
config({ path: '.env.local', override: false })

const app = createApp()

/**
 * 生产托管：若存在 Vite 构建产物 dist/，则由同一 Express 进程托管静态资源 + SPA fallback。
 * 供 Render 单 Web Service 使用；本地仅跑 API（无 dist）时行为不变。
 */
const distDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist')
if (existsSync(distDir)) {
  // 静态资源（js/css/assets）；未命中文件时 next() 到下方 SPA fallback
  app.use(express.static(distDir))
  // SPA：非 /api 的 GET 回退到 index.html（API 已在 createApp 中优先注册）
  app.get(/^(?!\/api\/).*/, (_req, res) => {
    res.sendFile(path.join(distDir, 'index.html'))
  })
  console.log(`[api] serving static from ${distDir}`)
}

// Render 注入 PORT；本地仍可用 API_PORT（默认 3001）
const port = Number(process.env.PORT || process.env.API_PORT || 3001)

app.listen(port, () => {
  // 启动日志只打印 present/missing，绝不打印 Key 本体
  console.log(`[api] listening on http://127.0.0.1:${port}`)
  console.log(`[api] bailian key: ${bailianKeyPresenceLabel()}`)
  console.log(
    `[api] Turso: ${process.env.TURSO_DATABASE_URL?.trim() && process.env.TURSO_AUTH_TOKEN?.trim() ? 'configured' : 'memory fallback'}`,
  )
})
