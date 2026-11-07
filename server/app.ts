import cors from 'cors'
import express, { type Request, type Response } from 'express'
import {
  BUILTIN_MODELS,
  type BuiltinModel,
  type GenerationMode,
  type TaskSource,
} from '../shared/constants.js'
import {
  extractHtml,
  streamBuiltinHtml,
  summarizeVersionChange,
  type ChatTurn,
  type StreamResult,
} from './lib/bailian.js'
import { getBailianApiKey, isBailianConfigured } from './lib/bailian-env.js'
import { sanitizeChangeSummary } from '../shared/versions.js'
import {
  createTask,
  deleteTask,
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
  messages?: ChatTurn[]
  currentHtml?: string
  onChunk?: (text: string) => void
  onThinking?: (text: string) => void
  signal?: AbortSignal
}) => Promise<StreamResult>

export type CreateAppOptions = {
  /** 默认走真实百炼；单测注入 mock provider */
  streamHtml?: StreamHtmlFn
}

/** 规范化前端传入的对话历史 */
function parseMessages(raw: unknown): ChatTurn[] | undefined {
  if (!Array.isArray(raw)) return undefined
  const out: ChatTurn[] = []
  for (const item of raw) {
    if (!item || typeof item !== 'object') continue
    const role = (item as { role?: string }).role
    const content = String((item as { content?: unknown }).content ?? '').trim()
    if (!content) continue
    if (role === 'user' || role === 'assistant') {
      out.push({ role, content })
    }
  }
  return out.length ? out : undefined
}

/** 创建 Express 应用：本地 / Render Node 与可选 Vercel serverless 共用 */
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
      // 已取消内存降级：未配置时为 unconfigured，Task API 会 500
      storage: isTursoConfigured() ? 'turso' : 'unconfigured',
    })
  })

  // 内置模型列表（不含任何密钥）
  app.get('/api/models', (_req, res) => {
    res.json({ models: [...BUILTIN_MODELS] })
  })

  /**
   * 为本轮生成补一句短摘要（版本卡用）
   * body: { prompt, isIteration? }
   * 失败时仍 200 + ok:false，前端回退 Prompt 截断
   */
  app.post('/api/summarize-version', async (req: Request, res: Response) => {
    const prompt = String(req.body?.prompt ?? '').trim()
    if (!prompt) {
      res.status(400).json({ ok: false, error: 'Prompt 不能为空' })
      return
    }
    const apiKey = getBailianApiKey()
    if (!apiKey) {
      res.json({
        ok: false,
        error: '未配置百炼 Key',
        summary: sanitizeChangeSummary('', prompt),
      })
      return
    }
    try {
      const result = await summarizeVersionChange({
        prompt,
        apiKey,
        isIteration: Boolean(req.body?.isIteration),
      })
      if (result.ok) {
        res.json({ ok: true, summary: result.summary })
        return
      }
      res.json({
        ok: false,
        error: result.message,
        summary: sanitizeChangeSummary('', prompt),
      })
    } catch (e) {
      res.json({
        ok: false,
        error: e instanceof Error ? e.message : String(e),
        summary: sanitizeChangeSummary('', prompt),
      })
    }
  })

  /**
   * 服务端内置生成（流式 SSE）
   * body: { prompt, model?, messages?, currentHtml?, guest?: boolean }
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

    const messages = parseMessages(req.body?.messages)
    const currentHtml =
      typeof req.body?.currentHtml === 'string'
        ? req.body.currentHtml
        : undefined

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

    // 步骤：流式过程兼容旧 chunk，并增补 thinking / delta / html
    let rawAccum = ''
    let lastHtmlEmit = 0
    const emitProgressiveHtml = (force = false) => {
      const now = Date.now()
      if (!force && now - lastHtmlEmit < 180) return
      lastHtmlEmit = now
      if (!rawAccum.trim()) return
      // 尽力预览：未完成文档也经 extractHtml 包一层可渲染壳
      send('html', { html: extractHtml(rawAccum) })
    }

    // 经注入的 streamHtml 调用，测试可替换而不触达百炼
    const result = await streamHtml({
      prompt,
      model,
      apiKey,
      messages,
      currentHtml,
      onThinking: (text) => send('thinking', { text }),
      onChunk: (text) => {
        // 兼容：旧前端只认 chunk
        send('chunk', { text })
        // 新协议：正文 delta + 周期性 html 快照
        send('delta', { text })
        rawAccum += text
        emitProgressiveHtml(false)
      },
      signal: req.aborted ? AbortSignal.abort() : undefined,
    })

    if (result.ok) {
      // 结束前再推一帧完整 html，便于前端右侧代码区对齐终稿
      send('html', { html: result.html })
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

  /**
   * 赛马薄封装：固定两路并行 generate（不同内置模型）
   * 仅语义封装；鉴权由前端保证「已登录才调用」
   * body: { prompt, messages?, currentHtml?, models?: [m1,m2] }
   */
  app.post('/api/race', async (req: Request, res: Response) => {
    const prompt = String(req.body?.prompt ?? '').trim()
    if (!prompt) {
      res.status(400).json({ ok: false, error: 'Prompt 不能为空' })
      return
    }

    const messages = parseMessages(req.body?.messages)
    const currentHtml =
      typeof req.body?.currentHtml === 'string'
        ? req.body.currentHtml
        : undefined

    // 步骤：固定两路不同内置模型；非法输入回退前两个默认模型
    const rawModels = Array.isArray(req.body?.models) ? req.body.models : []
    const pickModel = (raw: unknown, fallback: BuiltinModel): BuiltinModel => {
      const s = String(raw ?? '')
      return (BUILTIN_MODELS as readonly string[]).includes(s)
        ? (s as BuiltinModel)
        : fallback
    }
    const modelA = pickModel(rawModels[0], BUILTIN_MODELS[0])
    // 第二路尽量与第一路不同
    const fallbackB =
      BUILTIN_MODELS.find((m) => m !== modelA) ?? BUILTIN_MODELS[1]
    const modelB = pickModel(rawModels[1], fallbackB)
    const models: [BuiltinModel, BuiltinModel] = [
      modelA,
      modelB === modelA ? fallbackB : modelB,
    ]

    const apiKey = getBailianApiKey()
    if (!apiKey) {
      res.status(503).json({
        ok: false,
        error:
          '服务端未配置百炼 Key，无法赛马；请配置后重试或改用自配模型（单路）',
        suggestByok: true,
      })
      return
    }

    // 步骤：并行两次 streamHtml，不做自动打分
    const runOne = async (model: BuiltinModel, lane: 'A' | 'B') => {
      const result = await streamHtml({
        prompt,
        model,
        apiKey,
        messages,
        currentHtml,
      })
      if (result.ok) {
        return {
          lane,
          model,
          ok: true as const,
          html: result.html,
          mode: 'builtin' as GenerationMode,
        }
      }
      return {
        lane,
        model,
        ok: false as const,
        kind: result.kind,
        message: result.message,
      }
    }

    const [a, b] = await Promise.all([
      runOne(models[0], 'A'),
      runOne(models[1], 'B'),
    ])

    res.json({
      ok: a.ok || b.ok,
      candidates: [a, b],
    })
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
      // 列表不返回完整 html / chat / versions，减小体积
      res.json({
        ok: true,
        tasks: tasks.map(
          ({ html: _h, chat: _c, versions: _v, ...rest }) => ({
            ...rest,
            hasHtml: Boolean(_h),
            versionCount: _v.length,
          }),
        ),
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

  /** 删除项目；访客拒绝 */
  app.delete('/api/tasks/:id', async (req, res) => {
    const email = String(
      req.query.email ?? req.body?.email ?? '',
    ).trim()
    if (!email) {
      res.status(403).json({ ok: false, error: '访客无法删除，请先登记邮箱' })
      return
    }
    try {
      await deleteTask(req.params.id, email)
      res.json({ ok: true })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      const status = /不存在|无权/.test(msg) ? 404 : 500
      res.status(status).json({ ok: false, error: msg })
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
    // 步骤：对话 / versions 可选；未传则服务端保留或惰性迁移
    const chat = req.body?.chat
    const versions = req.body?.versions
    const currentVersionN = req.body?.currentVersionN

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
        chat,
        versions,
        currentVersionN,
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
