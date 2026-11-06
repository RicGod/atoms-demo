import { AtomsMark } from '../components/AtomsMark'
import { PRESETS } from '../lib/types'

/** 访客首页：极简落地 + 单路生成入口；无赛马、无配置模型 */
export function GuestHome(props: {
  prompt: string
  onPromptChange: (v: string) => void
  streaming: boolean
  statusText: string
  statusError: boolean
  onGenerate: () => void
  onLogin: () => void
  onLoadPreset: (path: string) => void
}) {
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
          <label className="sr-only" htmlFor="guest-prompt">
            描述你的想法
          </label>
          <textarea
            id="guest-prompt"
            value={props.prompt}
            onChange={(e) => props.onPromptChange(e.target.value)}
            placeholder="描述你想要的应用，例如：一个带分类统计的记账本"
            rows={4}
          />
          <div className="row guest-actions">
            <button
              className="btn"
              type="button"
              disabled={props.streaming}
              onClick={props.onGenerate}
            >
              {props.streaming ? '生成中…' : '生成'}
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
