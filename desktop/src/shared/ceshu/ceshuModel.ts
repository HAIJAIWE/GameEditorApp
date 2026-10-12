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
import { createDefaultChapters } from '../domain/ceshu/ceshuDefaults'
import { getStyle, inferStyleFromText } from '../gameStyle'
import { migrateV4ToV5, needsV4Migration } from './ceshuMigration'
import { formatLocalTimestamp } from '../util/datetime'
import { isPlainObject } from '../util/guards'

/**
 * 策划书纯逻辑（跨进程共用：主进程存取用，渲染层进度展示用）。
 * 与 Python 版 ceshu_model.py 行为对齐：本地时间字符串、8 位 id、v5.0 结构。
 */

// `formatLocalTimestamp` / `isPlainObject` 已下沉到 `shared/util/`（消除 agent→ceshu、attr→ceshu
// 两条跨业务域依赖）。此处 re-export 以保持既有 60+ 处 `from './ceshuModel'` 的调用方不受影响。
export { formatLocalTimestamp, isPlainObject }

/** 策划书 id：8 位十六进制（与 Python uuid4[:8] 格式兼容） */
export function createCeshuId(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 8)
}

/** 新建策划书：文档信息 + 16 章默认值 + 档位写入 meta.gdd_scope */
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
 * - 迁移：检测到 v4.0 / 缺失新增章节时先跑 `migrateV4ToV5`（对齐 Python `CeshuModel.from_dict`
 *   的懒加载迁移）；必须在套用默认值之前，才能读到旧章节的原始值
 * - 章节：raw 里存在且为对象则整体替换默认值（与 Python from_dict 行为一致，容错旧版字段差异）
 * - 顶层未知键保留（兼容旧版与未来扩展）
 */
export function normalizeCeshu(raw: unknown): CeshuDocument {
  if (!isPlainObject(raw)) {
    throw new Error('策划书文件格式不正确：期望 JSON 对象')
  }
  const source: Record<string, unknown> = needsV4Migration(raw) ? migrateV4ToV5(raw) : raw
  const now = formatLocalTimestamp()
  const base: CeshuDocument = {
    version: typeof source.version === 'string' ? source.version : '5.0',
    ceshu_id: typeof source.ceshu_id === 'string' && source.ceshu_id ? source.ceshu_id : createCeshuId(),
    created_at: typeof source.created_at === 'string' ? source.created_at : now,
    updated_at: typeof source.updated_at === 'string' ? source.updated_at : now,
    parent_id: typeof source.parent_id === 'string' ? source.parent_id : '',
    version_label: typeof source.version_label === 'string' && source.version_label ? source.version_label : 'v1.0',
    is_active: typeof source.is_active === 'boolean' ? source.is_active : true,
    version_note: typeof source.version_note === 'string' ? source.version_note : '',
    style: typeof source.style === 'string' ? source.style : '',
    module_type: typeof source.module_type === 'string' ? source.module_type : '',
    ...createDefaultChapters(),
    enabled_editors: Array.isArray(source.enabled_editors) ? source.enabled_editors.filter(isEnabledEditor) : [],
    editor_configs: isPlainObject(source.editor_configs) ? source.editor_configs : {}
  }
  for (const key of CHAPTER_KEYS) {
    const value = source[key]
    if (isPlainObject(value)) {
      base[key] = value
    }
  }
  for (const [key, value] of Object.entries(source)) {
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

/** 从 meta 取字符串（非字符串一律视为空） */
function readMetaText(meta: Record<string, unknown>, key: string): string {
  const value = meta[key]
  return typeof value === 'string' ? value : ''
}

/**
 * 由策划书推导活跃游戏风格 id（用于条目表单字段标签的术语替换）。
 *
 * 对应 Python `ui/ceshu_controller.py::open_ceshu`：
 * ```python
 * inferred = infer_style_from_text(game_type + " " + tags)
 * if not inferred:
 *     inferred = infer_style_from_text(meta.get("positioning", ""))
 * set_active_style(inferred)
 * ```
 *
 * **对 Python 的有意增强**：先看 `doc.style`。Python 完全忽略它，只做关键词推断——
 * 而 `doc.style` 是用户在「AI 一键生成 / 预设应用」里**显式选择**的风格 key，
 * 比启发式推断更权威；两者都拿不到时才回退到推断。
 *
 * 返回 `''` 表示「无活跃风格」（标签原样显示），与 Python `set_active_style("")` 同义。
 */
export function resolveDocGameStyle(doc: CeshuDocument): string {
  const declared = typeof doc.style === 'string' ? doc.style : ''
  if (declared && getStyle(declared) !== undefined) return declared

  const meta = isPlainObject(doc.meta) ? doc.meta : {}
  const tags = Array.isArray(meta.tags) ? meta.tags.filter((tag) => typeof tag === 'string').join(' ') : ''
  const inferred = inferStyleFromText(`${readMetaText(meta, 'game_type')} ${tags}`)
  if (inferred) return inferred

  return inferStyleFromText(readMetaText(meta, 'positioning'))
}