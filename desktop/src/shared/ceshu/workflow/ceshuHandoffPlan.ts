import type { CeshuDocument, ChapterKey, SystemEntry } from '../reference'
import { GENRE_REVIEW_PROFILES, resolveGenreProfileKey, type GenreProfileKey } from '../prompts'
import { fieldLabelOf } from '../fields'
import { isFilledValue } from '../model'
import { SYSTEM_CONFIG_SCHEMA } from '../model'
import { validateCeshu } from '../validation'
import { resolveValidationChapter } from '../validation'
import { docsOfVolume } from './ceshuHandoffDocs'
import { handoffVolumeFolderName, readPath } from './ceshuHandoffPaths'
import type { HandoffDoc, HandoffDocCondition, HandoffDocLayer, HandoffVolume } from './ceshuHandoffTypes'
import { HANDOFF_VOLUMES } from './ceshuHandoffVolumes'

/**
 * 品类适配 → 裁剪重排 → 门禁。
 *
 * 输入一份策划书，输出「这次要出哪些文档、按什么顺序编号、每份能不能开工」。
 * 纯函数：不碰文件系统、不读系统时间；`doc` 显式传参（无模块级可变状态）。
 */

/** 品类解析结果（用于交接包裁剪与文档头展示） */
export interface HandoffGenreResolution {
  /** 主类型档案 */
  primary: GenreProfileKey
  primaryLabel: string
  /** 组合玩法标签（原样，可能为空） */
  tags: string[]
  /**
   * 命中的全部档案：primary 在前，标签追加去重。
   * 组合品类（SLG+卡牌）会同时命中 strategy 与 card ⇒ 两套专属文档都出现。
   */
  profiles: GenreProfileKey[]
  /** 是否组合品类（命中 >1 个档案） */
  composite: boolean
}

/**
 * 解析文档的品类集合。
 *
 * `meta.game_type` 是单选，装不下「SLG + 卡牌」这类组合玩法；`meta.game_type_tags`
 * 是多选标签，两者取**并集**。未知/自由文本走 `resolveGenreProfileKey` 的包含匹配，
 * 完全没命中则回落 `generic`（只出通用文档，不瞎补系统）。
 */
export function resolveHandoffGenre(doc: CeshuDocument): HandoffGenreResolution {
  const primary = resolveGenreProfileKey(doc.meta.game_type)
  const rawTags = Array.isArray(doc.meta.game_type_tags) ? (doc.meta.game_type_tags as unknown[]) : []
  const tags = rawTags.filter((item): item is string => typeof item === 'string' && item.trim() !== '')
  const profiles: GenreProfileKey[] = [primary]
  for (const tag of tags) {
    const key = resolveGenreProfileKey(tag)
    if (!profiles.includes(key)) profiles.push(key)
  }
  return {
    primary,
    primaryLabel: GENRE_REVIEW_PROFILES[primary].label,
    tags,
    profiles,
    composite: profiles.length > 1
  }
}

/** 一份「已规划」的文档：编号已按品类裁剪后重排，路径可直接用 */
export interface PlannedHandoffDoc {
  def: HandoffDoc
  volume: HandoffVolume
  /** 卷内显示序号（过滤后从 1 连续，保证「按编号做」不断号） */
  number: number
  /** 层级：通用基线 / 品类专属 / 条件文档 */
  layer: HandoffDocLayer
  /** 相对路径：`00-架构/01-范围与平台.md` */
  path: string
}

/** 文档层级：条件文档 > 品类专属 > 通用基线 */
export function docLayer(def: HandoffDoc): HandoffDocLayer {
  if ((def.when ?? []).length > 0) return 'conditional'
  if ((def.genres ?? []).length > 0) return 'genre'
  return 'baseline'
}

/** 条件文档的触发判定（任一条件满足即可） */
function conditionMatches(doc: CeshuDocument, condition: HandoffDocCondition): boolean {
  if (condition.kind === 'field') {
    return isFilledValue(readPath(doc[condition.chapter], condition.field))
  }
  if (condition.kind === 'fieldOneOf') {
    const value = readPath(doc[condition.chapter], condition.field)
    return typeof value === 'string' && condition.values.includes(value)
  }
  const entry = readPath(doc.systems, condition.key) as SystemEntry | undefined
  return entry !== undefined && entry.enabled === true
}

/**
 * 该文档在当前文档下是否出现。
 *
 * 两道闸：① 品类（`genres`，未知品类 `generic` 时全出，宁可多给不漏规格）；
 * ② 条件（`when`，按项目事实决定，如「有音频引擎」「联机形态不是纯单机」）。
 */
function docAppliesTo(doc: CeshuDocument, def: HandoffDoc, profiles: GenreProfileKey[]): boolean {
  if ((def.when ?? []).length > 0 && !(def.when ?? []).some((condition) => conditionMatches(doc, condition))) {
    return false
  }
  if (def.genres === undefined) return true
  if (profiles.includes('generic')) return true
  return def.genres.some((genre) => profiles.includes(genre))
}

/**
 * 按品类裁剪并**重排编号**：过滤掉不适用的文档后，卷内序号从 1 连续。
 *
 * 为什么要重排：用户要的是「文件名开头的数字 = 开发顺序」。如果直接沿用目录里的
 * `order`，视觉小说品类会因为跳过「敌人与 Boss」而出现 `01, 02, 04` 这种断号。
 */
export function planHandoffDocs(doc: CeshuDocument): PlannedHandoffDoc[] {
  const { profiles } = resolveHandoffGenre(doc)
  const planned: PlannedHandoffDoc[] = []
  for (const volume of HANDOFF_VOLUMES) {
    const docs = docsOfVolume(volume.id).filter((def) => docAppliesTo(doc, def, profiles))
    docs.forEach((def, index) => {
      const number = index + 1
      planned.push({
        def,
        volume,
        number,
        layer: docLayer(def),
        path: `${handoffVolumeFolderName(volume)}/${String(number).padStart(2, '0')}-${def.title}.md`
      })
    })
  }
  return planned
}

/* ------------------------------------------------------------------ */
/* 门禁                                                                */
/* ------------------------------------------------------------------ */

/** 单份文档的门禁 */
export interface HandoffDocStatus {
  doc: HandoffDoc
  /** 卷内显示序号（裁剪后重排） */
  number: number
  /** 相对路径 */
  path: string
  /** 层级：通用基线 / 品类专属 / 条件文档 */
  layer: HandoffDocLayer
  fieldTotal: number
  fieldFilled: number
  /** 还没写的字段（点名到章/字段） */
  missing: Array<{ chapter: ChapterKey; field: string; label: string }>
  /** 已启用的系统 id（未启用的系统不算缺，只是本作不做） */
  systemsEnabled: string[]
  /** 已启用系统的配置填写进度（部分空告警用；0/0 表示本文档不涉及系统配置） */
  configFieldFilled: number
  configFieldTotal: number
  /**
   * 本文档是否适用：带系统的文档在「相关系统全未启用」时视为不适用
   * （本作不做装备 → 「装备与词条」这份文档没有要实现的东西，不该标 ✅ 更不该标 ⏳）
   */
  applicable: boolean
  /** 与该文档相关的校验问题 */
  blockers: string[]
  ready: boolean
}

/** 单卷门禁（聚合其文档） */
export interface HandoffVolumeStatus {
  volume: HandoffVolume
  docs: HandoffDocStatus[]
  keyFieldTotal: number
  keyFieldFilled: number
  missing: Array<{ chapter: ChapterKey; field: string; label: string }>
  blockers: string[]
  ready: boolean
}

/** 该文档涉及的章节（字段所属章 + 系统章） */
export function docChapters(def: HandoffDoc): Set<ChapterKey> {
  const set = new Set<ChapterKey>()
  for (const item of def.fields) set.add(item.chapter)
  if ((def.systems ?? []).length > 0) set.add('systems')
  return set
}

/** 归属判定的共享上下文（每章第一份文档 + 已被文档引用的字段集合） */
interface BlockerContext {
  firstDocOfChapter: Map<ChapterKey, string>
  /** `章.字段`：被某份文档显式引用的字段 */
  coveredFields: Set<string>
}

/**
 * 校验问题归属哪份文档。
 *
 * ① 文案点名的字段被某份文档显式引用 → **只归那一份**（不重复报）；
 * ② 点名的字段没被任何文档引用（例如 story.protagonist）→ 归「该章第一份文档」，
 *    否则问题会在交接包里凭空消失，实现方永远看不到；
 * ③ 系统配置问题（`systems.<key>`）→ 归包含该系统的文档；
 * ④ 章节级问题（不点名字段）→ 同样归该章第一份文档。
 */
function blockerBelongsTo(def: HandoffDoc, message: string, context: BlockerContext): boolean {
  const chapter = resolveValidationChapter(message)
  const quoted = /字段\s*['"]([^'"]+)['"]/.exec(message)?.[1]
  if (quoted !== undefined) {
    if (chapter !== null && context.coveredFields.has(`${chapter}.${quoted}`)) {
      return def.fields.some((item) => item.chapter === chapter && item.field === quoted)
    }
    return chapter !== null && context.firstDocOfChapter.get(chapter) === def.id
  }
  for (const system of def.systems ?? []) {
    if (message.includes(`systems.${system.key}`)) return true
  }
  if (chapter === null) return false
  return context.firstDocOfChapter.get(chapter) === def.id
}

/** 构建归属上下文（每章第一份文档 + 已被引用的字段）；只统计**当前品类会出现**的文档 */
function buildBlockerContext(planned: readonly PlannedHandoffDoc[]): BlockerContext {
  const firstDocOfChapter = new Map<ChapterKey, string>()
  const coveredFields = new Set<string>()
  for (const item of planned) {
    for (const field of item.def.fields) coveredFields.add(`${field.chapter}.${field.field}`)
    for (const chapter of docChapters(item.def)) {
      if (!firstDocOfChapter.has(chapter)) firstDocOfChapter.set(chapter, item.def.id)
    }
  }
  return { firstDocOfChapter, coveredFields }
}

/** 系统 config 是否为空（没有键，或所有值都空） */
function systemConfigEmpty(entry: SystemEntry | undefined): boolean {
  if (entry === undefined) return true
  const config = (entry.config ?? {}) as Record<string, unknown>
  for (const value of Object.values(config)) {
    if (value === '' || value === null || value === undefined) continue
    if (Array.isArray(value) && value.length === 0) continue
    return false
  }
  return true
}

/** 系统配置填写进度：schema 字段总数 vs 已填数（只统计启用系统） */
function systemConfigStats(key: string, entry: SystemEntry | undefined): { filled: number; total: number } {
  const schema = SYSTEM_CONFIG_SCHEMA[key] ?? {}
  const total = Object.keys(schema).length
  const config = (entry?.config ?? {}) as Record<string, unknown>
  let filled = 0
  for (const fieldKey of Object.keys(schema)) {
    const value = config[fieldKey]
    if (value === '' || value === null || value === undefined) continue
    if (Array.isArray(value) && value.length === 0) continue
    filled += 1
  }
  return { filled, total }
}

/** 单份文档门禁 */
function buildDocStatus(
  doc: CeshuDocument,
  planned: PlannedHandoffDoc,
  errors: readonly string[],
  context: BlockerContext
): HandoffDocStatus {
  const def = planned.def
  let filled = 0
  const missing: HandoffDocStatus['missing'] = []
  for (const item of def.fields) {
    const value = readPath(doc[item.chapter], item.field)
    if (isFilledValue(value)) filled += 1
    else missing.push({ chapter: item.chapter, field: item.field, label: fieldLabelOf(item.chapter, item.field) })
  }
  const systemsEnabled = (def.systems ?? [])
    .filter((item) => {
      const entry = readPath(doc.systems, item.key) as SystemEntry | undefined
      return entry !== undefined && entry.enabled === true
    })
    .map((item) => item.key)
  const blockers = errors.filter((message) => blockerBelongsTo(def, message, context))
  // 系统启用但配置为空：交接包会渲染成「(无配置)」，实现方只能自己编参数——必须显式标红。
  for (const system of def.systems ?? []) {
    const entry = readPath(doc.systems, system.key) as SystemEntry | undefined
    if (entry !== undefined && entry.enabled === true && systemConfigEmpty(entry)) {
      blockers.push(
        `系统「${entry.name ?? system.key}」已启用但配置为空——实现方只能自己编参数，请先在「文档信息 → 游戏系统」补配置`
      )
    }
  }
  const hasSystems = (def.systems ?? []).length > 0
  const applicable = !hasSystems || systemsEnabled.length > 0
  let configFieldFilled = 0
  let configFieldTotal = 0
  for (const system of def.systems ?? []) {
    const entry = readPath(doc.systems, system.key) as SystemEntry | undefined
    if (entry === undefined || entry.enabled !== true) continue
    const stats = systemConfigStats(system.key, entry)
    configFieldTotal += stats.total
    configFieldFilled += stats.filled
  }
  return {
    doc: def,
    number: planned.number,
    path: planned.path,
    layer: planned.layer,
    fieldTotal: def.fields.length,
    fieldFilled: filled,
    missing,
    systemsEnabled,
    configFieldFilled,
    configFieldTotal,
    applicable,
    blockers,
    ready: applicable && filled === def.fields.length && blockers.length === 0
  }
}

/** 单卷门禁（聚合其文档；字段按 `章.字段` 去重） */
/**
 * 导出时的预计算结果：`buildHandoffFiles` 算一次，传给每份文档/卷目录的渲染，
 * 避免「每份文档都重跑 validateCeshu + planHandoffDocs」的 O(N²) 浪费。
 */
export interface HandoffRenderContext {
  plan: HandoffVolumeStatus[]
  planned: PlannedHandoffDoc[]
}

export function buildHandoffPlan(doc: CeshuDocument): HandoffVolumeStatus[] {
  const errors = validateCeshu(doc)
  const planned = planHandoffDocs(doc)
  const context = buildBlockerContext(planned)
  return HANDOFF_VOLUMES.map((volume) => {
    const docs = planned
      .filter((item) => item.volume.id === volume.id)
      .map((item) => buildDocStatus(doc, item, errors, context))
    // 卷门禁只看「适用」文档：不适用（如本作未启用相关系统）的文档既不计入「待补」也不计入「已完成」。
    // 否则全 N/A 的卷会因无关共享字段被填实而误报「✅ 可开工」——卷目录/总纲会显示可开工，
    // 但卷内每份文档都是「— 不适用」，自相矛盾。
    const applicableDocs = docs.filter((status) => status.applicable)
    const seen = new Set<string>()
    const missing: HandoffVolumeStatus['missing'] = []
    let total = 0
    let filled = 0
    for (const status of applicableDocs) {
      for (const item of status.missing) {
        const id = `${item.chapter}.${item.field}`
        if (seen.has(id)) continue
        seen.add(id)
        missing.push(item)
      }
      total += status.fieldTotal
      filled += status.fieldFilled
    }
    const blockers = applicableDocs.flatMap((status) => status.blockers)
    return {
      volume,
      docs,
      keyFieldTotal: total,
      keyFieldFilled: filled,
      missing,
      blockers,
      ready: applicableDocs.length > 0 && total > 0 && filled === total && blockers.length === 0
    }
  }).filter((status) => status.docs.length > 0)
}
