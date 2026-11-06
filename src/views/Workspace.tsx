import { useEffect, useRef, useState } from 'react'
import { BUILTIN_MODELS } from '../../shared/constants'
import type { ChatTurn, RaceCandidate } from '../lib/api'
import { modeBadgeLabel } from '../lib/labels'
import type { GenerationMode } from '../lib/types'

export type ChatItem =
  | { kind: 'user'; id: string; text: string }
  | { kind: 'assistant'; id: string; text: string }
  | { kind: 'version'; id: string; n: number; label: string }

type Pane = 'preview' | 'code'

/** 图3：左对话 + 右预览/代码；单文件 index.html；版本 N 仅装饰 */
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

          {props.raceCandidates ? (
            <div className="race-panel" role="group" aria-label="赛马候选">
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

        <div className="chat-composer">
          {!props.guest ? (
            <div className="composer-tools">
              <label className="field-inline">
                <span className="sr-only">内置模型</span>
                <select
                  value={props.model}
                  onChange={(e) => props.onModelChange(e.target.value)}
                  disabled={props.preferByok}
                >
                  {BUILTIN_MODELS.map((m) => (
                    <option key={m} value={m}>
                      {m}
                    </option>
                  ))}
                </select>
              </label>
              <label className="hint check">
                <input
                  type="checkbox"
                  checked={props.preferByok}
                  disabled={!props.hasByok}
                  onChange={(e) => props.onPreferByok(e.target.checked)}
                />
                自配
              </label>
            </div>
          ) : null}

          <div className="chips">
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                className="chip"
                disabled={props.streaming || props.racing}
                onClick={() => props.onDraftChange(s)}
              >
                {s}
              </button>
            ))}
          </div>

          <div className="composer-row">
            <input
              className="composer-input"
              value={props.draft}
              onChange={(e) => props.onDraftChange(e.target.value)}
              placeholder="让智能体团队实现你的想法"
              disabled={props.streaming || props.racing}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  props.onSend()
                }
              }}
            />
            <button
              className="btn"
              type="button"
              disabled={props.streaming || props.racing}
              onClick={props.onSend}
            >
              发送
            </button>
          </div>

          <div className="row composer-extra">
            {!props.guest ? (
              <>
                <button
                  className="btn ghost sm"
                  type="button"
                  disabled={props.streaming || props.racing}
                  onClick={props.onRace}
                >
                  {props.racing ? '赛马中…' : '赛马（两路）'}
                </button>
                <button
                  className="btn warn sm"
                  type="button"
                  disabled={props.saving || !props.html}
                  onClick={props.onSave}
                >
                  {props.saving ? '保存中…' : '保存到项目'}
                </button>
              </>
            ) : (
              // 步骤：访客工作区轻提示；登录后可保存项目与持续对话
              // 注意：三元 else 分支只能有一个表达式；勿用 {/* */} 与元素并列（会解析失败）
              <span className="hint">当前为访客模式 · 登录后解锁更多功能</span>
            )}
            {modeBadgeLabel(props.mode) ? (
              <span className={`badge ${props.mode ?? ''}`}>
                {modeBadgeLabel(props.mode)}
              </span>
            ) : null}
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
