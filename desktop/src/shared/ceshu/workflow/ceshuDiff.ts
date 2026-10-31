import { CHAPTER_KEYS, CHAPTER_LABELS, type CeshuDocument, type ChapterKey } from '../reference'
import { isPlainObject } from '../model'

/**
 * 版本链纯逻辑：
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

/** 归一化字段值：null → ''；对象 → 键排序 JSON；其余 String */
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
    // 短路：章节结构相等则无差异
    if (normalizeValue(oldData) === normalizeValue(newData)) continue
    diffs.push(...(key === 'systems' ? diffSystems(oldData, newData) : diffChapterFlat(key, oldData, newData)))
  }
  return diffs
}

/** 生成两个版本之间的变更条目 */
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

/** 变更描述文案 */
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

/** 变更值格式化 */
export function formatChangeValue(value: unknown, maxLength = 80): string {
  let text: string
  if (value === null || value === undefined) text = '(空)'
  else if (typeof value === 'boolean') text = value ? '是' : '否'
  else if (typeof value === 'object') text = stableStringify(value)
  else text = String(value)
  return text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

/** 计算下一个版本号：v1.0 → v1.1 → v1.2 */
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

/** 版本号排序比较 */
export function compareVersionLabels(left: string, right: string): number {
  const a = parseVersionLabel(left) ?? [0, 0]
  const b = parseVersionLabel(right) ?? [0, 0]
  return a[0] - b[0] || a[1] - b[1]
}

/* ---- 版本对比 ---- */

export interface CeshuVersionFieldDiff {
  /** 字段路径（如 meta.game_name / systems.battle.enabled） */
  field_path: string
  /** 字段显示名（如 game_name / battle (enabled)） */
  field_label: string
  old_value: unknown
  new_value: unknown
  diff_type: CeshuDiffType
}

export interface CeshuChapterDiff {
  chapter_key: ChapterKey
  chapter_label: string
  /** 该章全部字段的 diff（含 unchanged） */
  field_diffs: CeshuVersionFieldDiff[]
  added_count: number
  removed_count: number
  modified_count: number
  unchanged_count: number
}

export interface CeshuVersionDiff {
  old_version_label: string
  new_version_label: string
  old_ceshu_id: string
  new_ceshu_id: string
  chapter_diffs: CeshuChapterDiff[]
  total_added: number
  total_removed: number
  total_modified: number
  total_unchanged: number
}

/** 变更类型展示映射 */
export const DIFF_DISPLAY: Record<CeshuDiffType, { text: string; color: string }> = {
  added: { text: '✚ 新增', color: '#22C55E' },
  removed: { text: '✖ 删除', color: '#EF4444' },
  modified: { text: '✎ 修改', color: '#F59E0B' },
  unchanged: { text: '未变', color: '#888888' }
}

/** 章节变更总数（新增 + 删除 + 修改） */
export function chapterTotalChanges(chapterDiff: CeshuChapterDiff): number {
  return chapterDiff.added_count + chapterDiff.removed_count + chapterDiff.modified_count
}

/** 报告变更总数 */
export function versionDiffTotalChanges(diff: CeshuVersionDiff): number {
  return diff.total_added + diff.total_removed + diff.total_modified
}

/**
 * 字段值格式化：null → (空)；bool → 是/否；对象 → JSON；其余 String。
 * maxLength > 0 时截断并补省略号（对应 _iter_changed_renders 的 max_len）。
 */
export function formatDiffValue(value: unknown, maxLength = 0): string {
  let text: string
  if (value === null || value === undefined) text = '(空)'
  else if (typeof value === 'boolean') text = value ? '是' : '否'
  else if (typeof value === 'object') text = JSON.stringify(value) ?? String(value)
  else text = String(value)
  return maxLength > 0 && text.length > maxLength ? `${text.slice(0, maxLength)}...` : text
}

/**
 * 两个版本之间的完整章节级 Diff：
 * 章节相等时短路（仅按旧章扁平键数计未变）；否则逐字段分类计数（含 unchanged）。
 */
export function buildVersionDiff(oldDoc: CeshuDocument, newDoc: CeshuDocument): CeshuVersionDiff {
  const chapter_diffs: CeshuChapterDiff[] = []
  let totalAdded = 0
  let totalRemoved = 0
  let totalModified = 0
  let totalUnchanged = 0

  for (const key of CHAPTER_KEYS) {
    const label = CHAPTER_LABELS[key]
    const oldData = oldDoc[key]
    const newData = newDoc[key]
    let chapterDiff: CeshuChapterDiff
    if (normalizeValue(oldData) === normalizeValue(newData)) {
      // 章节相等：不展开字段，未变数按旧章扁平键数近似
      const flat = flattenChapter(isPlainObject(oldData) ? oldData : {})
      chapterDiff = {
        chapter_key: key,
        chapter_label: label,
        field_diffs: [],
        added_count: 0,
        removed_count: 0,
        modified_count: 0,
        unchanged_count: Object.keys(flat).length
      }
    } else if (key === 'systems') {
      chapterDiff = versionDiffSystems(key, label, oldData, newData)
    } else {
      chapterDiff = versionDiffFlat(key, label, oldData, newData)
    }
    chapter_diffs.push(chapterDiff)
    totalAdded += chapterDiff.added_count
    totalRemoved += chapterDiff.removed_count
    totalModified += chapterDiff.modified_count
    totalUnchanged += chapterDiff.unchanged_count
  }

  return {
    old_version_label: oldDoc.version_label,
    new_version_label: newDoc.version_label,
    old_ceshu_id: oldDoc.ceshu_id,
    new_ceshu_id: newDoc.ceshu_id,
    chapter_diffs,
    total_added: totalAdded,
    total_removed: totalRemoved,
    total_modified: totalModified,
    total_unchanged: totalUnchanged
  }
}

/** 版本对比 Markdown 报告 */
export function buildVersionDiffMarkdown(diff: CeshuVersionDiff, timestamp: string): string {
  const lines: string[] = [
    '# 版本对比报告',
    '',
    `- **旧版本**: ${diff.old_version_label} (${diff.old_ceshu_id})`,
    `- **新版本**: ${diff.new_version_label} (${diff.new_ceshu_id})`,
    `- **对比时间**: ${timestamp}`,
    '',
    '## 变更统计',
    '',
    `- ✚ 新增字段: ${diff.total_added}`,
    `- ✖ 删除字段: ${diff.total_removed}`,
    `- ✎ 修改字段: ${diff.total_modified}`,
    `- 未变字段: ${diff.total_unchanged}`,
    `- 总变更: ${versionDiffTotalChanges(diff)}`,
    '',
    '## 章节明细',
    ''
  ]
  for (const chapter of diff.chapter_diffs) {
    if (chapterTotalChanges(chapter) === 0) {
      lines.push(`### ${chapter.chapter_label} — 未变`, '')
      continue
    }
    lines.push(`### ${chapter.chapter_label}`, '')
    lines.push(
      `新增 ${chapter.added_count} | 删除 ${chapter.removed_count} | 修改 ${chapter.modified_count} | 未变 ${chapter.unchanged_count}`,
      ''
    )
    lines.push('| 字段 | 旧值 | 新值 | 类型 |', '|------|------|------|------|')
    for (const field of chapter.field_diffs) {
      if (field.diff_type === 'unchanged') continue
      const oldText = escapeMarkdownCell(formatDiffValue(field.old_value, 60))
      const newText = escapeMarkdownCell(formatDiffValue(field.new_value, 60))
      lines.push(`| ${field.field_label} | ${oldText} | ${newText} | ${DIFF_DISPLAY[field.diff_type].text} |`)
    }
    lines.push('')
  }
  return lines.join('\n')
}

/** Markdown 表格单元格转义：折叠换行 + 转义管道符 */
function escapeMarkdownCell(text: string): string {
  return text.replace(/\n/g, ' ').replace(/\|/g, '\\|')
}

/** 普通章节：扁平化后逐字段分类计数（含未变） */
function versionDiffFlat(
  chapterKey: ChapterKey,
  label: string,
  oldData: unknown,
  newData: unknown
): CeshuChapterDiff {
  const oldFlat = flattenChapter(isPlainObject(oldData) ? oldData : {})
  const newFlat = flattenChapter(isPlainObject(newData) ? newData : {})
  const oldKeys = new Set(Object.keys(oldFlat))
  const newKeys = new Set(Object.keys(newFlat))
  const allKeys = [...new Set([...oldKeys, ...newKeys])].sort()
  const chapterDiff: CeshuChapterDiff = {
    chapter_key: chapterKey,
    chapter_label: label,
    field_diffs: [],
    added_count: 0,
    removed_count: 0,
    modified_count: 0,
    unchanged_count: 0
  }
  for (const field of allKeys) {
    const inOld = oldKeys.has(field)
    const inNew = newKeys.has(field)
    const oldValue = inOld ? oldFlat[field] : null
    const newValue = inNew ? newFlat[field] : null
    const diffType = classifyFieldDiff(inOld, inNew, oldValue, newValue)
    countIntoChapterDiff(chapterDiff, diffType)
    chapterDiff.field_diffs.push({
      field_path: `${chapterKey}.${field}`,
      field_label: field,
      old_value: oldValue,
      new_value: newValue,
      diff_type: diffType
    })
  }
  return chapterDiff
}

/** systems 章：按系统 enabled 状态逐项计数（含未变） */
function versionDiffSystems(
  chapterKey: ChapterKey,
  label: string,
  oldData: unknown,
  newData: unknown
): CeshuChapterDiff {
  const chapterDiff: CeshuChapterDiff = {
    chapter_key: chapterKey,
    chapter_label: label,
    field_diffs: [],
    added_count: 0,
    removed_count: 0,
    modified_count: 0,
    unchanged_count: 0
  }
  for (const diff of diffSystems(oldData, newData)) {
    countIntoChapterDiff(chapterDiff, diff.diffType)
    const systemId = diff.field.includes(' ') ? diff.field.split(' ')[0] : diff.field
    chapterDiff.field_diffs.push({
      field_path: `systems.${systemId}.enabled`,
      field_label: diff.field,
      old_value: diff.oldValue,
      new_value: diff.newValue,
      diff_type: diff.diffType
    })
  }
  return chapterDiff
}

function countIntoChapterDiff(chapterDiff: CeshuChapterDiff, diffType: CeshuDiffType): void {
  if (diffType === 'added') chapterDiff.added_count += 1
  else if (diffType === 'removed') chapterDiff.removed_count += 1
  else if (diffType === 'modified') chapterDiff.modified_count += 1
  else chapterDiff.unchanged_count += 1
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
 * diff 分类：
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

/** 章节字段扁平化：简单字典（值均非 dict/list）与列表作为叶节点 */
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

/** 键排序的稳定 JSON */
function stableStringify(value: unknown): string {
  if (value === null || value === undefined) return JSON.stringify(value) ?? 'null'
  if (Array.isArray(value)) return `[${value.map((item) => stableStringify(item)).join(',')}]`
  if (typeof value === 'object') {
    const entries = Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b))
    return `{${entries.map(([key, item]) => `${JSON.stringify(key)}:${stableStringify(item)}`).join(',')}}`
  }
  return JSON.stringify(value) ?? String(value)
}