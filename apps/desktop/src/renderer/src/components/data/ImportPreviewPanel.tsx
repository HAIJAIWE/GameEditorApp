import { useState } from 'react'

import { useT } from '@mobai/client-ui'

import { PanelShell } from '../common'

import type { MessageKey, TranslateParams } from '@mobai/shared/i18n'
import type { DataTypeDef, ImportFieldChange, ImportPreview, ImportSummary } from '@mobai/shared/types'

/** `useT()` 返回的翻译函数签名（供模块级纯函数复用） */
type TranslateFn = (key: MessageKey, params?: TranslateParams) => string

/**
 * 导入预览（确认后才落库）。
 *
 * 为什么要有这一步：导入是**不可撤销的批量写**（撤销栈只记单条），
 * 以前点「导入 Excel」就直接写库，改错了只能靠备份回滚。现在先把
 * 「新增多少、改了哪些字段（前 → 后）」摆出来，用户点确认才落。
 *
 * 会话（解析结果）存在主进程，确认时用会话 id 取用；取消不额外发通道——
 * 会话 10 分钟自然过期，且最多只留 4 个，不会堆内存。
 */

interface ImportPreviewPanelProps {
  previewId: string
  preview: ImportPreview
  types: DataTypeDef[]
  onApplied: (summary: ImportSummary) => void
  onCancel: () => void
}

/** 单元格值 → 可读文本（空值要能看出来，对象别显示成 [object Object]） */
function formatValue(value: unknown, t: TranslateFn): string {
  if (value === undefined || value === null || value === '') return t('importPreview.empty')
  if (Array.isArray(value)) {
    return value.length === 0
      ? t('importPreview.empty')
      : value.map((item) => String(item)).join(t('importPreview.listSeparator'))
  }
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return t('importPreview.unrenderable')
    }
  }
  return String(value)
}

function fileNameOf(path: string): string {
  const parts = path.split(/[\\/]/)
  return parts[parts.length - 1] ?? path
}

export default function ImportPreviewPanel({
  previewId,
  preview,
  types,
  onApplied,
  onCancel
}: ImportPreviewPanelProps) {
  const t = useT()
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const typeLabel = (typeId: string): string => types.find((def) => def.id === typeId)?.name ?? typeId
  /** 字段 key → 中文标签（认不出就退回 key，别把信息藏起来） */
  const fieldLabel = (typeId: string, key: string): string =>
    types.find((def) => def.id === typeId)?.formFields.find((field) => field.name === key)?.label ?? key

  const hasChanges = preview.createCount > 0 || preview.updateCount > 0

  const handleApply = async (): Promise<void> => {
    setBusy(true)
    setError(null)
    try {
      const summary = await window.mbApi.data.applyImport({ previewId })
      onApplied(summary)
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setBusy(false)
    }
  }

  return (
    <PanelShell
      testId="import-preview-panel"
      toolbar={<span className="item-meta">{fileNameOf(preview.filePath)}</span>}
      footer={
        <>
          <button
            type="button"
            className="btn primary"
            data-testid="import-preview-apply"
            disabled={busy}
            onClick={() => void handleApply()}
          >
            {busy ? t('importPreview.applying') : hasChanges ? t('importPreview.confirm') : t('importPreview.importAnyway')}
          </button>
          <button type="button" className="btn" data-testid="import-preview-cancel" disabled={busy} onClick={onCancel}>
            {t('common.cancel')}
          </button>
        </>
      }
    >
        <div className="import-preview-stats" data-testid="import-preview-stats">
          <span className="import-stat create">{t('importPreview.statCreate', { n: preview.createCount })}</span>
          <span className="import-stat update">{t('importPreview.statUpdate', { n: preview.updateCount })}</span>
          <span className="import-stat">{t('importPreview.statUnchanged', { n: preview.unchangedCount })}</span>
          <span className="import-stat">{t('importPreview.statSkipped', { n: preview.skipped })}</span>
        </div>

        {preview.missingIdSources.length > 0 && (
          <div className="error-banner" data-testid="import-preview-missing-id">
            {t('importPreview.missingId', {
              sources: preview.missingIdSources.slice(0, 4).join(t('importPreview.listSeparator'))
            })}
          </div>
        )}

        {Object.keys(preview.unknownTypes).length > 0 && (
          <div className="form-hint" data-testid="import-preview-unknown">
            {t('importPreview.unknownTypes', {
              keys: Object.keys(preview.unknownTypes).join(t('importPreview.listSeparator'))
            })}
          </div>
        )}

        {!hasChanges ? (
          <div className="artifact-placeholder" data-testid="import-preview-nochange">
            <p>{t('importPreview.noChange')}</p>
          </div>
        ) : (
          <div className="import-preview-list" data-testid="import-preview-list">
            {preview.records.map((record) => (
              <div key={`${record.kind}-${record.type}-${record.businessId}-${record.name}`} className="import-preview-row">
                <div className="import-preview-head">
                  <span className={`import-tag ${record.kind}`}>{record.kind === 'create' ? t('importPreview.tagCreate') : t('importPreview.tagUpdate')}</span>
                  <span className="import-preview-type">{typeLabel(record.type)}</span>
                  <span className="import-preview-name">{record.name}</span>
                  {record.businessId !== '' && <span className="item-meta">id {record.businessId}</span>}
                </div>
                {record.changes.length > 0 && (
                  <ul className="import-change-list">
                    {record.changes.map((change: ImportFieldChange) => (
                      <li key={change.key} className="import-change">
                        <span className="import-change-field">{fieldLabel(record.type, change.key)}</span>
                        <span className="import-change-before">{formatValue(change.before, t)}</span>
                        <span className="import-change-arrow">→</span>
                        <span className="import-change-after">{formatValue(change.after, t)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {preview.truncated && (
              <div className="form-hint" data-testid="import-preview-truncated">
                {t('importPreview.truncated', { n: preview.records.length })}
              </div>
            )}
          </div>
        )}

        {error !== null && (
          <div className="error-banner" data-testid="import-preview-error">
            {error}
          </div>
        )}
    </PanelShell>
  )
}
