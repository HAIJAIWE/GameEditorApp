import { useMemo } from 'react'

import { useT } from '@mobai/client-ui'
import { buildAttrPreview, type AttrRow } from '@mobai/shared/domain/attr/attrList'
import type { AttrSystem } from '@mobai/shared/attrSystem'

/**
 * 条目级属性列表编辑器：
 * - 行为「属性名称 + 数值」，名称可自由输入或从属性系统下拉建议（datalist）
 * - 添加 / 删除行；空名称行保存时忽略（由 ItemForm 的 payload 转换处理）
 * - 计算预览：以列表行作为输入按属性系统拓扑计算全部属性（输入/计算来源标记），
 *   明确改进 旧版：角色/怪物的行序自算改为拓扑序 + 环依赖提示 + 未收录名称提示
 */

interface AttrTableEditorProps {
  /** 所属字段名（生成 id / data-testid，支持多字段共存） */
  fieldName: string
  rows: AttrRow[]
  /** 属性系统（null 表示加载中） */
  attrSystem: AttrSystem | null
  /** 属性系统加载失败信息（预览不可用） */
  systemError: string | null
  onChange: (rows: AttrRow[]) => void
}

export default function AttrTableEditor({ fieldName, rows, attrSystem, systemError, onChange }: AttrTableEditorProps) {
  const t = useT()
  const nameOptions = useMemo(() => (attrSystem ? Object.keys(attrSystem.attributes) : []), [attrSystem])
  const hasNamedRows = rows.some((row) => String(row.name ?? '').trim() !== '')
  const preview = useMemo(
    () => (attrSystem && hasNamedRows ? buildAttrPreview(attrSystem, rows) : null),
    [attrSystem, hasNamedRows, rows]
  )

  const updateRow = (index: number, patch: Partial<AttrRow>): void => {
    onChange(rows.map((row, current) => (current === index ? { ...row, ...patch } : row)))
  }

  return (
    <div className="attr-list" id={`field-${fieldName}`} data-testid={`field-${fieldName}`}>
      <datalist id={`attr-list-options-${fieldName}`}>
        {nameOptions.map((name) => (
          <option key={name} value={name} />
        ))}
      </datalist>

      {rows.length === 0 && <div className="attr-list-empty">{t('attrTable.empty')}</div>}
      {rows.map((row, index) => (
        <div className="attr-list-row" key={index}>
          <input
            className="form-input attr-list-name"
            data-testid={`field-${fieldName}-name-${index}`}
            list={`attr-list-options-${fieldName}`}
            placeholder={t('attrTable.namePlaceholder')}
            value={String(row.name ?? '')}
            onChange={(event) => updateRow(index, { name: event.target.value })}
          />
          <input
            className="form-input attr-list-value"
            data-testid={`field-${fieldName}-value-${index}`}
            type="number"
            step="any"
            placeholder={t('attrTable.valuePlaceholder')}
            value={String(row.value ?? '')}
            onChange={(event) => updateRow(index, { value: event.target.value })}
          />
          <button
            type="button"
            className="btn slim danger"
            data-testid={`field-${fieldName}-remove-${index}`}
            title={t('attrTable.removeTitle')}
            onClick={() => onChange(rows.filter((_, current) => current !== index))}
          >
            ✕
          </button>
        </div>
      ))}

      <div className="attr-list-actions">
        <button
          type="button"
          className="btn slim"
          data-testid={`field-${fieldName}-add`}
          onClick={() => onChange([...rows, { name: '', value: '' }])}
        >
          {t('attrTable.addRow')}
        </button>
      </div>

      <div className="attr-calc" data-testid={`field-${fieldName}-calc`}>
        <div className="attr-calc-title">{t('attrTable.calcTitle')}</div>
        {systemError ? (
          <div className="form-error">{systemError}</div>
        ) : !attrSystem ? (
          <div className="attr-calc-note">{t('attrTable.loading')}</div>
        ) : !hasNamedRows ? (
          <div className="attr-calc-note">{t('attrTable.calcHint')}</div>
        ) : preview && preview.cycle ? (
          <div className="form-error">{t('attrTable.cycle', { cycle: preview.cycle.join(' → ') })}</div>
        ) : preview ? (
          <>
            <div className="attr-calc-rows">
              {preview.entries.map((entry) => (
                <div className="attr-calc-row" key={entry.name}>
                  <span className="attr-calc-name">{entry.displayName}</span>
                  <span className={`attr-calc-source${entry.source === 'input' ? ' input' : ''}`}>
                    {entry.source === 'input' ? t('attrTable.sourceInput') : t('attrTable.sourceCalc')}
                  </span>
                  <span className="attr-calc-value" data-testid={`field-${fieldName}-calc-${entry.name}`}>
                    {formatValue(entry.value)}
                  </span>
                </div>
              ))}
            </div>
            {preview.unknownNames.length > 0 && (
              <div className="attr-calc-note" data-testid={`field-${fieldName}-calc-unknown`}>
                {t('attrTable.unknown', { names: preview.unknownNames.join('、') })}
              </div>
            )}
          </>
        ) : null}
      </div>
    </div>
  )
}

/** 预览数值展示：最多保留 4 位小数（消除浮点长尾，与属性系统编辑器一致） */
function formatValue(value: number): string {
  if (!Number.isFinite(value)) return '—'
  return String(Math.round(value * 10000) / 10000)
}