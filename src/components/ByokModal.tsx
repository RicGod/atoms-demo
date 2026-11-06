import { useState } from 'react'
import type { ByokConfig } from '../lib/types'

/** 自配模型弹窗：仅登录后可打开；Key 只存本机 */
export function ByokModal(props: {
  initial: ByokConfig | null
  onClose: () => void
  onSave: (cfg: ByokConfig) => void
  onClear: () => void
}) {
  const [baseUrl, setBaseUrl] = useState(
    props.initial?.baseUrl || 'https://api.openai.com/v1',
  )
  const [apiKey, setApiKey] = useState(props.initial?.apiKey || '')
  const [model, setModel] = useState(props.initial?.model || 'gpt-4o-mini')

  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true" aria-label="自配模型">
      <div className="modal">
        <h3>自配模型</h3>
        <p className="hint warn">
          出于安全考虑，API Key 只保存在本机浏览器，不会上传到服务器。
        </p>
        <div className="field">
          <label htmlFor="byok-base">Base URL</label>
          <input
            id="byok-base"
            value={baseUrl}
            onChange={(e) => setBaseUrl(e.target.value)}
          />
        </div>
        <div className="field">
          <label htmlFor="byok-key">API Key</label>
          <input
            id="byok-key"
            type="password"
            value={apiKey}
            onChange={(e) => setApiKey(e.target.value)}
            placeholder="不会上传到本应用服务端"
            autoComplete="off"
          />
        </div>
        <div className="field">
          <label htmlFor="byok-model">Model</label>
          <input
            id="byok-model"
            value={model}
            onChange={(e) => setModel(e.target.value)}
          />
        </div>
        <div className="row">
          <button
            className="btn"
            type="button"
            onClick={() =>
              props.onSave({
                baseUrl: baseUrl.trim(),
                apiKey: apiKey.trim(),
                model: model.trim(),
              })
            }
          >
            保存到本机
          </button>
          <button className="btn ghost" type="button" onClick={props.onClear}>
            清除
          </button>
          <button className="btn ghost" type="button" onClick={props.onClose}>
            关闭
          </button>
        </div>
      </div>
    </div>
  )
}
