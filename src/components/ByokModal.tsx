import { useState } from 'react'
import { isBuiltinProfile, newByokId } from '../lib/byok'
import type { ByokProfile, ByokStore } from '../lib/types'

/** 线框图标：编辑 */
function IconEdit() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zm2.92 2.33H5v-.92l9.06-9.06.92.92L5.92 19.58zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"
      />
    </svg>
  )
}

/** 线框图标：删除 */
function IconTrash() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M6 19a2 2 0 0 0 2 2h8a2 2 0 0 0 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"
      />
    </svg>
  )
}

/** 线框图标：关闭 */
function IconClose() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M18.3 5.71 12 12l6.3 6.29-1.41 1.42L10.59 13.4 4.29 19.7 2.88 18.3 9.17 12 2.88 5.71 4.29 4.3l6.3 6.29 6.3-6.3z"
      />
    </svg>
  )
}

/** 线框图标：勾选 / 保存 */
function IconCheck() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M9.55 18.2 3.8 12.45l1.4-1.4 4.35 4.35L18.8 6.15l1.4 1.4z"
      />
    </svg>
  )
}

/** 线框图标：加号 */
function IconPlus() {
  return (
    <svg width="16" height="16" viewBox="0 0 24 24" aria-hidden="true">
      <path fill="currentColor" d="M11 5h2v6h6v2h-6v6h-2v-6H5v-2h6z" />
    </svg>
  )
}

/** 自配模型弹窗：多配置列表 + 选用；操作以图标为主 */
export function ByokModal(props: {
  store: ByokStore
  onClose: () => void
  /** 整仓写回（含选用、增删改后的 profiles） */
  onChange: (store: ByokStore) => void
  onClearAll: () => void
}) {
  const [editingId, setEditingId] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [baseUrl, setBaseUrl] = useState('https://api.openai.com/v1')
  const [apiKey, setApiKey] = useState('')
  const [model, setModel] = useState('gpt-4o-mini')
  const [formError, setFormError] = useState('')
  const [showKey, setShowKey] = useState(false)

  const resetForm = () => {
    setEditingId(null)
    setName('')
    setBaseUrl('https://api.openai.com/v1')
    setApiKey('')
    setModel('gpt-4o-mini')
    setFormError('')
    setShowKey(false)
  }

  const startEdit = (p: ByokProfile) => {
    // 步骤：平台预置禁止进入编辑表单
    if (isBuiltinProfile(p)) return
    setEditingId(p.id)
    setName(p.name)
    setBaseUrl(p.baseUrl)
    setApiKey(p.apiKey)
    setModel(p.model)
    setFormError('')
    setShowKey(false)
  }

  const selectActive = (id: string) => {
    props.onChange({ ...props.store, activeId: id })
  }

  const removeProfile = (id: string) => {
    const target = props.store.profiles.find((p) => p.id === id)
    // 步骤：平台预置不可删除
    if (target && isBuiltinProfile(target)) return
    const profiles = props.store.profiles.filter((p) => p.id !== id)
    const activeId =
      props.store.activeId === id
        ? profiles[0]?.id ?? null
        : props.store.activeId
    props.onChange({ profiles, activeId })
    if (editingId === id) resetForm()
  }

  const submitForm = () => {
    const trimmedName = name.trim() || model.trim()
    const trimmedBase = baseUrl.trim()
    const trimmedKey = apiKey.trim()
    const trimmedModel = model.trim()
    // 步骤：校验必填
    if (!trimmedBase || !trimmedKey || !trimmedModel) {
      setFormError('请填写 Base URL、API Key 和 Model')
      return
    }
    // 步骤：禁止把预置条目改写成自配
    if (editingId) {
      const current = props.store.profiles.find((p) => p.id === editingId)
      if (current && isBuiltinProfile(current)) {
        setFormError('平台默认模型不可编辑')
        return
      }
    }
    setFormError('')
    if (editingId) {
      const profiles = props.store.profiles.map((p) =>
        p.id === editingId
          ? {
              ...p,
              name: trimmedName,
              baseUrl: trimmedBase,
              apiKey: trimmedKey,
              model: trimmedModel,
            }
          : p,
      )
      props.onChange({
        profiles,
        activeId: props.store.activeId ?? editingId,
      })
    } else {
      const id = newByokId()
      const profile: ByokProfile = {
        id,
        name: trimmedName,
        baseUrl: trimmedBase,
        apiKey: trimmedKey,
        model: trimmedModel,
      }
      props.onChange({
        profiles: [...props.store.profiles, profile],
        activeId: id,
      })
    }
    resetForm()
  }

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="配置模型">
      <div className="modal byok-modal">
        {/* 步骤：顶栏标题 + 关闭图标 */}
        <header className="byok-head">
          <div>
            <h3>模型配置</h3>
            <p className="byok-sub">
              Key 仅存本机浏览器，不会上传服务器
            </p>
          </div>
          <button
            type="button"
            className="icon-btn"
            aria-label="关闭"
            onClick={props.onClose}
          >
            <IconClose />
          </button>
        </header>

        {/* 步骤：已保存列表 */}
        <section className="byok-list" aria-label="已保存的模型">
          <div className="byok-section-head">
            <span className="section-label">已保存</span>
            <span className="byok-count">{props.store.profiles.length}</span>
          </div>
          <ul className="byok-profiles">
            {props.store.profiles.map((p) => {
              const active = props.store.activeId === p.id
              const locked = isBuiltinProfile(p)
              return (
                <li
                  key={p.id}
                  className={
                    active
                      ? locked
                        ? 'byok-row active builtin'
                        : 'byok-row active'
                      : locked
                        ? 'byok-row builtin'
                        : 'byok-row'
                  }
                >
                  <button
                    type="button"
                    className="byok-pick"
                    aria-pressed={active}
                    aria-label={`选用 ${p.name || p.model}`}
                    onClick={() => selectActive(p.id)}
                  >
                    <span className="byok-radio" aria-hidden="true" />
                    <span className="byok-meta">
                      <strong>{p.name || p.model}</strong>
                      <span className="hint">
                        {locked ? (
                          <>平台默认 · 不可编辑删除</>
                        ) : (
                          <>
                            {p.model}
                            <span className="byok-sep">·</span>
                            {p.baseUrl.replace(/^https?:\/\//, '')}
                          </>
                        )}
                      </span>
                    </span>
                    {locked ? <span className="byok-badge muted">默认</span> : null}
                    {active ? <span className="byok-badge">ON</span> : null}
                  </button>
                  <div className="byok-actions">
                    {locked ? (
                      <span className="hint byok-locked-hint" title="平台默认不可改">
                        锁定
                      </span>
                    ) : (
                      <>
                        <button
                          type="button"
                          className="icon-btn"
                          aria-label="编辑"
                          title="编辑"
                          onClick={() => startEdit(p)}
                        >
                          <IconEdit />
                        </button>
                        <button
                          type="button"
                          className="icon-btn danger"
                          aria-label="删除"
                          title="删除"
                          onClick={() => removeProfile(p.id)}
                        >
                          <IconTrash />
                        </button>
                      </>
                    )}
                  </div>
                </li>
              )
            })}
          </ul>
        </section>

        {/* 步骤：添加 / 编辑表单 */}
        <section
          className="byok-form"
          aria-label={editingId ? '编辑模型' : '添加模型'}
        >
          <div className="byok-section-head">
            <span className="section-label">
              {editingId ? '编辑' : '新增'}
            </span>
            {editingId ? (
              <button
                type="button"
                className="icon-btn"
                aria-label="取消编辑"
                title="取消编辑"
                onClick={resetForm}
              >
                <IconClose />
              </button>
            ) : null}
          </div>

          <div className="byok-fields">
            <div className="field">
              <label htmlFor="byok-name">Name</label>
              <input
                id="byok-name"
                value={name}
                placeholder="DeepSeek / 公司账号"
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="field">
              <label htmlFor="byok-model">Model</label>
              <input
                id="byok-model"
                value={model}
                placeholder="gpt-4o-mini"
                onChange={(e) => setModel(e.target.value)}
              />
            </div>
            <div className="field byok-span-2">
              <label htmlFor="byok-base">Base URL</label>
              <input
                id="byok-base"
                value={baseUrl}
                onChange={(e) => setBaseUrl(e.target.value)}
              />
            </div>
            <div className="field byok-span-2 byok-key-field">
              <label htmlFor="byok-key">API Key</label>
              <div className="byok-key-wrap">
                <input
                  id="byok-key"
                  type={showKey ? 'text' : 'password'}
                  value={apiKey}
                  onChange={(e) => setApiKey(e.target.value)}
                  placeholder="sk-…"
                  autoComplete="off"
                />
                <button
                  type="button"
                  className="icon-btn byok-eye"
                  aria-label={showKey ? '隐藏密钥' : '显示密钥'}
                  title={showKey ? '隐藏' : '显示'}
                  onClick={() => setShowKey((v) => !v)}
                >
                  {/* 步骤：简易眼睛图标 */}
                  <svg width="15" height="15" viewBox="0 0 24 24" aria-hidden="true">
                    {showKey ? (
                      <path
                        fill="currentColor"
                        d="M12 6a9.8 9.8 0 0 0-9.5 6 9.8 9.8 0 0 0 19 0A9.8 9.8 0 0 0 12 6zm0 10a4 4 0 1 1 0-8 4 4 0 0 1 0 8z"
                      />
                    ) : (
                      <path
                        fill="currentColor"
                        d="M2.1 3.5 3.5 2.1l18.4 18.4-1.4 1.4-3.2-3.2A11.4 11.4 0 0 1 12 19.5 11.5 11.5 0 0 1 .7 12c.6-1.3 1.5-2.5 2.6-3.5L2.1 3.5zM12 7.5c1 0 1.9.3 2.7.8l-1.5 1.5A2.5 2.5 0 0 0 9.7 13l-1.5 1.5A4.5 4.5 0 0 1 12 7.5zm8.2 1.1c1.1 1 2 2.2 2.6 3.4a11.5 11.5 0 0 1-5.1 5.7l-1.6-1.6c1.5-.7 2.7-1.8 3.5-3.2A9.7 9.7 0 0 0 12 8.1l1.2-1.2c2.3.2 4.4 1.1 6 2.7z"
                      />
                    )}
                  </svg>
                </button>
              </div>
            </div>
          </div>

          {formError ? <p className="hint danger">{formError}</p> : null}

          <div className="byok-form-actions">
            <button
              type="button"
              className="btn byok-primary"
              onClick={submitForm}
              title={editingId ? '保存修改' : '添加到列表'}
            >
              {editingId ? <IconCheck /> : <IconPlus />}
              <span>{editingId ? 'Save' : 'Add'}</span>
            </button>
          </div>
        </section>

        <footer className="byok-foot">
          <button
            type="button"
            className="icon-btn danger"
            aria-label="清除自配"
            title="清除自配（保留平台默认）"
            disabled={!props.store.profiles.some((p) => !isBuiltinProfile(p))}
            onClick={props.onClearAll}
          >
            <IconTrash />
          </button>
          <span className="hint">清除自配（保留平台默认）</span>
        </footer>
      </div>
    </div>
  )
}
