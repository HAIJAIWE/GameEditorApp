import { CHAPTER_KEYS, CHAPTER_LABELS, type CeshuDocument, type ChapterKey } from './ceshuConstants'
import { isPlainObject } from './ceshuModel'

/**
 * 版本链纯逻辑（自 Python ceshu_changelog.py + version_diff_dialog.compute_version_diff 匹平迁移）：
 * - 版本号递增：v1.0 → v1.1 → v1.2
 * - 版本 diff：章节字段扁平化比较（空值按新增/删除语义），systems 章按 enabled 状态比较
 * - 变更描述：added/removed/modified 三类人类可读文案
 */

export type CeshuDiffType = 'added' | 'removed' | 'modified' | 'unchanged'

export interface CeshuFieldDiff {
  chapter: ChapterKey
  /** 扁平化字段路径（如 user_personas.primary）或系统标签（如 battle (enabled)） */
  field: string
  diffType: CeshuDiffType
  oldValue: unknown
  newValue: unknown
}

export interface CeshuChangeItem {
  type: Exclude<CeshuDiffType, 'unchanged'>
  /** 章节中文标签 */
  chapter: string
  field: string
  old: string
  new: string
  description: string
}

export interface CeshuChangelogEntry {
  version: string
  date: string
  summary: string
  changes: CeshuChangeItem[]
}

export interface CeshuChangelog {
  entries: CeshuChangelogEntry[]
}

/** 归一化字段值（对应 Python _normalize_value）：null → ''；对象 → 键排序 JSON；其余 String */
export function normalizeValue(value: unknown): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'object') return stableStringify(value)
  return String(value)
}

/** 两个版本间的字段级 diff（仅返回有变化的字段可过滤 diffType !== 'unchanged'） */
export function computeCeshuDiff(oldDoc: CeshuDocument, newDoc: CeshuDocument): CeshuFieldDiff[] {
  const diffs: CeshuFieldDiff[] = []
  for (const key of CHAPTER_KEYS) {
    const oldData = oldDoc[key]
    const newData = newDoc[key]
    // 短路：章节结构相等则无差异（对应 Python old_data == new_data）
    if (normalizeValue(oldData) === normalizeValue(newData)) continue
    diffs.push(...(key === 'systems' ? diffSystems(oldData, newData) : diffChapterFlat(key, oldData, newData)))
  }
  return diffs
}

/** 生成两个版本之间的变更条目（对应 Python generate_changelog_between） */
export function buildChangelogEntry(
  oldDoc: CeshuDocument,
  newDoc: CeshuDocument,
  versionLabel: string,
  date: string
): CeshuChangelogEntry {
  const diffs = computeCeshuDiff(oldDoc, newDoc).filter((diff) => diff.diffType !== 'unchanged')
  let added = 0
  let removed = 0
  let modified = 0
  const changes: CeshuChangeItem[] = diffs.map((diff) => {
    if (diff.diffType === 'added') added++
    else if (diff.diffType === 'removed') removed++
    else modified++
    return {
      type: diff.diffType as CeshuChangeItem['type'],
      chapter: CHAPTER_LABELS[diff.chapter],
      field: diff.field,
      old: formatChangeValue(diff.oldValue),
      new: formatChangeValue(diff.newValue),
      description: buildChangeDescription(diff)
    }
  })
  const total = added + removed + modified
  return {
    version: versionLabel,
    date,
    summary: `新增 ${added} / 删除 ${removed} / 修改 ${modified}（共 ${total} 处）`,
    changes
  }
}

/** 变更描述文案（systems 章特殊处理，与 Python _build_change_description 一致） */
export function buildChangeDescription(diff: CeshuFieldDiff): string {
  if (diff.chapter === 'systems') {
    const systemId = diff.field.includes(' ') ? diff.field.split(' ')[0] : diff.field
    if (diff.diffType === 'added') return `启用系统 ${systemId}`
    if (diff.diffType === 'removed') return `禁用系统 ${systemId}`
    return `修改系统 ${systemId} 配置`
  }
  const oldText = formatChangeValue(diff.oldValue)
  const newText = formatChangeValue(diff.newValue)
  if (diff.diffType === 'added') return `新增字段 ${diff.field}：${newText}`
  if (diff.diffType === 'removed') return `删除字段 ${diff.field}（原值：${oldText}）`
  return `修改字段 ${diff.field}：${oldText} → ${newText}`
}

/** 变更值格式化（对象走紧凑 JSON，超长截断；对应 Python _format_value） */
export function formatChangeValue(value: unknown, maxLength = 80): string {
  let text: string
  if (value === null || value === undefined) text = '(空)'
  else if (typeof value === 'boolean') text = value ? '是' : '否'
  else if (typeof value === 'object') text = stableStringify(value)
  else text = String(value)
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

/** 计算下一个版本号：v1.0 → v1.1 → v1.2（对应 Python _next_version_label） */
export function nextVersionLabel(parentLabel: string, existingLabels: string[]): string {
  const parsed = parseVersionLabel(parentLabel) ?? [1, 0]
  const [major, parentMinor] = parsed
  const usedMinors = new Set<number>([parentMinor])
  for (const label of existingLabels) {
    const item = parseVersionLabel(label)
    if (item && item[0] === major) usedMinors.add(item[1])
  }
  return `v${major}.${Math.max(...usedMinors) + 1}`
}

/** 版本号解析（形如 v1.0 / 1.2.3 → [major, minor]；失败返回 null） */
export function parseVersionLabel(label: string): [number, number] | null {
  const matched = /^[vV]?(\d+)(?:\.(\d+))?/.exec(label.trim())
  if (!matched) return null
  return [Number(matched[1]), matched[2] === undefined ? 0 : Number(matched[2])]
}

/** 版本号排序比较（主策划在前由调用方处理；无效标签按 (0,0) 处理，对应 Python _sort_key） */
export function compareVersionLabels(left: string, right: string): number {
  const a = parseVersionLabel(left) ?? [0, 0]
  const b = parseVersionLabel(right) ?? [0, 0]
  return a[0] - b[0] || a[1] - b[1]
}

/** 普通章节 diff：字段扁平化后逐键比较 */
function diffChapterFlat(chapter: ChapterKey, oldData: unknown, newData: unknown): CeshuFieldDiff[] {
  const oldFlat = flattenChapter(isPlainObject(oldData) ? oldData : {})
  const newFlat = flattenChapter(isPlainObject(newData) ? newData : {})
  const keys = [...new Set([...Object.keys(oldFlat), ...Object.keys(newFlat)])].sort()
  return keys.map((field) => {
    const inOld = field in oldFlat
    const inNew = field in newFlat
    const oldValue = inOld ? oldFlat[field] : null
    const newValue = inNew ? newFlat[field] : null
    return { chapter, field, diffType: classifyFieldDiff(inOld, inNew, oldValue, newValue), oldValue, newValue }
  })
}

/** systems 章 diff：按系统比较 enabled 状态（key 缺失与 enabled=false 区分） */
function diffSystems(oldData: unknown, newData: unknown): CeshuFieldDiff[] {
  const oldSystems = isPlainObject(oldData) ? oldData : {}
  const newSystems = isPlainObject(newData) ? newData : {}
  const keys = [...new Set([...Object.keys(oldSystems), ...Object.keys(newSystems)])].sort()
  return keys.map((systemId) => {
    const oldEntry = oldSystems[systemId]
    const newEntry = newSystems[systemId]
    const oldEnabled = isPlainObject(oldEntry) && oldEntry.enabled === true
    const newEnabled = isPlainObject(newEntry) && newEntry.enabled === true
    const inOld = systemId in oldSystems
    const inNew = systemId in newSystems
    return {
      chapter: 'systems' as ChapterKey,
      field: `${systemId} (enabled)`,
      diffType: classifyFieldDiff(inOld, inNew, inOld ? oldEnabled : null, inNew ? newEnabled : null),
      oldValue: oldEnabled,
      newValue: newEnabled
    }
  })
}

/**
 * diff 分类（对应 Python _classify_field_diff）：
 * 归一化相等 → unchanged；旧缺失或旧值为空 → added；新缺失或新值为空 → removed；否则 modified。
 */
function classifyFieldDiff(inOld: boolean, inNew: boolean, oldValue: unknown, newValue: unknown): CeshuDiffType {
  const oldText = normalizeValue(oldValue)
  const newText = normalizeValue(newValue)
  if (oldText === newText) return 'unchanged'
  if (!inOld || oldText === '') return 'added'
  if (!inNew || newText === '') return 'removed'
  return 'modified'
}

/** 章节字段扁平化：简单字典（值均非 dict/list）与列表作为叶节点（对应 Python _flatten_chapter） */
function flattenChapter(data: Record<string, unknown>, prefix = ''): Record<string, unknown> {
  const result: Record<string, unknown> = {}
  for (const [key, value] of Object.entries(data)) {
    const path = prefix ? `${prefix}.${key}` : key
    if (isPlainObject(value) && !isLeafValue(value)) {
      Object.assign(result, flattenChapter(value, path))
    } else {
      result[path] = value
    }
  }
  return result
}

function isLeafValue(value: Record<string, unknown>): boolean {
  return Object.values(value).every((item) => !isPlainObject(item) && !Array.isArray(item))
}

/** 键排序的稳定 JSON（对应 Python json.dumps(sort_keys=True)，用于比较与显示） */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? String(value)
}