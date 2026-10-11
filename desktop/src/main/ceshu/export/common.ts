import {
  CHAPTER_KEYS,
  CHAPTER_LABELS,
  CHAPTER_REQUIRED_FIELDS,
  visibleChapterKeys,
  type ChapterData,
  type ChapterKey,
  type GddScope
} from '../../../shared/ceschu/ceshuConstants'
import { isPlainObject } from '../../../shared/ceschu/ceshuModel'

/**
 * 导出器公用工具（自 Python ceshu_export_common.py 匹平迁移）。
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
 * 与 Python format_field_value 行为一致：列表逐项加 bullet，字典按键值展开并对嵌套缩进。
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

/** 列表内对象的标量显示（字符串原样、布尔中文、其余紧凑 JSON，对应 Python str(v) 的效果） */
function formatScalar(value: unknown): string {
  if (typeof value === 'string') return value
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'number') return String(value)
  if (isPlainObject(value) || Array.isArray(value)) return JSON.stringify(value)
  return value === null || value === undefined ? EMPTY_PLACEHOLDER : String(value)
}

/** 系统分组：(已启用, 未启用)，顺序保持数据键序（对齐 Python classify_systems） */
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

/**
 * 章节字段渲染顺序：必填字段在前（按 CHAPTER_REQUIRED_FIELDS 顺序），其余键按数据原顺序。
 * 与 Python 导出器的 ordered_keys 规则一致；仅返回数据中实际存在的键。
 */
export function orderedFieldEntries(chapterKey: ChapterKey, data: ChapterData): Array<[string, unknown]> {
  const required = CHAPTER_REQUIRED_FIELDS[chapterKey]
  const optional = Object.keys(data).filter((key) => !required.includes(key))
  const ordered = [...required, ...optional]
  return ordered.filter((key) => key in data).map((key) => [key, data[key]])
}

export interface VisibleChapterEntry {
  key: ChapterKey
  /** 全量章节序号（1 起，与 Python 导出锚点 ch1~ch18 一致） */
  index: number
}

/** 按档位返回导出章节及全局序号（lite 档只导出基础 9 章，序号仍用全局章号） */
export function visibleChapterEntries(scope: GddScope): VisibleChapterEntry[] {
  const visible = new Set(visibleChapterKeys(scope))
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