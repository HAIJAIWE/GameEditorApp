import { useEffect, useMemo, useState } from 'react'

import {
  BALANCE_VERDICT_LABELS,
  assessBalance,
  countByType,
  numericFieldNames,
  summarizeNumeric,
  type NumericSummary
} from '../../../shared/util/data/dataStats'
import type { ItemRecord } from '../../../shared/types'
import { useAppContext } from '../plugins/appContext'

/**
 * 数据统计 + 平衡性分析面板（对应 旧版 `ui/dialogs/statistics` 的
 * `StatisticsDialog` + `BalanceAnalysisDialog`）。
 *
 * **刻意差异（有实证）**：旧版 的角色/怪物分析读扁平字段 `hp`/`atk`/`def`，
 * 但 TS schema 里这些类型**没有**该字段（属性在 `attr_list` 里）→ 直译会变死代码。
 * 故本面板按 schema 的 `spinbox` 字段**自动发现**数值字段，换 schema 也成立。
 *
 * **不迁**：旧版 的「📈 图表」页是 matplotlib 占位符，这里用 CSS 柱条真实渲染分布，
 * 不复制占位符。
 */

interface StatisticsPanelProps {
  /** 面板关闭（宿主 `HostPanel` 统一下发的面板生命周期契约） */
  onClose: () => void
}

type Tab = 'overview' | 'balance'

export default function StatisticsPanel({ onClose }: StatisticsPanelProps) {
  // 自供给：数据类型定义经 appContext 取用，不再由 App 以 props 下发（B 方案 Slice 2）
  const { types } = useAppContext()
  const [tab, setTab] = useState<Tab>('overview')
  const [items, setItems] = useState<ItemRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [balanceType, setBalanceType] = useState('')

  useEffect(() => {
    let alive = true
    window.mbApi.data
      .listAll()
      .then((list) => {
        if (alive) setItems(list)
      })
      .catch((err: unknown) => {
        if (alive) setError(err instanceof Error ? err.message : String(err))
      })
    return () => {
      alive = false
    }
  }, [])

  const rows = useMemo(() => countByType(items ?? [], types), [items, types])
  const total = items?.length ?? 0
  const maxCount = rows.reduce((max, row) => Math.max(max, row.count), 0)

  // 有数值字段的类型才能做平衡性分析；默认选第一个
  const balanceTypes = useMemo(
    () => types.filter((def) => numericFieldNames(def).length > 0),
    [types]
  )
  const activeBalanceType = balanceType !== '' && balanceTypes.some((def) => def.id === balanceType)
    ? balanceType
    : (balanceTypes[0]?.id ?? '')

  const balanceDef = types.find((def) => def.id === activeBalanceType) ?? null
  const balanceItems = useMemo(
    () => (items ?? []).filter((item) => item.type === activeBalanceType),
    [items, activeBalanceType]
  )
  const summaries = useMemo(() => {
    if (balanceDef === null) return [] as NumericSummary[]
    const labels = new Map(balanceDef.formFields.map((field) => [field.name, field.label.replace(/[:：]\s*$/, '')]))
    return numericFieldNames(balanceDef)
      .map((field) => summarizeNumeric(balanceItems, field, labels.get(field) ?? field))
      .filter((summary): summary is NumericSummary => summary !== null)
  }, [balanceDef, balanceItems])

  return (
    <div className="editor" data-testid="stats-panel">
      <div className="editor-header">
        <div className="editor-title">
          数据统计
          <small>共 {total} 条数据</small>
        </div>
      </div>

      <div className="editor-body">
        <div className="qc-tabs">
          <button
            type="button"
            className={`qc-tab${tab === 'overview' ? ' active' : ''}`}
            data-testid="stats-tab-overview"
            onClick={() => setTab('overview')}
          >
            数据概览
          </button>
          <button
            type="button"
            className={`qc-tab${tab === 'balance' ? ' active' : ''}`}
            data-testid="stats-tab-balance"
            onClick={() => setTab('balance')}
          >
            平衡性分析
          </button>
        </div>

        {error !== null && <div className="error-banner">{error}</div>}
        {items === null && error === null && <div className="empty">正在统计…</div>}

        {items !== null && tab === 'overview' && (
          <>
            {total === 0 ? (
              <div className="empty" data-testid="stats-empty">
                暂无数据，先创建一些条目再来统计
              </div>
            ) : (
              <div className="qc-stat-list" data-testid="stats-overview">
                {rows
                  .filter((row) => row.count > 0)
                  .map((row) => (
                    <div key={row.type} className="qc-stat-row" data-testid="stats-row">
                      <span className="qc-stat-name">{row.name}</span>
                      <span className="qc-stat-bar">
                        <span
                          className="qc-stat-bar-fill"
                          style={{ width: `${maxCount === 0 ? 0 : (row.count / maxCount) * 100}%` }}
                        />
                      </span>
                      <span className="qc-stat-value">
                        {row.count}（{row.percent.toFixed(1)}%）
                      </span>
                    </div>
                  ))}
                <div className="qc-stat-total" data-testid="stats-total">
                  总数据量：{total} 项
                </div>
              </div>
            )}
          </>
        )}

        {items !== null && tab === 'balance' && (
          <>
            {balanceTypes.length === 0 ? (
              <div className="empty" data-testid="stats-no-balance">
                当前 schema 没有可用于平衡性分析的数值字段
              </div>
            ) : (
              <>
                <div className="form-row">
                  <label className="form-label" htmlFor="stats-balance-type">
                    分析类型
                  </label>
                  <select
                    id="stats-balance-type"
                    className="form-select"
                    data-testid="stats-balance-type"
                    value={activeBalanceType}
                    onChange={(event) => setBalanceType(event.target.value)}
                  >
                    {balanceTypes.map((def) => (
                      <option key={def.id} value={def.id}>
                        {def.name}
                      </option>
                    ))}
                  </select>
                </div>

                {balanceItems.length === 0 ? (
                  <div className="empty" data-testid="stats-no-items">
                    没有{balanceDef?.name ?? ''}数据
                  </div>
                ) : summaries.length === 0 ? (
                  <div className="empty" data-testid="stats-no-numeric">
                    没有有效的数值数据（字段为空或不可解析为数字）
                  </div>
                ) : (
                  <div className="qc-stat-list" data-testid="stats-balance">
                    <div className="qc-stat-total">
                      {balanceDef?.name}总数：{balanceItems.length}
                    </div>
                    {summaries.map((summary) => {
                      const verdict = assessBalance(summary.std, summary.avg)
                      return (
                        <div key={summary.field} className="qc-summary" data-testid="stats-summary">
                          <div className="qc-summary-title">{summary.label}</div>
                          <div className="qc-summary-grid">
                            <span>样本</span>
                            <span>{summary.count}</span>
                            <span>平均</span>
                            <span data-testid="stats-avg">{summary.avg.toFixed(2)}</span>
                            <span>标准差</span>
                            <span>{summary.std.toFixed(2)}</span>
                            <span>范围</span>
                            <span>
                              {summary.min.toFixed(2)} - {summary.max.toFixed(2)}
                            </span>
                          </div>
                          <div
                            className={`qc-verdict ${verdict}`}
                            data-testid="stats-verdict"
                          >
                            平衡性评估：{BALANCE_VERDICT_LABELS[verdict]}
                          </div>
                        </div>
                      )
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>

      <div className="editor-actions">
        <button type="button" className="btn" onClick={onClose}>
          关闭
        </button>
      </div>
    </div>
  )
}
