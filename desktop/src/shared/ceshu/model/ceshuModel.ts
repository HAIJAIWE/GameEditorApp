import {
  CHAPTER_KEYS,
  CHAPTER_REQUIRED_FIELDS,
  GDD_SCOPE_FULL,
  SYSTEM_LABELS,
  enabledModuleChapters,
  isGddScope,
  visibleChapterKeys,
  type CeshuDocument,
  type ChapterData,
  type ChapterKey,
  type EnabledEditor,
  type GddScope
} from '../reference'
import { createDefaultChapters } from '../reference'
import { getStyle, inferStyleFromText } from '../../config/game'
import { migrateV4ToV5, needsV4Migration } from '../data'
import { isChapterVisibleInStage, type CeshuStage } from '../workflow'
import { formatLocalTimestamp } from '../../util/datetime'
import { isPlainObject } from '../../util/object'

/**
 * 策划书纯逻辑（跨进程共用：主进程存取用，渲染层进度展示用）。
 * 与 早期版本 ceshu_model 行为对齐：本地时间字符串、8 位 id、v5.0 结构。
 */

// `formatLocalTimestamp` / `isPlainObject` 已下沉到 `shared/util/`（消除 agent→ceshu、attr→ceshu
// 两条跨业务域依赖）。此处 re-export 以保持既有 60+ 处 `from './ceshuModel'` 的调用方不受影响。
export { formatLocalTimestamp, isPlainObject }

/** 策划书 id：8 位十六进制 */
export function createCeshuId(): string {
  return globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 8)
}

/** 新建策划书：文档信息 + 全部章节默认值 + 档位写入 meta.gdd_scope */
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
 * - 迁移：检测到 v4.0 / 缺失新增章节时先跑 `migrateV4ToV5`（对齐 旧版 `CeshuModel.from_dict`
 *   的懒加载迁移）；必须在套用默认值之前，才能读到旧章节的原始值
 * - 章节：raw 里存在且为对象则整体替换默认值
 * - 顶层未知键保留
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
  // ruleset_id 由上面的「未知键保留」循环带过来（它不是 base 的属性）；派生值不在
  // 这里现算——否则老文档一保存就被塞进派生结果，用户改 ceshu_id 时旧值会诈尸成「显式值」
  return base
}

/** 读取档位（meta.gdd_scope，缺省为 full） */
export function getGddScope(doc: CeshuDocument): GddScope {
  const meta = doc.meta
  return isPlainObject(meta) && isGddScope(meta.gdd_scope) ? meta.gdd_scope : GDD_SCOPE_FULL
}

/**
 * 读取游戏类型（meta.game_type，缺省为空串）。
 * 用于按品类判定 `combat` 章是否适用（无战斗品类的立项稿不该被 combat 拉低）。
 */
export function getGameType(doc: CeshuDocument): string {
  const meta = doc.meta
  return isPlainObject(meta) && typeof meta.game_type === 'string' ? meta.game_type : ''
}

/**
 * 规则集标识（设计契约的锚点，见 `CeshuDocument.ruleset_id` 注释）。
 *
 * 派生而非强制落盘：显式值优先；否则由 `ceshu_id` 生成 `ceshu-<id>`——**同文档恒定**，
 * 所以设计文档、契约 JSON、原型 Demo 能对上同一套规则。老文档没有该字段时导出/契约里
 * 现算既有值，不静默改写用户文件（要固化用显式赋值）。
 */
export function deriveRulesetId(doc: CeshuDocument): string {
  const explicit = doc.ruleset_id
  if (typeof explicit === 'string' && explicit.trim() !== '') return explicit.trim()
  return `ceshu-${doc.ceshu_id}`
}

/**
 * 该文档可见的章 = 档位 × 品类 × 启用模块。
 * `enabledModuleChapters` 缺省返回全部模块 ⇒ 老文档行为零变化。
 */
export function visibleChaptersForDoc(doc: CeshuDocument): readonly ChapterKey[] {
  return visibleChapterKeys(getGddScope(doc), getGameType(doc), enabledModuleChapters(doc))
}

/**
 * 每章完成度（0~1）与总进度。
 * 规则：systems 按 enabled 系统占比；无必填字段的章节固定 0.5；其余按必填字段填充数。
 */
export function computeChapterProgress(doc: CeshuDocument, stage?: CeshuStage): Record<string, number> {
  /*
   * 按品类剔除「不适用章」（无战斗品类的 combat 章）：它们既不该出现在导航/导出，
   * 也不该进 `total` 的分母——否则 combat 章贡献 0 会把非战斗品类的立项完成度压低。
   * 与「把 combat 的必填清空」不同，**从 visible 里剔除**才能真正修正分母。
   */
  const visible = visibleChaptersForDoc(doc)
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
      /*
       * 无必填字段的章按「未开始」计（P2：2026-10-23 由 0.5 改为 0）。
       * 既有数据里这条分支本是死分支——唯一 required 为空的 systems 被上面的
       * 特殊路径截走；P2 新增 7 章在字段定义交付前 required 均为空，0.5 会让
       * 每份新文档自带 3.5% 的假进度、结构分虚高（空文档 3.3 而非 0）。
       * 0 的语义也符合直觉：没有必填可衡量的章 = 没有任何已开始的内容。
       */
      progress[key] = 0
      continue
    }
    const data = doc[key]
    const filled = required.filter((field) => isFilledValue(data[field])).length
    progress[key] = round2(filled / required.length)
  }
  /*
   * total 的分母：传 `stage` 时只算「截至该阶段」的章——完成度 = 当前阶段，而不是 24 章全量。
   * 不传时保持原行为（全部可见章）。逐章进度仍对全部可见章计算，避免其他消费方读到 undefined。
   */
  const counted = stage === undefined ? visible : visible.filter((key) => isChapterVisibleInStage(key, stage))
  const sum = counted.reduce((acc, key) => acc + progress[key], 0)
  progress.total = counted.length === 0 ? 0 : round2(sum / counted.length)
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

/** 由 systems 计算启用编辑器列表 */
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
 * 旧版 真值语义（进度计算用）：'' / 0 / false / null / 空数组 / 空对象 均视为未填。
 * 注意与「校验用空值判定」isEmptyRequiredValue 的区别：后者按 旧版
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
 * 校验用空值判定：
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
 * 对应 旧版 `ui/ceshu_controller::open_ceshu`：
 * ```
 * inferred = infer_style_from_text(game_type + " " + tags)
 * if not inferred:
 *     inferred = infer_style_from_text(meta.get("positioning", ""))
 * set_active_style(inferred)
 * ```
 *
 * **对 旧版 的有意增强**：先看 `doc.style`。旧版 完全忽略它，只做关键词推断——
 * 而 `doc.style` 是用户在「AI 一键生成 / 预设应用」里**显式选择**的风格 key，
 * 比启发式推断更权威；两者都拿不到时才回退到推断。
 *
 * 返回 `''` 表示「无活跃风格」（标签原样显示），与 旧版 `set_active_style("")` 同义。
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