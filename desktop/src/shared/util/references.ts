import { isPlainObject } from './guards'
import type { DataTypeDef, ItemRecord } from '../types'

/**
 * 引用关系纯逻辑：
 * - 引用了谁 / 被谁引用：按 id 精确解析
 * - 相似数据：同类型字段重合度（共有键 ≥2，相似度 = 共有 / 并集，取前 20）
 * - 引用字段来源：schema 的 refType 字段（自动覆盖用户新增的多选引用）+ 下方文本引用字段补充表
 *   
 */

/** 文本引用字段补充表（值为 id / id 列表 / 逗号等分隔文本；无 refType 标注的跨条目指针） */
export const TEXT_REFERENCE_FIELDS: Record<string, string[]> = {
  story: ['dialog_ids', 'prev_story', 'next_story'],
  task: ['dialog_id'],
  dialog: ['next_dialog'],
  talent: ['owner']
}

export interface ReferenceField {
  field: string
  /** refType（复数键）仅作来源标记；解析统一按全局 id 查找 */
  refType: string | null
}

export interface ResolvedReference {
  field: string
  /** token 原文（未解析时用于展示） */
  raw: string
  /** 是否解析到条目 */
  resolved: boolean
  /** 目标条目 id（即 token） */
  targetId: string
  /** 解析到的条目类型（未解析为 null） */
  targetType: string | null
  /** 解析到的条目名称（未解析为 null） */
  targetName: string | null
}

export interface ReverseReference {
  /** 来源条目类型 */
  type: string
  itemId: string
  itemName: string
  field: string
  raw: string
}

export interface SimilarItem {
  itemId: string
  itemName: string
  /** 相似度百分比（0~100，向下取整） */
  similarity: number
  /** 共有字段名 */
  commonFields: string[]
}

export interface ReferenceReport {
  references: ResolvedReference[]
  referencedBy: ReverseReference[]
  similar: SimilarItem[]
}

/** 某类型参与引用扫描的字段：schema refType 字段 + 文本引用补充表（去重、保持定义顺序） */
export function referenceFieldsOf(types: DataTypeDef[], typeId: string): ReferenceField[] {
  const fields: ReferenceField[] = []
  const typeDef = types.find((def) => def.id === typeId)
  for (const field of typeDef?.formFields ?? []) {
    if (field.refType) fields.push({ field: field.name, refType: field.refType })
  }
  for (const name of TEXT_REFERENCE_FIELDS[typeId] ?? []) {
    if (!fields.some((item) => item.field === name)) fields.push({ field: name, refType: null })
  }
  return fields
}

/**
 * token 归一化：
 * 字符串按 、，,; 分隔；数组逐元素取（对象取 id）；对象取 id；null/数字等其余类型返回空。
 */
export function parseReferenceTokens(value: unknown): string[] {
  if (value === null || value === undefined) return []
  if (typeof value === 'string') {
    return value
      .split(/[、，,;]/)
      .map((token) => token.trim())
      .filter(Boolean)
  }
  if (Array.isArray(value)) {
    const tokens: string[] = []
    for (const entry of value) {
      if (typeof entry === 'string') {
        const token = entry.trim()
        if (token) tokens.push(token)
      } else if (isPlainObject(entry)) {
        const token = entry['id']
        if (typeof token === 'string' && token.trim()) tokens.push(token.trim())
      }
    }
    return tokens
  }
  if (isPlainObject(value)) {
    const token = value['id']
    return typeof token === 'string' && token.trim() ? [token.trim()] : []
  }
  return []
}

/** 计算指定条目的引用报告（引用了谁 / 被谁引用 / 相似数据） */
export function buildReferenceReport(
  types: DataTypeDef[],
  items: ItemRecord[],
  target: { id: string; type: string }
): ReferenceReport {
  const byId = new Map(items.map((item) => [item.id, item]))
  const self = byId.get(target.id)

  // 引用了谁：逐字段取 token，按全局 id 解析
  const references: ResolvedReference[] = []
  for (const { field } of referenceFieldsOf(types, target.type)) {
    for (const token of parseReferenceTokens(self?.data[field])) {
      const resolved = byId.get(token)
      references.push({
        field,
        raw: token,
        resolved: resolved !== undefined,
        targetId: token,
        targetType: resolved?.type ?? null,
        targetName: resolved ? itemName(resolved) : null
      })
    }
  }

  // 被谁引用：全库扫描（所有类型的所有引用字段）
  const referencedBy: ReverseReference[] = []
  for (const item of items) {
    for (const { field } of referenceFieldsOf(types, item.type)) {
      for (const token of parseReferenceTokens(item.data[field])) {
        if (token !== target.id) continue
        referencedBy.push({ type: item.type, itemId: item.id, itemName: itemName(item), field, raw: token })
      }
    }
  }

  // 相似数据：仅同类型、共有非空字段 ≥2
  const selfKeys = filledKeys(self?.data)
  const similar: SimilarItem[] = []
  for (const item of items) {
    if (item.type !== target.type || item.id === target.id) continue
    const keys = filledKeys(item.data)
    const common = keys.filter((key) => selfKeys.includes(key))
    if (common.length < 2) continue
    const union = new Set([...selfKeys, ...keys]).size
    similar.push({
      itemId: item.id,
      itemName: itemName(item),
      similarity: Math.floor((common.length * 100) / Math.max(union, 1)),
      commonFields: common.slice(0, 5)
    })
  }
  similar.sort((a, b) => b.similarity - a.similarity)

  return { references, referencedBy, similar: similar.slice(0, 20) }
}

function itemName(item: ItemRecord): string {
  const name = item.data['name']
  return typeof name === 'string' && name !== '' ? name : item.id
}

/** 非 id 且值非空的字段名 */
function filledKeys(data: Record<string, unknown> | undefined): string[] {
  if (!data) return []
  return Object.entries(data)
    .filter(([key, value]) => key !== 'id' && isTruthyValue(value))
    .map(([key]) => key)
}

/** 旧版 真值语义（''/0/false/空数组/空对象 为假） */
function isTruthyValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value !== ''
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (Array.isArray(value)) return value.length > 0
  if (isPlainObject(value)) return Object.keys(value).length > 0
  return true
}