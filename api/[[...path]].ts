import type { VercelRequest, VercelResponse } from '@vercel/node'
import { createApp } from '../server/app.js'

const app = createApp()

/**
 * Vercel catch-all：把 /api/* 交给同一套 Express 应用
 * 这样 health / generate / tasks 与本地行为一致
 */
export default function handler(req: VercelRequest, res: VercelResponse) {
  return app(req as never, res as never)
}
