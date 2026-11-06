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
        {/* 步骤：访客能力叙事产品化——可预览；登录后解锁保存与持续对话 */}
        <p className="hero-sub">
          一句话生成可交互单文件 HTML，即时预览。登录后解锁更多功能，可保存项目、持续对话优化。
        </p>

        <div className="guest-compose">
          <label className="sr-only" htmlFor="guest-prompt">
            描述你的想法
          </label>
          <textarea
            id="guest-prompt"
            value={props.prompt}
            onChange={(e) => props.onPromptChange(e.target.value)}
            placeholder="让智能体团队实现你的想法…"
            rows={3}
          />
          <div className="row guest-actions">
            <button
              className="btn"
              type="button"
              disabled={props.streaming}
              onClick={props.onGenerate}
            >
              {props.streaming ? '生成中…' : '生成预览'}
            </button>
            {/* 步骤：轻提示解锁能力，不罗列赛马等技术点 */}
            <span className="hint">当前为访客模式 · 登录后解锁更多功能</span>
          </div>
          <p className={`status-line ${props.statusError ? 'error' : ''}`}>
            {props.statusText}
          </p>
        </div>

        <div className="preset-block">
          <p className="section-label">试试这些演示应用</p>
          <div className="chips">
            {PRESETS.map((p) => (
              <button
                key={p.id}
                type="button"
                className="chip"
                disabled={props.streaming}
                onClick={() => props.onLoadPreset(p.path)}
              >
                {p.label}
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  )
}
