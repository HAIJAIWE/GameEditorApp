import { useState } from 'react'

import {
  ADJUST_MODES,
  ADJUST_MODE_LABELS,
  BATCH_OP_KINDS,
  BATCH_OP_LABELS,
  type BatchOpKind,
  type AdjustMode
} from '../../../shared/dataTableOps'
import type { DataTypeDef } from '../../../shared/types'

/**
 * 批量操作面板（对应 Python BatchEditDialog）：
 * 设置字段值 / 追加字段值（文本）/ 数值增减（加·乘·设）/ 添加标签 / 删除选中项。
 * 选中项来自左侧列表勾选；删除需二次确认（Python 为弹窗确认）；应用走 IPC 批量写入（单次写队列任务）。
 */

type OpChoice = BatchOpKind | 'delete_selected'

interface BatchEditPanelProps {
  type: string
  typeDef: DataTypeDef | null
  selectedIds: string[]
  onApplied: (message: string) => void
  onClose: () => void
}

export default function BatchEditPanel({ type, typeDef, selectedIds, onApplied, onClose }: BatchEditPanelProps) {
  // 字段选项与 Python _populate_fields 一致（列出全部字段）；id 为系统字段，排除以避免破坏条目身份
  const fieldOptions = (typeDef?.formFields ?? []).filter((field) => field.name !== 'id')
  const [op, setOp] = useState<OpChoice>('set_value')
  const [field, setField] = useState(() => fieldOptions[0]?.name ?? 'name')
  const [value, setValue] = useState('')
  const [separator, setSeparator] = useState(',')
  const [mode, setMode] = useState<AdjustMode>('add')
  const [adjustText, setAdjustText] = useState('0')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  const selectedCount = selectedIds.length

  const changeOp = (next: OpChoice): void => {
    setOp(next)
    setDeleteConfirm(false)
    setErrors([])
  }

  const handleApply = async (): Promise<void> => {
    setErrors([])
    if (op === 'delete_selected') return
    // 与 Python _on_apply 的告警条件一致：追加/标签要求内容非空；其余要求选中字段
    if (field === '') {
      setErrors(['请选择字段'])
      return
    }
    if (op === 'append_value' && value === '') {
      setErrors(['请填写追加内容'])
      return
    }
    if (op === 'add_tag' && value === '') {
      setErrors(['请填写标签内容'])
      return
    }
    setBusy(true)
    try {
      const summary = await window.mbApi.data.batchUpdate({
        type,
        ids: selectedIds,
        op: { kind: op, field, value, separator, mode, adjust: clampInt(adjustText) }
      })
      const parts = [`已处理 ${summary.affected} 项`]
      if (summary.skipped > 0) parts.push(`${summary.skipped} 项非数值已跳过`)
      if (summary.missing > 0) parts.push(`${summary.missing} 项已不存在`)
      onApplied(`批量操作完成：${parts.join('，')}`)
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)])
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (): Promise<void> => {
    setErrors([])
    setBusy(true)
    try {
      const summary = await window.mbApi.data.deleteMany({ ids: selectedIds })
      const parts = [`已删除 ${summary.deleted} 项`]
      if (summary.missing > 0) parts.push(`${summary.missing} 项已不存在`)
      onApplied(`批量删除完成：${parts.join('，')}`)
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)])
    } finally {
      setBusy(false)
    }
  }

  return (
    <aside className="editor" data-testid="batch-panel">
      <div className="editor-header">
        <div className="editor-title">
          批量操作
          <small>
            {typeDef?.name ?? type} · 已选中 {selectedCount} 项
          </small>
        </div>
      </div>

      <div className="editor-body">
        <div className="form-row">
          <label className="form-label" htmlFor="batch-op">
            操作
          </label>
          <select
            id="batch-op"
            className="form-select"
            data-testid="batch-op"
            value={op}
            disabled={busy}
            onChange={(event) => changeOp(event.target.value as OpChoice)}
          >
            {BATCH_OP_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {BATCH_OP_LABELS[kind]}
              </option>
            ))}
            <option value="delete_selected">删除选中项</option>
          </select>
        </div>

        {op !== 'delete_selected' && (
          <div className="form-row">
            <label className="form-label" htmlFor="batch-field">
              字段
            </label>
            <select
              id="batch-field"
              className="form-select"
              data-testid="batch-field"
              value={field}
              disabled={busy}
              onChange={(event) => setField(event.target.value)}
            >
              {fieldOptions.map((option) => (
                <option key={option.name} value={option.name}>
                  {option.label}（{option.name}）
                </option>
              ))}
            </select>
          </div>
        )}

        {op === 'set_value' && (
          <div className="form-row">
            <label className="form-label" htmlFor="batch-value">
              值（可为空）
            </label>
            <input
              id="batch-value"
              className="form-input"
              data-testid="batch-value"
              value={value}
              disabled={busy}
              placeholder="输入新的字段值"
              onChange={(event) => setValue(event.target.value)}
            />
          </div>
        )}

        {op === 'append_value' && (
          <>
            <div className="form-row">
              <label className="form-label" htmlFor="batch-value">
                追加内容
              </label>
              <input
                id="batch-value"
                className="form-input"
                data-testid="batch-value"
                value={value}
                disabled={busy}
                placeholder="追加到字段末尾"
                onChange={(event) => setValue(event.target.value)}
              />
            </div>
            <div className="form-row">
              <label className="form-label" htmlFor="batch-sep">
                分隔符
              </label>
              <input
                id="batch-sep"
                className="form-input"
                data-testid="batch-sep"
                value={separator}
                disabled={busy}
                onChange={(event) => setSeparator(event.target.value)}
              />
            </div>
          </>
        )}

        {op === 'adjust_number' && (
          <>
            <div className="form-row">
              <label className="form-label" htmlFor="batch-mode">
                模式
              </label>
              <select
                id="batch-mode"
                className="form-select"
                data-testid="batch-mode"
                value={mode}
                disabled={busy}
                onChange={(event) => setMode(event.target.value as AdjustMode)}
              >
                {ADJUST_MODES.map((item) => (
                  <option key={item} value={item}>
                    {ADJUST_MODE_LABELS[item]}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-row">
              <label className="form-label" htmlFor="batch-adjust">
                调整量
              </label>
              <input
                id="batch-adjust"
                className="form-input"
                data-testid="batch-adjust"
                type="number"
                step={1}
                min={-99999}
                max={99999}
                value={adjustText}
                disabled={busy}
                onChange={(event) => setAdjustText(event.target.value)}
              />
            </div>
            <div className="item-meta">数值按「去掉 % 后解析」处理；非数值的条目会自动跳过。</div>
          </>
        )}

        {op === 'add_tag' && (
          <div className="form-row">
            <label className="form-label" htmlFor="batch-value">
              标签
            </label>
            <input
              id="batch-value"
              className="form-input"
              data-testid="batch-value"
              value={value}
              disabled={busy}
              placeholder="输入标签内容"
              onChange={(event) => setValue(event.target.value)}
            />
          </div>
        )}

        {op === 'delete_selected' && (
          <div className="form-row">
            <div className="danger-hint">将删除左侧勾选的 {selectedCount} 项数据，此操作不可撤销！</div>
          </div>
        )}

        {errors.length > 0 && (
          <div className="form-error" data-testid="batch-error">
            {errors.map((message, index) => (
              <div key={index}>{message}</div>
            ))}
          </div>
        )}
      </div>

      <div className="editor-actions">
        {op === 'delete_selected' ? (
          deleteConfirm ? (
            <>
              <button
                type="button"
                className="btn danger"
                data-testid="batch-delete-confirm"
                disabled={busy || selectedCount === 0}
                onClick={() => void handleDelete()}
              >
                确认删除 {selectedCount} 项
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => setDeleteConfirm(false)}>
                取消
              </button>
            </>
          ) : (
            <button
              type="button"
              className="btn danger"
              data-testid="batch-delete"
              disabled={busy || selectedCount === 0}
              onClick={() => setDeleteConfirm(true)}
            >
              删除选中项
            </button>
          )
        ) : (
          <button
            type="button"
            className="btn primary"
            data-testid="batch-apply"
            disabled={busy || selectedCount === 0}
            onClick={() => void handleApply()}
          >
            应用（{selectedCount} 项）
          </button>
        )}
        <button type="button" className="btn" data-testid="batch-close" disabled={busy} onClick={onClose}>
          关闭
        </button>
      </div>
    </aside>
  )
}

/** 调整量规整为整数并夹取到 Python QSpinBox 范围（-99999 ~ 99999） */
function clampInt(raw: string): number {
  const value = Number(raw)
  if (!Number.isFinite(value)) return 0
  return Math.max(-99999, Math.min(99999, Math.trunc(value)))
}