import { useEffect, useRef } from 'react'
import { BUILTIN_MODELS } from '../../shared/constants'
import type { ChatTurn, RaceCandidate } from '../lib/api'
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

  // 步骤：新消息时滚到底部
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [props.chat, props.streaming, props.raceCandidates])

  const suggestions =
    props.suggestions ??
    ['添加移动控制', '添加在线排行榜', '优化视觉风格']

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
          {props.streaming ? (
            <div className="bubble assistant muted">生成中…</div>
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
              <span className="hint">访客模式：不落库 · 赛马已禁用</span>
            )}
            {props.mode ? (
              <span className={`badge ${props.mode}`}>{props.mode}</span>
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
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={props.pane === 'code'}
              className={props.pane === 'code' ? 'pill active' : 'pill'}
              onClick={() => props.onPane('code')}
            >
              代码
            </button>
          </div>
          <span className="hint file-hint">index.html · 单文件</span>
        </header>

        {props.pane === 'preview' ? (
          <div className="iframe-wrap stage-body">
            <iframe
              title="preview"
              sandbox="allow-scripts allow-forms"
              srcDoc={props.html || emptyPreview}
            />
          </div>
        ) : (
          <pre className="code-view stage-body" tabIndex={0}>
            <code>{props.html || '<!-- 尚未生成 index.html -->'}</code>
          </pre>
        )}
      </section>
    </div>
  )
}

const emptyPreview = `<!DOCTYPE html><html><body style="font-family:system-ui,sans-serif;display:grid;place-items:center;height:100vh;margin:0;color:#6b7280;background:#fafafa"><p>在左侧对话区发送 Prompt 开始生成</p></body></html>`

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
