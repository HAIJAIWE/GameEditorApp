/**
 * 属性分布图表的纯计算逻辑（渲染层只负责画，逻辑全在这里以便单测覆盖）。
 *
 * ## 对应 PyQt 真源
 * `src/features/advanced.py:48` `show_attribute_charts()`：
 * 取某个数据类型下所有条目的某个数值字段，降序排序，画前 20 条的等宽字符条形图，
 * 末尾附「数量 / 最小 / 最大 / 平均 / 总和」统计。
 *
 * ## 三处刻意偏差（均有实证，不是照抄）
 *
 * ① **属性下拉按 schema 自动发现，而不是硬编码 `['value','hp','mp','atk','def','level']`**
 *    —— PyQt `advanced.py:82` 写死这 6 个名字，但 TS schema 里技能/角色/怪物/装备/道具
 *    都没有这些字段（数值在 `attr_list` 里）⇒ 照抄必然得到「没有可用数据」的空图，
 *    是一枚半假控件。改用 `numericFieldNames()`（`dataStats.ts:96`，按 `spinbox` 字段发现）
 *    后换 schema 也成立。与 `StatisticsPanel` 的同一处决策保持一致。
 *
 * ② **类型下拉按已注册 schema 列出，而不是硬编码「技能/角色/怪物/装备/道具」**
 *    —— PyQt `advanced.py:77` 的 `type_mapping` 把中文名写死到 plural key；
 *    TS 侧类型是数据驱动的（`DataTypeDef.pluralKey`），写死会漏掉用户自建类型。
 *    键口径提醒：`items.type` 存**单数** `DataTypeDef.id`（`role`），不是 `pluralKey`（`roles`）。
 *
 * ③ **条长用 CSS 像素而不是 `█` 字符**
 *    —— PyQt 用 `█` 拼 50 字符宽的等宽字条形图；TS 侧改用真实 `<div>` 柱条，
 *    同样按最大值归一化，但不依赖等宽字体、不受中文名宽度影响。与 `StatisticsPanel`
 *    「不复制 matplotlib 占位符」的取舍一致。
 */

/** 单个条目在图表里的一行 */
export interface ChartDatum {
  /** 条目 id（缺名时用它兜底，对齐 PyQt 的 `item.get("name","未命名")`） */
  id: string
  /** 条目名 */
  name: string
  /** 该字段的数值；非有限值不会进入数据点（对齐 PyQt 的 try/except continue） */
  value: number
}

/** 统计摘要（对应 PyQt 末尾的「📈 统计信息」块） */
export interface ChartStats {
  /** 有效数据点数量 */
  count: number
  min: number
  max: number
  avg: number
  sum: number
}

/** 一张完整图表 */
export interface AttributeChart {
  /** 数据点（已按 value 降序） */
  data: ChartDatum[]
  stats: ChartStats
  /** 实际画出来的条数（PyQt 限前 20） */
  shown: number
  /** 被截断的条数；0 表示全部画出 */
  truncated: number
}

/** 图表最多展示的条数（对齐 PyQt `data_points[:20]`） */
export const CHART_TOP_N = 20

/** 把任意 data 值转成有限数字；无法转换返回 null（对齐 PyQt 的 `float()` + try/except） */
function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const trimmed = value.trim()
    if (trimmed === '') return null
    const parsed = Number(trimmed)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/**
 * 取条目显示名：优先 `name`，其次 `id`，都没有则「未命名」（对齐 PyQt 的取值口径）
 *
 * 注意 `name` 可能被塞在 `data` 里（`ItemRecord` 的业务字段都在 `data` 下），
 * 与 `dataStats.ts::summarizeNumeric` 读 `item.data[field]` 同一口径。
 */
function displayName(raw: Record<string, unknown>, id: string): string {
  const name = raw.name
  if (typeof name === 'string' && name.trim() !== '') return name
  if (typeof name === 'number') return String(name)
  return id !== '' ? id : '未命名'
}

/** 图表数据行上限，供 UI 提示用（避免组件里散落魔数） */
export const CHART_NAME_MAX = 12

/** 截断显示名（PyQt `name[:12] + "..."`，TS 侧多留一个省略号宽度） */
export function truncateName(name: string): string {
  return name.length > CHART_NAME_MAX ? `${name.slice(0, CHART_NAME_MAX)}…` : name
}

/**
 * 从条目列表里抽出某个字段的分布数据。
 *
 * @param rows 该类型下的**完整条目**（`ItemRecord` 形状，业务字段在 `data` 下）
 * @param field 数值字段名
 */
export function buildAttributeChart(rows: readonly Record<string, unknown>[], field: string): AttributeChart {
  const points: ChartDatum[] = []
  for (const row of rows) {
    const id = typeof row.id === 'string' ? row.id : ''
    /*
     * 业务字段在 `ItemRecord.data` 下（`dataStats.ts::summarizeNumeric` 同一口径）；
     * 顶层也兜一层，方便直接喂「扁平对象」的调用方与测试。
     */
    const bag = (row.data !== null && typeof row.data === 'object' ? row.data : {}) as Record<string, unknown>
    const value = toFiniteNumber(bag[field] !== undefined ? bag[field] : row[field])
    if (value === null) continue
    points.push({ id, name: displayName(bag.name !== undefined ? bag : row, id), value })
  }
  // 降序；同值时按名称稳定排序，避免同值条目顺序抖动（PyQt 的 sort 是稳定排序）
  points.sort((a, b) => (b.value - a.value) || a.name.localeCompare(b.name, 'zh-CN'))

  const values = points.map((p) => p.value)
  const sum = values.reduce((acc, v) => acc + v, 0)
  const stats: ChartStats = {
    count: values.length,
    min: values.length > 0 ? Math.min(...values) : 0,
    max: values.length > 0 ? Math.max(...values) : 0,
    avg: values.length > 0 ? sum / values.length : 0,
    sum
  }
  const shown = Math.min(points.length, CHART_TOP_N)
  return { data: points, stats, shown, truncated: points.length - shown }
}

/** 单条数据点归一化后的柱条宽度百分比（0–100），用于 CSS 宽度 */
export function barPercent(value: number, max: number): number {
  if (max <= 0) return 0
  return Math.max(0, Math.min(100, (value / max) * 100))
}

/** 数值展示：整数不带小数点，小数保留 1 位（对齐 PyQt 的 `:6.0f` / `:3.0f` 观感） */
export function formatChartValue(value: number): string {
  return Number.isInteger(value) ? String(value) : value.toFixed(1)
}
