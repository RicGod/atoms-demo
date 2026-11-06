import { useEffect, useMemo, useState } from 'react'
import { BUILTIN_MODELS } from '../shared/constants'
import { ByokModal } from './components/ByokModal'
import {
  createTask,
  fetchTasks,
  generateBuiltin,
  openTask,
  raceBuiltin,
  saveTask,
  type RaceCandidate,
} from './lib/api'
import { clearByok, loadByok, saveByok, streamByokHtml } from './lib/byok'
import { doneStatusLabel } from './lib/labels'
import { revealHtmlGradually } from './lib/stream-example'
import {
  EMAIL_STORAGE_KEY,
  PRESETS,
  type ByokConfig,
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

export default function App() {
  const [view, setView] = useState<View>('home')
  const [email, setEmail] = useState('')
  const [emailDraft, setEmailDraft] = useState('')

  const [prompt, setPrompt] = useState('做一个可点击的霓虹风格打卡按钮')
  const [model, setModel] = useState<string>(BUILTIN_MODELS[0])
  const [preferByok, setPreferByok] = useState(false)
  const [byok, setByok] = useState<ByokConfig | null>(null)
  const [showByok, setShowByok] = useState(false)

  const [html, setHtml] = useState('')
  const [mode, setMode] = useState<GenerationMode | null>(null)
  const [streaming, setStreaming] = useState(false)
  const [racing, setRacing] = useState(false)
  const [saving, setSaving] = useState(false)
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
  const [lastSource, setLastSource] = useState<'single' | 'horse-race'>('single')
  // 流式：思考链与阶段性亲和文案
  const [streamThinking, setStreamThinking] = useState('')
  const [streamStage, setStreamStage] = useState('')

  /** 无思考链时轮换阶段文案，避免只显示「生成中」 */
  const beginStreamUi = () => {
    setStreamThinking('')
    setStreamStage('正在理解你的需求…')
    setPane('code')
  }

  const bumpStageFromHtml = (partial: string) => {
    if (partial.includes('</style>') || /<style[\s>]/i.test(partial)) {
      setStreamStage('正在排布样式与结构…')
    } else if (/<body[\s>]/i.test(partial)) {
      setStreamStage('正在填充页面内容…')
    } else if (/<!DOCTYPE|<html/i.test(partial)) {
      setStreamStage('正在搭建 HTML 骨架…')
    } else if (partial.length > 40) {
      setStreamStage('正在写入源码…')
    }
  }

  const friendlyDone = (source: 'single' | 'horse-race', guest: boolean) => {
    if (source === 'horse-race') {
      return '已选好这一版，右侧可以预览和看代码。想继续打磨的话直接跟我说就行。'
    }
    if (guest) {
      // 步骤：访客完成生成后的产品化引导（保存项目 / 持续对话）
      return '这一版已经好了，可先在右侧预览。登录后解锁更多功能，能保存成项目并持续对话优化～'
    }
    return '这一版已经好了，右侧可预览 / 查看代码。有什么需要优化的继续跟我说就行。'
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
    const cfg = loadByok()
    if (cfg) {
      setByok(cfg)
      setPreferByok(true)
    }
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
   * @param softFallback 为 true 时表示云端暂不可用后的温和切换，不暴露技术原因
   */
  const playExample = async (
    pick: (typeof PRESETS)[number],
    softFallback = false,
  ) => {
    setGuestSession(true)
    setActiveTaskId(null)
    setRaceCandidates(null)
    setLastSource('single')
    setMode(null)
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

      applySuccess(userText, fullHtml, 'mock', 'single')
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

  /** 云端不可用时温和切换到演示（对用户隐藏技术细节） */
  const fallbackMock = async (_reason: string) => {
    const pick = PRESETS[Math.floor(Math.random() * PRESETS.length)]
    await playExample(pick, true)
  }

  const enterWorkspaceFresh = (opts: {
    guest: boolean
    taskId: string | null
    titleHint?: string
    existingHtml?: string
    existingPrompt?: string
    existingMode?: GenerationMode | null
  }) => {
    setGuestSession(opts.guest)
    setActiveTaskId(opts.taskId)
    setRaceCandidates(null)
    setLastSource('single')
    setPane('preview')
    if (opts.existingHtml) {
      setHtml(opts.existingHtml)
      setMode(opts.existingMode ?? 'builtin')
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
      setMode(null)
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
    if (signedIn && !guestSession && !activeTaskId) {
      setStatus({ kind: 'error', text: '请先新建或打开项目' })
      return
    }

    // 步骤：登录用户禁止走预置模型，必须自配；未配置则引导并阻断
    const loggedInWorkspace = signedIn && !guestSession
    if (loggedInWorkspace && !byok) {
      setStatus({
        kind: 'error',
        text: '请先配置你的模型，配置完成后即可开始生成',
      })
      setShowByok(true)
      return
    }

    setStreaming(true)
    beginStreamUi()
    setRaceCandidates(null)
    setStatus({ kind: 'info', text: '正在生成，源码会实时出现在右侧…' })
    const userMsg: ChatItem = { kind: 'user', id: nid('u'), text: p }
    setChat((prev) => [...prev, userMsg])
    setDraft('')

    const history = chatToMessages([...chat, userMsg])
    const currentHtml = html || undefined

    try {
      // 步骤：登录用户只走自配模型（BYOK）
      if (loggedInWorkspace && byok) {
        setHtml('')
        const result = await streamByokHtml({
          prompt: p,
          config: byok,
          currentHtml,
          messages: history,
          onChunk: (text) => {
            setHtml((prev) => {
              const next = prev + text
              bumpStageFromHtml(next)
              return next
            })
          },
        })
        if (result.ok) {
          applySuccess(p, result.html, 'byok', 'single')
          return
        }
        setStatus({
          kind: 'error',
          text: '模型暂时不可用，请检查配置后重试',
        })
        setChat((prev) => [
          ...prev,
          {
            kind: 'assistant',
            id: nid('a'),
            text: '模型这边没跑通。请检查密钥、地址与模型名，保存后再试一次～',
          },
        ])
        return
      }

      // 步骤：访客走云端生成；失败则演示体验
      setHtml('')
      const result = await generateBuiltin({
        prompt: p,
        model,
        messages: history,
        currentHtml,
        onThinking: (t) => {
          setStreamThinking((prev) => prev + t)
          setStreamStage('正在思考怎么实现…')
        },
        onHtml: (h) => {
          setHtml(h)
          bumpStageFromHtml(h)
        },
      })

      if (result.ok) {
        applySuccess(p, result.html, result.mode, 'single')
        return
      }

      await fallbackMock(result.message || 'generate-failed')
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!signedIn || guestSession) {
        await fallbackMock(msg)
      } else {
        setStatus({
          kind: 'error',
          text: '网络或服务异常，请稍后重试',
        })
      }
    } finally {
      setStreaming(false)
      setStreamStage('')
    }
  }

  const applySuccess = (
    userPrompt: string,
    nextHtml: string,
    nextMode: GenerationMode,
    source: 'single' | 'horse-race',
  ) => {
    setHtml(nextHtml)
    setMode(nextMode)
    setLastSource(source)
    setPrompt(userPrompt)
    setStreamThinking('')
    setStreamStage('')
    // 步骤：用函数式更新版本号，避免闭包陈旧
    setVersionN((n) => {
      const nextVer = n + 1
      setChat((prev) => [
        ...prev,
        {
          kind: 'assistant',
          id: nid('a'),
          text: friendlyDone(source, guestSession || !signedIn),
        },
        {
          kind: 'version',
          id: nid('v'),
          n: nextVer,
          label:
            source === 'horse-race' ? '赛马择优完成' : '本轮生成完成',
        },
      ])
      return nextVer
    })
    setStatus({
      kind: 'info',
      text:
        source === 'horse-race' ? '已选定这一版' : doneStatusLabel(nextMode),
    })
    // 完成后切回预览，刷新终稿（保证脚本可交互）
    setPane('preview')

    // 步骤：已登录项目内自动覆盖保存，保证回看
    if (signedIn && activeTaskId && !guestSession) {
      void autoSave(userPrompt, nextHtml, nextMode, source)
    }
  }

  const autoSave = async (
    userPrompt: string,
    nextHtml: string,
    nextMode: GenerationMode,
    source: 'single' | 'horse-race',
  ) => {
    if (!activeTaskId) return
    setSaving(true)
    try {
      await saveTask({
        id: activeTaskId,
        email,
        prompt: userPrompt,
        html: nextHtml,
        generationMode: nextMode,
        source,
        title: userPrompt.slice(0, 40),
      })
      await refreshTasks(email)
      setStatus({ kind: 'info', text: '已覆盖保存到项目' })
    } catch (e) {
      setStatus({
        kind: 'error',
        text: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setSaving(false)
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
    setLastSource('single')
    setPane('preview')
    setHtml('')
    setMode(null)
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
          setStreamStage('模型正在思考…')
        },
        onHtml: (h) => {
          setHtml(h)
          bumpStageFromHtml(h)
        },
      })
      if (result.ok) {
        setHtml(result.html)
        setMode(result.mode)
        setLastSource('single')
        setVersionN(1)
        setStreamThinking('')
        setStreamStage('')
        setChat([
          userMsg,
          {
            kind: 'assistant',
            id: nid('a'),
            text: friendlyDone('single', true),
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
      await fallbackMock(result.message || 'generate-failed')
    } catch (e) {
      await fallbackMock(e instanceof Error ? e.message : String(e))
    } finally {
      setStreaming(false)
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
    setChat((prev) => [...prev, userMsg])

    try {
      const history = chatToMessages([...chat, userMsg])
      const result = await raceBuiltin({
        prompt: p,
        messages: history,
        currentHtml: html || undefined,
        models: [BUILTIN_MODELS[0], BUILTIN_MODELS[1]],
      })
      if (!result.ok) {
        setStatus({
          kind: 'error',
          text: result.message,
        })
        if (result.suggestByok) setShowByok(true)
        setChat((prev) => [
          ...prev,
          { kind: 'assistant', id: nid('a'), text: result.message },
        ])
        return
      }
      setRaceCandidates(result.candidates)
      setStatus({ kind: 'info', text: '请选择 Winner（无自动打分）' })
    } catch (e) {
      setStatus({
        kind: 'error',
        text: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setRacing(false)
    }
  }

  const onPickWinner = (c: RaceCandidate & { ok: true }) => {
    setRaceCandidates(null)
    applySuccess(draft.trim() || prompt, c.html, c.mode, 'horse-race')
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
        text: byok
          ? '已新建项目，开始对话吧'
          : '已新建项目。请先配置模型，再开始生成',
      })
      // 步骤：未配模型时顺手打开配置，降低卡顿感
      if (!byok) setShowByok(true)
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
        existingMode: task.generationMode,
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

  const onManualSave = async () => {
    if (!signedIn || !activeTaskId || guestSession) {
      setStatus({ kind: 'error', text: '访客无法保存，请先登录并打开项目' })
      return
    }
    if (!html.trim()) {
      setStatus({ kind: 'error', text: '没有可保存的预览内容' })
      return
    }
    await autoSave(prompt, html, mode ?? 'builtin', lastSource)
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
          onCreate={(title) => void onCreateProject(title)}
          onOpen={(id) => void onOpenProject(id)}
          onLogout={onLogout}
          onOpenByok={() => setShowByok(true)}
          statusText={status.text}
          statusError={status.kind === 'error'}
        />
      ) : null}

      {view === 'workspace' ? (
        <Workspace
          title={activeTitle}
          guest={guestSession || !signedIn}
          chat={chat}
          draft={draft}
          onDraftChange={setDraft}
          streaming={streaming}
          streamThinking={streamThinking}
          streamStage={streamStage}
          saving={saving}
          html={html}
          mode={mode}
          model={model}
          onModelChange={setModel}
          preferByok={preferByok}
          onPreferByok={setPreferByok}
          hasByok={Boolean(byok)}
          pane={pane}
          onPane={setPane}
          statusText={status.text}
          statusError={status.kind === 'error'}
          raceCandidates={raceCandidates}
          racing={racing}
          onSend={() => void runGenerate(draft)}
          onRace={() => void onRace()}
          onPickWinner={onPickWinner}
          onSave={() => void onManualSave()}
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
          initial={byok}
          onClose={() => setShowByok(false)}
          onSave={(cfg) => {
            saveByok(cfg)
            setByok(cfg)
            setPreferByok(true)
            setShowByok(false)
            setStatus({
              kind: 'info',
              text: '模型已保存在本机浏览器，可以开始生成了',
            })
          }}
          onClear={() => {
            clearByok()
            setByok(null)
            setPreferByok(false)
            setShowByok(false)
            setStatus({
              kind: 'info',
              text: '已清除本机模型配置。登录后需重新配置才能生成',
            })
          }}
        />
      ) : null}
    </>
  )
}
