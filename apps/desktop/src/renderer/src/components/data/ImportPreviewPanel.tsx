import { useState } from 'react'

import type { DataTypeDef, ImportFieldChange, ImportPreview, ImportSummary } from '@mobai/shared/types'

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
function formatValue(value: unknown): string {
  if (value === undefined || value === null || value === '') return '(空)'
  if (Array.isArray(value)) return value.length === 0 ? '(空)' : value.map((item) => String(item)).join('、')
  if (typeof value === 'object') {
    try {
      return JSON.stringify(value)
    } catch {
      return '(无法显示)'
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
    <div className="editor" data-testid="import-preview-panel">
      <div className="editor-header">
        <div className="editor-title">
          导入预览
          <small>{fileNameOf(preview.filePath)}</small>
        </div>
      </div>

      <div className="editor-body">
        <div className="import-preview-stats" data-testid="import-preview-stats">
          <span className="import-stat create">新增 {preview.createCount}</span>
          <span className="import-stat update">修改 {preview.updateCount}</span>
          <span className="import-stat">未变 {preview.unchangedCount}</span>
          <span className="import-stat">跳过 {preview.skipped}</span>
        </div>

        {preview.missingIdSources.length > 0 && (
          <div className="error-banner" data-testid="import-preview-missing-id">
            {preview.missingIdSources.slice(0, 4).join('、')} 没有 id 列，已全部按「新增」导入——
            若本想修改已有数据，会变成重复项。建议从系统重新导出模板再填。
          </div>
        )}

        {Object.keys(preview.unknownTypes).length > 0 && (
          <div className="form-hint" data-testid="import-preview-unknown">
            未收录类型（数据仍会入库）：{Object.keys(preview.unknownTypes).join('、')}
          </div>
        )}

        {!hasChanges ? (
          <div className="artifact-placeholder" data-testid="import-preview-nochange">
            <p>文件内容与库内完全一致，导入不会产生任何变化。</p>
          </div>
        ) : (
          <div className="import-preview-list" data-testid="import-preview-list">
            {preview.records.map((record) => (
              <div key={`${record.kind}-${record.type}-${record.businessId}-${record.name}`} className="import-preview-row">
                <div className="import-preview-head">
                  <span className={`import-tag ${record.kind}`}>{record.kind === 'create' ? '新增' : '修改'}</span>
                  <span className="import-preview-type">{typeLabel(record.type)}</span>
                  <span className="import-preview-name">{record.name}</span>
                  {record.businessId !== '' && <span className="item-meta">id {record.businessId}</span>}
                </div>
                {record.changes.length > 0 && (
                  <ul className="import-change-list">
                    {record.changes.map((change: ImportFieldChange) => (
                      <li key={change.key} className="import-change">
                        <span className="import-change-field">{fieldLabel(record.type, change.key)}</span>
                        <span className="import-change-before">{formatValue(change.before)}</span>
                        <span className="import-change-arrow">→</span>
                        <span className="import-change-after">{formatValue(change.after)}</span>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            ))}
            {preview.truncated && (
              <div className="form-hint" data-testid="import-preview-truncated">
                变更太多，仅列出前 {preview.records.length} 条；确认后其余变更同样会写入。
              </div>
            )}
          </div>
        )}

        {error !== null && (
          <div className="error-banner" data-testid="import-preview-error">
            {error}
          </div>
        )}
      </div>

      <div className="editor-actions">
        <button
          type="button"
          className="btn primary"
          data-testid="import-preview-apply"
          disabled={busy}
          onClick={() => void handleApply()}
        >
          {busy ? '导入中…' : hasChanges ? '确认导入' : '仍然导入'}
        </button>
        <button type="button" className="btn" data-testid="import-preview-cancel" disabled={busy} onClick={onCancel}>
          取消
        </button>
      </div>
    </div>
  )
}
