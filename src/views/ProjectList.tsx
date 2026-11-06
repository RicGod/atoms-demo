import { useState } from 'react'
import { AtomsMark } from '../components/AtomsMark'
import type { TaskSummary } from '../lib/types'

/** 登录后项目列表：窄侧栏 + 主区卡片；新建须填写项目名称 */
export function ProjectList(props: {
  email: string
  tasks: TaskSummary[]
  filter: 'all' | 'fav'
  onFilter: (f: 'all' | 'fav') => void
  creating: boolean
  /** 步骤：带名称创建，空名称由本组件拦截 */
  onCreate: (title: string) => void
  onOpen: (id: string) => void
  onLogout: () => void
  onOpenByok: () => void
  statusText: string
  statusError: boolean
}) {
  // 收藏筛选为 UI 占位：暂无收藏字段，列表仍展示全部并提示
  const visible = props.tasks
  // 步骤：新建项目弹窗本地状态
  const [showCreate, setShowCreate] = useState(false)
  const [nameDraft, setNameDraft] = useState('')
  const [nameError, setNameError] = useState('')

  const openCreate = () => {
    setNameDraft('')
    setNameError('')
    setShowCreate(true)
  }

  const submitCreate = () => {
    const title = nameDraft.trim()
    // 步骤：产品规则——必须填写项目名称才能创建
    if (!title) {
      setNameError('请填写项目名称')
      return
    }
    setNameError('')
    setShowCreate(false)
    props.onCreate(title)
  }

  return (
    <div className="shell app-shell">
      <aside className="app-sidebar" aria-label="主导航">
        <div className="sidebar-brand">
          <AtomsMark size={22} />
          <span className="brand-name">Atoms</span>
        </div>
        <p className="workspace-pill" title={props.email}>
          {props.email}
        </p>
        <nav className="side-nav">
          {/* 共识：侧栏只保留项目 */}
          <button type="button" className="nav-item active" aria-current="page">
            <svg
              className="nav-ico"
              width="16"
              height="16"
              viewBox="0 0 16 16"
              aria-hidden="true"
            >
              <rect x="1.5" y="1.5" width="5" height="5" rx="1" fill="currentColor" />
              <rect x="9.5" y="1.5" width="5" height="5" rx="1" fill="currentColor" />
              <rect x="1.5" y="9.5" width="5" height="5" rx="1" fill="currentColor" />
              <rect x="9.5" y="9.5" width="5" height="5" rx="1" fill="currentColor" />
            </svg>
            项目
          </button>
        </nav>
        <div className="sidebar-foot">
          <button className="btn ghost block" type="button" onClick={props.onOpenByok}>
            配置模型
          </button>
          <button className="btn ghost block" type="button" onClick={props.onLogout}>
            退出
          </button>
        </div>
      </aside>

      <main className="app-main">
        <div className="app-main-inner">
          <header className="page-head">
            <h1>项目</h1>
            <button
              className="btn"
              type="button"
              disabled={props.creating}
              onClick={openCreate}
            >
              {props.creating ? '创建中…' : '新建项目'}
            </button>
          </header>

          <div className="pill-tabs" role="tablist" aria-label="项目筛选">
            <button
              type="button"
              role="tab"
              aria-selected={props.filter === 'all'}
              className={props.filter === 'all' ? 'pill active' : 'pill'}
              onClick={() => props.onFilter('all')}
            >
              全部
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={props.filter === 'fav'}
              className={props.filter === 'fav' ? 'pill active' : 'pill'}
              onClick={() => props.onFilter('fav')}
            >
              已收藏
            </button>
          </div>

          {props.filter === 'fav' ? (
            <p className="hint">收藏功能即将上线，当前仍展示全部项目。</p>
          ) : null}

          <p className={`status-line ${props.statusError ? 'error' : ''}`}>
            {props.statusText}
          </p>

          {visible.length === 0 ? (
            <div className="empty-projects">
              <p>还没有项目。新建一个，开始对话式生成。</p>
            </div>
          ) : (
            <ul className="project-grid">
              {visible.map((t) => (
                <li key={t.id}>
                  <button
                    type="button"
                    className="project-card"
                    onClick={() => props.onOpen(t.id)}
                  >
                    <div className="project-thumb" aria-hidden="true">
                      {t.hasHtml ? (
                        <span className="thumb-label">已有预览</span>
                      ) : (
                        <span className="thumb-label muted">尚未生成</span>
                      )}
                    </div>
                    <div className="project-meta">
                      <strong>{t.title || t.prompt.slice(0, 32) || '未命名项目'}</strong>
                      <time dateTime={t.updatedAt}>
                        {new Date(t.updatedAt).toLocaleDateString('zh-CN')}
                      </time>
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      </main>

      {/* 步骤：新建项目弹窗——名称必填 */}
      {showCreate ? (
        <div
          className="modal-backdrop"
          role="dialog"
          aria-modal="true"
          aria-label="新建项目"
        >
          <div className="modal">
            <h3>新建项目</h3>
            <p className="hint">给项目起个名字，方便之后在列表里找到。</p>
            <div className="field">
              <label htmlFor="project-name">项目名称</label>
              <input
                id="project-name"
                value={nameDraft}
                autoFocus
                placeholder="例如：贪吃蛇小游戏"
                disabled={props.creating}
                onChange={(e) => {
                  setNameDraft(e.target.value)
                  if (nameError) setNameError('')
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault()
                    submitCreate()
                  }
                }}
              />
              {nameError ? <p className="hint danger">{nameError}</p> : null}
            </div>
            <div className="row">
              <button
                className="btn"
                type="button"
                disabled={props.creating}
                onClick={submitCreate}
              >
                {props.creating ? '创建中…' : '创建'}
              </button>
              <button
                className="btn ghost"
                type="button"
                disabled={props.creating}
                onClick={() => setShowCreate(false)}
              >
                取消
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}
