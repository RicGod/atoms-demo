import { AtomsMark } from '../components/AtomsMark'
import type { TaskSummary } from '../lib/types'

/** 登录后项目列表（图1极简）：侧栏只保留「项目」，无游戏/视频/文件夹 */
export function ProjectList(props: {
  email: string
  tasks: TaskSummary[]
  filter: 'all' | 'fav'
  onFilter: (f: 'all' | 'fav') => void
  creating: boolean
  onCreate: () => void
  onOpen: (id: string) => void
  onLogout: () => void
  onOpenByok: () => void
  statusText: string
  statusError: boolean
}) {
  // 收藏筛选为 UI 占位：MVP 无收藏字段，列表仍展示全部并提示
  const visible = props.tasks

  return (
    <div className="shell app-shell">
      <aside className="app-sidebar" aria-label="主导航">
        <div className="sidebar-brand">
          <AtomsMark size={24} />
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
        <header className="page-head">
          <h1>项目</h1>
          <button
            className="btn"
            type="button"
            disabled={props.creating}
            onClick={props.onCreate}
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
          <p className="hint">MVP 暂无收藏字段，以下仍展示全部项目。</p>
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
      </main>
    </div>
  )
}
