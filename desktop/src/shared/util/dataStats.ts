/**
 * 数据统计与平衡性分析（迁移自 旧版 `ui/dialogs/statistics`，374 行）。
 *
 * ## 与 旧版 的一处**重要差异**（有实证，不是偷懒）
 * 旧版 `_analyze_roles` / `_analyze_monsters` 读的是扁平字段 `hp` / `atk` / `def`。
 * 但 TS 的默认 schema 里 **`role` 与 `monster` 都没有这些字段** —— 属性存在
 * `attr_list`（`attrpanel` 字段）里（`typeSchema.ts` 可查：role 只有 job/race/faction/…；
 * monster 只有 level/type/category/…）。**直译会得到永远只输出「总数 N」的死代码。**
 *
 * 故本移植改为**按 schema 自动发现数值字段**（`spinbox` 类型）：
 * - skill → `value`（基础数值）、`cd`（冷却）等
 * - monster → `level`（等级）
 * - role → 无扁平数值字段（属性在 attr_list），故只显示总数
 * 这样换 schema 后仍成立，不会因硬编码字段名失效而「静默变空」。
 *
 * ## 明确不迁
 * 旧版 的「📈 图表」标签页是 **matplotlib 占位符**（`_update_chart_overview` 只输出
 * 「完整的图表生成需要 matplotlib」+ ASCII 柱条）。TS 侧用 **CSS 柱条**真实渲染分布，
 * 不复制占位符。
 *
 * ## 键口径
 * 用**单数** `DataTypeDef.id`（`role`/`skill`），与 `items.type` 一致
 * （旧版 用的是复数 `roles`/`skills`，那是旧版平铺存储的键）。
 */

import type { DataTypeDef, ItemRecord } from '../types'

/** 平衡性判定阈值：标准差 < 均值 × 0.3 视为「良好」（对齐 旧版 `_analyze_skills`） */
export const BALANCE_STD_RATIO = 0.3

/** 均值；空数组返回 0（调用方按 count 判断是否展示） */
export function mean(values: readonly number[]): number {
  if (values.length === 0) return 0
  return values.reduce((sum, value) => sum + value, 0) / values.length
}

/**
 * 样本标准差（对齐 旧版 `statistics.stdev`，分母 n-1）；
 * 样本数 < 2 时返回 0（旧版 在此分支也是取 0，见 `_analyze_skills` 的三元表达式）。
 */
export function stdev(values: readonly number[]): number {
  if (values.length < 2) return 0
  const avg = mean(values)
  const variance = values.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (values.length - 1)
  return Math.sqrt(variance)
}

/** 平衡性评估：均值 ≤0 时无法按比例判定，退回 'needs_adjust'（不谎报「良好」） */
export function assessBalance(std: number, avg: number): 'good' | 'needs_adjust' {
  if (avg <= 0) return 'needs_adjust'
  return std < avg * BALANCE_STD_RATIO ? 'good' : 'needs_adjust'
}

export const BALANCE_VERDICT_LABELS: Readonly<Record<'good' | 'needs_adjust', string>> = {
  good: '良好：数值分布较为均匀，平衡性良好',
  needs_adjust: '需要调整：数值差异较大，建议调整以提高平衡性'
}

/** 某类型的条目数与占比 */
export interface TypeCountRow {
  /** 单数类型 id */
  type: string
  /** 显示名（取 schema 的 name，缺省退回 id） */
  name: string
  count: number
  /** 占总量的百分比（0–100；总量为 0 时为 0） */
  percent: number
}

/**
 * 按类型统计条目数。
 * 只统计 **schema 里存在**的类型（与 `quickCreate.filterQuickCreateTypes` 同理，
 * 避免把孤儿条目算进统计）；顺序沿用 `types` 的声明序。
 */
export function countByType(items: readonly ItemRecord[], types: readonly DataTypeDef[]): TypeCountRow[] {
  const total = items.length
  const counts = new Map<string, number>()
  for (const item of items) {
    counts.set(item.type, (counts.get(item.type) ?? 0) + 1)
  }
  return types.map((def) => {
    const count = counts.get(def.id) ?? 0
    return {
      type: def.id,
      name: def.name,
      count,
      percent: total === 0 ? 0 : (count / total) * 100
    }
  })
}

/**
 * 取出某类型的**数值字段名**（`spinbox`，且排除系统字段 `id`）。
 * 这是「自动发现」的落点：换 schema 后字段名变了也能继续工作。
 */
export function numericFieldNames(typeDef: DataTypeDef | null): string[] {
  if (typeDef === null) return []
  return typeDef.formFields.filter((field) => field.type === 'spinbox' && field.name !== 'id').map((f) => f.name)
}

/** 单个数值字段的统计摘要 */
export interface NumericSummary {
  field: string
  /** 字段显示名（去掉 旧版/TS 里表单标签的冒号后缀） */
  label: string
  /** 有效数值条数（无法解析为数字的条目被跳过，对齐 旧版 的 try/except） */
  count: number
  avg: number
  min: number
  max: number
  std: number
}

/** 把任意 data 值转成有限数字；无法转换返回 null（对齐 旧版 `float()` + try/except） */
function toFiniteNumber(value: unknown): number | null {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null
  if (typeof value === 'string') {
    const text = value.trim()
    if (text === '') return null
    const parsed = Number(text)
    return Number.isFinite(parsed) ? parsed : null
  }
  return null
}

/**
 * 统计某类型某数值字段。字段全为空/无法解析时返回 null（调用方据此显示「无有效数值数据」，
 * 对齐 旧版 的「没有有效的技能数值数据」）。
 */
export function summarizeNumeric(
  items: readonly ItemRecord[],
  field: string,
  label = field
): NumericSummary | null {
  const values: number[] = []
  for (const item of items) {
    const parsed = toFiniteNumber(item.data[field])
    if (parsed !== null) values.push(parsed)
  }
  if (values.length === 0) return null
  return {
    field,
    label,
    count: values.length,
    avg: mean(values),
    min: Math.min(...values),
    max: Math.max(...values),
    std: stdev(values)
  }
}
