import { useEffect, useState } from 'react'

import {
  ADJUST_MODES,
  ADJUST_MODE_LABELS,
  BATCH_OP_KINDS,
  BATCH_OP_LABELS,
  type BatchOpKind,
  type AdjustMode
} from '../../../../shared/util/data/dataTableOps'
import { loadConfirmDelete } from '../../../../shared/config/settings/settingsPreferences'
import type { DataTypeDef } from '../../../../shared/types'

/**
 * 批量操作面板。
 *
 * 设置字段值 / 追加字段值（文本）/ 数值增减（加·乘·设）/ 添加标签 / 删除选中项。
 *
 * **作用范围（自选）**：对齐 旧版——批量修改数据从菜单直接打开，由面板**自己选范围**
 * （选类型 → 作用于该类型全部条目），不依赖任何外部勾选。当宿主传入非空 `selectedIds`
 * 时才以传入选中为范围；否则顶部提供类型下拉，以该类型全部条目为范围。
 * 删除需二次确认；应用/删除走 IPC 批量写入（单次写队列任务）。
 */

type OpChoice = BatchOpKind | 'delete_selected'

interface BatchEditPanelProps {
  /** 初始作用类型（宿主一般传当前 schema 的第一个类型） */
  type: string
  typeDef: DataTypeDef | null
  /** 全部数据类型定义（自选范围下类型下拉的选项来源） */
  types: readonly DataTypeDef[]
  /** 外部传入的选中条目 id；缺省/空表示改用面板自选的「整类型」范围 */
  selectedIds?: string[]
  onApplied: (message: string) => void
  onClose: () => void
}

export default function BatchEditPanel({
  type,
  typeDef,
  types,
  selectedIds = [],
  onApplied,
  onClose
}: BatchEditPanelProps) {
  /** 外部是否提供了选中项（true 时沿用传入选中，false 时面板自选整类型范围） */
  const externalSelection = selectedIds.length > 0
  /** 自选作用类型：初始取传入 type（不在 types 中则回退到第一个类型） */
  const [scopeType, setScopeType] = useState<string>(() =>
    types.some((def) => def.id === type) ? type : (types[0]?.id ?? type)
  )
  /** 自选范围下该类型的全部条目 id（异步加载） */
  const [scopeIds, setScopeIds] = useState<string[]>([])

  const scopeDef = types.find((def) => def.id === scopeType) ?? typeDef
  // 字段选项与 旧版 _populate_fields 一致（列出全部字段）；id 为系统字段，排除以避免破坏条目身份
  const fieldOptions = (scopeDef?.formFields ?? []).filter((field) => field.name !== 'id')

  const [op, setOp] = useState<OpChoice>('set_value')
  const [field, setField] = useState(() => fieldOptions[0]?.name ?? 'name')
  const [value, setValue] = useState('')
  const [separator, setSeparator] = useState(',')
  const [mode, setMode] = useState<AdjustMode>('add')
  const [adjustText, setAdjustText] = useState('0')
  const [deleteConfirm, setDeleteConfirm] = useState(false)
  const [errors, setErrors] = useState<string[]>([])
  const [busy, setBusy] = useState(false)

  /**
   * 「删除时确认」偏好。
   * 惰性初值：面板挂载时读一次即可 —— 设置面板与批量面板是互斥浮层，用户不可能同时改偏好。
   * 关闭时删除**直接执行不确认**（破坏性，故默认开启，见 `settingsPreferences` 的说明）。
   */
  const [confirmDelete] = useState<boolean>(() => loadConfirmDelete())

  // 自选范围：按当前 scopeType 拉取该类型的全部条目 id。
  // setState 只在 promise 回调里发生（不在 effect 体内同步 setState，避免级联渲染被 lint 禁止）。
  useEffect(() => {
    let cancelled = false
    window.mbApi.data
      .listItems({ type: scopeType })
      .then((list) => {
        if (!cancelled) setScopeIds(list.map((item) => item.id))
      })
      .catch(() => {
        if (!cancelled) setScopeIds([])
      })
    return () => {
      cancelled = true
    }
  }, [scopeType])

  /** 实际作用类型：外部选中用传入 type，自选范围用 scopeType */
  const effectiveType = externalSelection ? type : scopeType
  /** 实际作用 id 列表：外部选中优先，否则用自选范围加载结果 */
  const effectiveIds = externalSelection ? selectedIds : scopeIds
  const effectiveCount = effectiveIds.length
  /** 当前生效字段（换类型后旧字段可能不在新字段表中，回退到第一个） */
  const effectiveField = fieldOptions.some((option) => option.name === field)
    ? field
    : (fieldOptions[0]?.name ?? '')

  const changeOp = (next: OpChoice): void => {
    setOp(next)
    setDeleteConfirm(false)
    setErrors([])
  }

  /** 切换自选类型：同步重置字段选项（在事件处理器内完成，避免 effect 内 setState） */
  const changeScopeType = (nextId: string): void => {
    setScopeType(nextId)
    const nextDef = types.find((def) => def.id === nextId)
    const nextFields = (nextDef?.formFields ?? []).filter((item) => item.name !== 'id')
    setField(nextFields[0]?.name ?? 'name')
    setDeleteConfirm(false)
    setErrors([])
  }

  /**
   * 点「删除作用范围内条目」：按「删除时确认」偏好决定是否先要一次确认。
   * 偏好开启 → 先进入内联两按钮确认态（项目对模态弹窗的既有替代方案）；
   * 偏好关闭 → 直接执行删除。
   */
  const handleDeleteClick = (): void => {
    if (!confirmDelete) {
      void handleDelete()
      return
    }
    setDeleteConfirm(true)
  }

  const handleApply = async (): Promise<void> => {
    setErrors([])
    if (op === 'delete_selected') return
    // 与 旧版 _on_apply 的告警条件一致：追加/标签要求内容非空；其余要求选中字段
    if (effectiveField === '') {
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
        type: effectiveType,
        ids: effectiveIds,
        op: { kind: op, field: effectiveField, value, separator, mode, adjust: clampInt(adjustText) }
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
      const summary = await window.mbApi.data.deleteMany({ ids: effectiveIds })
      const parts = [`已删除 ${summary.deleted} 项`]
      if (summary.missing > 0) parts.push(`${summary.missing} 项已不存在`)
      onApplied(`批量删除完成：${parts.join('，')}`)
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)])
    } finally {
      setBusy(false)
    }
  }

  const scopeLabel = scopeDef?.name ?? effectiveType
  const scopeSummary = externalSelection ? `作用范围：选中 ${effectiveCount} 项` : `作用范围：全部 ${effectiveCount} 项`

  return (
    <aside className="editor" data-testid="batch-panel">
      <div className="editor-header">
        <div className="editor-title">
          批量操作
          <small>
            {scopeLabel} · {scopeSummary}
          </small>
        </div>
      </div>

      <div className="editor-body">
        {!externalSelection && (
          <div className="form-row">
            <label className="form-label" htmlFor="batch-type">
              作用类型
            </label>
            <select
              id="batch-type"
              className="form-select"
              data-testid="batch-type"
              value={scopeType}
              disabled={busy}
              onChange={(event) => changeScopeType(event.target.value)}
            >
              {types.map((def) => (
                <option key={def.id} value={def.id}>
                  {def.name}（{def.id}）
                </option>
              ))}
            </select>
            <div className="item-meta" data-testid="batch-scope-hint">
              {effectiveCount === 0 ? '该类型暂无数据' : `该类型共 ${effectiveCount} 项，将对全部条目生效`}
            </div>
          </div>
        )}

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
            <option value="delete_selected">删除作用范围内条目</option>
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
              value={effectiveField}
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
            <div className="danger-hint" data-testid="batch-delete-hint">
              将删除作用范围内的 {effectiveCount} 项数据，此操作不可撤销！
              {confirmDelete ? null : (
                <>
                  <br />
                  <b>「删除时确认」已关闭</b>：点击后立即删除，不再二次确认。
                </>
              )}
            </div>
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
                disabled={busy || effectiveCount === 0}
                onClick={() => void handleDelete()}
              >
                确认删除 {effectiveCount} 项
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
              disabled={busy || effectiveCount === 0}
              onClick={() => handleDeleteClick()}
            >
              删除作用范围内条目
            </button>
          )
        ) : (
          <button
            type="button"
            className="btn primary"
            data-testid="batch-apply"
            disabled={busy || effectiveCount === 0}
            onClick={() => void handleApply()}
          >
            应用（{effectiveCount} 项）
          </button>
        )}
        <button type="button" className="btn" data-testid="batch-close" disabled={busy} onClick={onClose}>
          关闭
        </button>
      </div>
    </aside>
  )
}

/** 调整量规整为整数并夹取到 旧版 QSpinBox 范围（-99999 ~ 99999） */
function clampInt(raw: string): number {
  const value = Number(raw)
  if (!Number.isFinite(value)) return 0
  return Math.max(-99999, Math.min(99999, Math.trunc(value)))
}
