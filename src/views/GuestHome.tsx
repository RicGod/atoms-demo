import { AtomsMark } from '../components/AtomsMark'
import { BUILTIN_MODELS } from '../../shared/constants'
import { PRESETS } from '../lib/types'

/** 访客首页：极简落地 + 模型选择 + 输入区内发送（无独立「生成」按钮） */
export function GuestHome(props: {
  prompt: string
  onPromptChange: (v: string) => void
  model: string
  onModelChange: (v: string) => void
  streaming: boolean
  statusText: string
  statusError: boolean
  onGenerate: () => void
  onLogin: () => void
  onLoadPreset: (path: string) => void
}) {
  /** 步骤：Enter 发送（Shift+Enter 换行）；空内容或生成中不触发 */
  const trySend = () => {
    if (props.streaming || !props.prompt.trim()) return
    props.onGenerate()
  }

  return (
    <div className="shell guest-home">
      <header className="topbar">
        <div className="brand-lockup">
          <AtomsMark />
          <span className="brand-name">Atoms</span>
        </div>
        <button className="btn" type="button" onClick={props.onLogin}>
          登录
        </button>
      </header>

      <main className="guest-hero">
        <p className="tech-eyebrow">
          <span className="tech-dot" aria-hidden="true" />
          Instant HTML · Live Preview
        </p>
        <h1 className="hero-title">Atoms</h1>
        {/* 步骤：短副文案，对齐参考站克制气质，不堆功能说明 */}
        <p className="hero-sub">一句话描述需求，即时生成可预览的单文件 HTML。</p>

        <div className="guest-compose">
          {/* 步骤：模型 chips，科技浅色；与输入同框，不抢主标题 */}
          <div className="guest-model-row" role="group" aria-label="选择模型">
            {BUILTIN_MODELS.map((m) => (
              <button
                key={m}
                type="button"
                className={
                  props.model === m
                    ? 'chip chip-model active'
                    : 'chip chip-model'
                }
                disabled={props.streaming}
                onClick={() => props.onModelChange(m)}
                title={m}
              >
                {m}
              </button>
            ))}
          </div>

          <label className="sr-only" htmlFor="guest-prompt">
            描述你的想法
          </label>
          <textarea
            id="guest-prompt"
            value={props.prompt}
            onChange={(e) => props.onPromptChange(e.target.value)}
            placeholder="描述你想要的应用，例如：一个带分类统计的记账本"
            rows={4}
            disabled={props.streaming}
            onKeyDown={(e) => {
              // 步骤：Enter 提交；Shift+Enter 保留换行
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault()
                trySend()
              }
            }}
          />

          {/* 步骤：底栏 = 访客轻提示 + 圆形上送按钮（参考 atoms-demo.pub） */}
          <div className="guest-compose-footer">
            <p className="guest-mode-hint">
              当前为访客模式，登录后解锁更多功能
            </p>
            <button
              className="btn-send-circle"
              type="button"
              disabled={props.streaming || !props.prompt.trim()}
              onClick={trySend}
              aria-label={props.streaming ? '生成中' : '发送'}
              title={props.streaming ? '生成中…' : '发送（Enter）'}
            >
              {props.streaming ? (
                <span className="send-spinner" aria-hidden="true" />
              ) : (
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  aria-hidden="true"
                >
                  <path
                    d="M12 19V5M12 5l-6 6M12 5l6 6"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  />
                </svg>
              )}
            </button>
          </div>

          <p className={`status-line ${props.statusError ? 'error' : ''}`}>
            {props.statusText}
          </p>
        </div>

        {/* 步骤：无演示区大标题；示例以低调 chips 呈现（参考站风格） */}
        <div className="preset-chips" aria-label="示例">
          {PRESETS.map((p) => (
            <button
              key={p.id}
              type="button"
              className="chip chip-quiet"
              disabled={props.streaming}
              onClick={() => props.onLoadPreset(p.path)}
            >
              {p.label}
            </button>
          ))}
        </div>
      </main>
    </div>
  )
}
