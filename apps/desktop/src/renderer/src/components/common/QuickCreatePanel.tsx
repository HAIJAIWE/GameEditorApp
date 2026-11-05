import { useState } from 'react'

import { useT } from '@mobai/client-ui'

import PanelShell from './PanelShell'
import StateView from './StateView'
import {
  filterQuickCreateTypes,
  listQuickCreateTemplates,
  quickCreateTypeLabel,
  type QuickCreateTemplate
} from '@mobai/shared/util/field'
import type { DataTypeDef } from '@mobai/shared/types'

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
  const t = useT()
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
      onCreated(
        t('quickCreate.created', {
          template: selected.name,
          type: quickCreateTypeLabel(activeType),
          name: selected.defaults.name ?? ''
        })
      )
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <PanelShell
      testId="qc-panel"
      toolbar={<span className="item-meta">{t('quickCreate.subtitle')}</span>}
      footer={
        <>
          <button
            type="button"
            className="btn primary"
            data-testid="qc-create"
            disabled={busy || selected === null}
            onClick={() => void create()}
          >
            {busy ? t('quickCreate.creating') : t('quickCreate.create')}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={onClose}>
            {t('common.close')}
          </button>
        </>
      }
    >
        <div className="form-row">
          <label className="form-label" htmlFor="qc-type">
            {t('quickCreate.typeLabel')}
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
          <StateView kind="empty" testId="qc-no-type" title={t('quickCreate.noType')} />
        ) : templates.length === 0 ? (
          <StateView kind="empty" title={t('quickCreate.noTemplates')} />
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
            <div className="qc-preview-title">{t('quickCreate.previewTitle')}</div>
            {Object.entries(selected.defaults).map(([key, value]) => (
              <div key={key} className="qc-preview-row">
                <span className="qc-preview-key">{key}</span>
                <span className="qc-preview-value">{value === '' ? t('quickCreate.empty') : value}</span>
              </div>
            ))}
          </div>
        )}

        {error !== null && <div className="error-banner">{error}</div>}
    </PanelShell>
  )
}
