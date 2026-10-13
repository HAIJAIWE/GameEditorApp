/**
 * 高级搜索（迁移自 Python `ui/dialogs/advanced_search.py`，172 行）。
 *
 * ## 与审计描述的一处**更正**（有实证）
 * 审计原写「缺跨类型搜索/按字段选择/结果跳转」。但读 Python 源码可见：
 * - Python **是单类型搜索**（`type_combo` 选一个类型），**并没有跨类型搜索**；
 * - 按字段选择（`field_combo`：名称/ID/类型/描述）与结果跳转（双击 → 切 tab 选中）Python **都有**。
 * 故本刀移植的是 Python 真实能力（选类型 + 选字段 + 关键词 + 结果 + 跳转），
 * 并额外提供「全部类型」与「全部字段」两个 TS 增强项（Python 无，已在文档注明）。
 *
 * ## 口径
 * Python 的 `item['type']` 指**条目自己的字段**（如技能的「攻击/治疗」），
 * 对应 TS 的 `item.data['type']`；**不是** `item.type`（那是 schema 类型 id，如 `skill`）。
 * 关键字匹配沿用列表过滤的既有约定：小写、空格拆分多词、全部命中（AND）。
 */

import type { ItemRecord } from '../types'

/** 可选的搜索字段（对齐 Python field_combo 的 4 项） */
export const SEARCH_FIELD_OPTIONS: ReadonlyArray<{ value: string; label: string }> = [
  { value: 'name', label: '名称' },
  { value: 'id', label: 'ID' },
  { value: 'type', label: '类型' },
  { value: 'desc', label: '描述' }
]

/** 「全部字段」的哨兵值（TS 增强：Python 只能选单个字段） */
export const SEARCH_ALL_FIELDS = '__all__'

/** 「全部类型」的哨兵值（TS 增强：Python 只能选单个类型） */
export const SEARCH_ALL_TYPES = '__all__'

export interface AdvancedSearchParams {
  /** 关键词（大小写不敏感） */
  keyword: string
  /** 限定类型（单数 type id）；`SEARCH_ALL_TYPES` 表示不限 */
  type: string
  /** 限定字段；`SEARCH_ALL_FIELDS` 表示全部字段 */
  field: string
}

/** 取条目在某字段上的可搜索文本（非字符串一律转空串，不参与匹配） */
export function resolveSearchValue(item: ItemRecord, field: string): string {
  // id：以记录 id（uuid，内部权威键）为准；data.id 是外显的业务短序号，
  // 两者自 2026-10-13 起解耦（data.id 不再强制对齐记录 id），但都能定位条目
  if (field === 'id') return item.id
  const value = item.data[field]
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  return ''
}

/** 全部字段时参与匹配的文本：id + 所有字符串/数字字段值 */
function allFieldsText(item: ItemRecord): string {
  const parts = [item.id]
  for (const value of Object.values(item.data)) {
    if (typeof value === 'string') parts.push(value)
    else if (typeof value === 'number') parts.push(String(value))
  }
  return parts.join(' ')
}

/**
 * 执行高级搜索。
 * - 关键词为空 → 返回空数组（Python 在此弹窗提示「请输入搜索关键词」，不返回全量）
 * - 空格拆分多词，**全部命中**才保留（与列表过滤 `filterItemRecords` 同约定）
 * - 类型/字段哨兵值表示不限
 */
export function searchItems(items: readonly ItemRecord[], params: AdvancedSearchParams): ItemRecord[] {
  const normalized = params.keyword.trim().toLowerCase()
  if (normalized === '') return []
  const terms = normalized.split(/\s+/).filter((term) => term !== '')

  return items.filter((item) => {
    if (params.type !== SEARCH_ALL_TYPES && item.type !== params.type) return false
    const text =
      params.field === SEARCH_ALL_FIELDS
        ? allFieldsText(item)
        : resolveSearchValue(item, params.field)
    const haystack = text.toLowerCase()
    return terms.every((term) => haystack.includes(term))
  })
}

/** 结果行展示用：把匹配到的值截断，避免长描述撑破列表 */
export function truncateMatch(value: string, maxLength = 60): string {
  const flat = value.replace(/\s+/g, ' ').trim()
  return flat.length > maxLength ? `${flat.slice(0, maxLength)}…` : flat
}
