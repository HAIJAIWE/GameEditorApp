import { CHAPTER_LABELS, type ChapterKey } from './ceshuConstants'
import { isPlainObject } from './ceshuModel'
import { CHAPTER_TEMPLATES } from '../domain/ceshu/ceshuTemplateData'

/**
 * 章节模板库纯逻辑（自 Python `ui/ceshu/chapter_templates.py` + `template_picker_dialog.py` 匹平迁移）：
 * - 内置模板查询：按章列表 / 跨章搜索 / 按名取用 / 每章数量统计
 * - 合并策略三模式：仅填充空字段（`merge_template_to_chapter`）/ 覆盖 / 追加（`_merge_data`）
 * - 模板预览树（`_render_data_html` 的结构等价表达，渲染层负责样式）
 * 数据本体见 `shared/ceshuTemplateData.ts`（由 Python 数据池机械转换）。
 */

export interface ChapterTemplate {
  /** 模板名称（展示与搜索匹配） */
  name: string
  /** 模板描述（提示与搜索匹配） */
  description: string
  /** 标签列表（搜索匹配） */
  tags: string[]
  /** 与 CeshuModel.get_chapter(key) 字段对齐的数据 */
  data: Record<string, unknown>
  /** 无数据模板的展示提示（如 systems 预设说明），不参与合并 */
  note?: string
}

export type TemplateApplyMode = 'fillEmpty' | 'overwrite' | 'append'

/** 应用模式顺序与文案（与 Python ApplyMode + 下拉项文案一致） */
export const TEMPLATE_APPLY_MODES: TemplateApplyMode[] = ['fillEmpty', 'overwrite', 'append']

export const TEMPLATE_APPLY_MODE_LABELS: Record<TemplateApplyMode, string> = {
  fillEmpty: '仅填充空字段（推荐，不覆盖现有内容）',
  overwrite: '覆盖现有字段（替换为模板内容）',
  append: '追加到字段末尾（仅文本字段）'
}

/** 应用模式短标签（提示语用，不含括号补充说明） */
export const TEMPLATE_APPLY_MODE_SHORT_LABELS: Record<TemplateApplyMode, string> = {
  fillEmpty: '仅填充空字段',
  overwrite: '覆盖现有字段',
  append: '追加到字段末尾'
}

/** 无数据模板的兜底提示（对应 Python `tpl.get("note", "此章节无模板数据")`） */
export const TEMPLATE_NO_DATA_HINT = '(此章节无模板数据)'

/** 跨章搜索结果项（保留章节归属，供列表展示） */
export interface ChapterTemplateHit {
  chapterKey: string
  template: ChapterTemplate
}

/** 取指定章节的模板列表（章节不存在返回空数组，不抛异常） */
export function listChapterTemplates(chapterKey: string): ChapterTemplate[] {
  return CHAPTER_TEMPLATES[chapterKey] ?? []
}

/**
 * 跨章节搜索：关键词大小写不敏感，匹配 name / description / tags（子串）。
 * 空关键词返回全部模板；顺序按数据池的章节顺序与每章模板顺序。
 */
export function searchChapterTemplates(keyword = ''): ChapterTemplateHit[] {
  const all = Object.entries(CHAPTER_TEMPLATES).flatMap(([chapterKey, templates]) =>
    templates.map((template) => ({ chapterKey, template }))
  )
  if (!keyword) return all
  const kw = keyword.toLowerCase()
  return all.filter(({ template }) => chapterTemplateMatches(template, kw))
}

/** 单模板是否命中关键词（已小写化） */
export function chapterTemplateMatches(template: ChapterTemplate, lowerKeyword: string): boolean {
  const tags = (template.tags ?? []).join(' ').toLowerCase()
  return (
    template.name.toLowerCase().includes(lowerKeyword) ||
    (template.description ?? '').toLowerCase().includes(lowerKeyword) ||
    tags.includes(lowerKeyword)
  )
}

/**
 * 按章节 + 关键词筛选（对应 Python `_load_templates`）：
 * 指定章节且无关键词 → 直接取该章列表；否则先全局搜索再按章节过滤。
 */
export function filterChapterTemplates(chapterKey: string, keyword: string): ChapterTemplateHit[] {
  const trimmed = keyword.trim()
  if (chapterKey && !trimmed) {
    return listChapterTemplates(chapterKey).map((template) => ({ chapterKey, template }))
  }
  const hits = searchChapterTemplates(trimmed)
  return chapterKey ? hits.filter((hit) => hit.chapterKey === chapterKey) : hits
}

/** 按名称精确取模板（章节不存在或无同名模板返回 null） */
export function getChapterTemplateByName(chapterKey: string, name: string): ChapterTemplate | null {
  return listChapterTemplates(chapterKey).find((template) => template.name === name) ?? null
}

/** 每章模板数量统计（键顺序与数据池一致） */
export function chapterTemplateSummary(): Record<string, number> {
  const result: Record<string, number> = {}
  for (const [chapterKey, templates] of Object.entries(CHAPTER_TEMPLATES)) {
    result[chapterKey] = templates.length
  }
  return result
}

/** 全部内置模板数量（18 章 34 个） */
export function countChapterTemplates(): number {
  return Object.values(CHAPTER_TEMPLATES).reduce((sum, templates) => sum + templates.length, 0)
}

/** 章节中文标签（未知键原样返回，对应 Python CHAPTER_LABELS.get(key, key)） */
export function templateChapterLabel(chapterKey: string): string {
  return CHAPTER_LABELS[chapterKey as ChapterKey] ?? chapterKey
}

/**
 * 字段是否视为「空」（对应 Python `_is_empty_field`，即 `value in (None, "", [], {})`）：
 * 数值 0 与布尔 false 是有效值，**不**视为空。
 */
export function isTemplateEmptyField(value: unknown): boolean {
  if (value === null || value === undefined || value === '') return true
  if (Array.isArray(value)) return value.length === 0
  if (isPlainObject(value)) return Object.keys(value).length === 0
  return false
}

/**
 * 把模板数据合并到章节数据（对应 Python `merge_template_to_chapter`）：
 * overwrite=true 直接覆盖同名字段；false 仅填充空字段。返回新对象，不改原数据。
 */
export function mergeTemplateToChapter(
  chapterData: unknown,
  templateData: unknown,
  overwrite = false
): Record<string, unknown> {
  const base = isPlainObject(chapterData) ? chapterData : {}
  if (!isPlainObject(templateData)) return { ...base }
  const result: Record<string, unknown> = { ...base }
  for (const [key, value] of Object.entries(templateData)) {
    if (overwrite) result[key] = value
    else if (isTemplateEmptyField(result[key])) result[key] = value
  }
  return result
}

/**
 * 按应用模式合并（对应 Python `TemplatePickerDialog._merge_data`）：
 * - overwrite：模板字段优先，保留现有非模板字段
 * - append：文本字段追加（换行分隔）；现有为空则直接填入；非文本字段保留现有
 * - fillEmpty：仅填充空字段
 */
export function mergeTemplateByMode(
  existing: unknown,
  templateData: unknown,
  mode: TemplateApplyMode
): Record<string, unknown> {
  const current = isPlainObject(existing) ? existing : {}
  if (!isPlainObject(templateData)) return { ...current }

  if (mode === 'overwrite') {
    const merged: Record<string, unknown> = { ...templateData }
    for (const [key, value] of Object.entries(current)) {
      if (!(key in merged)) merged[key] = value
    }
    return merged
  }

  if (mode === 'append') {
    const merged: Record<string, unknown> = { ...current }
    for (const [key, value] of Object.entries(templateData)) {
      const cur = merged[key] ?? ''
      if (typeof cur === 'string' && typeof value === 'string' && cur && value) {
        merged[key] = `${cur}\n${value}`
      } else if (isTemplateEmptyField(cur)) {
        merged[key] = value
      }
    }
    return merged
  }

  return mergeTemplateToChapter(current, templateData, false)
}

/** 合并后字段数（用于「共 N 个字段」提示） */
export function countTemplateFields(data: unknown): number {
  return isPlainObject(data) ? Object.keys(data).length : 0
}

/* ---- 预览树 ---- */

export interface TemplatePreviewRow {
  /** 缩进层级（0 起） */
  depth: number
  /** 分组标题行 / 列表项行 / 值行 */
  kind: 'group' | 'item' | 'value'
  /** 展示文本（值行已含「键名: 值」） */
  text: string
  /** 键路径（列表项为 parent[i]） */
  path: string
}

/** 模板数据的层级预览行（对应 Python `_render_data_html` 的遍历顺序与结构） */
export function buildTemplatePreview(data: unknown): TemplatePreviewRow[] {
  const rows: TemplatePreviewRow[] = []
  appendTemplatePreview(rows, data, 0, '')
  return rows
}

function appendTemplatePreview(rows: TemplatePreviewRow[], value: unknown, depth: number, path: string): void {
  if (!isPlainObject(value)) {
    rows.push({ depth, kind: 'value', text: formatTemplateValue(value), path })
    return
  }
  for (const [key, item] of Object.entries(value)) {
    const childPath = path ? `${path}.${key}` : key
    if (isPlainObject(item)) {
      rows.push({ depth, kind: 'group', text: `${key}:`, path: childPath })
      appendTemplatePreview(rows, item, depth + 1, childPath)
    } else if (Array.isArray(item)) {
      rows.push({ depth, kind: 'group', text: `${key}:`, path: childPath })
      item.forEach((entry, index) => {
        const entryPath = `${childPath}[${index}]`
        if (isPlainObject(entry)) appendTemplatePreview(rows, entry, depth + 1, entryPath)
        else rows.push({ depth: depth + 1, kind: 'item', text: `- ${formatTemplateValue(entry)}`, path: entryPath })
      })
    } else {
      rows.push({ depth, kind: 'value', text: `${key}: ${formatTemplateValue(item)}`, path: childPath })
    }
  }
}

/** 预览值展示：null/空串 → (空)；布尔 → 是/否；对象 → JSON；其余 String */
export function formatTemplateValue(value: unknown): string {
  if (value === null || value === undefined || value === '') return '(空)'
  if (typeof value === 'boolean') return value ? '是' : '否'
  if (typeof value === 'object') return JSON.stringify(value) ?? ''
  return String(value)
}