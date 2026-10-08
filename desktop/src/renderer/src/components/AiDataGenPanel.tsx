import { useEffect, useState } from 'react'

import {
  DATA_GEN_DEFAULT_COUNT,
  DATA_GEN_MAX_COUNT,
  DATA_GEN_MIN_COUNT,
  DATA_GEN_ERROR_NO_TYPE,
  summarizeCandidateItem,
  type CeshuDataGenResult
} from '../../../shared/ceshuDataGen'
import { LLM_BULK_COUNT_THRESHOLD, isBulkLlmCall } from '../../../shared/agent/protocol'
import { evaluateBudget, taskBudget } from '../../../shared/agent/budget'
import type { DataQualityVerdict } from '../../../shared/agent/qualityGate'
import type { DataTypeDef } from '../../../shared/types'

/**
 * AI 数据生成面板（对应 Python AIDataGenerateDialog）：
 * 数据共同开发工作流入口 —— 策划书数值/系统章作为设定 → AI 生成候选游戏数据 → 表格预览勾选 → 人工导入。
 * 核心原则：AI 只生产候选，人工审批后才会写入数据表。
 * 说明：Python 用 QThread 后台生成 + QTabWidget 分类预览；TS 走 IPC（主进程调 LLM，不阻塞渲染）+
 * 标签按钮 + 勾选列表；导入逐条走 data:createItem（type 用单数键，id 已由生成端剥离）。
 */

interface AiDataGenPanelProps {
  ceshuId: string
  /** 打开时预选的数据类型 id（由条目表单的「AI 生成」传入；不传则默认全选，与 Python 一致） */
  initialTypeId?: string
  onClose: () => void
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export default function AiDataGenPanel({ ceshuId, initialTypeId, onClose }: AiDataGenPanelProps) {
  const [types, setTypes] = useState<DataTypeDef[]>([])
  const [checkedTypeIds, setCheckedTypeIds] = useState<string[]>([])
  const [count, setCount] = useState(DATA_GEN_DEFAULT_COUNT)
  const [instruction, setInstruction] = useState('')
  const [result, setResult] = useState<CeshuDataGenResult | null>(null)
  const [checkedItems, setCheckedItems] = useState<Record<string, boolean[]>>({})
  const [activeTab, setActiveTab] = useState('')
  const [busy, setBusy] = useState(false)
  const [importing, setImporting] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  /** 批量生成的内联确认态（v0.5 DD-17：超过阈值的云端调用需先确认） */
  const [confirming, setConfirming] = useState(false)
  /** 候选的确定性质量门结论（v0.5 DD-19 数据半边） */
  const [quality, setQuality] = useState<DataQualityVerdict | null>(null)
  /** 导入前的二次确认态（v0.7 DD-19 × M5：质量门检出问题时需显式确认才写入数据表） */
  const [importConfirming, setImportConfirming] = useState(false)

  useEffect(() => {
    let cancelled = false
    window.mbApi.schema
      .list()
      .then((loaded) => {
        if (cancelled) return
        setTypes(loaded)
        // 默认全选（与 Python 一致）；若由条目表单指定了类型，则只预选该类型，
        // 避免用户从「某条数据的 AI 生成」进来后还要手动取消其余类型。
        setCheckedTypeIds(
          initialTypeId !== undefined && loaded.some((type) => type.id === initialTypeId)
            ? [initialTypeId]
            : loaded.map((type) => type.id)
        )
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toErrorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [initialTypeId])

  const pluralKeys = result ? Object.keys(result.candidates) : []
  const activeItems = result && activeTab ? (result.candidates[activeTab] ?? []) : []
  const activeChecked = checkedItems[activeTab] ?? []
  const checkedCount = pluralKeys.reduce(
    (sum, key) => sum + (checkedItems[key] ?? []).filter(Boolean).length,
    0
  )
  const allChecked =
    pluralKeys.length > 0 &&
    pluralKeys.every((key) => (checkedItems[key] ?? []).every(Boolean))

  /** 生成候选：走 IPC（主进程组装提示词 + 调本地 LLM + 归一化） */
  const handleGenerate = async (): Promise<void> => {
    setError(null)
    setNotice(null)
    if (checkedTypeIds.length === 0) {
      setError(DATA_GEN_ERROR_NO_TYPE)
      return
    }
    // v0.5 DD-17：超过阈值的批量生成属「大范围云端调用」⇒ 首次点击只进入内联确认态
    // （交互沿用项目既有做法，同 `ClearAllPanel` / `BatchEditPanel`，不自造弹窗）
    if (isBulkLlmCall({ count }) && !confirming) {
      setConfirming(true)
      return
    }
    setConfirming(false)
    setBusy(true)
    try {
      const generated = await window.mbApi.ceshu.aiGenerateData({
        id: ceshuId,
        dataTypes: checkedTypeIds,
        count,
        instruction: instruction.trim(),
        confirmed: true
      })
      setResult(generated)
      setCheckedItems(
        Object.fromEntries(
          Object.entries(generated.candidates).map(([key, items]) => [key, items.map(() => true)])
        )
      )
      setActiveTab(Object.keys(generated.candidates)[0] ?? '')
      setNotice(generated.summary)
      setQuality(generated.quality ?? null)
      setImportConfirming(false)
    } catch (err) {
      setResult(null)
      setCheckedItems({})
      setQuality(null)
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /** 全选 / 取消全选（对应 Python _on_toggle_select_all：以第一类首项状态为准取反） */
  const handleToggleSelectAll = (): void => {
    if (pluralKeys.length === 0) return
    const next = !allChecked
    setCheckedItems(
      Object.fromEntries(pluralKeys.map((key) => [key, (result?.candidates[key] ?? []).map(() => next)]))
    )
  }

  /** 导入勾选条目：逐条写入数据表（id 由数据层生成），统计成功与失败 */
  const handleImport = async (): Promise<void> => {
    setError(null)
    setNotice(null)
    if (!result) return
    // DD-19 × M5：质量门检出违反项（数量约束超限或离散度偏高）时，导入前需显式二次确认，
    // 强化「AI 只产候选、人工审批后才写入数据表」的硬约束（沿用 DD-17 内联确认范式，不自造弹窗）
    if (quality?.hasIssues && !importConfirming) {
      setImportConfirming(true)
      return
    }
    setImportConfirming(false)
    const rows: Array<{ type: string; data: Record<string, unknown> }> = []
    for (const pluralKey of pluralKeys) {
      const items = result.candidates[pluralKey] ?? []
      const checked = checkedItems[pluralKey] ?? []
      const typeId = types.find((type) => type.pluralKey === pluralKey)?.id ?? pluralKey
      items.forEach((item, index) => {
        if (checked[index]) rows.push({ type: typeId, data: item })
      })
    }
    if (rows.length === 0) {
      setError('请先在预览中勾选要导入的条目。')
      return
    }
    setImporting(true)
    try {
      let imported = 0
      const failures: string[] = []
      for (const row of rows) {
        try {
          await window.mbApi.data.createItem({ type: row.type, data: row.data })
          imported += 1
        } catch (err) {
          failures.push(`${String(row.data['name'] ?? '未命名')}: ${toErrorMessage(err)}`)
        }
      }
      const message = `已导入 ${imported} 条数据。`
      setNotice(failures.length > 0 ? `${message}\n${failures.length} 条失败（如 ${failures[0]}）` : message)
    } finally {
      setImporting(false)
    }
  }

  return (
    <div className="changelog-panel" data-testid="datagen-panel">
      <div className="changelog-header">
        <span className="chapter-form-title">🤖 AI 数据生成（候选 + 人工审批）</span>
        <div className="editor-actions">
          <button type="button" className="btn" data-testid="datagen-close" onClick={onClose}>
            关闭
          </button>
        </div>
      </div>

      <div className="item-meta">
        根据当前策划书的数值/系统章设定，AI 生成候选游戏数据；下方预览中人工勾选后才会导入数据表。
      </div>

      {error && (
        <div className="form-error" data-testid="datagen-error">
          {error}
        </div>
      )}
      {notice && (
        <div className="notice-banner inline" data-testid="datagen-notice">
          {notice}
        </div>
      )}
      {/* v0.5 DD-19（数据半边）：候选的确定性质量门结论 —— 数量约束（硬）+ 平衡性（建议） */}
      {quality && (
        <div className="datagen-quality" data-testid="datagen-quality">
          <p className="datagen-quality-title">质量门：{quality.summary}</p>
          {quality.issues.length > 0 && (
            <ul className="datagen-quality-issues">
              {quality.issues.map((issue, index) => (
                <li
                  key={`${issue.kind}:${issue.type}:${index}`}
                  className={issue.kind === 'count_limit' ? 'is-count' : 'is-balance'}
                >
                  {issue.message}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
      {/* v0.6 M5：本次生成的 token 花费 + 预算条（本地档 usage 为空时不显示） */}
      {result?.usage && result.usage.totalTokens > 0 && (() => {
        const budget = taskBudget('datagen', { count })
        const status = evaluateBudget(result.usage.totalTokens, budget, true)
        return (
          <div className="datagen-cost" data-testid="datagen-cost">
            <span className="datagen-cost-label">
              本次花费 {result.usage.totalTokens} token（预算 {budget}）
            </span>
            <div className="budget-bar">
              <div
                className={`budget-bar-fill level-${status.level}`}
                style={{ width: `${Math.min(100, Math.round(status.ratio * 100))}%` }}
              />
            </div>
          </div>
        )
      })()}

      <div className="datagen-types" data-testid="datagen-types">
        <span className="form-label">生成的数据类型</span>
        <div className="datagen-type-grid">
          {types.map((type) => (
            <label className="check-option" key={type.id}>
              <input
                type="checkbox"
                data-testid="datagen-type"
                checked={checkedTypeIds.includes(type.id)}
                onChange={(event) =>
                  setCheckedTypeIds((prev) =>
                    event.target.checked ? [...prev, type.id] : prev.filter((id) => id !== type.id)
                  )
                }
              />
              {type.name}
            </label>
          ))}
        </div>
      </div>

      <div className="template-save-row">
        <span className="form-label">每类数量</span>
        <input
          className="form-input datagen-count"
          data-testid="datagen-count"
          type="number"
          min={DATA_GEN_MIN_COUNT}
          max={DATA_GEN_MAX_COUNT}
          value={count}
          onChange={(event) => setCount(Number(event.target.value))}
        />
        <span className="form-label">补充要求</span>
        <input
          className="form-input"
          data-testid="datagen-instruction"
          placeholder="可选，如：全部为 1-10 级新手内容，技能带冷却时间"
          value={instruction}
          onChange={(event) => setInstruction(event.target.value)}
        />
        <button
          type="button"
          className="btn primary"
          data-testid="datagen-generate"
          disabled={busy}
          onClick={() => void handleGenerate()}
        >
          {busy ? '生成中…' : '生成候选'}
        </button>
        {confirming && (
          <div className="form-row" data-testid="datagen-confirm">
            <span className="form-label">
              将调用云端模型生成 {count} 条候选（超过 {LLM_BULK_COUNT_THRESHOLD} 条），token 消耗较高，确认生成？
            </span>
            <button
              type="button"
              className="btn primary"
              data-testid="datagen-confirm-yes"
              disabled={busy}
              onClick={() => void handleGenerate()}
            >
              确认生成
            </button>
            <button
              type="button"
              className="btn"
              data-testid="datagen-confirm-no"
              onClick={() => setConfirming(false)}
            >
              取消
            </button>
          </div>
        )}
      </div>

      {!result ? (
        <div className="empty" data-testid="datagen-status">
          尚未生成。选择类型后点击「生成候选」开始。
        </div>
      ) : (
        <>
          <div className="datagen-tabs">
            {pluralKeys.map((key) => (
              <button
                key={key}
                type="button"
                className={`datagen-tab${key === activeTab ? ' active' : ''}`}
                data-testid="datagen-tab"
                onClick={() => setActiveTab(key)}
              >
                {key}（{(result.candidates[key] ?? []).length}）
              </button>
            ))}
            <span className="item-meta" data-testid="datagen-status">
              {result.summary}
              {result.model ? `（模型 ${result.model}）` : ''}
            </span>
          </div>

          <div className="datagen-list" data-testid="datagen-list">
            {activeItems.length === 0 ? (
              <div className="empty">该分类暂无候选</div>
            ) : (
              activeItems.map((item, index) => (
                <label className="check-option datagen-item" key={`${activeTab}-${index}`}>
                  <input
                    type="checkbox"
                    data-testid="datagen-item"
                    checked={Boolean(activeChecked[index])}
                    onChange={(event) =>
                      setCheckedItems((prev) => {
                        const next = [...(prev[activeTab] ?? [])]
                        next[index] = event.target.checked
                        return { ...prev, [activeTab]: next }
                      })
                    }
                  />
                  {summarizeCandidateItem(item)}
                </label>
              ))
            )}
          </div>

          <div className="editor-actions">
            <button type="button" className="btn" data-testid="datagen-select-all" onClick={handleToggleSelectAll}>
              全选 / 取消全选
            </button>
            <span className="item-meta" data-testid="datagen-checked-count">
              已勾选 {checkedCount} 条
            </span>
            <button
              type="button"
              className="btn primary"
              data-testid="datagen-import"
              disabled={importing || checkedCount === 0}
              onClick={() => void handleImport()}
            >
              {importing ? '导入中…' : `导入勾选（${checkedCount}）`}
            </button>
          </div>

          {/* v0.7 DD-19 × M5 联动：质量门检出违反项时，导入前需显式二次确认 */}
          {importConfirming && (
            <div className="form-row" data-testid="datagen-import-confirm">
              <span className="form-label">
                质量门检出 {quality?.issues.length ?? 0} 处问题（如：{quality?.issues[0]?.message}），仍要导入勾选的 {checkedCount} 条？
              </span>
              <button
                type="button"
                className="btn primary"
                data-testid="datagen-import-confirm-yes"
                disabled={importing}
                onClick={() => void handleImport()}
              >
                仍要导入
              </button>
              <button
                type="button"
                className="btn"
                data-testid="datagen-import-confirm-no"
                onClick={() => setImportConfirming(false)}
              >
                取消
              </button>
            </div>
          )}
        </>
      )}
    </div>
  )
}