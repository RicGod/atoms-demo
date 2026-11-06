import { AtomsMark } from '../components/AtomsMark'

/** 邮箱即登录（无验证码）；冒充风险明示 */
export function LoginView(props: {
  emailDraft: string
  onEmailChange: (v: string) => void
  statusText: string
  statusError: boolean
  onSubmit: () => void
  onBack: () => void
}) {
  return (
    <div className="shell login-view">
      <header className="topbar">
        <div className="brand-lockup">
          <AtomsMark />
          <span className="brand-name">Atoms</span>
        </div>
        <button className="btn ghost" type="button" onClick={props.onBack}>
          返回
        </button>
      </header>

      <main className="login-card">
        <h1>登录</h1>
        <p className="hero-sub">输入邮箱即可进入项目列表。当前无需验证码。</p>
        <div className="field">
          <label htmlFor="login-email">邮箱</label>
          <input
            id="login-email"
            type="email"
            autoComplete="email"
            value={props.emailDraft}
            onChange={(e) => props.onEmailChange(e.target.value)}
            placeholder="you@example.com"
            onKeyDown={(e) => {
              if (e.key === 'Enter') props.onSubmit()
            }}
          />
        </div>
        <p className="hint warn">
          冒充风险：任何人填入同一邮箱即视为该身份，不做验证码 / OIDC。
        </p>
        <div className="row">
          <button className="btn" type="button" onClick={props.onSubmit}>
            进入项目
          </button>
        </div>
        <p className={`status-line ${props.statusError ? 'error' : ''}`}>
          {props.statusText}
        </p>
      </main>
    </div>
  )
}
