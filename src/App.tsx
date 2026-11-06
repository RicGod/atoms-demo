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
      text: '已登记邮箱。MVP 无验证码，存在冒充风险。',
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
    setStatus({ kind: 'info', text: '已退出（访客模式）' })
  }

  const loadPreset = async (path: string) => {
    const res = await fetch(path)
    const text = await res.text()
    setHtml(text)
    setMode('mock')
    setGuestSession(true)
    setActiveTaskId(null)
    setChat([
      {
        kind: 'assistant',
        id: nid('a'),
        text: `已加载预置示例（mock）：${path}`,
      },
    ])
    setVersionN(1)
    setView('workspace')
    setPane('preview')
    setStatus({ kind: 'info', text: '已加载预置示例（mock）' })
  }

  /** 访客失败/超时兜底：随机预置 */
  const fallbackMock = async (reason: string) => {
    const pick = PRESETS[Math.floor(Math.random() * PRESETS.length)]
    await loadPreset(pick.path)
    setStatus({
      kind: 'info',
      text: `${reason}；已切换预置「${pick.label}」（mock）`,
    })
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
          text: '已打开项目当前产物，可继续对话迭代。',
        },
        {
          kind: 'version',
          id: nid('v'),
          n: 1,
          label: '当前已保存版本（装饰，不可回看历史）',
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
      setStatus({ kind: 'error', text: 'Prompt 不能为空' })
      return
    }
    if (signedIn && !guestSession && !activeTaskId) {
      setStatus({ kind: 'error', text: '请先新建或打开项目' })
      return
    }

    setStreaming(true)
    setRaceCandidates(null)
    setStatus({ kind: 'info', text: '生成中…' })
    const userMsg: ChatItem = { kind: 'user', id: nid('u'), text: p }
    setChat((prev) => [...prev, userMsg])
    setDraft('')

    const history = chatToMessages([...chat, userMsg])
    const currentHtml = html || undefined

    try {
      // 步骤：登录用户可优先自配；访客仅内置 / mock
      if (signedIn && preferByok && byok) {
        const result = await streamByokHtml({
          prompt: p,
          config: byok,
          currentHtml,
          messages: history,
        })
        if (result.ok) {
          applySuccess(p, result.html, 'byok', 'single')
          return
        }
        setStatus({
          kind: 'error',
          text: `自配失败：${result.message}`,
        })
        setChat((prev) => [
          ...prev,
          { kind: 'assistant', id: nid('a'), text: `自配失败：${result.message}` },
        ])
        return
      }

      const result = await generateBuiltin({
        prompt: p,
        model,
        messages: history,
        currentHtml,
      })

      if (result.ok) {
        applySuccess(p, result.html, result.mode, 'single')
        return
      }

      if (!signedIn || guestSession) {
        await fallbackMock(result.message || '内置生成失败')
      } else {
        setStatus({
          kind: 'error',
          text: `${result.message || '生成失败'}。可重试 / 换模型 / 配置自配`,
        })
        if (result.suggestByok) setShowByok(true)
        setChat((prev) => [
          ...prev,
          {
            kind: 'assistant',
            id: nid('a'),
            text: result.message || '生成失败',
          },
        ])
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!signedIn || guestSession) {
        await fallbackMock(msg)
      } else {
        setStatus({ kind: 'error', text: msg })
      }
    } finally {
      setStreaming(false)
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
    // 步骤：用函数式更新版本号，避免闭包陈旧
    setVersionN((n) => {
      const nextVer = n + 1
      setChat((prev) => [
        ...prev,
        {
          kind: 'assistant',
          id: nid('a'),
          text:
            source === 'horse-race'
              ? '已选定赛马 Winner，整页已更新。'
              : '已根据本轮需求覆盖生成完整 HTML。',
        },
        {
          kind: 'version',
          id: nid('v'),
          n: nextVer,
          label:
            source === 'horse-race'
              ? '赛马择优完成（装饰版本号，不可回看）'
              : '完成整页覆盖生成（装饰版本号，不可回看）',
        },
      ])
      return nextVer
    })
    setStatus({
      kind: 'info',
      text:
        source === 'horse-race'
          ? '已选定 Winner'
          : nextMode === 'builtin'
            ? '内置模型生成完成'
            : nextMode === 'byok'
              ? '自配模型生成完成'
              : 'mock 完成',
    })
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
      setStatus({ kind: 'error', text: 'Prompt 不能为空' })
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
    setStatus({ kind: 'info', text: '生成中…' })
    const userMsg: ChatItem = { kind: 'user', id: nid('u'), text: p }
    setChat([userMsg])
    try {
      const result = await generateBuiltin({ prompt: p, model })
      if (result.ok) {
        setHtml(result.html)
        setMode(result.mode)
        setLastSource('single')
        setVersionN(1)
        setChat([
          userMsg,
          {
            kind: 'assistant',
            id: nid('a'),
            text: '已生成可预览 HTML（访客不落库）。',
          },
          {
            kind: 'version',
            id: nid('v'),
            n: 1,
            label: '完成搭建（装饰版本号，不可回看）',
          },
        ])
        setStatus({ kind: 'info', text: '内置模型生成完成' })
        return
      }
      await fallbackMock(result.message || '内置生成失败')
    } catch (e) {
      await fallbackMock(e instanceof Error ? e.message : String(e))
    } finally {
      setStreaming(false)
    }
  }

  const onRace = async () => {
    // 步骤：访客禁用赛马
    if (!signedIn || guestSession) {
      setStatus({ kind: 'error', text: '访客不可使用赛马，请先登录' })
      return
    }
    const p = (draft.trim() || prompt).trim()
    if (!p) {
      setStatus({ kind: 'error', text: '赛马需要 Prompt' })
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

  const onCreateProject = async () => {
    if (!signedIn) return
    setCreating(true)
    try {
      const task = await createTask(email, '新项目')
      await refreshTasks(email)
      enterWorkspaceFresh({
        guest: false,
        taskId: task.id,
        titleHint: '',
      })
      setStatus({ kind: 'info', text: '已新建项目，开始对话吧' })
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
          onCreate={() => void onCreateProject()}
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
              text: '自配已保存到本机 localStorage',
            })
          }}
          onClear={() => {
            clearByok()
            setByok(null)
            setPreferByok(false)
            setShowByok(false)
          }}
        />
      ) : null}
    </>
  )
}
