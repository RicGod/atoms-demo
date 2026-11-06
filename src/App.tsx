import { useEffect, useMemo, useRef, useState } from 'react'
import { BUILTIN_MODELS } from '../shared/constants'
import { ByokModal } from './components/ByokModal'
import {
  createTask,
  deleteTask,
  fetchTasks,
  generateBuiltin,
  openTask,
  raceBuiltin,
  saveTask,
  type RaceCandidate,
} from './lib/api'
import {
  clearByok,
  ensureBuiltinProfiles,
  getActiveByok,
  getActiveProfile,
  isBuiltinProfile,
  loadByokStore,
  saveByokStore,
  streamByokHtml,
} from './lib/byok'
import { doneStatusLabel } from './lib/labels'
import { revealHtmlGradually } from './lib/stream-example'
import type { DiffLine } from './lib/line-diff'
import { collapseUnchanged, diffLines } from './lib/line-diff'
import {
  EMAIL_STORAGE_KEY,
  PRESETS,
  type ByokStore,
  type GenerationMode,
  type TaskSummary,
} from './lib/types'
import { GuestHome } from './views/GuestHome'
import { LoginView } from './views/LoginView'
import { ProjectList } from './views/ProjectList'
import {
  chatToMessages,
  Workspace,
  type ChatItem,
} from './views/Workspace'

type View = 'home' | 'login' | 'projects' | 'workspace'
type Status = { kind: 'idle' | 'info' | 'error'; text: string }

let seq = 0
const nid = (prefix: string) => `${prefix}-${++seq}`

/** 步骤：失败写入对话内 error 气泡（不进模型上下文） */
function chatWithError(base: ChatItem[], text: string): ChatItem[] {
  return [...base, { kind: 'error', id: nid('e'), text }]
}

export default function App() {
  const [view, setView] = useState<View>('home')
  const [email, setEmail] = useState('')
  const [emailDraft, setEmailDraft] = useState('')

  const [prompt, setPrompt] = useState('做一个可点击的霓虹风格打卡按钮')
  // 步骤：默认用 flash，降低访客首包超时导致误走失败路径的概率
  const [model, setModel] = useState<string>('qwen3.8-flash')
  const [preferByok, setPreferByok] = useState(false)
  // 步骤：本机多模型仓库；生成时取 active 配置
  const [byokStore, setByokStore] = useState<ByokStore>({
    profiles: [],
    activeId: null,
  })
  const [showByok, setShowByok] = useState(false)
  const [deletingId, setDeletingId] = useState<string | null>(null)
  const byok = useMemo(() => getActiveByok(byokStore), [byokStore])
  const activeProfile = useMemo(() => getActiveProfile(byokStore), [byokStore])
  // 步骤：有选用条目即可生成（含平台默认模型）
  const hasModel = Boolean(activeProfile)

  const [html, setHtml] = useState('')
  const [streaming, setStreaming] = useState(false)
  const [racing, setRacing] = useState(false)
  const [creating, setCreating] = useState(false)
  const [status, setStatus] = useState<Status>({ kind: 'idle', text: '' })

  const [tasks, setTasks] = useState<TaskSummary[]>([])
  const [filter, setFilter] = useState<'all' | 'fav'>('all')
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [guestSession, setGuestSession] = useState(false)

  const [chat, setChat] = useState<ChatItem[]>([])
  const [draft, setDraft] = useState('')
  const [pane, setPane] = useState<'preview' | 'code'>('preview')
  // 版本号仅驱动装饰「版本 N」卡片，不用于回看
  const [, setVersionN] = useState(0)
  const [raceCandidates, setRaceCandidates] = useState<RaceCandidate[] | null>(
    null,
  )
  // 流式：思考链与阶段性亲和文案
  const [streamThinking, setStreamThinking] = useState('')
  const [streamStage, setStreamStage] = useState('')
  /** 步骤：迭代流式中（代码区冻旧稿），用于「修改中」态与阶段文案 */
  const [iterationStreaming, setIterationStreaming] = useState(false)
  /** 迭代完成后代码区展示的「相对上一版」行 diff（折叠未改动） */
  const [codeDiff, setCodeDiff] = useState<DiffLine[] | null>(null)
  /** 赛马发送时的对话快照，供择优落库 */
  const raceChatAtSendRef = useRef<ChatItem[] | null>(null)

  /** 无思考链时轮换阶段文案，避免只显示「生成中」（省略号由 UI 动态点出） */
  const beginStreamUi = () => {
    setStreamThinking('')
    setStreamStage('正在理解你的需求')
    setPane('code')
  }

  /**
   * 按已收到 HTML 推进阶段文案（省略号由 UI 动态点出，此处不写死 …）
   * @param iterating 迭代时不刷代码区，改用「正在改代码 / 应用改动」系列，避免静默空窗
   */
  const bumpStageFromHtml = (partial: string, iterating = false) => {
    if (iterating) {
      if (partial.includes('</style>') || /<style[\s>]/i.test(partial)) {
        setStreamStage('正在调整样式与结构')
      } else if (/<body[\s>]/i.test(partial)) {
        setStreamStage('正在应用改动')
      } else if (/<!DOCTYPE|<html/i.test(partial)) {
        setStreamStage('正在改代码')
      } else if (partial.length > 40) {
        setStreamStage('正在写入变更')
      } else {
        setStreamStage('正在改代码')
      }
      return
    }
    if (partial.includes('</style>') || /<style[\s>]/i.test(partial)) {
      setStreamStage('正在排布样式与结构')
    } else if (/<body[\s>]/i.test(partial)) {
      setStreamStage('正在填充页面内容')
    } else if (/<!DOCTYPE|<html/i.test(partial)) {
      setStreamStage('正在搭建 HTML 骨架')
    } else if (partial.length > 40) {
      setStreamStage('正在写入源码')
    }
  }

  /**
   * 生成成功后的助手回复：结合本轮诉求与是否迭代，避免千篇一律的固定句
   * （不另调模型，控制成本与延迟）
   */
  const friendlyDone = (
    source: 'single' | 'horse-race',
    guest: boolean,
    userPrompt: string,
    chatAtSend: ChatItem[],
  ) => {
    const raw = userPrompt.trim().replace(/\s+/g, ' ')
    const topic =
      raw.length <= 24 ? raw : `${raw.slice(0, 24)}…`
    const isIteration = chatAtSend.some((c) => c.kind === 'version')
    const nextVer =
      chatAtSend.reduce(
        (m, c) => (c.kind === 'version' ? Math.max(m, c.n) : m),
        0,
      ) + 1

    if (source === 'horse-race') {
      return `已选定「${topic}」这一版（赛马择优），右侧可预览。继续说要改的点就行。`
    }
    if (guest) {
      return isIteration
        ? `已按「${topic}」改了一版，右侧可先看效果。登录后能保存项目并继续迭代。`
        : `已按「${topic}」生成初版，右侧可预览。登录后能保存成项目，接着对话优化。`
    }
    if (isIteration) {
      // 步骤：迭代场景强调「针对性修改」而非「又出了一整版固定话术」
      const tails = [
        '请在右侧确认效果；还要改哪里直接说。',
        '若和预期有出入，指出具体位置我继续改。',
        '可以继续提交互、样式或逻辑上的调整。',
      ]
      const tail = tails[(nextVer - 1) % tails.length]
      return `第 ${nextVer} 版已按「${topic}」做了针对性调整。${tail}`
    }
    const firstTails = [
      '右侧可预览 / 看代码；想加功能或修问题，接着说即可。',
      '先在右侧点一点试试；下一步需求直接发给我。',
      '初版已就绪，继续描述要优化的点就行。',
    ]
    const tail = firstTails[Math.abs(raw.length) % firstTails.length]
    return `已根据「${topic}」生成第 1 版。${tail}`
  }

  const signedIn = Boolean(email.trim())

  // 步骤：启动时恢复邮箱与自配（自配 UI 仅登录后展示）
  useEffect(() => {
    const saved = localStorage.getItem(EMAIL_STORAGE_KEY) || ''
    if (saved) {
      setEmail(saved)
      setEmailDraft(saved)
      setView('projects')
    }
    // 步骤：启动即注入平台默认模型（qwen3.8-flash）
    const store = ensureBuiltinProfiles(loadByokStore())
    setByokStore(store)
    setPreferByok(Boolean(store.activeId))
    saveByokStore(store)
  }, [])

  useEffect(() => {
    if (!signedIn) {
      setTasks([])
      return
    }
    void refreshTasks(email)
  }, [signedIn, email])

  const refreshTasks = async (em: string) => {
    try {
      const list = await fetchTasks(em)
      setTasks(list)
    } catch (e) {
      setStatus({
        kind: 'error',
        text: e instanceof Error ? e.message : String(e),
      })
    }
  }

  const activeTitle = useMemo(() => {
    if (guestSession) return draft.trim() || prompt.slice(0, 24) || '访客预览'
    const t = tasks.find((x) => x.id === activeTaskId)
    return t?.title || t?.prompt?.slice(0, 32) || '项目'
  }, [guestSession, draft, prompt, tasks, activeTaskId])

  const onLogin = () => {
    const next = emailDraft.trim()
    if (!next || !next.includes('@')) {
      setStatus({ kind: 'error', text: '请输入有效邮箱' })
      return
    }
    setEmail(next)
    localStorage.setItem(EMAIL_STORAGE_KEY, next)
    setGuestSession(false)
    setActiveTaskId(null)
    setView('projects')
    setStatus({
      kind: 'info',
      text: '已登记邮箱。当前无需验证码，请妥善保管邮箱入口。',
    })
  }

  const onLogout = () => {
    setEmail('')
    localStorage.removeItem(EMAIL_STORAGE_KEY)
    setActiveTaskId(null)
    setTasks([])
    setGuestSession(false)
    setChat([])
    setHtml('')
    setView('home')
    setStatus({ kind: 'info', text: '已退出，可继续以访客体验' })
  }

  /**
   * 打开演示应用：带思考过程 + 源码逐步写出（禁止整页蹦出）
   * 仅访客可用；登录用户禁止走此路径（避免冲掉项目并误显示预设）
   * @param softFallback 为 true 时表示云端暂不可用后的温和切换，不暴露技术原因
   */
  const playExample = async (
    pick: (typeof PRESETS)[number],
    softFallback = false,
  ) => {
    // 步骤：登录态绝不进入演示兜底
    if (email.trim()) {
      setStatus({
        kind: 'error',
        text: '已登录请在项目内使用自配模型生成，不会再切换到演示应用',
      })
      return
    }
    setGuestSession(true)
    setActiveTaskId(null)
    setRaceCandidates(null)
    setVersionN(0)
    setDraft('')
    setHtml('')
    setView('workspace')
    setStreaming(true)
    beginStreamUi()

    const userText = softFallback
      ? '先体验一份可交互演示'
      : `打开演示：${pick.label}`
    const userMsg: ChatItem = { kind: 'user', id: nid('u'), text: userText }
    setChat([userMsg])
    setStatus({
      kind: 'info',
      text: softFallback
        ? '云端稍忙，先为你打开一份演示应用…'
        : `正在打开演示「${pick.label}」…`,
    })

    try {
      const res = await fetch(pick.path)
      if (!res.ok) throw new Error('演示加载失败')
      const fullHtml = await res.text()
      if (!fullHtml.trim()) throw new Error('演示内容为空')

      await revealHtmlGradually({
        html: fullHtml,
        label: pick.label,
        onThinking: (line) => setStreamThinking((prev) => prev + line),
        onStage: (s) => setStreamStage(s),
        onHtml: (partial) => {
          setHtml(partial)
          bumpStageFromHtml(partial)
        },
      })

      applySuccess(userText, fullHtml, 'mock', 'single', [userMsg])
      if (softFallback) {
        setStatus({
          kind: 'info',
          text: `已切换到演示「${pick.label}」，可继续对话优化`,
        })
      }
    } catch {
      setStatus({
        kind: 'error',
        text: '演示暂时打不开，请稍后重试或换一份试试',
      })
      setChat((prev) => [
        ...prev,
        {
          kind: 'assistant',
          id: nid('a'),
          text: '抱歉，这份演示没能打开。换一个示例，或稍后再试～',
        },
      ])
    } finally {
      setStreaming(false)
      setStreamStage('')
    }
  }

  /** 首页点选演示 */
  const loadPreset = async (path: string) => {
    const pick = PRESETS.find((p) => p.path === path) ?? PRESETS[0]
    await playExample(pick, false)
  }

  const enterWorkspaceFresh = (opts: {
    guest: boolean
    taskId: string | null
    titleHint?: string
    existingHtml?: string
    existingPrompt?: string
    /** 步骤：从库恢复的对话；有则优先生效 */
    existingChat?: ChatItem[]
  }) => {
    setGuestSession(opts.guest)
    setActiveTaskId(opts.taskId)
    setRaceCandidates(null)
    setCodeDiff(null)
    setPane('preview')
    if (opts.existingChat && opts.existingChat.length > 0) {
      // 步骤：恢复完整对话时间线 + HTML
      setHtml(opts.existingHtml || '')
      setChat(opts.existingChat)
      const maxVer = opts.existingChat.reduce(
        (m, c) => (c.kind === 'version' ? Math.max(m, c.n) : m),
        0,
      )
      setVersionN(maxVer)
      setDraft('')
    } else if (opts.existingHtml) {
      // 步骤：旧项目无 chat 时给一条引导，避免空白
      setHtml(opts.existingHtml)
      setChat([
        {
          kind: 'assistant',
          id: nid('a'),
          text: '已打开项目当前页面，可继续对话迭代。有想改的直接说就行。',
        },
        {
          kind: 'version',
          id: nid('v'),
          n: 1,
          label: '当前保存版本',
        },
      ])
      setVersionN(1)
      if (opts.existingPrompt) setDraft('')
    } else {
      setHtml('')
      setChat([])
      setVersionN(0)
      if (opts.titleHint) setDraft(opts.titleHint)
    }
    setView('workspace')
  }

  /** 单路生成 / 对话迭代 */
  const runGenerate = async (userText: string) => {
    const p = userText.trim()
    if (!p) {
      setStatus({ kind: 'error', text: '请先描述你的想法' })
      return
    }

    // 步骤：已登录且打开了项目 → 强制项目模式（禁止误走访客演示兜底）
    const inProject = Boolean(signedIn && activeTaskId)
    if (inProject) {
      // 步骤：纠正历史 guestSession 残留，避免再次掉进 preset 演示
      if (guestSession) setGuestSession(false)
      if (!activeProfile) {
        setStatus({
          kind: 'error',
          text: '请先选择或配置模型，配置完成后即可开始生成',
        })
        setShowByok(true)
        return
      }
    } else if (signedIn && !guestSession && !activeTaskId) {
      setStatus({ kind: 'error', text: '请先新建或打开项目' })
      return
    }

    setStreaming(true)
    beginStreamUi()
    setRaceCandidates(null)
    setStatus({ kind: 'info', text: '正在生成，源码会实时出现在右侧…' })
    const userMsg: ChatItem = { kind: 'user', id: nid('u'), text: p }
    // 步骤：发送瞬间冻结对话快照，避免长请求后 setState prev 丢首轮 user
    const chatAtSend: ChatItem[] = [...chat, userMsg]
    setChat(chatAtSend)
    setDraft('')

    const history = chatToMessages(chatAtSend)
    const currentHtml = html || undefined
    // 步骤：已有页面再改 = 迭代；代码区保留旧稿，避免整页从头流式刷一遍
    const isIteration = Boolean(currentHtml?.trim())
    setIterationStreaming(isIteration)
    setCodeDiff(null)
    if (!isIteration) {
      setHtml('')
    } else {
      setStreamStage('正在按你的要求修改现有页面')
    }

    try {
      // 步骤：项目内 — 平台默认走服务端；自配走浏览器直连；失败只报错
      if (inProject && activeProfile && isBuiltinProfile(activeProfile)) {
        if (!isIteration) setHtml('')
        const result = await generateBuiltin({
          prompt: p,
          model: activeProfile.model,
          messages: history,
          currentHtml,
          onThinking: (t) => {
            setStreamThinking((prev) => prev + t)
            setStreamStage(
              isIteration ? '正在针对性修改' : '正在思考怎么实现',
            )
          },
          onHtml: (h) => {
            bumpStageFromHtml(h, isIteration)
            if (!isIteration) setHtml(h)
          },
        })
        if (result.ok) {
          applySuccess(
            p,
            result.html,
            result.mode,
            'single',
            chatAtSend,
            isIteration ? currentHtml : undefined,
          )
          return
        }
        setChat(
          chatWithError(
            chatAtSend,
            result.message || '平台默认模型生成失败，请稍后重试',
          ),
        )
        setStatus({ kind: 'idle', text: '' })
        return
      }

      if (inProject && byok) {
        const result = await streamByokHtml({
          prompt: p,
          config: byok,
          currentHtml,
          messages: history,
          onThinking: (t) => {
            setStreamThinking((prev) => prev + t)
            setStreamStage(
              isIteration ? '正在针对性修改' : '模型正在思考',
            )
          },
          onHtml: (h) => {
            bumpStageFromHtml(h, isIteration)
            // 步骤：仅初版把流式正文推到代码区；迭代等完成后再用 diff 展示
            if (!isIteration) setHtml(h)
          },
        })
        if (result.ok) {
          applySuccess(
            p,
            result.html,
            'byok',
            'single',
            chatAtSend,
            isIteration ? currentHtml : undefined,
          )
          return
        }
        // 步骤：真实错误进对话框，不再挂在输入框下方
        const detail = result.message
          ? `模型调用失败：${result.message.slice(0, 180)}`
          : '模型暂时不可用，请检查 Base URL、密钥、模型名，以及浏览器是否被 CORS 拦截'
        setChat(chatWithError(chatAtSend, detail))
        setStatus({ kind: 'idle', text: '' })
        return
      }

      // 步骤：仅访客走云端生成；失败不静默切预设
      if (!isIteration) setHtml('')
      const result = await generateBuiltin({
        prompt: p,
        model,
        messages: history,
        currentHtml,
        onThinking: (t) => {
          setStreamThinking((prev) => prev + t)
          setStreamStage(
            isIteration ? '正在针对性修改' : '正在思考怎么实现',
          )
        },
        onHtml: (h) => {
          bumpStageFromHtml(h, isIteration)
          if (!isIteration) setHtml(h)
        },
      })

      if (result.ok) {
        applySuccess(
          p,
          result.html,
          result.mode,
          'single',
          chatAtSend,
          isIteration ? currentHtml : undefined,
        )
        return
      }

      // 步骤：失败只报错进对话；禁止再静默随机切预设
      const failText =
        result.message ||
        (signedIn
          ? '这一轮没生成成功，可以换个说法再试，或检查模型配置'
          : '云端生成没有成功。可稍后再试，或回首页点选「演示」体验示例（演示与本次输入无关）')
      setChat(chatWithError(chatAtSend, failText))
      setStatus({ kind: 'idle', text: '' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setChat(chatWithError(chatAtSend, `生成异常：${msg.slice(0, 160)}`))
      setStatus({ kind: 'idle', text: '' })
    } finally {
      setStreaming(false)
      setIterationStreaming(false)
      setStreamStage('')
    }
  }

  /**
   * 生成成功：更新预览，并基于「发送时对话快照」追加 assistant/version 后落库
   * @param chatAtSend 发送瞬间的完整对话（必须已含本轮 user），禁止再从可能被清空的 state 推导
   */
  const applySuccess = (
    userPrompt: string,
    nextHtml: string,
    nextMode: GenerationMode,
    source: 'single' | 'horse-race',
    chatAtSend: ChatItem[],
    /** 迭代前的 HTML；有则代码区展示变更对照，而非整页重播 */
    previousHtml?: string,
  ) => {
    setHtml(nextHtml)
    setPrompt(userPrompt)
    setStreamThinking('')
    setStreamStage('')
    const maxVer = chatAtSend.reduce(
      (m, c) => (c.kind === 'version' ? Math.max(m, c.n) : m),
      0,
    )
    const nextVer = maxVer + 1
    const nextChat: ChatItem[] = [
      ...chatAtSend,
      {
        kind: 'assistant',
        id: nid('a'),
        text: friendlyDone(
          source,
          guestSession || !signedIn,
          userPrompt,
          chatAtSend,
        ),
      },
      {
        kind: 'version',
        id: nid('v'),
        n: nextVer,
        label: source === 'horse-race' ? '赛马择优完成' : '本轮生成完成',
      },
    ]
    setVersionN(nextVer)
    setChat(nextChat)
    // 步骤：副作用放在 setState 外，避免 Strict Mode 双调 updater 丢消息 / 重复保存
    if (signedIn && activeTaskId) {
      void autoSave(userPrompt, nextHtml, nextMode, source, nextChat)
    }

    const hadBase = Boolean(previousHtml?.trim())
    if (hadBase && previousHtml !== nextHtml) {
      // 步骤：迭代成功 → 备好折叠 diff（代码 Tab 可看）；默认仍回预览看效果
      setCodeDiff(collapseUnchanged(diffLines(previousHtml!, nextHtml)))
      setStatus({
        kind: 'info',
        text: '已按你的要求更新预览；需要对照改动时可打开「代码」查看变更',
      })
    } else {
      setCodeDiff(null)
      setStatus({
        kind: 'info',
        text:
          source === 'horse-race' ? '已选定这一版' : doneStatusLabel(nextMode),
      })
    }
    setPane('preview')
  }

  /** 步骤：生成成功后自动覆盖写回当前项目（HTML + 对话） */
  const autoSave = async (
    userPrompt: string,
    nextHtml: string,
    nextMode: GenerationMode,
    source: 'single' | 'horse-race',
    nextChat: ChatItem[],
  ) => {
    if (!activeTaskId) return
    try {
      await saveTask({
        id: activeTaskId,
        email,
        prompt: userPrompt,
        html: nextHtml,
        generationMode: nextMode,
        source,
        chat: nextChat,
      })
      await refreshTasks(email)
      setStatus({ kind: 'info', text: '已自动保存代码与对话' })
    } catch (e) {
      // 步骤：自动保存失败也进对话区，方便用户看到
      const msg = e instanceof Error ? e.message : String(e)
      setChat((prev) => chatWithError(prev, `自动保存失败：${msg}`))
      setStatus({ kind: 'idle', text: '' })
    }
  }

  /** 访客从首页发起：进入临时工作区再生成 */
  const onGuestGenerate = async () => {
    const p = prompt.trim()
    if (!p) {
      setStatus({ kind: 'error', text: '请先描述你的想法' })
      return
    }
    // 步骤：进入访客工作区（不落库），再跑单路生成
    setGuestSession(true)
    setActiveTaskId(null)
    setRaceCandidates(null)
    setPane('preview')
    setHtml('')
    setVersionN(0)
    setDraft('')
    setView('workspace')
    await runGenerateFromHome(p)
  }

  const runGenerateFromHome = async (p: string) => {
    setStreaming(true)
    beginStreamUi()
    setStatus({ kind: 'info', text: '正在生成，源码会实时出现在右侧…' })
    const userMsg: ChatItem = { kind: 'user', id: nid('u'), text: p }
    setChat([userMsg])
    setHtml('')
    try {
      const result = await generateBuiltin({
        prompt: p,
        model,
        onThinking: (t) => {
          setStreamThinking((prev) => prev + t)
          setStreamStage('模型正在思考')
        },
        onHtml: (h) => {
          setHtml(h)
          bumpStageFromHtml(h)
        },
      })
      if (result.ok) {
        setHtml(result.html)
        setVersionN(1)
        setStreamThinking('')
        setStreamStage('')
        setChat([
          userMsg,
          {
            kind: 'assistant',
            id: nid('a'),
            text: friendlyDone('single', true, p, [userMsg]),
          },
          {
            kind: 'version',
            id: nid('v'),
            n: 1,
            label: '本轮生成完成',
          },
        ])
        setStatus({ kind: 'info', text: doneStatusLabel(result.mode) })
        setPane('preview')
        return
      }
      // 步骤：访客失败进对话；不再随机套预设
      setChat(
        chatWithError(
          [userMsg],
          result.message ||
            '云端生成没有成功，没有改用演示页。可稍后重试，或回首页点选演示示例',
        ),
      )
      setStatus({ kind: 'idle', text: '' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setChat(
        chatWithError(
          [userMsg],
          `生成异常：${msg.slice(0, 160)}。请确认本地 API（:3001）已启动`,
        ),
      )
      setStatus({ kind: 'idle', text: '' })
    } finally {
      setStreaming(false)
      setIterationStreaming(false)
      setStreamStage('')
    }
  }

  const onRace = async () => {
    // 步骤：访客禁用赛马
    if (!signedIn || guestSession) {
      setStatus({ kind: 'error', text: '登录后才能使用赛马对比' })
      return
    }
    const p = (draft.trim() || prompt).trim()
    if (!p) {
      setStatus({ kind: 'error', text: '赛马前请先写下你的想法' })
      return
    }
    if (!activeTaskId) {
      setStatus({ kind: 'error', text: '请先打开项目再赛马' })
      return
    }

    setRacing(true)
    setRaceCandidates(null)
    setStatus({ kind: 'info', text: '赛马进行中（两路并行）…' })
    const userMsg: ChatItem = { kind: 'user', id: nid('u'), text: `[赛马] ${p}` }
    const chatAtSend: ChatItem[] = [...chat, userMsg]
    setChat(chatAtSend)
    // 步骤：择优时仍用发送快照，避免中间 state 被冲掉
    raceChatAtSendRef.current = chatAtSend

    try {
      const history = chatToMessages(chatAtSend)
      const result = await raceBuiltin({
        prompt: p,
        messages: history,
        currentHtml: html || undefined,
        models: [BUILTIN_MODELS[0], BUILTIN_MODELS[1]],
      })
      if (!result.ok) {
        if (result.suggestByok) setShowByok(true)
        setChat(chatWithError(chatAtSend, result.message))
        setStatus({ kind: 'idle', text: '' })
        return
      }
      setRaceCandidates(result.candidates)
      setStatus({ kind: 'info', text: '请选择 Winner（无自动打分）' })
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      setChat(chatWithError(chatAtSend, msg))
      setStatus({ kind: 'idle', text: '' })
    } finally {
      setRacing(false)
    }
  }

  const onPickWinner = (c: RaceCandidate & { ok: true }) => {
    setRaceCandidates(null)
    const baseline = raceChatAtSendRef.current ?? chat
    const prev = html || undefined
    applySuccess(
      draft.trim() || prompt,
      c.html,
      c.mode,
      'horse-race',
      baseline,
      prev,
    )
    setDraft('')
  }

  /** 步骤：须带非空项目名称创建（弹窗已校验，此处再兜底） */
  const onCreateProject = async (title: string) => {
    if (!signedIn) return
    const name = title.trim()
    if (!name) {
      setStatus({ kind: 'error', text: '请填写项目名称' })
      return
    }
    setCreating(true)
    try {
      const task = await createTask(email, name)
      await refreshTasks(email)
      enterWorkspaceFresh({
        guest: false,
        taskId: task.id,
        titleHint: '',
      })
      setStatus({
        kind: 'info',
        text: hasModel
          ? '已新建项目，开始对话吧（默认可用平台模型）'
          : '已新建项目。请先配置模型，再开始生成',
      })
      // 步骤：无可用模型时才弹配置（正常应已有平台默认）
      if (!hasModel) setShowByok(true)
    } catch (e) {
      setStatus({
        kind: 'error',
        text: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setCreating(false)
    }
  }

  const onOpenProject = async (id: string) => {
    if (!signedIn) return
    try {
      const task = await openTask(email, id)
      enterWorkspaceFresh({
        guest: false,
        taskId: task.id,
        existingHtml: task.html || undefined,
        existingPrompt: task.prompt,
        // 步骤：还原服务端持久化的对话
        existingChat: Array.isArray(task.chat) ? task.chat : [],
      })
      if (task.prompt) setPrompt(task.prompt)
      setStatus({ kind: 'info', text: `已打开项目：${task.title}` })
    } catch (e) {
      setStatus({
        kind: 'error',
        text: e instanceof Error ? e.message : String(e),
      })
    }
  }

  /** 步骤：删除项目；若正在工作区打开同一项目则退回列表 */
  const onDeleteProject = async (id: string) => {
    if (!signedIn) return
    setDeletingId(id)
    try {
      await deleteTask(email, id)
      await refreshTasks(email)
      if (activeTaskId === id) {
        setActiveTaskId(null)
        setView('projects')
        setHtml('')
        setChat([])
      }
      setStatus({ kind: 'info', text: '项目已删除' })
    } catch (e) {
      setStatus({
        kind: 'error',
        text: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setDeletingId(null)
    }
  }

  /** 步骤：写回本机模型仓库（始终保留平台默认）并同步 prefer 状态 */
  const persistByokStore = (store: ByokStore) => {
    const next = ensureBuiltinProfiles(store)
    saveByokStore(next)
    setByokStore(next)
    setPreferByok(Boolean(next.activeId && next.profiles.length))
  }

  return (
    <>
      {view === 'home' ? (
        <GuestHome
          prompt={prompt}
          onPromptChange={setPrompt}
          model={model}
          onModelChange={setModel}
          streaming={streaming}
          statusText={status.text}
          statusError={status.kind === 'error'}
          onGenerate={() => void onGuestGenerate()}
          onLogin={() => {
            setStatus({ kind: 'idle', text: '' })
            setView('login')
          }}
          onLoadPreset={(path) => void loadPreset(path)}
        />
      ) : null}

      {view === 'login' ? (
        <LoginView
          emailDraft={emailDraft}
          onEmailChange={setEmailDraft}
          statusText={status.text}
          statusError={status.kind === 'error'}
          onSubmit={onLogin}
          onBack={() => setView(signedIn ? 'projects' : 'home')}
        />
      ) : null}

      {view === 'projects' && signedIn ? (
        <ProjectList
          email={email}
          tasks={tasks}
          filter={filter}
          onFilter={setFilter}
          creating={creating}
          deletingId={deletingId}
          onCreate={(title) => void onCreateProject(title)}
          onOpen={(id) => void onOpenProject(id)}
          onDelete={(id) => void onDeleteProject(id)}
          onLogout={onLogout}
          onOpenByok={() => setShowByok(true)}
          statusText={status.text}
          statusError={status.kind === 'error'}
        />
      ) : null}

      {view === 'workspace' ? (
        <Workspace
          title={activeTitle}
          // 步骤：打开了项目即非访客工作区（避免 guestSession 残留导致 UI/链路错乱）
          guest={!(signedIn && activeTaskId) && (guestSession || !signedIn)}
          chat={chat}
          draft={draft}
          onDraftChange={setDraft}
          streaming={streaming}
          streamThinking={streamThinking}
          streamStage={streamStage}
          /** 步骤：迭代冻稿期间展示代码区「修改中」态 */
          iterationStreaming={iterationStreaming}
          html={html}
          codeDiff={codeDiff}
          model={model}
          onModelChange={setModel}
          preferByok={preferByok}
          onPreferByok={setPreferByok}
          hasByok={hasModel}
          byokProfiles={byokStore.profiles}
          activeByokId={byokStore.activeId}
          onSelectByok={(id) => {
            // 步骤：工作区切换当前模型，立即持久化
            persistByokStore({ ...byokStore, activeId: id })
          }}
          pane={pane}
          onPane={setPane}
          statusText={status.text}
          statusError={status.kind === 'error'}
          raceCandidates={raceCandidates}
          racing={racing}
          onSend={() => void runGenerate(draft)}
          onRace={() => void onRace()}
          onPickWinner={onPickWinner}
          onBack={() => {
            setRaceCandidates(null)
            if (signedIn && !guestSession) setView('projects')
            else setView('home')
          }}
          onOpenByok={() => setShowByok(true)}
        />
      ) : null}

      {/* 自配弹窗：仅登录后打开（访客首页不展示入口） */}
      {showByok && signedIn ? (
        <ByokModal
          store={byokStore}
          onClose={() => setShowByok(false)}
          onChange={(store) => {
            persistByokStore(store)
            setStatus({
              kind: 'info',
              text: '模型配置已更新（平台默认始终保留）',
            })
          }}
          onClearAll={() => {
            // 步骤：clearByok 会保留平台默认模型
            clearByok()
            const kept = ensureBuiltinProfiles({ profiles: [], activeId: null })
            setByokStore(kept)
            setPreferByok(true)
            setShowByok(false)
            setStatus({
              kind: 'info',
              text: '已清除自配模型；平台默认模型仍可用',
            })
          }}
        />
      ) : null}
    </>
  )
}
