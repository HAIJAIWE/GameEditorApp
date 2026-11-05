import { useEffect, useMemo, useState } from 'react'

import { useT } from '@mobai/client-ui'

import { PanelShell } from '../common'

import {
  ATTR_TYPES,
  ATTR_TYPE_LABELS,
  createDefaultAttrSystem,
  defaultBaseValues,
  formulaToText,
  parseFormulaText,
  validateAttrSystem,
  type AttrDefinition,
  type AttrSystem,
  type AttrType
} from '@mobai/shared/attrSystem'
import { calculateAttributes } from '@mobai/shared/domain/attr/attrEngine'

import AttrLivePreview from './AttrLivePreview'
import EquipPreviewPanel from './EquipPreviewPanel'
import { textsOf, formatPreview } from '../attrSystemUtils'

/**
 * 属性系统编辑器：
 * - 属性增删改（名称/显示名/类型/分类/默认值/最小·上限）+ 系数公式文本编辑（如 "= 力量*10 + 体质*20"）
 * - 保存前校验：公式可解析、依赖存在、无环依赖、min ≤ 上限、数值合法
 * - 示例值列：以各基础属性默认值实时计算全部属性（拓扑序 + min/max 截断）
 * 明确推迟（后续切片）：关系矩阵、等级/装备/Buff 实时预览、导出游戏配置、装备预览。
 */

interface AttrSystemPanelProps {
  onClose: () => void
}

export default function AttrSystemPanel({ onClose }: AttrSystemPanelProps) {
  const t = useT()
  const [baseline, setBaseline] = useState<AttrSystem | null>(null)
  const [draft, setDraft] = useState<AttrSystem | null>(null)
  // 公式原始文本（编辑中可能暂时非法，不覆盖草稿里的上一个合法公式）
  const [formulaTexts, setFormulaTexts] = useState<Record<string, string>>({})
  const [errors, setErrors] = useState<string[]>([])
  const [notice, setNotice] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const [resetToken, setResetToken] = useState(0)
  const [view, setView] = useState<'list' | 'matrix' | 'live' | 'equip'>('list')
  const [matrixFilter, setMatrixFilter] = useState<'all' | 'derived' | 'combat'>('all')

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
  const baseAttrNames = draft
    ? Object.entries(draft.attributes)
        .filter(([, attr]) => attr.type === 'base')
        .map(([name]) => name)
    : []
  const matrixRowNames = draft
    ? Object.entries(draft.attributes)
        .filter(([, attr]) => attr.type === 'derived' || attr.type === 'combat')
        .filter(([, attr]) => matrixFilter === 'all' || attr.type === matrixFilter)
        .map(([name]) => name)
    : []

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
    while (used.has(t('attrPanel.newAttrName', { n: index }))) index++
    const name = t('attrPanel.newAttrName', { n: index })
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

  /** 删除属性：被其他属性公式依赖时拒绝 */
  const removeAttr = (name: string): void => {
    if (!draft) return
    const dependents = Object.entries(draft.attributes)
      .filter(([key, attr]) => key !== name && name in attr.formula.coefficients)
      .map(([key]) => key)
    if (dependents.length > 0) {
      setErrors([
        t('attrPanel.deleteBlocked', {
          name,
          dependents: dependents.join(t('attrPanel.listSeparator'))
        })
      ])
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

  /** 关系矩阵：单元格系数 → 公式（0 表示无关系，从系数中移除）；同步公式文本供列表视图使用 */
  const setCoefficient = (derived: string, base: string, raw: string): void => {
    if (!draft) return
    const attr = draft.attributes[derived]
    if (!attr) return
    const text = raw.trim()
    const numeric = text === '' ? 0 : Number(text)
    if (!Number.isFinite(numeric)) return
    const coefficients = { ...attr.formula.coefficients }
    if (numeric === 0) delete coefficients[base]
    else coefficients[base] = numeric
    const formula = { ...attr.formula, coefficients }
    updateAttr(derived, { formula })
    setFormulaTexts((prev) => ({ ...prev, [derived]: formulaToText(formula) }))
  }

  /** 清空系数：作用于当前筛选出的行（保留常数项，其余属性不受影响） */
  const handleClearCoefficients = (): void => {
    if (!draft) return
    const attributes = { ...draft.attributes }
    const texts = { ...formulaTexts }
    for (const name of matrixRowNames) {
      const attr = attributes[name]
      if (!attr) continue
      const formula = { ...attr.formula, coefficients: {} }
      attributes[name] = { ...attr, formula }
      texts[name] = formulaToText(formula)
    }
    setDraft({ attributes })
    setFormulaTexts(texts)
    setResetToken((token) => token + 1)
  }

  /** 保存 / 导出共用的校验问题清单（非法公式 + 领域校验） */
  const collectProblems = (): string[] => {
    if (!draft) return [t('attrPanel.notLoaded')]
    return [
      ...invalidFormulas.map((name) => t('attrPanel.formulaInvalid', { name })),
      ...validateAttrSystem(draft)
    ]
  }

  const handleSave = async (): Promise<void> => {
    setErrors([])
    setNotice(null)
    if (!draft) return
    const problems = collectProblems()
    if (problems.length > 0) {
      setErrors(problems)
      return
    }
    setBusy(true)
    try {
      const saved = await window.mbApi.attrSystem.save({ system: draft })
      setBaseline(saved)
      applySystem(saved)
      setNotice(t('attrPanel.saved'))
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)])
    } finally {
      setBusy(false)
    }
  }

  /** 导出游戏引擎配置：与保存同校验；导出当前草稿 */
  const handleExportGameConfig = async (): Promise<void> => {
    setErrors([])
    setNotice(null)
    if (!draft) return
    const problems = collectProblems()
    if (problems.length > 0) {
      setErrors(problems)
      return
    }
    try {
      const chosen = await window.mbApi.dialog.chooseSaveJsonFile()
      if (!chosen.path) return
      setBusy(true)
      const result = await window.mbApi.attrSystem.exportGameConfig({ path: chosen.path, system: draft })
      setNotice(t('attrPanel.gameConfigExported', { path: result.filePath }))
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)])
    } finally {
      setBusy(false)
    }
  }

  /** 导出属性系统 JSON：导出当前草稿；主进程原子写盘 */
  const handleExportJson = async (): Promise<void> => {
    setErrors([])
    setNotice(null)
    if (!draft) return
    try {
      const chosen = await window.mbApi.dialog.chooseAttrSystemJsonFile({ mode: 'save', defaultName: 'attr_system.json' })
      if (!chosen.path) return
      setBusy(true)
      const result = await window.mbApi.attrSystem.exportJson({ path: chosen.path, system: draft })
      setNotice(t('attrPanel.jsonExported', { path: result.filePath }))
    } catch (error) {
      setErrors([error instanceof Error ? error.message : String(error)])
    } finally {
      setBusy(false)
    }
  }

  /** 导入属性系统 JSON：替换当前草稿（结构与公式异常以警告提示），需再点「保存」才落盘 */
  const handleImportJson = async (): Promise<void> => {
    setErrors([])
    setNotice(null)
    try {
      const chosen = await window.mbApi.dialog.chooseAttrSystemJsonFile({ mode: 'open' })
      if (!chosen.path) return
      setBusy(true)
      const result = await window.mbApi.attrSystem.importJson({ path: chosen.path })
      applySystem(result.system)
      const count = Object.keys(result.system.attributes).length
      setNotice(
        result.warnings.length > 0
          ? t('attrPanel.importedWithWarnings', {
              n: count,
              warnings: result.warnings.length,
              details: result.warnings.join(t('attrPanel.warningSeparator'))
            })
          : t('attrPanel.imported', { n: count })
      )
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
    setNotice(t('attrPanel.defaultLoaded'))
    applySystem(createDefaultAttrSystem())
  }

  return (
    <PanelShell
      testId="attr-system-panel"
      toolbar={
        <div className="panel-shell-toolbar-group">
          <button
            type="button"
            className={`btn${view === 'list' ? ' primary' : ''}`}
            data-testid="attr-view-list"
            disabled={busy}
            onClick={() => setView('list')}
          >
            {t('attrPanel.tabList')}
          </button>
          <button
            type="button"
            className={`btn${view === 'matrix' ? ' primary' : ''}`}
            data-testid="attr-view-matrix"
            disabled={busy}
            onClick={() => setView('matrix')}
          >
            {t('attrPanel.tabMatrix')}
          </button>
          <button
            type="button"
            className={`btn${view === 'live' ? ' primary' : ''}`}
            data-testid="attr-view-live"
            disabled={busy}
            onClick={() => setView('live')}
          >
            {t('attrPanel.tabLive')}
          </button>
          <button
            type="button"
            className={`btn${view === 'equip' ? ' primary' : ''}`}
            data-testid="attr-view-equip"
            disabled={busy}
            onClick={() => setView('equip')}
          >
            {t('attrPanel.tabEquip')}
          </button>
        </div>
      }
      footer={
        <>
          <button type="button" className="btn" data-testid="attr-default" disabled={busy} onClick={handleLoadDefault}>
            {t('attrPanel.loadDefault')}
          </button>
          <button type="button" className="btn" disabled={busy} onClick={handleReset}>
            {t('attrPanel.reset')}
          </button>
          <button
            type="button"
            className="btn"
            data-testid="attr-export-game"
            disabled={busy || !draft}
            onClick={() => void handleExportGameConfig()}
          >
            {t('attrPanel.exportGameConfig')}
          </button>
          <button
            type="button"
            className="btn"
            data-testid="attr-import-json"
            disabled={busy || !draft}
            onClick={() => void handleImportJson()}
          >
            {t('attrPanel.importJson')}
          </button>
          <button
            type="button"
            className="btn"
            data-testid="attr-export-json"
            disabled={busy || !draft}
            onClick={() => void handleExportJson()}
          >
            {t('attrPanel.exportJson')}
          </button>
          <button
            type="button"
            className="btn primary"
            data-testid="attr-save"
            disabled={busy || !draft}
            onClick={() => void handleSave()}
          >
            {t('common.save')}
          </button>
          <button type="button" className="btn" data-testid="attr-close" disabled={busy} onClick={onClose}>
            {t('common.close')}
          </button>
        </>
      }
    >

      {view === 'list' ? (
        <div className="changelog-entry">
          <div className="form-label">
            {t('attrPanel.listHeader', { n: entries.length })}
          </div>

          <div className="attr-head">
            <span className="attr-name">{t('attrPanel.colName')}</span>
            <span className="attr-display">{t('attrPanel.colDisplay')}</span>
            <span className="attr-type">{t('attrPanel.colType')}</span>
            <span className="attr-category">{t('attrPanel.colCategory')}</span>
            <span className="attr-num">{t('attrPanel.colDefault')}</span>
            <span className="attr-num">{t('attrPanel.colMin')}</span>
            <span className="attr-num">{t('attrPanel.colMax')}</span>
            <span className="attr-formula">{t('attrPanel.colFormula')}</span>
            <span className="attr-preview">{t('attrPanel.colPreview')}</span>
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
                  placeholder={t('attrPanel.noValuePlaceholder')}
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
                      {t('attrPanel.formulaInvalidShort')}
                    </span>
                  )}
                  <button
                    type="button"
                    className="btn slim danger"
                    data-testid={`attr-remove-${index}`}
                    title={t('attrPanel.removeAttrTitle')}
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
              {t('attrPanel.addAttr')}
            </button>
          </div>
        </div>
      ) : view === 'matrix' ? (
        <div className="changelog-entry" data-testid="attr-matrix">
          <div className="form-label">
            {t('attrPanel.matrixHeader')}
          </div>

          <div className="attr-matrix-toolbar">
            <label className="form-label" htmlFor="attr-matrix-filter">
              {t('attrPanel.filterLabel')}
            </label>
            <select
              id="attr-matrix-filter"
              className="form-select attr-matrix-filter"
              data-testid="matrix-filter"
              value={matrixFilter}
              onChange={(event) => setMatrixFilter(event.target.value as 'all' | 'derived' | 'combat')}
            >
              <option value="all">{t('attrPanel.filterAll')}</option>
              <option value="derived">{t('attrPanel.filterDerived')}</option>
              <option value="combat">{t('attrPanel.filterCombat')}</option>
            </select>
            <button
              type="button"
              className="btn slim danger"
              data-testid="matrix-clear"
              disabled={busy || !draft}
              onClick={handleClearCoefficients}
            >
              {t('attrPanel.clearCoefficients')}
            </button>
            <span className="item-meta" data-testid="matrix-summary">
              {t('attrPanel.matrixSummary', { rows: matrixRowNames.length, cols: baseAttrNames.length })}
            </span>
          </div>

          {matrixRowNames.length === 0 || baseAttrNames.length === 0 ? (
            <div className="empty">{t('attrPanel.matrixEmpty')}</div>
          ) : (
            <div className="attr-matrix-scroll">
              <table className="attr-matrix">
                <thead>
                  <tr>
                    <th className="attr-matrix-corner">{t('attrPanel.matrixCorner')}</th>
                    {baseAttrNames.map((baseName) => (
                      <th key={baseName}>{baseName}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {matrixRowNames.map((rowName) => (
                    <tr key={`${rowName}:${resetToken}`} data-testid={`matrix-row-${rowName}`}>
                      <th>{draft?.attributes[rowName]?.displayName || rowName}</th>
                      {baseAttrNames.map((baseName) => (
                        <td key={baseName}>
                          <input
                            type="number"
                            step="any"
                            className="form-input attr-matrix-cell"
                            data-testid={`matrix-cell-${rowName}-${baseName}`}
                            defaultValue={draft?.attributes[rowName]?.formula.coefficients[baseName] ?? 0}
                            onChange={(event) => setCoefficient(rowName, baseName, event.target.value)}
                          />
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}

          <div className="attr-matrix-hint">
            {t('attrPanel.matrixHint')}
          </div>
        </div>
      ) : view === 'live' ? (
        <div className="changelog-entry" data-testid="attr-live">
          {draft ? <AttrLivePreview system={draft} /> : <div className="empty">{t('attrPanel.loading')}</div>}
        </div>
      ) : (
        <div className="changelog-entry" data-testid="attr-equip">
          {draft ? <EquipPreviewPanel system={draft} /> : <div className="empty">{t('attrPanel.loading')}</div>}
        </div>
      )}

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
    </PanelShell>
  )
}