import { useEffect, useMemo, useState } from 'react'
import { BUILTIN_MODELS } from '../shared/constants'
import {
  createTask,
  fetchTasks,
  generateBuiltin,
  openTask,
  saveTask,
} from './lib/api'
import { clearByok, loadByok, saveByok, streamByokHtml } from './lib/byok'
import {
  EMAIL_STORAGE_KEY,
  PRESETS,
  type ByokConfig,
  type GenerationMode,
  type TaskSummary,
} from './lib/types'

type Status = { kind: 'idle' | 'info' | 'error'; text: string }

const MODE_LABEL: Record<GenerationMode, string> = {
  builtin: '内置',
  byok: '自配',
  mock: 'mock',
}

export default function App() {
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
  const [status, setStatus] = useState<Status>({ kind: 'idle', text: '' })

  const [tasks, setTasks] = useState<TaskSummary[]>([])
  const [activeTaskId, setActiveTaskId] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)

  const signedIn = Boolean(email.trim())

  // 启动时恢复上次邮箱与自配配置（仅本机）
  useEffect(() => {
    const saved = localStorage.getItem(EMAIL_STORAGE_KEY) || ''
    if (saved) {
      setEmail(saved)
      setEmailDraft(saved)
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
      setActiveTaskId(null)
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

  const onLogin = () => {
    const next = emailDraft.trim()
    if (!next || !next.includes('@')) {
      setStatus({ kind: 'error', text: '请输入有效邮箱' })
      return
    }
    setEmail(next)
    localStorage.setItem(EMAIL_STORAGE_KEY, next)
    setStatus({
      kind: 'info',
      text: '已登记邮箱。MVP 无验证码，存在冒充风险。',
    })
  }

  const onLogout = () => {
    setEmail('')
    setActiveTaskId(null)
    setTasks([])
    setStatus({ kind: 'info', text: '已退出登录（访客模式）' })
  }

  const loadPreset = async (path: string) => {
    const res = await fetch(path)
    const text = await res.text()
    setHtml(text)
    setMode('mock')
    setStatus({ kind: 'info', text: '已加载预置示例（mock）' })
  }

  /** 访客失败/超时兜底：随机一个预置示例 */
  const fallbackMock = async (reason: string) => {
    const pick = PRESETS[Math.floor(Math.random() * PRESETS.length)]
    await loadPreset(pick.path)
    setStatus({
      kind: 'info',
      text: `${reason}；已切换预置示例「${pick.label}」（mock，非交卷主路径）`,
    })
  }

  const runGenerate = async () => {
    const p = prompt.trim()
    if (!p) {
      setStatus({ kind: 'error', text: 'Prompt 不能为空' })
      return
    }
    if (signedIn && !activeTaskId) {
      setStatus({
        kind: 'error',
        text: '已登录：请先新建或打开 Task，再生成并保存',
      })
      return
    }

    setStreaming(true)
    setStatus({ kind: 'info', text: '生成中…' })
    setHtml('')
    setMode(null)

    try {
      // 优先自配（用户显式开启且已配置）
      if (preferByok && byok) {
        const result = await streamByokHtml({
          prompt: p,
          config: byok,
          onChunk: () => {
            /* 流式过程可扩展预览草稿 */
          },
        })
        if (result.ok) {
          setHtml(result.html)
          setMode('byok')
          setStatus({ kind: 'info', text: '自配模型生成完成' })
          return
        }
        // 自配失败：已登录提示重试；访客可 mock
        if (!signedIn) {
          await fallbackMock(`自配失败：${result.message}`)
        } else {
          setStatus({
            kind: 'error',
            text: `自配失败：${result.message}。可重试 / 换模型 / 检查自配配置`,
          })
        }
        return
      }

      const result = await generateBuiltin({
        prompt: p,
        model,
      })

      if (result.ok) {
        setHtml(result.html)
        setMode(result.mode)
        setStatus({ kind: 'info', text: '内置模型生成完成' })
        return
      }

      const msg = result.message
      if (result.suggestByok) {
        setShowByok(true)
      }

      if (!signedIn) {
        await fallbackMock(msg || '内置生成失败')
      } else {
        setStatus({
          kind: 'error',
          text: `${msg || '生成失败'}。请重试 / 换模型 / 配置自配 Key（不以 mock 为主出路）`,
        })
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e)
      if (!signedIn) {
        await fallbackMock(msg)
      } else {
        setStatus({
          kind: 'error',
          text: `${msg}。请重试 / 换模型 / 自配`,
        })
      }
    } finally {
      setStreaming(false)
    }
  }

  const onCreateTask = async () => {
    if (!signedIn) return
    try {
      const task = await createTask(email, prompt.trim().slice(0, 40) || undefined)
      setActiveTaskId(task.id)
      await refreshTasks(email)
      setStatus({ kind: 'info', text: `已新建 Task：${task.title}` })
    } catch (e) {
      setStatus({
        kind: 'error',
        text: e instanceof Error ? e.message : String(e),
      })
    }
  }

  const onOpenTask = async (id: string) => {
    if (!signedIn) return
    try {
      const task = await openTask(email, id)
      setActiveTaskId(task.id)
      setPrompt(task.prompt || prompt)
      if (task.html) {
        setHtml(task.html)
        setMode(task.generationMode)
      }
      setStatus({ kind: 'info', text: `已打开 Task：${task.title}` })
    } catch (e) {
      setStatus({
        kind: 'error',
        text: e instanceof Error ? e.message : String(e),
      })
    }
  }

  const onSave = async () => {
    if (!signedIn) {
      setStatus({ kind: 'error', text: '访客无法保存，请先登记邮箱' })
      return
    }
    if (!activeTaskId) {
      setStatus({ kind: 'error', text: '请先新建或打开 Task' })
      return
    }
    if (!html.trim()) {
      setStatus({ kind: 'error', text: '没有可保存的预览内容' })
      return
    }
    setSaving(true)
    try {
      const task = await saveTask({
        id: activeTaskId,
        email,
        prompt: prompt.trim(),
        html,
        generationMode: mode ?? 'builtin',
        source: 'single',
      })
      await refreshTasks(email)
      setStatus({ kind: 'info', text: `已覆盖保存到 Task（${task.updatedAt}）` })
    } catch (e) {
      setStatus({
        kind: 'error',
        text: e instanceof Error ? e.message : String(e),
      })
    } finally {
      setSaving(false)
    }
  }

  const activeTask = useMemo(
    () => tasks.find((t) => t.id === activeTaskId) || null,
    [tasks, activeTaskId],
  )

  return (
    <div className="app">
      <header className="brand-bar">
        <div>
          <h1 className="brand">Mini Atoms</h1>
          <p className="tagline">一句话 → 可交互 HTML → iframe 预览 → Task 持久化</p>
        </div>
        {mode ? (
          <span className={`badge ${mode}`}>{MODE_LABEL[mode]}</span>
        ) : null}
      </header>

      {!signedIn ? (
        <div className="banner">
          访客模式：可生成并 Preview，但不会持久化。登记邮箱后可新建 Task 保存回看。
        </div>
      ) : null}

      <div className="layout">
        <aside className="panel sidebar">
          <p className="section-title">身份</p>
          <div className="field">
            <label htmlFor="email">邮箱登记（无验证码）</label>
            <input
              id="email"
              value={emailDraft}
              onChange={(e) => setEmailDraft(e.target.value)}
              placeholder="you@example.com"
              disabled={signedIn}
            />
          </div>
          <p className="hint warn">
            冒充风险提示：任何人填入同一邮箱即视为该身份，MVP 不做验证码/OIDC。
          </p>
          <div className="row">
            {!signedIn ? (
              <button className="btn" type="button" onClick={onLogin}>
                登录
              </button>
            ) : (
              <button className="btn ghost" type="button" onClick={onLogout}>
                退出（{email}）
              </button>
            )}
          </div>

          {signedIn ? (
            <>
              <p className="section-title" style={{ marginTop: '1.2rem' }}>
                我的 Task
              </p>
              <div className="row" style={{ marginBottom: '0.6rem' }}>
                <button className="btn" type="button" onClick={() => void onCreateTask()}>
                  新建 Task
                </button>
              </div>
              {activeTask ? (
                <p className="hint">当前：{activeTask.title}</p>
              ) : (
                <p className="hint warn">保存前须新建或打开 Task</p>
              )}
              <ul className="task-list">
                {tasks.map((t) => (
                  <li key={t.id}>
                    <button
                      type="button"
                      className={t.id === activeTaskId ? 'active' : ''}
                      onClick={() => void onOpenTask(t.id)}
                    >
                      {t.title || t.prompt.slice(0, 24) || t.id.slice(0, 8)}
                      <span className="meta">{new Date(t.updatedAt).toLocaleString()}</span>
                    </button>
                  </li>
                ))}
              </ul>
            </>
          ) : null}

          <p className="section-title" style={{ marginTop: '1.2rem' }}>
            生成
          </p>
          <div className="field">
            <label htmlFor="prompt">Prompt</label>
            <textarea
              id="prompt"
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="一句话描述你的想法"
            />
          </div>
          <div className="field">
            <label htmlFor="model">内置模型</label>
            <select
              id="model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              disabled={preferByok}
            >
              {BUILTIN_MODELS.map((m) => (
                <option key={m} value={m}>
                  {m}
                </option>
              ))}
            </select>
          </div>
          <label className="hint" style={{ display: 'flex', gap: '0.4rem' }}>
            <input
              type="checkbox"
              checked={preferByok}
              onChange={(e) => setPreferByok(e.target.checked)}
              disabled={!byok}
            />
            使用浏览器自配模型
          </label>
          <div className="row" style={{ marginTop: '0.6rem' }}>
            <button
              className="btn"
              type="button"
              disabled={streaming}
              onClick={() => void runGenerate()}
            >
              {html ? '重新生成' : '生成'}
            </button>
            <button
              className="btn ghost"
              type="button"
              onClick={() => setShowByok(true)}
            >
              自配模型
            </button>
            {signedIn ? (
              <button
                className="btn warn"
                type="button"
                disabled={saving || !html}
                onClick={() => void onSave()}
              >
                保存到 Task
              </button>
            ) : null}
          </div>
          <p className={`status-line ${status.kind === 'error' ? 'error' : ''}`}>
            {status.text}
          </p>

          <p className="section-title" style={{ marginTop: '1rem' }}>
            预置示例（访客兜底）
          </p>
          <div className="chips">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="chip"
                onClick={() => void loadPreset(p.path)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </aside>

        <section className="panel main preview-shell">
          <div className="preview-toolbar">
            <p className="section-title" style={{ margin: 0 }}>
              Preview
            </p>
            <div className="row">
              {mode ? (
                <span className={`badge ${mode}`}>Generation Mode · {MODE_LABEL[mode]}</span>
              ) : (
                <span className="hint">等待生成…</span>
              )}
            </div>
          </div>
          <div className="iframe-wrap">
            {/* sandbox：允许脚本/表单；尽量不 allow-same-origin */}
            <iframe
              title="preview"
              sandbox="allow-scripts allow-forms"
              srcDoc={html || emptyPreview}
            />
          </div>
        </section>
      </div>

      {showByok ? (
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
              text: '自配已保存到本机 localStorage（不做服务端持久化）',
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
    </div>
  )
}

const emptyPreview = `<!DOCTYPE html><html><body style="font-family:sans-serif;display:grid;place-items:center;height:100vh;margin:0;color:#64748b;background:#f8fafc"><p>在左侧输入 Prompt 后点击生成</p></body></html>`

function ByokModal(props: {
  initial: ByokConfig | null
  onClose: () => void
  onSave: (cfg: ByokConfig) => void
  onClear: () => void
}) {
  const [baseUrl, setBaseUrl] = useState(
    props.initial?.baseUrl || 'https://api.openai.com/v1',
  )
  const [apiKey, setApiKey] = useState(props.initial?.apiKey || '')
  const [model, setModel] = useState(props.initial?.model || 'gpt-4o-mini')

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="modal">
        <h3>自配模型</h3>
        <p className="hint warn">
          出于安全考虑不做服务端持久化：API Key 仅保存在本机浏览器 localStorage。
        </p>
        <div className="field">
          <label>Base URL</label>
          <input value={baseUrl} onChange={(e) => setBaseUrl(e.target.value)} />
        </div>
        <div className="field">
          <label>API Key</label>
          <input
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="不会上传到本应用服务端"
          />
        </div>
        <div className="field">
          <label>Model</label>
          <input value={model} onChange={(e) => setModel(e.target.value)} />
        </div>
        <div className="row">
          <button
            className="btn"
            type="button"
            onClick={() =>
              props.onSave({
                baseUrl: baseUrl.trim(),
                apiKey: apiKey.trim(),
                model: model.trim(),
              })
            }
          >
            保存到本机
          </button>
          <button className="btn ghost" type="button" onClick={props.onClear}>
            清除
          </button>
          <button className="btn ghost" type="button" onClick={props.onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
