import { useEffect, useMemo, useState } from 'react'

import { useT } from '@mobai/client-ui'
import { numericFieldNames } from '@mobai/shared/util/data'
import {
  barPercent,
  buildAttributeChart,
  formatChartValue,
  truncateName
} from '@mobai/shared/domain/attr/attributeChart'
import type { DataTypeDef, ItemRecord } from '@mobai/shared/types'

import { PanelShell, StateView } from '../common'

/**
 * 属性分布图表面板。
 *
 * ## 为什么下拉是「按 schema 自动发现」而不是照抄 旧版 的写死列表
 *
 * 旧版 `advanced:77,82` 把类型映射（技能/角色/怪物/装备/道具 → plural key）和
 * 属性名（`value`/`hp`/`mp`/`atk`/`def`/`level`）**全部硬编码**。但 TS schema 里这些类型
 * 并没有这些字段 —— 数值在 `attr_list` 里（见 `StatisticsPanel.tsx` 顶部同一处说明）。
 * 照抄的结果是：用户点开只能看到「❌ 没有找到可用的 hp 数据！」——
 * 一枚**能打开但永远空着**的控件，比不做更糟（项目铁律：宁缺勿错）。
 *
 * 故两个下拉都改为数据驱动：
 * - 类型下拉 = `types`（已注册 schema，含用户自建类型）
 * - 属性下拉 = `numericFieldNames()`（按 `spinbox` 字段自动发现）
 *
 * ## 键口径（易错）
 * `items.type` 存**单数** `DataTypeDef.id`（如 `role`），**不是** `pluralKey`（`roles`）。
 * 与 `dataStats.ts::countByType` 同一口径。
 *
 * ## 纯逻辑在 shared
 * 计算全在 `shared/attributeChart.ts`（有单测），本组件只做取数 + 渲染。
 */
interface AttributeChartPanelProps {
  types: DataTypeDef[]
}

export default function AttributeChartPanel({ types }: AttributeChartPanelProps) {
  const t = useT()
  const [items, setItems] = useState<ItemRecord[] | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [typeId, setTypeId] = useState('')
  const [field, setField] = useState('')

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

  /** 有数值字段的类型才出现在下拉里（没有就画不出图，列出来只是_noise） */
  const chartTypes = useMemo(
    () => types.filter((def) => numericFieldNames(def).length > 0),
    [types]
  )

  /*
   * 类型/字段的「回退到第一个可用值」用**惰性派生表达式**实现，不在 effect 里 setState
   * （react-hooks v7 的 `set-state-in-effect` 是 error）。
   * 用户显式选过就尊重用户的选择（state 非空），否则回退到列表首项 ——
   * 这样切换类型时字段自然跟着走，无需任何同步 effect。
   */
  const effectiveTypeId = chartTypes.some((def) => def.id === typeId) ? typeId : (chartTypes[0]?.id ?? '')

  const currentType = useMemo(
    () => chartTypes.find((def) => def.id === effectiveTypeId) ?? null,
    [chartTypes, effectiveTypeId]
  )

  const fieldNames = useMemo(() => numericFieldNames(currentType), [currentType])

  const effectiveField = fieldNames.includes(field) ? field : (fieldNames[0] ?? '')

  /** 过滤当前类型的条目（type 存单数 id）；传完整 ItemRecord，数值在 .data 下 */
  const rows = useMemo(
    () => (items ?? []).filter((item) => item.type === effectiveTypeId) as unknown as Record<string, unknown>[],
    [items, effectiveTypeId]
  )

  const chart = useMemo(
    () => (effectiveField === '' ? null : buildAttributeChart(rows, effectiveField)),
    [rows, effectiveField]
  )

  const max = chart?.stats.max ?? 0

  return (
    <PanelShell
      testId="attribute-chart-panel"
      toolbar={<span className="item-meta">{t('attributeChart.subtitle')}</span>}
    >
        {error !== null && <div className="error-banner">{error}</div>}

        {chartTypes.length === 0 && items !== null && error === null && (
          <StateView kind="empty" testId="chart-no-numeric-type" title={t('attributeChart.noNumericType')} />
        )}

        {chartTypes.length > 0 && (
          <>
            <div className="form-row">
              <label className="form-label" htmlFor="chart-type">
                {t('attributeChart.typeLabel')}
              </label>
              <div className="form-field">
                <select
                  id="chart-type"
                  data-testid="chart-type"
                  value={effectiveTypeId}
                  onChange={(e) => setTypeId(e.target.value)}
                >
                  {chartTypes.map((def) => (
                    <option key={def.id} value={def.id}>
                      {def.name}（{def.pluralKey}）
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <label className="form-label" htmlFor="chart-field">
                {t('attributeChart.fieldLabel')}
              </label>
              <div className="form-field">
                <select
                  id="chart-field"
                  data-testid="chart-field"
                  value={effectiveField}
                  onChange={(e) => setField(e.target.value)}
                >
                  {fieldNames.map((name) => (
                    <option key={name} value={name}>
                      {name}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            {items === null && error === null && <StateView kind="loading" title={t('attributeChart.loading')} />}

            {items !== null && rows.length === 0 && (
              <StateView kind="empty" testId="chart-no-items" title={t('attributeChart.noItems')} />
            )}

            {chart !== null && chart.data.length === 0 && rows.length > 0 && (
              <StateView
                kind="empty"
                testId="chart-no-values"
                title={t('attributeChart.noValues', { field: effectiveField })}
              />
            )}

            {chart !== null && chart.data.length > 0 && (
              <>
                <div className="qc-stat-list" data-testid="chart-rows">
                  {chart.data.slice(0, chart.shown).map((d, i) => (
                    <div className="qc-stat-row" key={`${d.id}-${d.name}-${i}`} data-testid={`chart-row-${i}`}>
                      <span className="qc-stat-name" title={d.name}>
                        {truncateName(d.name)}
                      </span>
                      <span className="qc-stat-bar">
                        <span
                          className="qc-stat-bar-fill"
                          data-testid={`chart-bar-${i}`}
                          style={{ width: `${barPercent(d.value, max)}%` }}
                        />
                      </span>
                      <span className="qc-stat-value">{formatChartValue(d.value)}</span>
                    </div>
                  ))}
                </div>

                {chart.truncated > 0 && (
                  <div className="empty" data-testid="chart-truncated">
                    {t('attributeChart.truncated', { count: chart.truncated, shown: chart.shown })}
                  </div>
                )}

                <div className="form-section" data-testid="chart-stats">
                  <strong>{t('attributeChart.statsTitle')}</strong>
                  <div>{t('attributeChart.statCount', { n: chart.stats.count })}</div>
                  <div>{t('attributeChart.statMin', { v: formatChartValue(chart.stats.min) })}</div>
                  <div>{t('attributeChart.statMax', { v: formatChartValue(chart.stats.max) })}</div>
                  <div>{t('attributeChart.statAvg', { v: chart.stats.avg.toFixed(1) })}</div>
                  <div>{t('attributeChart.statSum', { v: formatChartValue(chart.stats.sum) })}</div>
                </div>
              </>
            )}

            <div className="notice-banner">{t('attributeChart.hint')}</div>
          </>
        )}
    </PanelShell>
  )
}
