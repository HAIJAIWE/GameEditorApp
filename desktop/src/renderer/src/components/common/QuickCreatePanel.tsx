import { useState } from 'react'

import {
  filterQuickCreateTypes,
  listQuickCreateTemplates,
  quickCreateTypeLabel,
  type QuickCreateTemplate
} from '../../../../shared/util/field/quickCreate'
import type { DataTypeDef } from '../../../../shared/types'

/**
 * 快速创建面板：
 * 选数据类型 → 卡片网格选模板 → 「创建」把模板 defaults 作为初始字段值新建条目。
 *
 * 与 旧版 的**刻意差异**（不复制 bug）：旧版 `_on_create` 里
 * `plural = get_type_schema(); data_type + "s"` 那段拼接结果被丢弃、循环 `break` 也无效，
 * 属死代码，本实现不复制；id 由主进程 `DataService.createItem` 生成。
 *
 * 模板是静态数据（`shared/quickCreate.ts`），故**不新增 IPC**；落库复用既有 `data:createItem`。
 */

interface QuickCreatePanelProps {
  /** 当前活跃数据类型（用于默认选中） */
  type: string
  /** 当前 schema 的类型定义：用于把模板类型收敛到 schema 里真实存在的（防造出无类型定义的孤儿条目） */
  types: DataTypeDef[]
  onCreated: (message: string) => void
  onClose: () => void
}

export default function QuickCreatePanel({ type, types, onCreated, onClose }: QuickCreatePanelProps) {
  // 只列 schema 里存在且有模板的类型
  const selectableTypes = filterQuickCreateTypes(types.map((def) => def.id))
  const [activeType, setActiveType] = useState(() =>
    selectableTypes.includes(type) ? type : (selectableTypes[0] ?? '')
  )
  const [selected, setSelected] = useState<QuickCreateTemplate | null>(null)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const templates = listQuickCreateTemplates(activeType)

  const changeType = (next: string): void => {
    setActiveType(next)
    setSelected(null) // 换类型即清空选中（旧选中不属于新类型）
    setError(null)
  }

  const create = async (): Promise<void> => {
    if (selected === null) return
    setBusy(true)
    setError(null)
    try {
      await window.mbApi.data.createItem({ type: activeType, data: { ...selected.defaults } })
      onCreated(`已按模板「${selected.name}」创建${quickCreateTypeLabel(activeType)}「${selected.defaults.name ?? ''}」`)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="editor" data-testid="qc-panel">
      <div className="editor-header">
        <div className="editor-title">
          快速创建
          <small>选模板后一键生成条目，字段值可再编辑</small>
        </div>
      </div>

      <div className="editor-body">
        <div className="form-row">
          <label className="form-label" htmlFor="qc-type">
            数据类型
          </label>
          <select
            id="qc-type"
            className="form-select"
            data-testid="qc-type"
            value={activeType}
            disabled={busy}
            onChange={(event) => changeType(event.target.value)}
          >
            {selectableTypes.map((key) => (
              <option key={key} value={key}>
                {quickCreateTypeLabel(key)}
              </option>
            ))}
          </select>
        </div>

        {selectableTypes.length === 0 ? (
          <div className="empty" data-testid="qc-no-type">
            当前 schema 没有可套用模板的数据类型
          </div>
        ) : templates.length === 0 ? (
          <div className="empty">该类型暂无模板</div>
        ) : (
          <div className="qc-grid">
            {templates.map((tpl) => (
              <button
                key={tpl.name}
                type="button"
                className={`qc-card${selected?.name === tpl.name ? ' selected' : ''}`}
                data-testid={`qc-card-${tpl.name}`}
                disabled={busy}
                onClick={() => setSelected(tpl)}
              >
                <div className="qc-card-name">{tpl.name}</div>
                <div className="qc-card-desc">{tpl.desc}</div>
              </button>
            ))}
          </div>
        )}

        {selected !== null && (
          <div className="qc-preview">
            <div className="qc-preview-title">将按以下初始值创建</div>
            {Object.entries(selected.defaults).map(([key, value]) => (
              <div key={key} className="qc-preview-row">
                <span className="qc-preview-key">{key}</span>
                <span className="qc-preview-value">{value === '' ? '（空）' : value}</span>
              </div>
            ))}
          </div>
        )}

        {error !== null && <div className="error-banner">{error}</div>}
      </div>

      <div className="editor-actions">
        <button
          type="button"
          className="btn primary"
          data-testid="qc-create"
          disabled={busy || selected === null}
          onClick={() => void create()}
        >
          {busy ? '创建中…' : '创建'}
        </button>
        <button type="button" className="btn" disabled={busy} onClick={onClose}>
          关闭
        </button>
      </div>
    </div>
  )
}
