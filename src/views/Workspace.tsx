import { useEffect, useRef, useState } from 'react'
import type { ChatTurn, RaceCandidate } from '../lib/api'
import { modeBadgeLabel } from '../lib/labels'
import type { GenerationMode } from '../lib/types'

export type ChatItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'version'; id: string; n: number; label: string }

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
  /** 流式阶段提示（无思考链时的亲和文案） */
  streamStage: string
  saving: boolean
  html: string
  mode: GenerationMode | null
  /** 访客可选模型；登录用户忽略（仅自配） */
  model: string
  onModelChange: (m: string) => void
  preferByok: boolean
  onPreferByok: (v: boolean) => void
  hasByok: boolean
  pane: Pane
  onPane: (p: Pane) => void
  statusText: string
  statusError: boolean
  raceCandidates: RaceCandidate[] | null
  racing: boolean
  onSend: () => void
  onRace: () => void
  onPickWinner: (c: RaceCandidate & { ok: true }) => void
  onSave: () => void
  onBack: () => void
  onOpenByok: () => void
  suggestions?: string[]
}) {
  const listRef = useRef<HTMLDivElement>(null)
  const codeRef = useRef<HTMLPreElement>(null)
  // 步骤：思考区默认展开，用户可手动折叠
  const [thinkOpen, setThinkOpen] = useState(true)

  // 步骤：新消息 / 流式时滚到底部
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [props.chat, props.streaming, props.streamThinking, props.raceCandidates])

  // 步骤：代码区流式追加时自动滚到底
  useEffect(() => {
    if (!props.streaming) return
    const el = codeRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [props.html, props.streaming])

  // 新一轮流式开始时重新展开思考区
  useEffect(() => {
    if (props.streaming) setThinkOpen(true)
  }, [props.streaming])

  const suggestions =
    props.suggestions ??
    ['添加移动控制', '添加在线排行榜', '优化视觉风格']

  const hasThinkBody = Boolean(
    props.streamThinking.trim() || props.streamStage.trim(),
  )

  // 步骤：登录用户未配置模型时禁止发送；访客不受限
  const needsModelSetup = !props.guest && !props.hasByok
  const sendBlocked =
    props.streaming || props.racing || needsModelSetup || !props.draft.trim()

  return (
    <div className="shell workspace-shell">
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
              // 版本卡片：纯装饰，不可点击回看
              return (
                <div key={item.id} className="version-card" aria-hidden="true">
                  <span className="version-badge">版本 {item.n}</span>
                  <p>{item.label}</p>
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

          {/* 流式：折叠思考区 + 阶段文案（替代生硬「生成中…」） */}
          {props.streaming ? (
            <div className="stream-panel" aria-live="polite">
              <button
                type="button"
                className="stream-toggle"
                aria-expanded={thinkOpen}
                onClick={() => setThinkOpen((v) => !v)}
              >
                <span className="stream-pulse" aria-hidden="true" />
                {thinkOpen ? '收起思考过程' : '展开思考过程'}
              </button>
              {thinkOpen && hasThinkBody ? (
                <div className="stream-body">
                  {props.streamStage ? (
                    <p className="stream-stage">{props.streamStage}</p>
                  ) : null}
                  {props.streamThinking ? (
                    <pre className="stream-thinking">{props.streamThinking}</pre>
                  ) : null}
                </div>
              ) : null}
              {!hasThinkBody ? (
                <p className="hint stream-wait">正在连接模型，稍等一下…</p>
              ) : null}
            </div>
          ) : null}

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

          <div className="chips">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                className="chip"
                disabled={props.streaming || props.racing || needsModelSetup}
                onClick={() => props.onDraftChange(s)}
              >
                {s}
              </button>
            ))}
          </div>

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
              placeholder="让智能体团队实现你的想法"
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
                {!props.guest ? (
                  <button
                    className="btn ghost sm"
                    type="button"
                    disabled={props.saving || !props.html || needsModelSetup}
                    onClick={props.onSave}
                  >
                    {props.saving ? '保存中…' : '保存'}
                  </button>
                ) : (
                  <span className="hint">访客模式 · 登录后可保存项目</span>
                )}
                {modeBadgeLabel(props.mode) ? (
                  <span className={`badge ${props.mode ?? ''}`}>
                    {modeBadgeLabel(props.mode)}
                  </span>
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

          <p className={`status-line ${props.statusError ? 'error' : ''}`}>
            {props.statusText}
          </p>
        </div>
      </aside>

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
              {props.streaming ? (
                <span className="pill-live" title="流式尽力预览">
                  ·直播
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
              {props.streaming ? (
                <span className="pill-live" title="源码实时追加">
                  ·写入中
                </span>
              ) : null}
            </button>
          </div>
          <span className="hint file-hint">index.html · 单文件</span>
        </header>

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
          <pre className="code-view stage-body" tabIndex={0} ref={codeRef}>
            <code>{props.html || '<!-- 尚未生成 index.html -->'}</code>
          </pre>
        )}
      </section>
    </div>
  )
}

const emptyPreview = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;color:#6b7280;background:#fafafa"><p>在左侧描述想法，开始生成页面</p></body></html>`

/** 将对话轮次压成 API 需要的 messages（不含装饰 version） */
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
