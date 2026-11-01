import { useEffect, useMemo, useState } from 'react'

import {
  clampDropCount,
  clampDropRate,
  dropSourceLabel,
  dropSourceTypeId,
  normalizeDropRange,
  type DropEntry
} from '@mobai/shared/util/data'

/**
 * 掉落表字段编辑器。
 *
 * - 表格四列：名称（只读）+ 掉率(%) + 最小 + 最大
 * - 「+ 添加掉落」→ 内联选库面板（从装备/道具库搜索选择 + 设掉率与数量范围）；「- 删除选中」按当前选中行删除
 * - 存储 `[{name, rate, count_min, count_max}]`
 *
 * 相对 旧版 的有意改进：
 * - 旧版 用独立模态 QDialog；TS 改为**内联面板**（更易测试）
 * - 旧版 选库时 `data_manager.data.get('equips'/'items')`（复数键）；TS 用单数 type id（键口径修正）
 *
 * 已知局限：掉落条目只存 `name`，**来源条目改名后此引用会失配**。
 * 这是既有数据模型的约束（存量数据无 id），保持格式兼容优先；如需改 id 引用应作为独立设计变更并迁移存量数据。
 */

interface DropTableEditorProps {
  /** 所属字段名（生成 id / data-testid，并据此推断选库来源） */
  fieldName: string
  /** 当前行数据（已归一化） */
  entries: DropEntry[]
  onChange: (entries: DropEntry[]) => void
}

/** 候选来源条目 */
interface Candidate {
  name: string
}

export default function DropTableEditor({ fieldName, entries, onChange }: DropTableEditorProps) {
  const sourceTypeId = useMemo(() => dropSourceTypeId(fieldName), [fieldName])
  const sourceLabel = useMemo(() => dropSourceLabel(fieldName), [fieldName])

  const [candidates, setCandidates] = useState<Candidate[]>([])
  const [loadError, setLoadError] = useState<string | null>(null)
  const [pickerOpen, setPickerOpen] = useState(false)
  const [pickerSearch, setPickerSearch] = useState('')
  const [pickerName, setPickerName] = useState('')
  const [pickerRate, setPickerRate] = useState(10)
  const [pickerMin, setPickerMin] = useState(1)
  const [pickerMax, setPickerMax] = useState(1)
  const [selectedRow, setSelectedRow] = useState(-1)

  useEffect(() => {
    let cancelled = false
    window.mbApi.data
      .listItems({ type: sourceTypeId })
      .then((items) => {
        if (cancelled) return
        setCandidates(
          items
            .map((item) => {
              const name = item.data['name']
              return typeof name === 'string' && name !== '' ? name : item.id
            })
            .map((name) => ({ name }))
        )
      })
      .catch((error: unknown) => {
        if (!cancelled) setLoadError(error instanceof Error ? error.message : String(error))
      })
    return () => {
      cancelled = true
    }
  }, [sourceTypeId])

  const filtered = useMemo(() => {
    const keyword = pickerSearch.trim().toLowerCase()
    if (keyword === '') return candidates
    return candidates.filter((c) => c.name.toLowerCase().includes(keyword))
  }, [candidates, pickerSearch])

  const patchRow = (index: number, patch: Partial<DropEntry>): void => {
    onChange(entries.map((entry, current) => (current === index ? { ...entry, ...patch } : entry)))
  }

  const removeSelected = (): void => {
    if (selectedRow < 0 || selectedRow >= entries.length) return
    onChange(entries.filter((_, index) => index !== selectedRow))
    setSelectedRow(-1)
  }

  const resetPicker = (): void => {
    setPickerOpen(false)
    setPickerSearch('')
    setPickerName('')
    setPickerRate(10)
    setPickerMin(1)
    setPickerMax(1)
  }

  const confirmPicker = (): void => {
    if (pickerName === '') return
    const range = normalizeDropRange(pickerMin, pickerMax)
    onChange([
      ...entries,
      { name: pickerName, rate: clampDropRate(pickerRate), count_min: range.min, count_max: range.max }
    ])
    resetPicker()
  }

  return (
    <div className="ref-drop" id={`field-${fieldName}`} data-testid={`field-${fieldName}`}>
      <div className="ref-drop-head">
        <span className="ref-drop-title">{sourceLabel}掉落表：</span>
        <div className="ref-drop-actions">
          <button
            type="button"
            className="btn slim"
            data-testid={`droptable-${fieldName}-add`}
            onClick={() => setPickerOpen(true)}
          >
            + 添加掉落
          </button>
          <button
            type="button"
            className="btn slim"
            data-testid={`droptable-${fieldName}-remove`}
            disabled={selectedRow < 0}
            onClick={removeSelected}
          >
            - 删除选中
          </button>
        </div>
      </div>

      {loadError !== null && (
        <div className="form-error" data-testid={`droptable-${fieldName}-error`}>
          候选条目加载失败：{loadError}
        </div>
      )}

      {entries.length === 0 ? (
        <div className="ref-drop-empty" data-testid={`droptable-${fieldName}-empty`}>
          暂无掉落，点击「+ 添加掉落」
        </div>
      ) : (
        <table className="ref-drop-table" data-testid={`droptable-${fieldName}-table`}>
          <thead>
            <tr>
              <th>名称</th>
              <th className="ref-drop-num-col">掉率(%):</th>
              <th className="ref-drop-num-col">最小:</th>
              <th className="ref-drop-num-col">最大:</th>
            </tr>
          </thead>
          <tbody>
            {entries.map((entry, index) => (
              <tr
                key={`${entry.name}-${index}`}
                className={selectedRow === index ? 'selected' : undefined}
                data-testid={`droptable-${fieldName}-row-${index}`}
                onClick={() => setSelectedRow(index)}
              >
                <td data-testid={`droptable-${fieldName}-name-${index}`}>{entry.name}</td>
                <td className="ref-drop-num-col">
                  <input
                    className="form-input ref-drop-num"
                    data-testid={`droptable-${fieldName}-rate-${index}`}
                    type="number"
                    min={0}
                    max={100}
                    value={String(entry.rate)}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => patchRow(index, { rate: clampDropRate(Number(event.target.value)) })}
                  />
                </td>
                <td className="ref-drop-num-col">
                  <input
                    className="form-input ref-drop-num"
                    data-testid={`droptable-${fieldName}-min-${index}`}
                    type="number"
                    min={1}
                    max={999}
                    value={String(entry.count_min)}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => {
                      const range = normalizeDropRange(Number(event.target.value), entry.count_max)
                      patchRow(index, { count_min: range.min, count_max: range.max })
                    }}
                  />
                </td>
                <td className="ref-drop-num-col">
                  <input
                    className="form-input ref-drop-num"
                    data-testid={`droptable-${fieldName}-max-${index}`}
                    type="number"
                    min={1}
                    max={999}
                    value={String(entry.count_max)}
                    onClick={(event) => event.stopPropagation()}
                    onChange={(event) => patchRow(index, { count_max: clampDropCount(Number(event.target.value)) })}
                  />
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {pickerOpen && (
        <div className="ref-drop-picker" data-testid={`droptable-${fieldName}-picker`}>
          <input
            className="form-input"
            data-testid={`droptable-${fieldName}-search`}
            placeholder={`搜索${sourceLabel}名称...`}
            value={pickerSearch}
            onChange={(event) => setPickerSearch(event.target.value)}
          />
          <div className="ref-drop-candidates">
            {filtered.length === 0 ? (
              <div className="ref-drop-empty">无匹配条目</div>
            ) : (
              filtered.map((c, index) => (
                <button
                  type="button"
                  key={`${c.name}-${index}`}
                  className={`ref-drop-candidate${pickerName === c.name ? ' selected' : ''}`}
                  data-testid={`droptable-${fieldName}-option-${index}`}
                  onClick={() => setPickerName(c.name)}
                >
                  {c.name}
                </button>
              ))
            )}
          </div>
          <div className="ref-drop-picker-foot">
            <label>
              掉率(%):
              <input
                className="form-input ref-drop-num"
                data-testid={`droptable-${fieldName}-picker-rate`}
                type="number"
                min={0}
                max={100}
                value={String(pickerRate)}
                onChange={(event) => setPickerRate(Number(event.target.value))}
              />
            </label>
            <label>
              数量:
              <input
                className="form-input ref-drop-num"
                data-testid={`droptable-${fieldName}-picker-min`}
                type="number"
                min={1}
                max={999}
                value={String(pickerMin)}
                onChange={(event) => setPickerMin(Number(event.target.value))}
              />
              ~
              <input
                className="form-input ref-drop-num"
                data-testid={`droptable-${fieldName}-picker-max`}
                type="number"
                min={1}
                max={999}
                value={String(pickerMax)}
                onChange={(event) => setPickerMax(Number(event.target.value))}
              />
            </label>
            <button
              type="button"
              className="btn slim primary"
              data-testid={`droptable-${fieldName}-confirm`}
              disabled={pickerName === ''}
              onClick={confirmPicker}
            >
              确定
            </button>
            <button
              type="button"
              className="btn slim"
              data-testid={`droptable-${fieldName}-cancel`}
              onClick={resetPicker}
            >
              取消
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
