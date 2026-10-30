import {
  CHAPTER_KEYS,
  CHAPTER_LABELS,
  visibleChapterKeys,
  type CeshuColumnDef,
  type CeshuFieldDef,
  type ChapterData,
  type ChapterKey,
  type GddScope
} from '../../../shared/ceshu/reference/ceshuConstants'
import { CESHU_CHAPTER_FIELDS, fieldLabelOf } from '../../../shared/ceshu/fields/ceshuFields'
import { isPlainObject } from '../../../shared/ceshu/model/ceshuModel'
import { splitRow, toRows } from '../../../shared/ceshu/workflow/ceshuPipeRows'
import { isMachineDataField } from '../../../shared/ceshu/workflow/ceshuStages'

/**
 * 导出器公用工具。
 * 供 markdown / html / docx / pptx / pdf 共用的字段格式化与章节渲染辅助。
 */

/** 空值显示符 */
export const EMPTY_PLACEHOLDER = '—'

/**
 * 空值判定：null / undefined / 空白字符串 / 空列表 / 空字典。
 * 注意：数值 0 与布尔 false 不视为空（业务上可能是有效值）。
 */
export function isEmptyValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value.trim() === ''
  if (Array.isArray(value)) return value.length === 0
  if (isPlainObject(value)) return Object.keys(value).length === 0
  return false
}

export interface FormatFieldOptions {
  /** 缩进层级，每层两个空格 */
  indent?: number
  /** 列表项前缀（docx 用 "- "，pptx 用 "• "） */
  bullet?: string
}

/**
 * 字段值 → 人类可读多行文本（空值统一返回 '—'）。
 * 与 旧版 format_field_value 行为一致：列表逐项加 bullet，字典按键值展开并对嵌套缩进。
 */
export function formatFieldValue(value: unknown, options: FormatFieldOptions = {}): string {
  const indent = options.indent ?? 0
  const bullet = options.bullet ?? '- '

  if (value === null || value === undefined) return EMPTY_PLACEHOLDER
  if (typeof value === 'string') return value.trim() ? value : EMPTY_PLACEHOLDER
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'number') return String(value)

  if (Array.isArray(value)) {
    if (value.length === 0) return EMPTY_PLACEHOLDER
    const prefix = '  '.repeat(indent) + bullet
    return value
      .map((item) => {
        if (isPlainObject(item)) {
          const parts = Object.entries(item)
            .filter(([, inner]) => !isEmptyValue(inner))
            .map(([key, inner]) => `${key}: ${formatScalar(inner)}`)
          return prefix + (parts.length > 0 ? parts.join(' | ') : '(空)')
        }
        if (typeof item === 'string') return prefix + item
        return prefix + String(item)
      })
      .join('\n')
  }

  if (isPlainObject(value)) {
    if (Object.keys(value).length === 0) return EMPTY_PLACEHOLDER
    const prefix = '  '.repeat(indent)
    return Object.entries(value)
      .map(([key, inner]) => {
        if (isPlainObject(inner) || Array.isArray(inner)) {
          const nested = formatFieldValue(inner, { indent: indent + 1, bullet })
          return `${prefix}${key}:\n${prefix}  ${nested}`
        }
        return `${prefix}${key}: ${formatFieldValue(inner, { indent, bullet })}`
      })
      .join('\n')
  }

  return String(value)
}

/** 列表内对象的标量显示 */
function formatScalar(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'number') return String(value)
  if (isPlainObject(value) || Array.isArray(value)) return JSON.stringify(value)
  return value === null || value === undefined ? EMPTY_PLACEHOLDER : String(value)
}

/** 系统分组：(已启用, 未启用)，顺序保持数据键序 */
export function classifySystems(data: ChapterData | undefined): Array<[string, ChapterData]>[] {
  const enabled: Array<[string, ChapterData]> = []
  const disabled: Array<[string, ChapterData]> = []
  for (const [systemId, systemData] of Object.entries(data ?? {})) {
    if (!isPlainObject(systemData)) continue
    if (systemData.enabled === true) {
      enabled.push([systemId, systemData])
    } else {
      disabled.push([systemId, systemData])
    }
  }
  return [enabled, disabled]
}

/** 字段定义（key → label/kind/columns）；schema 里没有的扩展键返回 undefined */
export function fieldDef(chapterKey: ChapterKey, key: string): CeshuFieldDef | undefined {
  return (CESHU_CHAPTER_FIELDS[chapterKey] ?? []).find((field) => field.key === key)
}

/** 字段中文标签（schema 外扩展键回退成 key 本身，至少不丢信息） */
export function fieldLabel(chapterKey: ChapterKey, key: string): string {
  return fieldLabelOf(chapterKey, key)
}

/** schema 阅读顺序索引（schema 外扩展键排到最后） */
function schemaOrder(chapterKey: ChapterKey): Map<string, number> {
  return new Map((CESHU_CHAPTER_FIELDS[chapterKey] ?? []).map((field, index) => [field.key, index]))
}

function bySchemaOrder(chapterKey: ChapterKey, keys: string[]): string[] {
  const order = schemaOrder(chapterKey)
  return keys.sort((a, b) => (order.get(a) ?? Number.MAX_SAFE_INTEGER) - (order.get(b) ?? Number.MAX_SAFE_INTEGER))
}

/**
 * 章节正文字段：按 **schema 阅读顺序**、跳过**机读字段**与**空值**。
 *
 * 与旧实现的区别：旧版是「必填在前 + 数据原序」，导出顺序和编辑器里看到的顺序对不上，
 * 还把 `ledger` / `numeric_assertions` 这类机读字段混进正文。现在正文只留人读字段、
 * 按 schema 顺序、不输出 `—` 空行；机读字段统一进「附录：验收与机读数据」。
 */
export function orderedFieldEntries(chapterKey: ChapterKey, data: ChapterData): Array<[string, unknown]> {
  const keys = Object.keys(data).filter(
    (key) => !isMachineDataField(chapterKey, key) && !isEmptyValue(data[key])
  )
  return bySchemaOrder(chapterKey, keys).map((key) => [key, data[key]] as [string, unknown])
}

/** 机读/验收字段（schema 顺序、跳过空值），供各格式的「附录：验收与机读数据」 */
export function machineFieldEntries(chapterKey: ChapterKey, data: ChapterData): Array<[string, unknown]> {
  const keys = Object.keys(data).filter(
    (key) => isMachineDataField(chapterKey, key) && !isEmptyValue(data[key])
  )
  return bySchemaOrder(chapterKey, keys).map((key) => [key, data[key]] as [string, unknown])
}

/** 表格化后的 pipeList：表头 + 数据行；无 `columns` 或空表返回 null（调用方回落成文本） */
export interface PipeTable {
  headers: string[]
  rows: string[][]
}

export function pipeTable(chapterKey: ChapterKey, key: string, value: unknown): PipeTable | null {
  const field = fieldDef(chapterKey, key)
  if (field?.kind !== 'pipeList' || field.columns === undefined || field.columns.length === 0) return null
  const rows = pipeRows(value, field.columns)
  return rows.length > 0 ? { headers: field.columns.map((column) => column.label), rows } : null
}

/** 管道行 → 二维字符串（兼容 `['a|b']` 与 `[{colKey: 值}]` 两种存储形态） */
function pipeRows(value: unknown, columns: readonly CeshuColumnDef[]): string[][] {
  if (Array.isArray(value) && value.some((item) => isPlainObject(item))) {
    const rows: string[][] = []
    for (const item of value) {
      if (!isPlainObject(item)) continue
      rows.push(columns.map((column) => formatScalar(item[column.key])))
    }
    return rows
  }
  return toRows(value).map((row) => {
    const cells = splitRow(row)
    return columns.map((_, index) => cells[index] ?? '')
  })
}

export interface VisibleChapterEntry {
  key: ChapterKey
  /** 全量章节序号 */
  index: number
}

/** 按档位返回导出章节及全局序号（lite 档只导出基础 9 章，序号仍用全局章号）；传 gameType / enabledModules 时再按品类与系统模块剔除 */
export function visibleChapterEntries(
  scope: GddScope,
  gameType?: unknown,
  enabledModules?: readonly ChapterKey[]
): VisibleChapterEntry[] {
  const visible = new Set(visibleChapterKeys(scope, gameType, enabledModules))
  return CHAPTER_KEYS.map((key, position) => ({ key, index: position + 1 })).filter((entry) => visible.has(entry.key))
}

/** 章节标题文本（如 "4. 第四章·游戏系统设计"；章号取自 `CHAPTER_LABELS`，勿在此硬编码） */
export function chapterHeading(entry: VisibleChapterEntry): string {
  return `${entry.index}. ${CHAPTER_LABELS[entry.key]}`
}

/** 章节锚点 id（ch1~ch18） */
export function chapterAnchor(index: number): string {
  return `ch${index}`
}