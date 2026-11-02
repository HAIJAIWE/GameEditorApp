import { useMemo, useState } from 'react'

import { useT } from '@mobai/client-ui'
import {
  ATTR_PANEL_CATEGORY_SUGGESTIONS,
  ATTR_PANEL_QUICK_ADD,
  ATTR_PANEL_TEMPLATES,
  evaluateAttrPanel,
  type AttrPanelRow
} from '@mobai/shared/domain/attr/attrPanel'
import AttrFormulaBuilder from './AttrFormulaBuilder'

/**
 * 条目级属性面板编辑器：
 * - 行=类别/属性名称/公式/计算结果；名称为本行列表内的变量，公式按行间依赖拓扑序求值
 * - 工具条：载入模板、快速添加（照抄预置类别/公式）、添加行
 * - 错误（未定义名称/非法公式/除零/环依赖）行下红字提示；结果列只读、按 旧版 语义展示 1 位小数
 * - 系数公式编辑器：每行公式框旁的 ƒx 按钮内联展开
 * 明确推迟：多选批量删除（TS 用逐行 ✕）。
 */

interface AttrPanelEditorProps {
  /** 所属字段名（生成 id / data-testid，支持多字段共存） */
  fieldName: string
  /** 条目类型 id（决定可用模板；无模板的类型不显示模板下拉） */
  typeId: string
  rows: AttrPanelRow[]
  onChange: (rows: AttrPanelRow[]) => void
}

export default function AttrPanelEditor({ fieldName, typeId, rows, onChange }: AttrPanelEditorProps) {
  const t = useT()
  const templates = ATTR_PANEL_TEMPLATES[typeId] ?? null
  const templateNames = templates ? Object.keys(templates) : []
  const evaluation = useMemo(() => evaluateAttrPanel(rows), [rows])
  /** 当前展开系数公式编辑器的行号（同一时刻只开一个） */
  const [builderRow, setBuilderRow] = useState<number | null>(null)
  const testId = (suffix: string): string => `field-${fieldName}-${suffix}`
  const listId = (suffix: string): string => `attr-panel-${suffix}-${fieldName}`

  /**
   * 系数编辑器的可用属性 = 面板各行名称（单一真源）。含被编辑行自身，
   * 与 旧版 一致（自引用由求值器的环依赖诊断提示，不在此处静默禁止）。
   */
  const availableAttrs = rows.map((row) => String(row.name ?? '').trim()).filter((name) => name !== '')

  const updateRow = (index: number, patch: Partial<AttrPanelRow>): void => {
    onChange(rows.map((row, current) => (current === index ? { ...row, ...patch } : row)))
  }

  const loadTemplate = (name: string): void => {
    const template = templates?.[name]
    if (template) onChange(template.map((row) => ({ ...row })))
  }

  /** 快速添加：同名已存在时忽略 */
  const quickAdd = (name: string): void => {
    const preset = ATTR_PANEL_QUICK_ADD.find((item) => item.name === name)
    if (!preset) return
    if (rows.some((row) => String(row.name ?? '').trim() === preset.name)) return
    onChange([...rows, { ...preset }])
  }

  return (
    <div className="attr-panel" id={`field-${fieldName}`} data-testid={`field-${fieldName}`}>
      <datalist id={listId('names')}>
        {ATTR_PANEL_QUICK_ADD.map((item) => (
          <option key={item.name} value={item.name} />
        ))}
      </datalist>
      <datalist id={listId('categories')}>
        {ATTR_PANEL_CATEGORY_SUGGESTIONS.map((category) => (
          <option key={category} value={category} />
        ))}
      </datalist>

      <div className="attr-panel-toolbar">
        {templateNames.length > 0 && (
          <select
            className="form-select attr-panel-select"
            data-testid={testId('template')}
            value=""
            onChange={(event) => loadTemplate(event.target.value)}
          >
            <option value="">{t('attrPanel.loadTemplate')}</option>
            {templateNames.map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        )}
        <select
          className="form-select attr-panel-select"
          data-testid={testId('quick')}
          value=""
          onChange={(event) => quickAdd(event.target.value)}
        >
          <option value="">{t('attrPanel.quickAdd')}</option>
          {ATTR_PANEL_QUICK_ADD.map((item) => (
            <option key={item.name} value={item.name}>
              {item.name}
            </option>
          ))}
        </select>
        <button
          type="button"
          className="btn slim"
          data-testid={testId('add')}
          onClick={() => onChange([...rows, { name: '', category: t('attrPanel.customCategory'), formula: '=0' }])}
        >
          {t('attrPanel.addRow')}
        </button>
      </div>

      {rows.length === 0 && <div className="attr-list-empty">{t('attrPanel.empty')}</div>}
      {rows.length > 0 && (
        <div className="attr-panel-head">
          <span className="attr-panel-category">{t('attrPanel.colCategory')}</span>
          <span className="attr-panel-name">{t('attrPanel.colName')}</span>
          <span className="attr-panel-formula">{t('attrPanel.colFormula')}</span>
          <span className="attr-panel-result">{t('attrPanel.colResult')}</span>
          <span className="attr-panel-remove" />
        </div>
      )}
      {rows.map((row, index) => (
        <div className="attr-panel-row" key={index}>
          <input
            className="form-input attr-panel-category"
            data-testid={testId(`category-${index}`)}
            list={listId('categories')}
            value={String(row.category ?? '')}
            onChange={(event) => updateRow(index, { category: event.target.value })}
          />
          <input
            className="form-input attr-panel-name"
            data-testid={testId(`name-${index}`)}
            list={listId('names')}
            placeholder={t('attrPanel.namePlaceholder')}
            value={String(row.name ?? '')}
            onChange={(event) => updateRow(index, { name: event.target.value })}
          />
          <div className="attr-panel-formula-cell">
            <input
              className="form-input attr-panel-formula"
              data-testid={testId(`formula-${index}`)}
              placeholder={t('attrPanel.formulaPlaceholder')}
              value={String(row.formula ?? '')}
              onChange={(event) => updateRow(index, { formula: event.target.value })}
            />
            <button
              type="button"
              className="btn slim attr-panel-builder-toggle"
              data-testid={testId(`formula-builder-toggle-${index}`)}
              title={t('attrPanel.builderTitle')}
              onClick={() => setBuilderRow(builderRow === index ? null : index)}
            >
              ƒx
            </button>
          </div>
          <span
            className={`attr-panel-result${evaluation.errors[index] ? ' invalid' : ''}`}
            data-testid={testId(`result-${index}`)}
          >
            {formatResult(evaluation.values[index] ?? 0, evaluation.errors[index] ?? null)}
          </span>
          <button
            type="button"
            className="btn slim danger attr-panel-remove"
            data-testid={testId(`remove-${index}`)}
            title={t('attrPanel.removeTitle')}
            onClick={() => onChange(rows.filter((_, current) => current !== index))}
          >
            ✕
          </button>
          {evaluation.errors[index] && (
            <div className="attr-panel-error" data-testid={testId(`error-${index}`)}>
              {evaluation.errors[index]}
            </div>
          )}
          {builderRow === index && (
            <AttrFormulaBuilder
              key={index}
              fieldName={fieldName}
              rowIndex={index}
              derivedName={String(row.name ?? '').trim()}
              availableAttrs={availableAttrs}
              formula={String(row.formula ?? '')}
              onApply={(formula) => updateRow(index, { formula })}
              onClose={() => setBuilderRow(null)}
            />
          )}
        </div>
      ))}
    </div>
  )
}

/** 结果展示 */
function formatResult(value: number, error: string | null): string {
  if (error || !Number.isFinite(value)) return '0'
  return value.toFixed(1)
}