import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import type { ChatTurn, RaceCandidate } from '../lib/api'
import type { DiffLine } from '../lib/line-diff'
import {
  CHAT_WIDTH_STORAGE_KEY,
  type ByokProfile,
  type TaskVersionSnapshot,
} from '../lib/types'

const CHAT_WIDTH_MIN = 280
const CHAT_WIDTH_MAX = 640
const CHAT_WIDTH_DEFAULT = 380

/** 读取本机记住的对话列宽 */
function loadChatWidth(): number {
  try {
    const raw = localStorage.getItem(CHAT_WIDTH_STORAGE_KEY)
    const n = raw ? Number(raw) : CHAT_WIDTH_DEFAULT
    if (!Number.isFinite(n)) return CHAT_WIDTH_DEFAULT
    return Math.min(CHAT_WIDTH_MAX, Math.max(CHAT_WIDTH_MIN, n))
  } catch {
    return CHAT_WIDTH_DEFAULT
  }
}

export type ChatItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'version'; id: string; n: number; label: string }
  /** 生成/校验失败：展示在对话流内，不进模型 messages */
  | { kind: 'error'; id: string; text: string }
  /** 回滚等系统说明：可持久化，不进模型 messages */
  | { kind: 'system'; id: string; text: string }

type Pane = 'preview' | 'code'

/** 图3：左对话 + 右预览/代码；大气圆角输入卡；登录用户仅自配模型 */
export function Workspace(props: {
  title: string
  guest: boolean
  chat: ChatItem[]
  draft: string
  onDraftChange: (v: string) => void
  streaming: boolean
  /** 流式思考过程文案（可折叠展示） */
  streamThinking: string
  /** 流式阶段提示（无思考链时的亲和文案；省略号由 UI 动态点出） */
  streamStage: string
  /** 迭代流式中：代码区保留旧稿，需展示「修改中」活态 */
  iterationStreaming?: boolean
  html: string
  /** 迭代后的行 diff；有则代码区优先展示变更，而非整页重播感 */
  codeDiff?: DiffLine[] | null
  /** Version 快照（登录有历史；访客可有当次） */
  versions: TaskVersionSnapshot[]
  currentVersionN: number
  /** 代码页浏览中的版本；null 表示跟 Current */
  viewingVersionN: number | null
  onViewVersion: (n: number) => void
  onRollbackVersion: (n: number) => void
  onExportHtml: () => void
  /** 访客可选模型；登录用户忽略（仅自配） */
  model: string
  onModelChange: (m: string) => void
  preferByok: boolean
  onPreferByok: (v: boolean) => void
  hasByok: boolean
  /** 登录用户：本机已保存的模型列表，用于选用 */
  byokProfiles?: ByokProfile[]
  activeByokId?: string | null
  onSelectByok?: (id: string) => void
  pane: Pane
  onPane: (p: Pane) => void
  statusText: string
  statusError: boolean
  raceCandidates: RaceCandidate[] | null
  racing: boolean
  onSend: () => void
  onRace: () => void
  onPickWinner: (c: RaceCandidate & { ok: true }) => void
  onBack: () => void
  onOpenByok: () => void
  /** 访客：跳转登录（与首页「登录后解锁」对齐） */
  onLogin?: () => void
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const bottomRef = useRef<HTMLDivElement>(null)
  const streamPanelRef = useRef<HTMLDivElement>(null)
  const codeRef = useRef<HTMLPreElement>(null)
  const thinkRef = useRef<HTMLPreElement>(null)
  const shellRef = useRef<HTMLDivElement>(null)
  // 步骤：代码区展示的 HTML——浏览历史版时用快照，否则用 Current
  const codeHtml = useMemo(() => {
    if (props.viewingVersionN != null) {
      const snap = props.versions.find((v) => v.n === props.viewingVersionN)
      if (snap) return snap.html
    }
    return props.html
  }, [props.viewingVersionN, props.versions, props.html])
  const showDiff =
    props.viewingVersionN == null &&
    Boolean(props.codeDiff && props.codeDiff.length > 0)
  // 步骤：思考区默认展开，用户可手动折叠
  const [thinkOpen, setThinkOpen] = useState(true)
  // 步骤：标记本轮流式是否已强制展开（避免上一轮折叠导致首屏看不到思考）
  const [openedForStream, setOpenedForStream] = useState(false)
  // 步骤：左侧对话列可拖拽调宽，并记住本机偏好
  const [chatWidth, setChatWidth] = useState(loadChatWidth)
  const draggingRef = useRef(false)

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!draggingRef.current || !shellRef.current) return
      const left = shellRef.current.getBoundingClientRect().left
      const next = Math.min(
        CHAT_WIDTH_MAX,
        Math.max(CHAT_WIDTH_MIN, e.clientX - left),
      )
      setChatWidth(next)
    }
    const onUp = () => {
      if (!draggingRef.current) return
      draggingRef.current = false
      document.body.classList.remove('is-resizing-chat')
      // 步骤：松手再落盘，避免拖动过程频繁写 localStorage
      setChatWidth((w) => {
        try {
          localStorage.setItem(CHAT_WIDTH_STORAGE_KEY, String(Math.round(w)))
        } catch {
          /* ignore */
        }
        return w
      })
    }
    window.addEventListener('pointermove', onMove)
    window.addEventListener('pointerup', onUp)
    window.addEventListener('pointercancel', onUp)
    return () => {
      window.removeEventListener('pointermove', onMove)
      window.removeEventListener('pointerup', onUp)
      window.removeEventListener('pointercancel', onUp)
    }
  }, [])

  // 步骤：流式刚开始时同步展开思考区（render 期纠正，不等 useEffect 晚一拍）
  if (props.streaming && !openedForStream) {
    setOpenedForStream(true)
    if (!thinkOpen) setThinkOpen(true)
  } else if (!props.streaming && openedForStream) {
    setOpenedForStream(false)
  }

  /** 对话区滚到底：思考面板仍在列表内，靠滚底进入视口 */
  const pinChatBottom = () => {
    const el = listRef.current
    if (!el) return
    // 步骤：直接写最大值；避免 scrollIntoView 误滚外层容器
    el.scrollTop = el.scrollHeight
  }

  // 步骤：布局后立刻钉底；双 rAF 覆盖报错换行 / 思考面板卸载后的高度变化
  useLayoutEffect(() => {
    pinChatBottom()
    let id2 = 0
    const id1 = requestAnimationFrame(() => {
      pinChatBottom()
      id2 = requestAnimationFrame(() => pinChatBottom())
    })
    return () => {
      cancelAnimationFrame(id1)
      cancelAnimationFrame(id2)
    }
  }, [
    props.chat,
    props.streaming,
    props.streamThinking,
    props.streamStage,
    props.statusError,
    props.statusText,
    props.pane,
    thinkOpen,
  ])

  // 步骤：对话变高（报错气泡、思考面板）持续跟滚，避免占满时只露出半截
  useEffect(() => {
    const root = listRef.current
    if (!root) return
    const pin = () => pinChatBottom()
    pin()
    const ro = new ResizeObserver(pin)
    ro.observe(root)
    const panel = streamPanelRef.current
    if (panel) ro.observe(panel)
    const anchor = bottomRef.current
    if (anchor) ro.observe(anchor)
    // 步骤：盯住最后一条报错，换行撑高后也能滚进视口
    const errors = root.querySelectorAll('.bubble.error')
    const lastError = errors[errors.length - 1]
    if (lastError) ro.observe(lastError)
    return () => ro.disconnect()
  }, [props.streaming, props.chat])

  // 步骤：思考框自身滚动条跟到底
  useLayoutEffect(() => {
    if (!props.streaming || !thinkOpen) return
    const el = thinkRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [props.streamThinking, props.streamStage, props.streaming, thinkOpen])

  // 步骤：代码区流式追加时自动滚到底
  useEffect(() => {
    if (!props.streaming) return
    const el = codeRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [props.html, props.streaming])

  const hasThinkBody = Boolean(
    props.streamThinking.trim() || props.streamStage.trim(),
  )

  // 步骤：登录用户未配置模型时禁止发送；访客不受限
  const needsModelSetup = !props.guest && !props.hasByok
  const sendBlocked =
    props.streaming || props.racing || needsModelSetup || !props.draft.trim()

  return (
    <div
      className="shell workspace-shell"
      ref={shellRef}
      style={{ ['--chat-pane-width' as string]: `${chatWidth}px` }}
    >
      <aside className="chat-pane" aria-label="对话">
        <header className="chat-head">
          <div>
            <button className="linkish" type="button" onClick={props.onBack}>
              ← {props.guest ? '返回首页' : '项目列表'}
            </button>
            <h2 className="chat-title">{props.title}</h2>
          </div>
          {!props.guest ? (
            <button className="btn ghost sm" type="button" onClick={props.onOpenByok}>
              配置模型
            </button>
          ) : null}
        </header>

        <div className="chat-scroll" ref={listRef}>
          {props.chat.length === 0 ? (
            <p className="hint chat-empty">描述想法，开始生成单文件 HTML。</p>
          ) : null}
          {props.chat.map((item) => {
            if (item.kind === 'version') {
              // 版本里程碑：文案已含「版本 N · 当轮修改」；回看在右侧代码页
              return (
                <div key={item.id} className="version-card">
                  <span className="version-badge">版本 {item.n}</span>
                  <p>{item.label}</p>
                </div>
              )
            }
            if (item.kind === 'error') {
              // 步骤：报错进对话流，避免只出现在输入框下方
              return (
                <div key={item.id} className="bubble error" role="alert">
                  {item.text}
                </div>
              )
            }
            if (item.kind === 'system') {
              return (
                <div key={item.id} className="bubble system" role="status">
                  {item.text}
                </div>
              )
            }
            return (
              <div
                key={item.id}
                className={`bubble ${item.kind === 'user' ? 'user' : 'assistant'}`}
              >
                {item.text}
              </div>
            )
          })}

          {/* 步骤：尚未写入 chat 的瞬时校验错误（如空输入）也进对话框 */}
          {!props.streaming &&
          props.statusError &&
          props.statusText &&
          !props.chat.some(
            (c) => c.kind === 'error' && c.text === props.statusText,
          ) ? (
            <div className="bubble error" role="alert">
              {props.statusText}
            </div>
          ) : null}

          {/* 步骤：思考面板仍在对话滚动流内（与消息同列），靠滚底进入视口 */}
          {props.streaming ? (
            <div
              className="stream-panel"
              aria-live="polite"
              ref={streamPanelRef}
            >
              <button
                type="button"
                className="stream-toggle"
                aria-expanded={thinkOpen}
                onClick={() => setThinkOpen((v) => !v)}
              >
                <span className="stream-pulse" aria-hidden="true" />
                {thinkOpen ? '收起思考过程' : '展开思考过程'}
              </button>
              <div className="stream-body">
                {props.streamStage ? (
                  <AnimatedStage text={props.streamStage} />
                ) : !hasThinkBody ? (
                  <AnimatedStage
                    text="正在连接模型，稍等一下"
                    className="hint stream-wait"
                  />
                ) : null}
                {thinkOpen && props.streamThinking ? (
                  <pre className="stream-thinking" ref={thinkRef}>
                    {props.streamThinking}
                  </pre>
                ) : null}
              </div>
            </div>
          ) : null}

          <div ref={bottomRef} className="chat-scroll-anchor" aria-hidden="true" />

          {/* 赛马候选面板：逻辑保留；入口已隐藏，正常不会触发 */}
          {props.raceCandidates ? (
            <div className="race-panel" role="group" aria-label="赛马候选" hidden>
              <p className="section-label">赛马候选 · 请择优（无自动打分）</p>
              <div className="race-grid">
                {props.raceCandidates.map((c) => (
                  <div key={c.lane} className="race-card">
                    <header>
                      候选 {c.lane}
                      <span className="hint">{c.model}</span>
                    </header>
                    {c.ok ? (
                      <>
                        <iframe
                          title={`race-${c.lane}`}
                          sandbox="allow-scripts allow-forms"
                          srcDoc={c.html}
                        />
                        <button
                          className="btn sm"
                          type="button"
                          onClick={() => props.onPickWinner(c)}
                        >
                          选为 Winner
                        </button>
                      </>
                    ) : (
                      <p className="hint danger">{c.message}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        {/* 步骤：大气圆角输入卡（多行 + 底栏 + 圆形发送） */}
        <div className="chat-composer">
          {/* 登录未配模型：产品化引导，禁用生成 */}
          {needsModelSetup ? (
            <div className="composer-gate" role="status">
              <p>
                登录后请先配置你自己的模型，配置完成后即可开始对话生成。
              </p>
              <button className="btn sm" type="button" onClick={props.onOpenByok}>
                去配置模型
              </button>
            </div>
          ) : null}

          {/* 步骤：登录后用下拉选用模型；管理入口在顶栏「配置模型」 */}
          {!props.guest && (props.byokProfiles?.length ?? 0) > 0 ? (
            <div className="model-select-row">
              <label className="sr-only" htmlFor="workspace-model">
                选用模型
              </label>
              <select
                id="workspace-model"
                className="model-select"
                value={props.activeByokId ?? ''}
                disabled={props.streaming || props.racing}
                onChange={(e) => {
                  const id = e.target.value
                  if (id) props.onSelectByok?.(id)
                }}
              >
                {props.byokProfiles!.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name || p.model}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          <div className="composer-card">
            <label className="sr-only" htmlFor="composer-textarea">
              描述你的想法
            </label>
            <textarea
              id="composer-textarea"
              className="composer-textarea"
              rows={3}
              value={props.draft}
              onChange={(e) => props.onDraftChange(e.target.value)}
              placeholder="描述你想做的页面或要改的地方"
              disabled={props.streaming || props.racing || needsModelSetup}
              onKeyDown={(e) => {
                // 步骤：Enter 发送，Shift+Enter 换行
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  if (!sendBlocked) props.onSend()
                }
              }}
            />
            <div className="composer-toolbar">
              <div className="composer-toolbar-left">
                {props.guest ? (
                  // 步骤：文案与首页 guest-mode-hint 对齐
                  <button
                    type="button"
                    className="guest-mode-hint linkish"
                    onClick={() => props.onLogin?.()}
                    title="登录后可保存项目、多轮回看与导出历史版本"
                  >
                    当前为访客模式，登录后解锁更多功能
                  </button>
                ) : null}
                {/* 赛马入口：功能暂隐，逻辑保留在 App（onRace 仍传入） */}
                {false ? (
                  <button
                    className="btn ghost sm"
                    type="button"
                    disabled={props.streaming || props.racing}
                    onClick={props.onRace}
                  >
                    {props.racing ? '赛马中…' : '赛马（两路）'}
                  </button>
                ) : null}
              </div>
              <button
                className="composer-send"
                type="button"
                aria-label="发送"
                disabled={sendBlocked}
                onClick={props.onSend}
              >
                <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true">
                  {/* 步骤：向上箭头，匹配参考图圆形发送 */}
                  <path
                    fill="currentColor"
                    d="M12 4.5l7 7-1.4 1.4L13 8.3V19.5h-2V8.3L6.4 12.9 5 11.5l7-7z"
                  />
                </svg>
              </button>
            </div>
          </div>

          {/* 步骤：错误已进对话区；此处仅保留非错误提示（如「正在生成」） */}
          {!props.statusError && props.statusText ? (
            <p className="status-line">{props.statusText}</p>
          ) : null}
        </div>
      </aside>

      {/* 步骤：拖拽分隔条，左右调整对话区宽度 */}
      <div
        className="chat-resize-handle"
        role="separator"
        aria-orientation="vertical"
        aria-label="调整对话区宽度"
        aria-valuemin={CHAT_WIDTH_MIN}
        aria-valuemax={CHAT_WIDTH_MAX}
        aria-valuenow={Math.round(chatWidth)}
        tabIndex={0}
        onPointerDown={(e) => {
          e.preventDefault()
          draggingRef.current = true
          document.body.classList.add('is-resizing-chat')
          ;(e.target as HTMLElement).setPointerCapture?.(e.pointerId)
        }}
        onKeyDown={(e) => {
          // 步骤：键盘微调，便于无鼠标操作
          const step = e.shiftKey ? 24 : 12
          if (e.key === 'ArrowLeft') {
            e.preventDefault()
            setChatWidth((w) => {
              const next = Math.max(CHAT_WIDTH_MIN, w - step)
              try {
                localStorage.setItem(CHAT_WIDTH_STORAGE_KEY, String(next))
              } catch {
                /* ignore */
              }
              return next
            })
          } else if (e.key === 'ArrowRight') {
            e.preventDefault()
            setChatWidth((w) => {
              const next = Math.min(CHAT_WIDTH_MAX, w + step)
              try {
                localStorage.setItem(CHAT_WIDTH_STORAGE_KEY, String(next))
              } catch {
                /* ignore */
              }
              return next
            })
          }
        }}
      />

      <section className="stage-pane" aria-label="预览与代码">
        <header className="stage-tabs">
          <div className="pill-tabs" role="tablist">
            <button
              type="button"
              role="tab"
              aria-selected={props.pane === 'preview'}
              className={props.pane === 'preview' ? 'pill active' : 'pill'}
              onClick={() => props.onPane('preview')}
            >
              预览
              {props.streaming && !props.iterationStreaming ? (
                <span className="pill-live" title="流式尽力预览">
                  ·直播
                </span>
              ) : null}
              {props.iterationStreaming ? (
                <span className="pill-live" title="迭代中，预览完成后更新">
                  ·修改中
                </span>
              ) : null}
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={props.pane === 'code'}
              className={props.pane === 'code' ? 'pill active' : 'pill'}
              onClick={() => props.onPane('code')}
            >
              代码
              {props.streaming || props.iterationStreaming ? (
                <span className="pill-live" title="迭代时保留上一版，完成后看变更">
                  ·修改中
                </span>
              ) : props.codeDiff?.length ? (
                <span className="pill-live" title="相对上一版">
                  ·变更
                </span>
              ) : null}
            </button>
          </div>
          <span className="hint file-hint">
            {props.iterationStreaming
              ? '保留上一版 · 后台正在改代码'
              : props.viewingVersionN != null
                ? `浏览版本 ${props.viewingVersionN}（未回滚前预览不变）`
                : showDiff
                  ? '相对上一版的变更（未改动行已折叠）'
                  : 'index.html · 单文件'}
          </span>
          <button
            type="button"
            className="btn ghost sm"
            disabled={!props.html.trim()}
            onClick={props.onExportHtml}
            title="导出当前版本到本机"
          >
            导出
          </button>
        </header>

        {/* 步骤：迭代冻稿时加轻量「修改中」层，避免代码区完全静止像卡死 */}
        <div
          className={`stage-surface${props.iterationStreaming ? ' is-mutating' : ''}`}
        >
          {props.pane === 'preview' ? (
            <div className="iframe-wrap stage-body">
              {/* sandbox 保持收紧：仅脚本与表单，无 top-navigation */}
              <iframe
                title="preview"
                sandbox="allow-scripts allow-forms"
                srcDoc={props.html || emptyPreview}
              />
            </div>
          ) : (
            <div className="code-with-versions stage-body">
              {props.versions.length > 0 ? (
                <aside className="version-rail" aria-label="历史版本">
                  <p className="version-rail-title">历史版本</p>
                  <ul className="version-rail-list">
                    {[...props.versions].reverse().map((v) => {
                      const isCurrent = v.n === props.currentVersionN
                      const isViewing =
                        (props.viewingVersionN ?? props.currentVersionN) ===
                        v.n
                      return (
                        <li key={v.n}>
                          <button
                            type="button"
                            className={`version-rail-item${isViewing ? ' active' : ''}`}
                            onClick={() => props.onViewVersion(v.n)}
                          >
                            <span className="version-rail-n">
                              v{v.n}
                              {isCurrent ? ' · 当前' : ''}
                            </span>
                            <span className="version-rail-summary">
                              {v.promptSummary}
                            </span>
                          </button>
                          {!isCurrent ? (
                            <button
                              type="button"
                              className="btn ghost sm version-rollback"
                              onClick={() => props.onRollbackVersion(v.n)}
                            >
                              回滚到此版本
                            </button>
                          ) : null}
                        </li>
                      )
                    })}
                  </ul>
                </aside>
              ) : null}
              {showDiff && props.codeDiff ? (
                <pre
                  className="code-view code-diff"
                  tabIndex={0}
                  ref={codeRef}
                  aria-label="相对上一版的代码变更"
                >
                  <code>
                    {props.codeDiff.map((line, i) => (
                      <span
                        key={`${line.type}-${i}`}
                        className={`diff-line diff-${line.type}`}
                      >
                        {line.type === 'add'
                          ? '+ '
                          : line.type === 'del'
                            ? '- '
                            : line.type === 'skip'
                              ? ''
                              : '  '}
                        {line.text}
                        {'\n'}
                      </span>
                    ))}
                  </code>
                </pre>
              ) : (
                <pre className="code-view" tabIndex={0} ref={codeRef}>
                  <code>
                    {codeHtml || '<!-- 尚未生成 index.html -->'}
                  </code>
                </pre>
              )}
            </div>
          )}
          {props.iterationStreaming ? (
            <div className="mutating-overlay" aria-live="polite">
              <span className="stream-pulse" aria-hidden="true" />
              {/* 步骤：与左侧阶段同步；思考期/改代码期文案不同，省略号动态点出 */}
              <AnimatedStage
                text={props.streamStage || '正在应用改动'}
              />
            </div>
          ) : null}
        </div>
      </section>
    </div>
  )
}

const emptyPreview = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;color:#6b7280;background:#fafafa"><p>在左侧描述想法，开始生成页面</p></body></html>`

/**
 * 阶段文案 + 动态点点点（去掉文案自带的 … / ...，统一由动画点出）
 * 注释：避免静态省略号像「卡住」
 */
function AnimatedStage(props: { text: string; className?: string }) {
  const base = props.text.replace(/[.…]+$/u, '').trimEnd()
  return (
    <p className={props.className ?? 'stream-stage'}>
      {base}
      <span className="ellipsis-dots" aria-hidden="true">
        <span>.</span>
        <span>.</span>
        <span>.</span>
      </span>
    </p>
  )
}

/** 将对话轮次压成 API 需要的 messages（不含 version / system / error） */
export function chatToMessages(chat: ChatItem[]): ChatTurn[] {
  return chat
    .filter((c): c is Extract<ChatItem, { kind: 'user' | 'assistant' }> =>
      c.kind === 'user' || c.kind === 'assistant',
    )
    .map((c) => ({
      role: c.kind === 'user' ? 'user' : 'assistant',
      content: c.text,
    }))
}
