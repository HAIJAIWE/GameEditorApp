import { useEffect, useMemo, useState } from 'react'

import {
  clampRefLevel,
  REF_LEVEL_MAX,
  REF_LEVEL_MIN,
  refTypeDisplayName,
  resolveRefTypeId,
  type ReferenceEntry
} from '@mobai/shared/util/search'
import type { DataTypeDef } from '@mobai/shared/types'

/**
 * 引用表字段编辑器。
 *
 * - 表格两列：名称（由 id 解析，只读）+ 触发等级（0~999，可编辑）
 * - 「+ 添加{类型}」→ 内联选库面板（搜索 + 选择 + 设等级）；「- 删除选中」按当前选中行删除
 * - 存储 `[{id, level}]`（兼容旧数据的 `{name, level}` / 纯字符串），由 shared/refTable.ts 负责归一化与序列化
 *
 * 相对 旧版 的有意改进：
 * - 旧版 用独立模态 QDialog 选条目；TS 改为**内联面板**（少一层模态、更易测试）
 * - 旧版 的 `_get_name_by_id` 用 `pluralKey` 查 `data_manager.data`；TS 用单数 type id 经 DataService 查（键口径修正）
 */

interface RefTableEditorProps {
  /** 所属字段名（生成 id / data-testid，支持多字段共存） */
  fieldName: string
  /** 引用的数据类型标记（schema 里的 refType，通常为复数键） */
  refType: string
  /** 全部数据类型定义（用于把 refType 解析为单数 id 与中文名） */
  types: readonly DataTypeDef[]
  /** 当前行数据（已归一化） */
  entries: ReferenceEntry[]
  onChange: (entries: ReferenceEntry[]) => void
}

interface Candidate {
  id: string
  name: string
}

function nameOf(item: { id: string; data: Record<string, unknown> }): string {
  const name = item.data['name']
  return typeof name === 'string' && name !== '' ? name : item.id
}

export default function RefTableEditor({ fieldName, refType, types, entries, onChange }: RefTableEditorProps) {
  const sourceTypeId = useMemo(() => resolveRefTypeId(refType, types), [refType, types])
  const label = useMemo(() => refTypeDisplayName(refType, types), [refType, types])

  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerLevel, setPickerLevel] = useState(0)
  const [pickerId, setPickerId] = useState('')
  const [selectedRow, setSelectedRow] = useState(-1)

  useEffect(() => {
    if (sourceTypeId === null) return
    let cancelled = false
    window.mbApi.data
      .listItems({ type: sourceTypeId })
      .then((items) => {
        if (cancelled) return
        setCandidates(items.map((item) => ({ id: item.id, name: nameOf(item) })))
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error))
      })
    return () => {
      cancelled = true
    }
  }, [sourceTypeId])

  const nameById = useMemo(() => new Map(candidates.map((c) => [c.id, c.name])), [candidates])

  const filtered = useMemo(() => {
    const keyword = pickerSearch.trim().toLowerCase()
    if (keyword === '') return candidates
    return candidates.filter((c) => c.name.toLowerCase().includes(keyword) || c.id.toLowerCase().includes(keyword))
  }, [candidates, pickerSearch])

  const displayName = (entry: ReferenceEntry): string => {
    if (entry.id !== undefined) return nameById.get(entry.id) ?? entry.name ?? entry.id
    return entry.name ?? '（未命名）'
  }

  const updateLevel = (index: number, raw: string): void => {
    const parsed = Number(raw)
    const level = Number.isFinite(parsed) ? clampRefLevel(parsed) : 0
    onChange(entries.map((entry, current) => (current === index ? { ...entry, level } : entry)))
  }

  const removeSelected = (): void => {
    if (selectedRow < 0 || selectedRow >= entries.length) return
    onChange(entries.filter((_, index) => index !== selectedRow))
    setSelectedRow(-1)
  }

  const confirmPicker = (): void => {
    if (pickerId === '') return
    onChange([...entries, { id: pickerId, level: clampRefLevel(pickerLevel) }])
    setPickerOpen(false)
    setPickerSearch('')
    setPickerLevel(0)
    setPickerId('')
  }

  const cancelPicker = (): void => {
    setPickerOpen(false)
    setPickerSearch('')
    setPickerLevel(0)
    setPickerId('')
  }

  return (
    <div className="ref-drop" id={`field-${fieldName}`} data-testid={`field-${fieldName}`}>
      <div className="ref-drop-head">
        <span className="ref-drop-title">{label}列表：</span>
        <div className="ref-drop-actions">
          <button
            type="button"
            className="btn slim"
            data-testid={`reftable-${fieldName}-add`}
            onClick={() => setPickerOpen(true)}
          >
            + 添加{label}
          </button>
          <button
            type="button"
            className="btn slim"
            data-testid={`reftable-${fieldName}-remove`}
            disabled={selectedRow < 0}
            onClick={removeSelected}
          >
            - 删除选中
          </button>
        </div>
      </div>

      {sourceTypeId === null && (
        <div className="form-error" data-testid={`reftable-${fieldName}-badtype`}>
          引用类型「{refType}」不存在，请检查字段定义
        </div>
      )}
      {loadError !== null && (
        <div className="form-error" data-testid={`reftable-${fieldName}-error`}>
          候选条目加载失败：{loadError}
        </div>
      )}

      {entries.length === 0 ? (
        <div className="ref-drop-empty" data-testid={`reftable-${fieldName}-empty`}>
          暂无{label}，点击「+ 添加{label}」
        </div>
      ) : (
        <table className="ref-drop-table" data-testid={`reftable-${fieldName}-table`}>
          <thead>
            <tr>
              <th>名称</th>
              <th className="ref-drop-level-col">等级:</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => (
              <tr
                key={`${entry.id ?? entry.name ?? 'x'}-${index}`}
                className={selectedRow === index ? 'selected' : undefined}
                data-testid={`reftable-${fieldName}-row-${index}`}
                onClick={() => setSelectedRow(index)}
              >
                <td data-testid={`reftable-${fieldName}-name-${index}`}>{displayName(entry)}</td>
                <td className="ref-drop-level-col">
                  <input
                    className="form-input ref-drop-level"
                    data-testid={`reftable-${fieldName}-level-${index}`}
                    type="number"
                    min={REF_LEVEL_MIN}
                    max={REF_LEVEL_MAX}
                    value={String(entry.level)}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => updateLevel(index, event.target.value)}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {pickerOpen && (
        <div className="ref-drop-picker" data-testid={`reftable-${fieldName}-picker`}>
          <input
            className="form-input"
            data-testid={`reftable-${fieldName}-search`}
            placeholder={`搜索${label}名称...`}
            value={pickerSearch}
            onChange={(event) => setPickerSearch(event.target.value)}
          />
          <div className="ref-drop-candidates">
            {filtered.length === 0 ? (
              <div className="ref-drop-empty">无匹配条目</div>
            ) : (
              filtered.map((c) => (
                <button
                  type="button"
                  key={c.id}
                  className={`ref-drop-candidate${pickerId === c.id ? ' selected' : ''}`}
                  data-testid={`reftable-${fieldName}-option-${c.id}`}
                  onClick={() => setPickerId(c.id)}
                >
                  {c.name}
                  <small>{c.id}</small>
                </button>
              ))
            )}
          </div>
          <div className="ref-drop-picker-foot">
            <label>
              等级:
              <input
                className="form-input ref-drop-level"
                data-testid={`reftable-${fieldName}-picker-level`}
                type="number"
                min={REF_LEVEL_MIN}
                max={REF_LEVEL_MAX}
                value={String(pickerLevel)}
                onChange={(event) => setPickerLevel(Number(event.target.value))}
              />
            </label>
            <button
              type="button"
              className="btn slim primary"
              data-testid={`reftable-${fieldName}-confirm`}
              disabled={pickerId === ''}
              onClick={confirmPicker}
            >
              确定
            </button>
            <button
              type="button"
              className="btn slim"
              data-testid={`reftable-${fieldName}-cancel`}
              onClick={cancelPicker}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
