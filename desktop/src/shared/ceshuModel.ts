import {
  CHAPTER_KEYS,
  CHAPTER_REQUIRED_FIELDS,
  GDD_SCOPE_FULL,
  SYSTEM_LABELS,
  isGddScope,
  visibleChapterKeys,
  type CeshuDocument,
  type ChapterData,
  type ChapterKey,
  type EnabledEditor,
  type GddScope
} from './ceshuConstants'
import { createDefaultChapters } from './ceshuDefaults'

/**
 * 策划书纯逻辑（跨进程共用：主进程存取用，渲染层进度展示用）。
 * 与 Python 版 ceshu_model.py 行为对齐：本地时间字符串、8 位 id、v5.0 结构。
 */

/** 本地时间字符串（与 Python 版一致：YYYY-MM-DD HH:mm:ss，非 ISO） */
export function formatLocalTimestamp(date: Date = new Date()): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
}

/** 策划书 id：8 位十六进制（与 Python uuid4[:8] 格式兼容） */
export function createCeshuId(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 8)
}

export function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** 新建策划书：18 章默认值 + 档位写入 meta.gdd_scope */
export function createDefaultCeshu(options: { scope: GddScope; name?: string }): CeshuDocument {
  const now = formatLocalTimestamp()
  const chapters = createDefaultChapters()
  chapters.meta.gdd_scope = options.scope
  if (options.name) {
    chapters.meta.game_name = options.name
  }
  const doc: CeshuDocument = {
    version: '5.0',
    ceshu_id: createCeshuId(),
    created_at: now,
    updated_at: now,
    parent_id: '',
    version_label: 'v1.0',
    is_active: true,
    version_note: '',
    style: '',
    module_type: '',
    ...chapters,
    enabled_editors: [],
    editor_configs: {}
  }
  doc.enabled_editors = computeEnabledEditors(doc)
  return doc
}

/**
 * 归一化磁盘数据为 CeshuDocument。
 * - 章节：raw 里存在且为对象则整体替换默认值（与 Python from_dict 行为一致，容错旧版字段差异）
 * - 顶层未知键保留（兼容旧版与未来扩展）
 */
export function normalizeCeshu(raw: unknown): CeshuDocument {
  if (!isPlainObject(raw)) {
    throw new Error('策划书文件格式不正确：期望 JSON 对象')
  }
  const now = formatLocalTimestamp()
  const base: CeshuDocument = {
    version: typeof raw.version === 'string' ? raw.version : '5.0',
    ceshu_id: typeof raw.ceshu_id === 'string' && raw.ceshu_id ? raw.ceshu_id : createCeshuId(),
    created_at: typeof raw.created_at === 'string' ? raw.created_at : now,
    updated_at: typeof raw.updated_at === 'string' ? raw.updated_at : now,
    parent_id: typeof raw.parent_id === 'string' ? raw.parent_id : '',
    version_label: typeof raw.version_label === 'string' && raw.version_label ? raw.version_label : 'v1.0',
    is_active: typeof raw.is_active === 'boolean' ? raw.is_active : true,
    version_note: typeof raw.version_note === 'string' ? raw.version_note : '',
    style: typeof raw.style === 'string' ? raw.style : '',
    module_type: typeof raw.module_type === 'string' ? raw.module_type : '',
    ...createDefaultChapters(),
    enabled_editors: Array.isArray(raw.enabled_editors) ? raw.enabled_editors.filter(isEnabledEditor) : [],
    editor_configs: isPlainObject(raw.editor_configs) ? raw.editor_configs : {}
  }
  for (const key of CHAPTER_KEYS) {
    const value = raw[key]
    if (isPlainObject(value)) {
      base[key] = value
    }
  }
  for (const [key, value] of Object.entries(raw)) {
    if (key in base) continue
    const target = base as unknown as Record<string, unknown>
    target[key] = value
  }
  return base
}

/** 读取档位（meta.gdd_scope，缺省为 full） */
export function getGddScope(doc: CeshuDocument): GddScope {
  const meta = doc.meta
  return isPlainObject(meta) && isGddScope(meta.gdd_scope) ? meta.gdd_scope : GDD_SCOPE_FULL
}

/**
 * 每章完成度（0~1）与总进度（键与 Python chapter_progress 一致，含 total）。
 * 规则：systems 按 enabled 系统占比；无必填字段的章节固定 0.5；其余按必填字段填充数。
 */
export function computeChapterProgress(doc: CeshuDocument): Record<string, number> {
  const visible = visibleChapterKeys(getGddScope(doc))
  const progress: Record<string, number> = {}
  for (const key of visible) {
    if (key === 'systems') {
      const entries = Object.values(doc.systems)
      const enabled = entries.filter((entry) => isPlainObject(entry) && entry.enabled === true).length
      progress[key] = entries.length === 0 ? 0 : round2(Math.min(enabled / entries.length, 1))
      continue
    }
    const required = CHAPTER_REQUIRED_FIELDS[key]
    if (required.length === 0) {
      progress[key] = 0.5
      continue
    }
    const data = doc[key]
    const filled = required.filter((field) => isFilledValue(data[field])).length
    progress[key] = round2(filled / required.length)
  }
  const sum = visible.reduce((acc, key) => acc + progress[key], 0)
  progress.total = round2(sum / visible.length)
  return progress
}

/** 更新单章（meta 章保留既有档位；刷新 updated_at 与 enabled_editors），返回新对象 */
export function withChapter(doc: CeshuDocument, chapter: ChapterKey, data: ChapterData): CeshuDocument {
  const next: CeshuDocument = { ...doc }
  if (chapter === 'meta') {
    const scope = doc.meta.gdd_scope
    next.meta = isGddScope(scope) && data.gdd_scope === undefined ? { ...data, gdd_scope: scope } : data
  } else {
    next[chapter] = data
  }
  next.updated_at = formatLocalTimestamp()
  next.enabled_editors = computeEnabledEditors(next)
  return next
}

/** 由 systems 计算启用编辑器列表（与 Python compute_enabled_editors 一致） */
export function computeEnabledEditors(doc: CeshuDocument): EnabledEditor[] {
  const result: EnabledEditor[] = []
  for (const [key, value] of Object.entries(doc.systems)) {
    if (!isPlainObject(value) || value.enabled !== true) continue
    const name = typeof value.name === 'string' && value.name ? value.name : (SYSTEM_LABELS[key] ?? key)
    const dataType = typeof value.data_type === 'string' ? value.data_type : key
    result.push({ key, name, data_type: dataType })
  }
  return result
}

/**
 * Python 真值语义（进度计算用）：'' / 0 / false / null / 空数组 / 空对象 均视为未填。
 * 注意与「校验用空值判定」isEmptyRequiredValue 的区别：后者按 Python
 * _is_empty_required_value 语义，空对象 {} 不视为空。
 */
export function isFilledValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value !== ''
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (Array.isArray(value)) return value.length > 0
  if (isPlainObject(value)) return Object.keys(value).length > 0
  return true
}

/**
 * 校验用空值判定（对应 Python _is_empty_required_value）：
 * '' / 0 / false / null / 空数组视为空；空对象 {} 与其余类型不视为空
 * （保持历史行为：resources.budget 等字段默认为 {} 不报错）。
 */
export function isEmptyRequiredValue(value: unknown): boolean {
  if (value === null || value === undefined) return true
  if (typeof value === 'string') return value === ''
  if (typeof value === 'boolean') return !value
  if (typeof value === 'number') return value === 0
  if (Array.isArray(value)) return value.length === 0
  return false
}

function isEnabledEditor(value: unknown): value is EnabledEditor {
  return isPlainObject(value) && typeof value.key === 'string' && typeof value.name === 'string'
}

function round2(value: number): number {
  return Math.round(value * 100) / 100
}