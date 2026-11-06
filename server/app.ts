import cors from 'cors'
import express, { type Request, type Response } from 'express'
import {
  BUILTIN_MODELS,
  type BuiltinModel,
  type GenerationMode,
  type TaskSource,
} from '../shared/constants.js'
import { streamBuiltinHtml, type StreamResult } from './lib/bailian.js'
import { getBailianApiKey, isBailianConfigured } from './lib/bailian-env.js'
import {
  createTask,
  getTask,
  isTursoConfigured,
  listTasks,
  saveTaskArtifact,
} from './lib/tasks.js'

/** LLM 流式生成可注入接口：测试时替换为 mock，禁止打真网 */
export type StreamHtmlFn = (options: {
  prompt: string
  model: BuiltinModel
  apiKey: string
  onChunk?: (text: string) => void
  signal?: AbortSignal
}) => Promise<StreamResult>

export type CreateAppOptions = {
  /** 默认走真实百炼；单测注入 mock provider */
  streamHtml?: StreamHtmlFn
}

/** 创建 Express 应用：本地 server 与 Vercel serverless 共用 */
export function createApp(options: CreateAppOptions = {}) {
  // 可测性 seam：允许注入 mock LLM，默认仍为真实 streamBuiltinHtml
  const streamHtml = options.streamHtml ?? streamBuiltinHtml
  const app = express()
  app.use(cors())
  app.use(express.json({ limit: '2mb' }))

  // 健康检查：便于本地与公网部署冒烟
  app.get('/api/health', (_req, res) => {
    res.json({
      ok: true,
      status: 'OK',
      time: new Date().toISOString(),
      // 只暴露是否已配置，不回传 Key
      bailianConfigured: isBailianConfigured(),
      tursoConfigured: isTursoConfigured(),
      storage: isTursoConfigured() ? 'turso' : 'memory',
    })
  })

  // 内置模型列表（不含任何密钥）
  app.get('/api/models', (_req, res) => {
    res.json({ models: [...BUILTIN_MODELS] })
  })

  /**
   * 服务端内置生成（流式 SSE）
   * body: { prompt, model?, guest?: boolean }
   * 注意：响应中永不回传 API Key（aliQwen-api / BAILIAN_API_KEY）
   */
  app.post('/api/generate', async (req: Request, res: Response) => {
    const prompt = String(req.body?.prompt ?? '').trim()
    if (!prompt) {
      res.status(400).json({ ok: false, error: 'Prompt 不能为空' })
      return
    }

    const modelRaw = String(req.body?.model ?? BUILTIN_MODELS[0])
    const model = (BUILTIN_MODELS as readonly string[]).includes(modelRaw)
      ? (modelRaw as BuiltinModel)
      : BUILTIN_MODELS[0]

    // 优先 aliQwen-api，回退 BAILIAN_API_KEY
    const apiKey = getBailianApiKey()
    const mode: GenerationMode = 'builtin'

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8')
    res.setHeader('Cache-Control', 'no-cache, no-transform')
    res.setHeader('Connection', 'keep-alive')
    res.flushHeaders?.()

    const send = (event: string, data: unknown) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`)
    }

    send('meta', { mode, model })

    if (!apiKey) {
      send('error', {
        kind: 'no_key',
        message:
          '服务端未配置百炼 Key（本地可用系统环境变量 aliQwen-api，或 BAILIAN_API_KEY），请配置后重试或改用自配模型',
        suggestByok: true,
      })
      send('done', { ok: false })
      res.end()
      return
    }

    // 经注入的 streamHtml 调用，测试可替换而不触达百炼
    const result = await streamHtml({
      prompt,
      model,
      apiKey,
      onChunk: (text) => send('chunk', { text }),
      signal: req.aborted ? AbortSignal.abort() : undefined,
    })

    if (result.ok) {
      send('result', { html: result.html, mode })
      send('done', { ok: true, mode })
    } else {
      send('error', {
        kind: result.kind,
        message: result.message,
        status: result.status,
        suggestByok: result.kind === 'quota' || result.kind === 'no_key',
        // 前端据 guest 决定是否走 mock；已登录不以 mock 为主出路
      })
      send('done', { ok: false, kind: result.kind })
    }
    res.end()
  })

  // —— Task CRUD（按邮箱隔离）——

  app.get('/api/tasks', async (req, res) => {
    const email = String(req.query.email ?? '').trim()
    if (!email) {
      // 与 create/save 一致：无邮箱视为未登记，403
      res.status(403).json({ ok: false, error: '缺少 email，请先登记邮箱' })
      return
    }
    try {
      const tasks = await listTasks(email)
      // 列表不返回完整 html，减小体积
      res.json({
        ok: true,
        tasks: tasks.map(({ html: _h, ...rest }) => ({
          ...rest,
          hasHtml: Boolean(_h),
        })),
      })
    } catch (e) {
      res.status(500).json({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  })

  app.post('/api/tasks', async (req, res) => {
    const email = String(req.body?.email ?? '').trim()
    if (!email) {
      res.status(403).json({ ok: false, error: '访客无法创建任务，请先登记邮箱' })
      return
    }
    try {
      const task = await createTask({
        email,
        title: req.body?.title,
        prompt: req.body?.prompt,
      })
      res.status(201).json({ ok: true, task })
    } catch (e) {
      res.status(500).json({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  })

  app.get('/api/tasks/:id', async (req, res) => {
    const email = String(req.query.email ?? '').trim()
    if (!email) {
      res.status(403).json({ ok: false, error: '缺少 email，请先登记邮箱' })
      return
    }
    try {
      const task = await getTask(req.params.id, email)
      if (!task) {
        res.status(404).json({ ok: false, error: '任务不存在或无权访问' })
        return
      }
      res.json({ ok: true, task })
    } catch (e) {
      res.status(500).json({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
      })
    }
  })

  /** 覆盖保存当前 Artifact；访客拒绝 */
  app.put('/api/tasks/:id', async (req, res) => {
    const email = String(req.body?.email ?? '').trim()
    if (!email) {
      res.status(403).json({ ok: false, error: '访客无法保存，请先登记邮箱' })
      return
    }
    const prompt = String(req.body?.prompt ?? '').trim()
    const html = String(req.body?.html ?? '')
    const generationMode = String(
      req.body?.generationMode ?? 'builtin',
    ) as GenerationMode
    const source = (req.body?.source as TaskSource | undefined) ?? 'single'

    if (!html.trim()) {
      res.status(400).json({ ok: false, error: '缺少可保存的 HTML' })
      return
    }

    try {
      const task = await saveTaskArtifact({
        id: req.params.id,
        email,
        prompt,
        html,
        generationMode,
        source,
        title: req.body?.title,
      })
      res.json({ ok: true, task })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const status = /不存在|无权/.test(msg) ? 404 : 500
      res.status(status).json({ ok: false, error: msg })
    }
  })

  return app
}
