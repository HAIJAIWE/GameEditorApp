import { isPlainObject } from './guards'
/**
 * 掉落表纯逻辑。
 *
 * 数据模型与 旧版 保持一致：每条掉落只存 name（物品名），不含 id 引用，这是既有口径，
 * 迁移时不做「改成 id 引用」的增强。存储形状：
 *   [{ "name": "铁剑", "rate": 10, "count_min": 1, "count_max": 1 }]
 *
 * 夹紧规则对照 旧版 _on_cell_changed：
 *   rate        ∈ [0, 100]
 *   count_min   ∈ [1, 999]
 *   count_max   ∈ [1, 999]
 * 以及 DropSelectDialog._on_count_min_changed 的「min 超过 max 时把 max 抬到 min」。
 */

export interface DropEntry {
  name: string
  rate: number
  count_min: number
  count_max: number
}

export const DROP_RATE_MIN = 0
export const DROP_RATE_MAX = 100
export const DROP_COUNT_MIN = 1
export const DROP_COUNT_MAX = 999

/** 掉率夹紧：非有限数 → 0；否则 [0,100] 内取整 */
export function clampDropRate(value: number): number {
  if (!Number.isFinite(value)) return DROP_RATE_MIN
  return Math.max(DROP_RATE_MIN, Math.min(DROP_RATE_MAX, Math.trunc(value)))
}

/** 数量夹紧：非有限数 → 1；否则 [1,999] 内取整 */
export function clampDropCount(value: number): number {
  if (!Number.isFinite(value)) return DROP_COUNT_MIN
  return Math.max(DROP_COUNT_MIN, Math.min(DROP_COUNT_MAX, Math.trunc(value)))
}

/** 保证 min<=max */
export function normalizeDropRange(min: number, max: number): { min: number; max: number } {
  const lo = clampDropCount(min)
  const hi = clampDropCount(max)
  return { min: lo, max: hi < lo ? lo : hi }
}

/**
 * 字段名 → 选库来源的类型 id（单数）：equip_drops → 'equip'，其余 → 'item'。
 *
 * 与 旧版 DropSelectDialog 一致：`equip_drops` 读 equips（装备），否则读 items（道具）。
 * 既有瑕疵（照搬勿改）：title_drops（称号掉落）在 旧版 里也落到 items，因此这里同样返回 'item'。
 */
export function dropSourceTypeId(fieldName: string): string {
  return fieldName === 'equip_drops' ? 'equip' : 'item'
}

/**
 * 字段名 → 来源中文标签：equip_drops → '装备'，其余 → '道具'。
 *
 * 对应 旧版 `'装备' if data_type == 'equip_drops' else '道具'`。
 * 既有瑕疵（照搬勿改）：title_drops 同样显示为「道具」。
 */
export function dropSourceLabel(fieldName: string): string {
  return fieldName === 'equip_drops' ? '装备' : '道具'
}

/**
 * 是否可作为掉落表解析：
 *   - null / undefined → true（空数据）
 *   - [] → true
 *   - 数组时每个元素必须是非 null 的 plain object 且 name 为非空字符串
 *   - 其余（字符串、数字、普通对象等）→ false
 */
export function canParseAsDropTable(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (!Array.isArray(value)) return false
  return value.every(
    (entry) => isPlainObject(entry) && typeof entry.name === 'string' && entry.name.length > 0
  )
}

/** 将单个未知值规整为 DropEntry；不合法（非 plain object / name 非空字符串）返回 null */
function toDropEntry(entry: unknown): DropEntry | null {
  if (!isPlainObject(entry)) return null
  const name = entry.name
  if (typeof name !== 'string' || name.length === 0) return null
  const rate = clampDropRate(Number(entry.rate ?? 0))
  const range = normalizeDropRange(Number(entry.count_min ?? 1), Number(entry.count_max ?? 1))
  // 只保留这四个键，丢弃其它键
  return { name, rate, count_min: range.min, count_max: range.max }
}

/**
 * 规整为掉落表数组：
 *   - 非数组 → []
 *   - 每项：name 为非空字符串才保留；缺省 rate=0、count_min/count_max=1 后夹紧
 *   - 输出仅含 { name, rate, count_min, count_max } 四键
 */
export function normalizeDropEntries(value: unknown): DropEntry[] {
  if (!Array.isArray(value)) return []
  const result: DropEntry[] = []
  for (const entry of value) {
    const normalized = toDropEntry(entry)
    if (normalized) result.push(normalized)
  }
  return result
}

/** 序列化掉落表：与 normalize 同产物形状，保持输入顺序，name 为非空字符串才输出 */
export function serializeDropEntries(entries: readonly DropEntry[]): DropEntry[] {
  const result: DropEntry[] = []
  for (const entry of entries) {
    const serialized = toDropEntry(entry)
    if (serialized) result.push(serialized)
  }
  return result
}
