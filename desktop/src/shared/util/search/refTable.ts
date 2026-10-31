/**
 * 引用表共享逻辑。
 *
 * 语义：某类型的「引用列表」字段（如角色的技能列表、天赋列表），
 * 存储格式 `[{ "id": "skills_1", "level": 5 }]` —— 仅存被引用条目 id 与触发等级，不冗余其它字段。
 *
 * ## 口径
 * - `load_data` 兼容三种历史写法：
 *   - dict 带 `id`    → `{ id, level }`（若同时带非空 `name` 也保留，便于显示，但 **id 为准**）
 *   - dict 带 `name`  → `{ name, level }`（无 id 的降级）
 *   - str             → `{ id: s, level: 0 }`
 * - `_on_cell_changed` 把 level 夹紧到 `max(0, min(999, v))`；非数值/非有限数一律归 0。
 * - 数据类型 schema 的 `id` 是**单数**（`skill`/`role`），`pluralKey` 是**复数**（`skills`/`roles`）；
 *   而 schema 里 multiselect 字段的 `refType` 值用的是**复数**（如 `'skills'`）。
 *   故解析时按 `id === refType || pluralKey === refType` 双向命中。
 */

import type { DataTypeDef } from '../../types'
import { isPlainObject } from '../object'

export interface ReferenceEntry {
  /** 被引用条目 id（新写入一律带 id；兼容旧数据可缺省） */
  id?: string
  /** 旧数据仅有名称时保留（无 id 的降级） */
  name?: string
  /** 触发等级 0~999 */
  level: number
}

export const REF_LEVEL_MIN = 0
export const REF_LEVEL_MAX = 999

/** 旧版 REF_TYPE_LABELS（复数键 → 中文），仅在 types 解析不到时兜底 */
export const REF_TYPE_LABELS: Record<string, string> = {
  skills: '技能',
  talents: '天赋',
  equips: '装备',
  items: '道具',
  monsters: '怪物',
  roles: '角色',
  achievements: '成就'
}

/** 判定 plain object（不引入外部依赖；数组与 null 排除） */

/**
 * 夹紧触发等级：非有限数（NaN/Infinity/-Infinity）→ 0；
 * 否则 `max(0, min(999, Math.trunc(v)))`（负数归 0，超上界归 999，小数向下截断）。
 */
export function clampRefLevel(value: number): number {
  if (!Number.isFinite(value)) return REF_LEVEL_MIN
  return Math.max(REF_LEVEL_MIN, Math.min(REF_LEVEL_MAX, Math.trunc(value)))
}

/**
 * 把 refType（可能是复数 `pluralKey`，也可能是单数 `id`）解析为 schema 中的单数 id。
 * 命中条件：`t.id === refType || t.pluralKey === refType`；找不到返回 `null`。
 */
export function resolveRefTypeId(refType: string, types: readonly DataTypeDef[]): string | null {
  const def = types.find((t) => t.id === refType || t.pluralKey === refType)
  return def ? def.id : null
}

/**
 * refType 的展示名：
 * 1. types 能解析到 → 返回 `def.name`；
 * 2. 否则查 REF_TYPE_LABELS（先按 refType 原值匹配；再把键单数化后匹配，
 *    以覆盖传入单数形式如 `'skill'` 的场景）；
 * 3. 仍无 → 返回 refType 原值。
 */
export function refTypeDisplayName(refType: string, types: readonly DataTypeDef[]): string {
  const resolvedId = resolveRefTypeId(refType, types)
  if (resolvedId !== null) {
    const def = types.find((t) => t.id === resolvedId)
    if (def) return def.name
  }

  for (const [key, label] of Object.entries(REF_TYPE_LABELS)) {
    if (key === refType) return label
  }
  for (const [key, label] of Object.entries(REF_TYPE_LABELS)) {
    if (key.endsWith('s') && key.slice(0, -1) === refType) return label
  }
  return refType
}

/**
 * 判断任意值能否作为引用表解析：
 * - `null` / `undefined` / `[]` → true；
 * - 数组时**每个元素**都必须是：非空字符串；或 plain object 且 `id` / `name` 之一为非空字符串；
 * - 非数组（非 null）→ false。
 */
export function canParseAsRefTable(value: unknown): boolean {
  if (value == null) return true
  if (!Array.isArray(value)) return false
  return value.every((entry) => {
    if (typeof entry === 'string') return entry !== ''
    if (isPlainObject(entry)) {
      return (
        (typeof entry.id === 'string' && entry.id !== '') ||
        (typeof entry.name === 'string' && entry.name !== '')
      )
    }
    return false
  })
}

/**
 * 把任意值规范化为 ReferenceEntry[]（忽略 entry 里除 id/name/level 外的其它键）：
 * - 非数组 → `[]`；
 * - string → `{ id: s, level: 0 }`（空串视为脏元素跳过）；
 * - object 有非空 string `id` → `{ id, level }`，若同时有非空 string `name` 则一并保留；
 * - object 仅有非空 `name` → `{ name, level }`；
 * - 其余元素跳过。level 经 `clampRefLevel(Number(entry.level ?? 0))`。
 */
export function normalizeRefEntries(value: unknown): ReferenceEntry[] {
  if (!Array.isArray(value)) return []

  const out: ReferenceEntry[] = []
  for (const entry of value) {
    if (typeof entry === 'string') {
      if (entry !== '') out.push({ id: entry, level: 0 })
      continue
    }
    if (isPlainObject(entry)) {
      const hasId = typeof entry.id === 'string' && entry.id !== ''
      const hasName = typeof entry.name === 'string' && entry.name !== ''
      const level = clampRefLevel(Number(entry.level ?? 0))
      if (hasId) {
        const item: ReferenceEntry = { id: entry.id as string, level }
        if (hasName) item.name = entry.name as string
        out.push(item)
      } else if (hasName) {
        out.push({ name: entry.name as string, level })
      }
    }
  }
  return out
}

/**
 * 序列化引用表：输出新对象数组，仅含 `id` / `name` / `level`（缺省的键不输出），
 * level 经 clampRefLevel；`id` 与 `name` 都缺失（含空串）的条目跳过。**保持输入顺序**。
 */
export function serializeRefEntries(entries: readonly ReferenceEntry[]): ReferenceEntry[] {
  const out: ReferenceEntry[] = []
  for (const entry of entries) {
    if (!isPlainObject(entry)) continue
    const id = typeof entry.id === 'string' && entry.id !== '' ? entry.id : undefined
    const name = typeof entry.name === 'string' && entry.name !== '' ? entry.name : undefined
    if (id === undefined && name === undefined) continue

    const item: ReferenceEntry = {
      ...(id !== undefined ? { id } : {}),
      ...(name !== undefined ? { name } : {}),
      level: clampRefLevel(Number(entry.level))
    }
    out.push(item)
  }
  return out
}
