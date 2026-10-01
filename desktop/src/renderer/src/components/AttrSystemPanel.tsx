import { useEffect, useMemo, useState } from 'react'

import {
  ATTR_TYPES,
  ATTR_TYPE_LABELS,
  calculateAttributes,
  createDefaultAttrSystem,
  defaultBaseValues,
  formulaToText,
  parseFormulaText,
  validateAttrSystem,
  type AttrDefinition,
  type AttrSystem,
  type AttrType
} from '../../../shared/attrSystem'

/**
 * 属性系统编辑器（属性库切片，对应 Python attr_system_editor 的左侧属性库 + attr_library）：
 * - 属性增删改（名称/显示名/类型/分类/默认值/最小·上限）+ 系数公式文本编辑（如 "= 力量*10 + 体质*20"）
 * - 保存前校验：公式可解析、依赖存在、无环依赖、min ≤ 上限、数值合法（依赖 Python 的缺陷：环/非法公式静默）
 * - 示例值列：以各基础属性默认值实时计算全部属性（拓扑序 + min/max 截断）
 * 明确推迟（后续切片）：关系矩阵、等级/装备/Buff 实时预览、导出游戏配置、装备预览。
 */

interface AttrSystemPanelProps {
  onClose: () => void
}

export default function AttrSystemPanel({ onClose }: AttrSystemPanelProps) {
  const [baseline, setBaseline] = useState<AttrSystem | null>(null)
  const [draft, setDraft] = useState<AttrSystem | null>(null)
  // 公式原始文本（编辑中可能暂时非法，不覆盖草稿里的上一个合法公式）
  const [formulaTexts, setFormulaTexts] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [resetToken, setResetToken] = useState(0)

  useEffect(() => {
    let cancelled = false
    window.mbApi.attrSystem
      .get()
      .then((system) => {
        if (cancelled) return
        setBaseline(system)
        setDraft(system)
        setFormulaTexts(textsOf(system))
      })
      .catch((error: unknown) => {
        if (!cancelled) setErrors([error instanceof Error ? error.message : String(error)])
      })
    return () => {
      cancelled = true
    }
  }, [])

  const invalidFormulas = useMemo(
    () => Object.entries(formulaTexts).filter(([, text]) => parseFormulaText(text) === null).map(([name]) => name),
    [formulaTexts]
  )

  const previewValues = useMemo<Record<string, number> | null>(() => {
    if (!draft) return null
    const calculation = calculateAttributes(draft, defaultBaseValues(draft))
    return calculation.cycle ? null : calculation.values
  }, [draft])

  const entries = draft ? Object.entries(draft.attributes) : []

  const applySystem = (system: AttrSystem): void => {
    setDraft(system)
    setFormulaTexts(textsOf(system))
    setResetToken((token) => token + 1)
  }

  const updateAttr = (name: string, patch: Partial<AttrDefinition>): void => {
    setDraft((prev) => {
      if (!prev) return prev
      const attr = prev.attributes[name]
      if (!attr) return prev
      return { ...prev, attributes: { ...prev.attributes, [name]: { ...attr, ...patch } } }
    })
  }

  /** 改名：属性键与其被引用处（其他属性的公式系数键）同步迁移，保持属性列表顺序 */
  const renameAttr = (oldName: string, newName: string): void => {
    if (!draft) return
    const attributes: Record<string, AttrDefinition> = {}
    const texts: Record<string, string> = {}
    for (const [key, attr] of Object.entries(draft.attributes)) {
      if (key === oldName) {
        attributes[newName] = { ...attr, name: newName }
        texts[newName] = formulaTexts[oldName] ?? formulaToText(attr.formula)
        continue
      }
      const coefficients: Record<string, number> = {}
      let changed = false
      for (const [dep, coeff] of Object.entries(attr.formula.coefficients)) {
        if (dep === oldName) {
          coefficients[newName] = coeff
          changed = true
        } else {
          coefficients[dep] = coeff
        }
      }
      const nextAttr = changed ? { ...attr, formula: { ...attr.formula, coefficients } } : attr
      attributes[key] = nextAttr
      texts[key] = changed ? formulaToText(nextAttr.formula) : (formulaTexts[key] ?? formulaToText(attr.formula))
    }
    setDraft({ attributes })
    setFormulaTexts(texts)
  }

  /** 公式文本编辑：解析成功即写入草稿（示例值实时更新），失败仅标记待修正 */
  const changeFormula = (name: string, text: string): void => {
    setFormulaTexts((prev) => ({ ...prev, [name]: text }))
    const parsed = parseFormulaText(text)
    if (parsed) {
      updateAttr(name, { formula: parsed })
    }
  }

  const changeNumber = (name: string, field: 'minValue' | 'maxValue' | 'defaultValue', raw: string): void => {
    if (raw.trim() === '') {
      updateAttr(name, { [field]: field === 'maxValue' ? null : 0 })
      return
    }
    const value = Number(raw)
    if (!Number.isFinite(value)) return
    updateAttr(name, { [field]: value })
  }

  const addAttr = (): void => {
    if (!draft) return
    const used = new Set(Object.keys(draft.attributes))
    let index = 1
    while (used.has(`新属性${index}`)) index++
    const name = `新属性${index}`
    const created: AttrDefinition = {
      name,
      type: 'derived',
      category: ATTR_TYPE_LABELS.derived,
      displayName: name,
      minValue: 0,
      maxValue: null,
      defaultValue: 0,
      formula: { coefficients: {}, baseValue: 0 }
    }
    setDraft({ attributes: { ...draft.attributes, [name]: created } })
    setFormulaTexts((prev) => ({ ...prev, [name]: '=0' }))
  }

  /** 删除属性：被其他属性公式依赖时拒绝（对应 Python remove_attribute 的保护） */
  const removeAttr = (name: string): void => {
    if (!draft) return
    const dependents = Object.entries(draft.attributes)
      .filter(([key, attr]) => key !== name && name in attr.formula.coefficients)
      .map(([key]) => key)
    if (dependents.length > 0) {
      setErrors([`属性「${name}」被 ${dependents.join('、')} 的公式依赖，不能删除`])
      return
    }
    const attributes: Record<string, AttrDefinition> = {}
    for (const [key, attr] of Object.entries(draft.attributes)) {
      if (key !== name) attributes[key] = attr
    }
    setDraft({ attributes })
    setFormulaTexts((prev) => {
      const next = { ...prev }
      delete next[name]
      return next
    })
  }

  const handleSave = async (): Promise<void> => {
    setErrors([])
    setNotice(null)
    if (!draft) return
    const problems = [
      ...invalidFormulas.map((name) => `属性「${name}」的公式无法解析（需形如 "= 力量*10 + 体质*20"）`),
      ...validateAttrSystem(draft)
    ]
    if (problems.length > 0) {
      setErrors(problems)
      return
    }
    setBusy(true)
    try {
      const saved = await window.mbApi.attrSystem.save({ system: draft })
      setBaseline(saved)
      applySystem(saved)
      setNotice('属性系统已保存，示例值已按新公式重算')
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)])
    } finally {
      setBusy(false)
    }
  }

  const handleReset = (): void => {
    if (!baseline) return
    setErrors([])
    setNotice(null)
    applySystem(baseline)
  }

  const handleLoadDefault = (): void => {
    setErrors([])
    setNotice('已载入内置默认属性系统（尚未保存）')
    applySystem(createDefaultAttrSystem())
  }

  return (
    <div className="changelog-panel" data-testid="attr-system-panel">
      <div className="changelog-header">
        <span className="chapter-form-title">属性系统编辑器</span>
        <div className="editor-actions">
          <button type="button" className="btn" data-testid="attr-default" disabled={busy} onClick={handleLoadDefault}>
            恢复默认
          </button>
          <button type="button" className="btn" disabled={busy} onClick={handleReset}>
            重置
          </button>
          <button
            type="button"
            className="btn primary"
            data-testid="attr-save"
            disabled={busy || !draft}
            onClick={() => void handleSave()}
          >
            保存
          </button>
          <button type="button" className="btn" data-testid="attr-close" disabled={busy} onClick={onClose}>
            关闭
          </button>
        </div>
      </div>

      <div className="changelog-entry">
        <div className="form-label">
          属性列表（{entries.length}）· 公式为系数式（如 "= 力量*10 + 体质*20"）· 示例值按基础属性默认值计算
        </div>

        <div className="attr-head">
          <span className="attr-name">属性名</span>
          <span className="attr-display">显示名</span>
          <span className="attr-type">类型</span>
          <span className="attr-category">分类</span>
          <span className="attr-num">默认值</span>
          <span className="attr-num">最小值</span>
          <span className="attr-num">上限</span>
          <span className="attr-formula">公式</span>
          <span className="attr-preview">示例值</span>
          <span className="attr-actions" />
        </div>

        {entries.map(([name, attr], index) => {
          const formulaText = formulaTexts[name] ?? formulaToText(attr.formula)
          const invalid = parseFormulaText(formulaText) === null
          return (
            <div className="attr-row" key={`${name}:${resetToken}`} data-testid={`attr-row-${index}`}>
              <input
                className="form-input attr-name"
                data-testid={`attr-name-${index}`}
                defaultValue={name}
                onBlur={(event) => {
                  const next = event.target.value.trim()
                  if (next !== '' && next !== name) renameAttr(name, next)
                }}
                onKeyDown={(event) => {
                  if (event.key === 'Enter') (event.target as HTMLInputElement).blur()
                }}
              />
              <input
                className="form-input attr-display"
                data-testid={`attr-display-${index}`}
                defaultValue={attr.displayName}
                onChange={(event) => updateAttr(name, { displayName: event.target.value })}
              />
              <select
                className="form-select attr-type"
                data-testid={`attr-type-${index}`}
                value={attr.type}
                onChange={(event) => updateAttr(name, { type: event.target.value as AttrType })}
              >
                {ATTR_TYPES.map((type) => (
                  <option key={type} value={type}>
                    {ATTR_TYPE_LABELS[type]}
                  </option>
                ))}
              </select>
              <input
                className="form-input attr-category"
                data-testid={`attr-category-${index}`}
                defaultValue={attr.category}
                onChange={(event) => updateAttr(name, { category: event.target.value })}
              />
              <input
                className="form-input attr-num"
                data-testid={`attr-default-${index}`}
                type="number"
                defaultValue={attr.defaultValue}
                onChange={(event) => changeNumber(name, 'defaultValue', event.target.value)}
              />
              <input
                className="form-input attr-num"
                data-testid={`attr-min-${index}`}
                type="number"
                defaultValue={attr.minValue}
                onChange={(event) => changeNumber(name, 'minValue', event.target.value)}
              />
              <input
                className="form-input attr-num"
                data-testid={`attr-max-${index}`}
                type="number"
                defaultValue={attr.maxValue ?? ''}
                placeholder="无"
                onChange={(event) => changeNumber(name, 'maxValue', event.target.value)}
              />
              <input
                className={`form-input attr-formula${invalid ? ' invalid' : ''}`}
                data-testid={`attr-formula-${index}`}
                defaultValue={formulaText}
                onChange={(event) => changeFormula(name, event.target.value)}
              />
              <span className="attr-preview" data-testid={`attr-preview-${index}`}>
                {previewValues ? formatPreview(previewValues[name]) : '—'}
              </span>
              <span className="attr-actions">
                {invalid && (
                  <span className="attr-invalid" data-testid={`attr-invalid-${index}`}>
                    公式无法解析
                  </span>
                )}
                <button
                  type="button"
                  className="btn slim danger"
                  data-testid={`attr-remove-${index}`}
                  title="删除属性"
                  onClick={() => removeAttr(name)}
                >
                  ✕
                </button>
              </span>
            </div>
          )
        })}

        <div className="editor-actions">
          <button type="button" className="btn" data-testid="attr-add" disabled={busy || !draft} onClick={addAttr}>
            添加属性
          </button>
        </div>
      </div>

      {errors.length > 0 && (
        <div className="error-banner" data-testid="attr-errors">
          {errors.map((message, index) => (
            <div key={index}>{message}</div>
          ))}
        </div>
      )}
      {notice && (
        <div className="notice-banner" data-testid="attr-notice">
          {notice}
        </div>
      )}
    </div>
  )
}

function textsOf(system: AttrSystem): Record<string, string> {
  const texts: Record<string, string> = {}
  for (const [name, attr] of Object.entries(system.attributes)) {
    texts[name] = formulaToText(attr.formula)
  }
  return texts
}

/** 示例值展示：最多保留 4 位小数（消除浮点长尾，核心计算值不受影响） */
function formatPreview(value: number | undefined): string {
  if (value === undefined || !Number.isFinite(value)) return '—'
  return String(Math.round(value * 10000) / 10000)
}