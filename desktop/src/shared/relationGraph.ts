import { isPlainObject } from './ceshuModel'
import { parseReferenceTokens, referenceFieldsOf } from './references'
import type { DataTypeDef, ItemRecord } from './types'

/**
 * 「关系图」面板纯逻辑（迁移自 Python `ui/widgets/relation_graph.py::RelationTablePanel`）：
 * 给定一个「主体」条目，列出它经由引用字段指向的关联数据
 * （来源字段 / 关联名称 / 类型 / ID / 描述），供表格式总览 + 双击跳转。
 *
 * 与 Python 的**有意差异**（同 `shared/references.ts` 头部声明，此处不另立一套真源）：
 * - 引用字段来源走 `referenceFieldsOf`（schema `refType` 字段 + 文本引用补充表），
 *   不再使用 Python `relation_graph.REFERENCE_FIELDS` 那份与 `reference_panel` 互相不一致的硬编码表。
 * - 类型中文名 / 颜色取自 schema（`DataTypeDef.name` / `.color`），不再另存
 *   `DATA_TYPE_LABELS` / `TYPE_COLORS` 两张常量表（两者在 Python 里只覆盖 12 个内置类型）。
 * - 主体信息摘要行跳过「空数组」字段（Python 对空列表会追加一条 `字段: ` 的空壳条目，属噪声）。
 */

export interface RelationRow {
  /** 来源字段：主体上承载该引用的字段名 */
  field: string
  /** 关联数据名称；未解析到时为 token 原文 */
  name: string
  /** 关联数据类型中文名（未解析为 null，表格显示「-」） */
  typeLabel: string | null
  /** 关联数据类型 id（未解析为 null；双击跳转用） */
  typeId: string | null
  /** 关联数据 id（未解析为 null，表格显示「-」） */
  targetId: string | null
  /** 描述：desc → description → effect → type，皆空则为空串 */
  detail: string
  /** 类型色（未解析为灰） */
  color: string
}

/** 未解析 / 未知类型的兜底色（对齐 Python `TYPE_COLORS.get(..., "#64748B")` 的缺省值） */
export const UNKNOWN_TYPE_COLOR = '#64748B'

/**
 * 构建主体的关联数据表行。
 *
 * @param types  全量类型定义（取中文名与颜色）
 * @param items  全量条目（跨类型；用于按 id 解析 token）
 * @param subject 主体条目
 *
 * 对齐 Python `_show_subject`：逐引用字段取 token；token 解析不到时仍出一行
 * （名称=tokn 原文，类型/ID/描述列留空，等宽占位由渲染层补「-」）。
 */
export function buildRelationRows(types: DataTypeDef[], items: ItemRecord[], subject: ItemRecord): RelationRow[] {
  const byId = new Map(items.map((item) => [item.id, item]))
  const typeOf = (typeId: string): DataTypeDef | undefined => types.find((def) => def.id === typeId)

  const rows: RelationRow[] = []
  for (const { field } of referenceFieldsOf(types, subject.type)) {
    for (const token of parseReferenceTokens(subject.data[field])) {
      const resolved = byId.get(token)
      if (resolved === undefined) {
        rows.push({
          field,
          name: token,
          typeLabel: null,
          typeId: null,
          targetId: null,
          detail: '',
          color: UNKNOWN_TYPE_COLOR
        })
        continue
      }
      const def = typeOf(resolved.type)
      rows.push({
        field,
        name: itemDisplayName(resolved),
        typeLabel: def?.name ?? resolved.type,
        typeId: resolved.type,
        targetId: resolved.id,
        detail: describeItem(resolved.data),
        color: def?.color ?? UNKNOWN_TYPE_COLOR
      })
    }
  }
  return rows
}

/**
 * 主体信息摘要行（对齐 Python `_show_subject` 的 `" | ".join(details[:8])`）：
 * 跳过 id / name，列表展开为 `a, b(name2)`，字符串/数字直接 `键: 值`，取前 8 段。
 */
export function buildSubjectDetailLine(subject: ItemRecord): string {
  const parts: string[] = []
  for (const [key, value] of Object.entries(subject.data)) {
    if (key === 'id' || key === 'name') continue
    if (Array.isArray(value)) {
      // 有意跳过空列表（见文件头「有意差异」）
      if (value.length === 0) continue
      parts.push(`${key}: ${value.map((entry) => (isPlainObject(entry) ? tokenLabel(entry) : String(entry))).join(', ')}`)
    } else if (typeof value === 'string') {
      if (value !== '') parts.push(`${key}: ${value}`)
    } else if (typeof value === 'number') {
      parts.push(`${key}: ${value}`)
    }
  }
  return parts.slice(0, 8).join(' | ')
}

/** 条目展示名（name 非空取 name，否则回落 id） */
export function itemDisplayName(item: ItemRecord): string {
  const name = item.data['name']
  return typeof name === 'string' && name !== '' ? name : item.id
}

/** 列表元素形如 `{id, name}` 时展示为 `名称(id)`（无 id 时仅名称） */
function tokenLabel(entry: Record<string, unknown>): string {
  const id = typeof entry['id'] === 'string' ? entry['id'] : ''
  const rawName = entry['name']
  const name = typeof rawName === 'string' ? rawName : id
  return id !== '' ? `${name}(${id})` : name
}

/** 描述列取值：desc → description → effect → type，第一个非空者 */
function describeItem(data: Record<string, unknown>): string {
  for (const key of ['desc', 'description', 'effect', 'type']) {
    const value = data[key]
    if (typeof value === 'string' && value !== '') return value
    if (typeof value === 'number') return String(value)
  }
  return ''
}
