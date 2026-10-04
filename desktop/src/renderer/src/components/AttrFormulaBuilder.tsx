import { useMemo, useState } from 'react'

import { buildFormulaFromCoeffs, initialEntries } from '../../../shared/formulaBuilder'

/**
 * 系数公式编辑器（内联展开，对应 Python `FormulaBuilderDialog`）。
 *
 * 形态选择：Python 是 QDialog 模态弹窗（双击公式列弹出）。本渲染层**没有模态/弹层约定**（全部面板都是内联的），
 * 故做成挂在属性行下方的内联展开块——沿用既有 `.attr-panel-error` 的 `flex-basis:100%` 先例，不新造交互范式。
 *
 * 初始系数在**挂载时一次性**计算（`useState` 惰性初始化）：
 * - 原公式可回填 → 用真实系数（修正 Python「打开即用默认值顶替、点确定覆盖原公式」的缺陷）
 * - 原公式不可回填 → 系数归零并显示警告，用户能在替换前核对原文
 * 依赖调用方用 `key` 控制挂载/卸载（换行编辑即重新初始化）。
 */

interface AttrFormulaBuilderProps {
  /** 所属字段名（生成 data-testid） */
  fieldName: string
  /** 所属行号（生成 data-testid；与行内容解耦，改名不影响 testid 稳定性） */
  rowIndex: number
  /** 被编辑的派生属性名（用于默认系数查表与提示文案） */
  derivedName: string
  /** 可用属性名（来自面板各行，作为系数行与公式词表） */
  availableAttrs: string[]
  /** 当前公式原文 */
  formula: string
  onApply: (formula: string) => void
  onClose: () => void
}

/** 输入框里保留原始文本（受控 number input 直接存数字会让「0.」被吞掉小数点） */
interface BuilderRow {
  name: string
  text: string
}

export default function AttrFormulaBuilder({
  fieldName,
  rowIndex,
  derivedName,
  availableAttrs,
  formula,
  onApply,
  onClose
}: AttrFormulaBuilderProps) {
  const testId = (suffix: string): string => `field-${fieldName}-formula-builder-${rowIndex}-${suffix}`

  // 挂载时一次性初始化：之后用户改动不再被 props 覆盖（父组件不会在编辑中回写本行公式）
  const [initial] = useState(() => initialEntries(availableAttrs, formula, derivedName))
  const [rows, setRows] = useState<BuilderRow[]>(() =>
    initial.entries.map((entry) => ({ name: entry.name, text: String(entry.coeff) }))
  )

  const preview = useMemo(
    () => buildFormulaFromCoeffs(rows.map((row) => ({ name: row.name, coeff: parseCoeffText(row.text) }))),
    [rows]
  )

  const setCoeff = (index: number, text: string): void => {
    setRows((current) => current.map((row, position) => (position === index ? { ...row, text } : row)))
  }

  return (
    <div className="attr-panel-builder" data-testid={testId('panel')}>
      <div className="attr-panel-builder-title">
        系数公式编辑器{derivedName ? ` · ${derivedName}` : ''}
      </div>
      <div className="attr-panel-builder-hint">
        {derivedName
          ? `设置「力量 = 10」表示 1 点力量增加 10 点${derivedName}；系数为 0 的属性不写入公式`
          : '请先填写属性名称，再配置系数'}
      </div>

      {initial.warning && (
        <div className="attr-panel-builder-warning" data-testid={testId('warning')}>
          {initial.warning}
        </div>
      )}

      {rows.length > 0 && (
        <div className="attr-panel-builder-rows">
          {rows.map((row, index) => (
            <label className="attr-panel-builder-row" key={row.name}>
              <span className="attr-panel-builder-name">{row.name}</span>
              <input
                className="form-input attr-panel-builder-coeff"
                type="number"
                step="0.1"
                min="-999"
                max="999"
                data-testid={testId(`coeff-${index}`)}
                value={row.text}
                onChange={(event) => setCoeff(index, event.target.value)}
              />
            </label>
          ))}
        </div>
      )}

      <div className="attr-panel-builder-foot">
        <code className="attr-panel-builder-preview" data-testid={testId('preview')}>
          {preview}
        </code>
        <button
          type="button"
          className="btn slim danger"
          data-testid={testId('clear')}
          onClick={() => setRows((current) => current.map((row) => ({ ...row, text: '0' })))}
        >
          清空
        </button>
        <button type="button" className="btn slim" data-testid={testId('cancel')} onClick={onClose}>
          取消
        </button>
        <button
          type="button"
          className="btn primary"
          data-testid={testId('apply')}
          onClick={() => {
            onApply(preview)
            onClose()
          }}
        >
          应用
        </button>
      </div>
    </div>
  )
}

/** 输入框文本 → 系数（空串/非法一律按 0，与 Python spinbox 的「无值即 0」一致） */
function parseCoeffText(text: string): number {
  const trimmed = text.trim()
  if (trimmed === '') return 0
  const value = Number(trimmed)
  return Number.isFinite(value) ? value : 0
}
