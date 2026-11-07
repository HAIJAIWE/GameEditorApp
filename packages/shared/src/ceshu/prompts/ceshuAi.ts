import {
  BASE_CHAPTER_KEYS,
  CHAPTER_KEYS,
  CHAPTER_LABELS,
  GDD_SCOPE_LITE,
  type CeshuDocument,
  type ChapterData,
  type ChapterKey,
  type GddScope
} from '../reference'
import type { LlmUsage } from '../../config/llm'
import { resolveFieldMeta } from '../fields'
import type { QualityGateVerdict } from '../../types'
import {
  chapterDataForDoc,
  chapterFieldsForDoc,
  chapterLabelForDoc,
  deriveRulesetId,
  getDocKind,
  getGameType,
  isChapterAllowedForDoc,
  isPlainObject,
  requiredFieldsForDoc,
  visibleChaptersForDoc,
  type DocKind
} from '../model'
// ⚠️ 只能从 appSchema 取应用档元数据，不能 import documentSpec：
// gameSpec.ts 顶层会 import ceshu/prompts 桶构造 GAME_SPEC，反向依赖会成环，
// 顶层常量未初始化就被读（实测 `Cannot read properties of undefined`）。
import {
  APP_CHAPTER_KEYS,
  APP_AGENT_DISPLAY,
  APP_AGENT_PROMPTS,
  APP_CHAPTER_LABELS,
  APP_REVIEW_ROLE_NOUN,
  APP_SYSTEM_DOC_NOUN,
  appChapterAi
} from '../../appSchema'

/** 应用档取数助手（AI 已并入应用，不再按 ai 分流；保留同名调用点） */
function softwareLabels(_kind: DocKind): Readonly<Record<string, string>> {
  return APP_CHAPTER_LABELS
}
function softwareAgentPrompts(_kind: DocKind): Readonly<Record<string, string>> {
  return APP_AGENT_PROMPTS
}
function softwareChapterAi(_kind: DocKind, chapter: string): { agentId: string; aiHint: string } {
  return appChapterAi(chapter)
}
function softwareDocNoun(_kind: DocKind): string {
  return APP_SYSTEM_DOC_NOUN
}
function softwareReviewRole(_kind: DocKind): string {
  return APP_REVIEW_ROLE_NOUN
}
function softwareOrder(_kind: DocKind): readonly string[] {
  return APP_CHAPTER_KEYS
}
import { readText } from '../../util/io'
import { parseLlmJson } from '../../util/object'
import {
  APP_ADVERSARIAL_CHECK_PROBES,
  APP_REQUIREMENTS_FULL,
  APP_REQUIREMENTS_ONLY_EMPTY,
  CHAPTER_AGENT_MAP,
  AGENT_DISPLAY,
  CHAPTER_AGENT_PROMPTS,
  STYLE_GLOSSARIES,
  REQUIREMENTS_ONLY_EMPTY,
  REQUIREMENTS_FULL,
  STYLE_LABEL_TO_KEY,
  TYPE_LABEL_TO_KEY,
  STYLE_KEYWORD_HINTS,
  PLATFORM_HARD_CONSTRAINTS,
  BUSINESS_HARD_CONSTRAINTS,
  TYPE_KEYWORD_HINTS,
  CHAPTER_GENERATION_HINTS,
  ADVERSARIAL_CHECK_KEYS,
  ADVERSARIAL_CHECK_LABELS,
  ADVERSARIAL_LEVELS,
  ADVERSARIAL_LEVEL_LABELS,
  genreReviewProfile,
  reviewProbeFor,
  type AdversarialLevel,
  type AdversarialCheckKey
} from './ceshuAiData'
import { buildFieldActionInstruction, type FieldAction } from '../fields'
export * from './ceshuAiData'

/**
 * 策划书 AI 生成纯逻辑（自 旧版 core/agent/skills 的 ceshu_skill_generate / ceshu_agent_router
 * / ceshu_style_helpers 匹平迁移）：子智能体路由、风格术语表、整章提示词组装、LLM 输出容错解析。
 */

export interface ChapterAgent {
  agentId: string
  displayName: string
  agentPrompt: string
}

/** 按章节取子智能体（路由 + 展示名 + 章节提示语） */
export function agentForChapter(chapter: ChapterKey): ChapterAgent {
  const agentId = CHAPTER_AGENT_MAP[chapter] ?? '通用策划助手'
  return {
    agentId,
    displayName: AGENT_DISPLAY[agentId] ?? agentId,
    agentPrompt: CHAPTER_AGENT_PROMPTS[chapter] ?? '请协助完善当前章节内容。'
  }
}

/**
 * 按文档档位取章节子智能体（路线 A 第 4 步的 AI 分派点）。
 * - **游戏档原样委托 `agentForChapter`**：一个 agent 管多章、章级提示语不同，
 *   直接换成「agentId → 首章提示语」会改变输出，硬约束是逐字节零回归。
 * - **应用档走 appSchema 的 AI 元数据**：`appChapterAi(key)` 给出 agentId 与本章
 *   生成要求，展示名/角色提示语来自 `APP_AGENT_DISPLAY/PROMPTS`。
 */
export function agentForDocChapter(doc: CeshuDocument, chapter: string): ChapterAgent {
  if (getDocKind(doc) !== 'application') return agentForChapter(chapter as ChapterKey)
  const meta = appChapterAi(chapter)
  const agentId = meta.agentId
  const rolePrompt = APP_AGENT_PROMPTS[agentId] ?? '请协助完善当前章节内容。'
  const chapterHint = meta.aiHint
  return {
    agentId,
    displayName: APP_AGENT_DISPLAY[agentId] ?? agentId,
    agentPrompt: chapterHint === '' ? rolePrompt : `${rolePrompt}\n本章生成要求：${chapterHint}`
  }
}

export function getStyleGlossary(style: string): string {
  if (!style) return ''
  return STYLE_GLOSSARIES[style] ?? ''
}

/* ---- 整章提示词组装 ---- */

/**
 * 系统控制字段：只由数据层 / 模块选择器写入（模板版本锚点、启用模块清单），
 * AI 整章生成时**不得列入字段清单**。否则模型会试图编造 / 改动系统元数据：
 * `template_version` 被改写会让「老文档按新模板读」的判定失效；
 * `enabled_modules` 被改写会凭空开关章节，让用户已有的章内容「消失」。
 * 与 `doc_kind` 不同：后者在字段表里（AI 可见、写盘由 `withChapter` 守卫），
 * 本集合里的键连字段表都不进。
 */
const NON_AI_GENERATED_KEYS: ReadonlySet<string> = new Set(['template_version', 'enabled_modules'])

/**
 * 整章生成的字段清单 = **字段表（schema，权威）∪ 文档数据键**（点路径键取首段）。
 *
 * ⚠️ 不能只用 `Object.keys(chapterData)`：doc 数据来自 defaults，**可选字段与
 * 拆分字段（xxx_points/notes）没有默认值条目** ⇒ 不进数据键 ⇒ 整章生成时模型
 * 根本看不到这些字段——而 UI 是按字段表渲染的（2026-10-24 导入 5 个新字段时
 * 发现：design_pillars 等在应用内整章生成中全部缺席）。字段表是唯一真源，
 * 生成清单必须以它为准；解析侧 `filterGeneratedFields` 早已是同一套并集逻辑，
 * 此处对齐。点路径取首段（user_personas.primary → user_personas）与数据键的
 * 嵌套对象形态对齐。
 *
 * 末位剔除 `NON_AI_GENERATED_KEYS`（系统控制字段）：它们随数据键进并集，但不该被生成。
 */
function chapterGenerationKeys(doc: CeshuDocument, chapter: string, chapterData: Record<string, unknown>): string[] {
  const merged: string[] = chapterFieldsForDoc(doc, chapter).map((field) => field.key.split('.')[0])
  for (const key of Object.keys(chapterData)) {
    if (!merged.includes(key)) merged.push(key)
  }
  return merged.filter((key) => !NON_AI_GENERATED_KEYS.has(key))
}

export interface ChapterPromptResult {
  system: string
  prompt: string
  /** 需要生成的字段（onlyEmpty 时仅空字段） */
  fields: string[]
}

export interface ChapterPromptOptions {
  onlyEmpty?: boolean
  /** 风格 key 覆盖（全量生成时用用户所选风格，如 xianxia；为空回退 doc.style） */
  styleOverride?: string
  /** 追加到默认提示之后的定制提示（全量生成的【章节】/【用户输入】/【生成要求】块） */
  extraPrompt?: string
  /** 单字段定向生成（E62）：只生成指定字段列表，忽略 onlyEmpty */
  onlyFields?: string[]
  /**
   * 局部重生成动作（改写/展开/精简/通俗化）：仅在 `onlyFields` 单字段生成时注入
   * 任务指令，让模型按人的诉求重写该字段，而不是重新起草。
   */
  action?: FieldAction
}

export function buildChapterPrompt(
  doc: CeshuDocument,
  chapter: string,
  options: ChapterPromptOptions = {}
): ChapterPromptResult {
  const onlyEmpty = options.onlyEmpty === true
  const onlyFields = options.onlyFields
  // 游戏分支的每一段文本都保持原样（逐字节零回归）；应用分支改走规格的
  // 角色 / 措辞 / 字段表 / 写作规范。所有分派都在这里收口，不散到下游。
  const docKind = getDocKind(doc)
  const isApp = docKind !== 'game'
  const agent = agentForDocChapter(doc, chapter)
  const chapterData = chapterDataForDoc(doc, chapter)
  const allKeys = chapterGenerationKeys(doc, chapter, chapterData)
  const fields =
    onlyFields && onlyFields.length > 0
      ? onlyFields
      : onlyEmpty
        ? allKeys.filter((key) => !isTruthyValue(chapterData[key]))
        : allKeys
  const fieldList = fields.join(', ')

  // 已有非空内容
  const existingContent = allKeys
    .filter((key) => {
      const value = chapterData[key]
      return isTruthyValue(value) && (typeof value === 'string' || typeof value === 'number')
    })
    .map((key) => `- ${key}: ${String(chapterData[key])}`)
    .join('\n')

  // 上下文：游戏档=游戏名称/类型/定位/风格术语表；应用档=项目名称/目标平台/一句话定位
  // （风格术语表是游戏风格词库，对软件设计毫无意义，应用档不下发）
  const contextLines: string[] = []
  const meta = doc.meta
  const gameName = readText(meta.game_name)
  const gameType = readText(meta.game_type)
  const positioning = readText(meta.positioning)
  if (isApp) {
    const projectName = readText(meta.project_name) || gameName
    const platform = Array.isArray(meta.platform)
      ? meta.platform.filter((item): item is string => typeof item === 'string').join('、')
      : ''
    if (projectName) contextLines.push(`项目名称: ${projectName}`)
    if (platform !== '') contextLines.push(`目标平台: ${platform}`)
    if (positioning) contextLines.push(`一句话定位: ${positioning}`)
  } else {
    if (gameName) contextLines.push(`游戏名称: ${gameName}`)
    if (gameType) contextLines.push(`游戏类型: ${gameType}`)
    if (positioning) contextLines.push(`市场定位: ${positioning}`)
  }
  const style = options.styleOverride || doc.style
  if (!isApp && style) {
    const glossary = getStyleGlossary(style)
    if (glossary) {
      contextLines.push(`风格: ${style}`)
      contextLines.push(`风格术语表:\n${glossary}`)
    }
  }
  const contextText = contextLines.length > 0 ? contextLines.join('\n') : '(无上下文)'

  // 章名：游戏档沿用章 key（system / 导语里的原文不能变），应用档用规格的中文标签
  const chapterName = isApp ? chapterLabelForDoc(doc, chapter) : chapter
  const docNoun = isApp ? softwareDocNoun(docKind) : '游戏策划书'
  const docWord = isApp ? docNoun : '策划书'

  const system =
    onlyFields && onlyFields.length > 0
      ? `你是${agent.displayName}，正在协助编写${docNoun}的${chapterName}章节。请仅生成下面列出的字段。输出格式为 JSON，键为字段名，值为生成内容。只输出 JSON，不要加任何解释或 markdown 标记。`
      : onlyEmpty
        ? `你是${agent.displayName}，正在协助编写${docNoun}的${chapterName}章节。请仅补全下面列出的空字段。输出格式为 JSON，键为字段名，值为生成内容。只输出 JSON，不要加任何解释或 markdown 标记。`
        : `你是${agent.displayName}，正在协助编写${docNoun}的${chapterName}章节。请生成该章节的完整内容，包括所有字段。输出格式为 JSON，键为字段名，值为生成内容（字符串或简单结构）。只输出 JSON，不要加任何解释或 markdown 标记。`

  const promptLead =
    onlyFields && onlyFields.length > 0
      ? `请为${docWord}「${chapterName}」章节生成以下单个字段。\n`
      : `请为${docWord}「${chapterName}」整章生成内容。\n`
  let prompt =
    promptLead +
    `章节提示: ${agent.agentPrompt}\n\n` +
    `上下文信息:\n${contextText}\n\n` +
    `该章节需要填充的字段列表:\n${fieldList}\n\n`
  /*
   * 单字段生成（协作粒度）：把该字段的 `aiHint`（AI 该产出什么）与 `reviewHint`
   * （人审看什么）一并喂给模型 —— 让生成目标和人审标准在同一处对齐，避免
   * 「AI 写了一堆、人不知道该看哪」。整章生成不加，避免提示词膨胀。
   */
  if (onlyFields && onlyFields.length > 0) {
    const defs = chapterFieldsForDoc(doc, chapter)
    const hintLines: string[] = []
    for (const key of onlyFields) {
      const def = defs.find((field) => field.key === key)
      if (def === undefined) continue
      const meta = resolveFieldMeta(chapter, def, requiredFieldsForDoc(doc, chapter))
      const parts: string[] = []
      if (meta.aiHint) parts.push(`AI 目标: ${meta.aiHint}`)
      if (meta.reviewHint) parts.push(`人审要点: ${meta.reviewHint}`)
      if (parts.length > 0) hintLines.push(`- ${def.label}：${parts.join('；')}`)
    }
    if (hintLines.length > 0) {
      prompt += `字段写作要求:\n${hintLines.join('\n')}\n\n`
    }
  }
  /*
   * 局部重生成动作（停靠栏快捷操作）：任务指令放在写作要求之后、已有内容之前 ——
   * 先告诉模型「这次要干什么」，再给它原材料。无动作时整段不出现（提示词零膨胀）。
   */
  const actionInstruction = buildFieldActionInstruction(options.action)
  if (actionInstruction !== '') {
    prompt += `${actionInstruction}\n\n`
  }
  if (existingContent) {
    prompt += `已有非空内容（请保留并补充其他字段）:\n${existingContent}\n\n`
  }
  prompt += isApp
    ? onlyEmpty
      ? APP_REQUIREMENTS_ONLY_EMPTY
      : APP_REQUIREMENTS_FULL
    : onlyEmpty
      ? REQUIREMENTS_ONLY_EMPTY
      : REQUIREMENTS_FULL
  if (options.extraPrompt) {
    prompt += `\n\n${options.extraPrompt}`
  }

  return { system, prompt, fields }
}

/* ---- LLM 输出解析与字段清洗 ---- */

export interface CeshuAiGenerateResult {
  /** 实际使用的模型名（未调用 LLM 时为空字符串） */
  model: string
  /** 通过清洗的字段（键为字段名，可能含嵌套对象） */
  fields: Record<string, unknown>
  /** LLM 原始输出（便于排查） */
  rawText: string
  /**
   * 生成结果的**确定性评分门**结论（v0.5 DD-19）。
   * 由 `shared/agent/qualityGate.ts::evaluateChapterDraft` 产出：把 `fields` 合并进文档后
   * 重跑 `validateCeshu`，给出「生成前/后」的错误数与立项完成度变化。
   * **可选**：仅当章节 key 合法时才有值；旧调用方忽略该字段即可。
   */
  quality?: QualityGateVerdict | null
  /** 本次调用的 token 用量（v0.6 M5：成本护栏的观测数据）；本地档可能为空 */
  usage?: LlmUsage | null
}

/**
 * 清洗生成字段：仅保留该章表单字段 / 既有数据键（含点路径父键），丢弃 null 与未知键。
 * 说明：空字符串与空数组被丢弃。
 */
export function filterGeneratedFields(
  doc: CeshuDocument,
  chapter: string,
  parsed: Record<string, unknown>
): Record<string, unknown> {
  const allowed = new Set<string>()
  for (const field of chapterFieldsForDoc(doc, chapter)) allowed.add(field.key)
  for (const key of Object.keys(chapterDataForDoc(doc, chapter))) allowed.add(key)
  const heads = new Set([...allowed].map((key) => key.split('.')[0]))

  const result: Record<string, unknown> = {}
  for (const [rawKey, value] of Object.entries(parsed)) {
    const key = rawKey.trim()
    if (value === null || value === undefined) continue
    if (typeof value === 'string' && value === '') continue
    if (Array.isArray(value) && value.length === 0) continue
    if (allowed.has(key) || heads.has(key)) result[key] = value
  }
  return result
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

/* ---- 全量生成 ---- */

/** 风格中文标签 → style key */
export function mapStyleLabelToKey(label: string): string {
  return STYLE_LABEL_TO_KEY[label.trim()] ?? ''
}

/** 游戏类型中文标签 → module_type key */
export function mapTypeLabelToKey(label: string): string {
  return TYPE_LABEL_TO_KEY[label.trim()] ?? ''
}

/** 全量生成表单原始输入（渲染层收集，未归一化） */
export interface FullGenerateFormInput {
  gameName: string
  gameType: string
  style: string
  description: string
  references: string | string[]
  platforms: string | string[]
  businessModel: string
}

/** 归一化后的全量生成输入 */
export interface FullGenerateInput {
  gameName: string
  gameType: string
  style: string
  description: string
  references: string[]
  platforms: string[]
  businessModel: string
}

/**
 * 文档信息 + 全量生成顺序（market 在 vision 后、risk 在 tech 后）。
 *
 * 2026-10-26 修复：此前只返回 17 章，**P2 扩展 7 章被漏掉**——「一键全量生成」永远不写
 * `uiux / level_design / live_ops / analytics / qa / publishing / performance`，生成的文档不完整。
 * 现在 full 档补全 24 章；lite 档仍由 `BASE_CHAPTER_KEYS` 过滤回基础 9 章。
 */
export function buildChapterOrder(includeMarket: boolean, includeRisk: boolean): ChapterKey[] {
  const order: ChapterKey[] = ['meta', 'vision']
  if (includeMarket) order.push('market_analysis')
  order.push(
    'story',
    'gameplay',
    'combat',
    'systems',
    'economy',
    'monetization',
    'numeric',
    'art',
    'audio',
    'tech'
  )
  if (includeRisk) order.push('risk_handling')
  order.push('mvp', 'resources', 'accessibility')
  // P2 扩展设计 7 章（2026-10-23 新增，此前漏在生成顺序外）
  order.push('uiux', 'level_design', 'live_ops', 'analytics', 'qa', 'publishing', 'performance')
  return order
}

/** meta 章节种子 */
export function buildMetaSeed(input: FullGenerateInput): ChapterData {
  return {
    game_name: input.gameName,
    game_type: input.gameType,
    platform: [...input.platforms],
    positioning: '',
    tags: input.style ? [input.style] : []
  }
}

/** 全量生成计划（渲染层驱动逐章生成用：顺序 + 每章定制提示 + meta 种子） */
export interface FullGeneratePlan {
  scope: GddScope
  /** 章 key 用 string：应用档章不属于 ChapterKey 联合类型 */
  order: readonly string[]
  chapterPrompts: Readonly<Record<string, string>>
  metaSeed: ChapterData
  /** 风格 key（如 xianxia，用于提示词术语表与文档 style 写回） */
  styleKey: string
  /** 类型 key（如 rpg，用于文档 module_type 写回） */
  typeKey: string
}

/** 归一化全量生成输入 */
export function normalizeFullGenerateInput(raw: FullGenerateFormInput): FullGenerateInput {
  return {
    gameName: raw.gameName.trim(),
    gameType: raw.gameType.trim(),
    style: raw.style.trim(),
    description: raw.description.trim(),
    references: splitList(raw.references),
    platforms: splitList(raw.platforms),
    businessModel: raw.businessModel.trim()
  }
}

/**
 * 组装全量生成计划：章节顺序 + 每章定制提示词 + meta 种子。
 * 轻量档（lite）按基础 9 章裁剪。
 */
export function buildFullGeneratePlan(
  raw: FullGenerateFormInput,
  options: { scope: GddScope; includeMarket: boolean; includeRisk: boolean; docKind?: DocKind }
): FullGeneratePlan {
  const input = normalizeFullGenerateInput(raw)
  // 应用档：SDD 全章表，不做游戏档的 lite/market/risk 裁剪，也不写游戏风格/品类 key。
  // 游戏档（docKind 缺省）走原来的 buildChapterOrder 路径，逐字节零回归。
  if (options.docKind === 'application') {
    const kind = options.docKind
    const order: readonly string[] = [...softwareOrder(kind)]
    return {
      scope: options.scope,
      order,
      chapterPrompts: buildChapterPrompts(input, order, kind),
      metaSeed: buildAppMetaSeed(input),
      styleKey: '',
      typeKey: ''
    }
  }
  let order = buildChapterOrder(options.includeMarket, options.includeRisk)
  if (options.scope === GDD_SCOPE_LITE) {
    const base = new Set<string>(BASE_CHAPTER_KEYS)
    order = order.filter((chapter) => base.has(chapter))
  }
  return {
    scope: options.scope,
    order,
    chapterPrompts: buildChapterPrompts(input, order),
    metaSeed: buildMetaSeed(input),
    styleKey: mapStyleLabelToKey(input.style),
    typeKey: mapTypeLabelToKey(input.gameType)
  }
}

/**
 * 一键生成表单的平台是游戏档中文枚举（PC/移动端/主机/Web），
 * 应用档 `meta.platform` 用的是规格 key（desktop/mobile/web）。
 * 这里做一次归一，避免把「移动端」这种显示标签写进应用档数据。
 */
const GAME_PLATFORM_TO_APP: Readonly<Record<string, string>> = {
  PC: 'desktop',
  移动端: 'mobile',
  主机: 'desktop',
  Web: 'web'
}

/** 应用档文档信息段种子：项目名 / 平台 / 定位，不写游戏类型与风格标签 */
function buildAppMetaSeed(input: FullGenerateInput): ChapterData {
  const platform = [...new Set(
    input.platforms
      .map((item) => GAME_PLATFORM_TO_APP[item] ?? item)
      .filter((item) => item === 'desktop' || item === 'mobile' || item === 'web')
  )]
  return {
    project_name: input.gameName,
    platform,
    positioning: ''
  }
}

/**
 * 从全量生成表单派生「关键词 + 硬约束」块（2026-10-28 一句话生成信号补足）。
 *
 * 为什么需要：此前每章提示词只把用户原话（名称/类型/风格/描述/参考/平台/商业模式）
 * 平铺进【用户输入】，模型看不到「这类游戏该长啥样、平台/商业有哪些验收红线」——
 * 一句话生成时更容易跑题或缺系统。这里把表单选择**结构化**成：
 *   · 关键词：风格术语表 + 风格关键词 + 品类关键词 + 品类应含系统
 *   · 硬约束：平台约束（点击区/重连/包体…）+ 商业模式约束（保底/不卖数值…）
 * 全部逐条可核验，注入每章提示词（同一份输入，逐章共享）。
 */
export function buildKeywordConstraintBlock(input: FullGenerateInput): string {
  const lines: string[] = []

  // —— 关键词 ——
  const keywords: string[] = []
  if (input.style) {
    const styleKey = mapStyleLabelToKey(input.style)
    if (styleKey) {
      const glossary = getStyleGlossary(styleKey)
      if (glossary) {
        keywords.push(`风格术语表(${input.style}): ${glossary.replace(/\n/g, '；')}`)
      }
      const styleHints = STYLE_KEYWORD_HINTS[styleKey]
      if (styleHints && styleHints.length > 0) {
        keywords.push(`风格关键词(${input.style}): ${styleHints.join('、')}`)
      }
    }
  }
  if (input.gameType) {
    const typeHint = TYPE_KEYWORD_HINTS[input.gameType]
    if (typeHint) {
      keywords.push(`品类关键词(${input.gameType}): ${typeHint.keywords.join('、')}`)
      keywords.push(`品类应含系统(${input.gameType}): ${typeHint.expectedSystems.join('、')}`)
    }
  }
  if (keywords.length > 0) {
    lines.push('【关键词】')
    lines.push(keywords.join('\n'))
    lines.push('')
  }

  // —— 硬约束 ——
  const constraints: string[] = []
  for (const platform of input.platforms) {
    const pc = PLATFORM_HARD_CONSTRAINTS[platform]
    if (pc) constraints.push(...pc.map((c) => `[平台·${platform}] ${c}`))
  }
  if (input.businessModel) {
    const bc = BUSINESS_HARD_CONSTRAINTS[input.businessModel]
    if (bc) constraints.push(...bc.map((c) => `[商业·${input.businessModel}] ${c}`))
  }
  if (constraints.length > 0) {
    lines.push('【硬约束】')
    lines.push(constraints.join('\n'))
    lines.push('')
    lines.push(
      '以上硬约束是验收红线：相关章节（如 UI/性能/商业化/数值）的生成内容必须可被机器或测试核验；' +
        '无法确定的项写「待确认」并标注将在哪章补，不要模糊带过。'
    )
    lines.push('')
  }

  return lines.join('\n')
}

/**
 * 每章定制提示词：由全量生成流程逐章追加到默认提示之后。
 */
export function buildChapterPrompts(
  input: FullGenerateInput,
  order: readonly string[],
  docKind?: DocKind
): Readonly<Record<string, string>> {
  const kind: DocKind = docKind ?? 'game'
  const isApp = kind !== 'game'
  const userInputText = (isApp ? buildAppUserInputLines(input) : buildUserInputLines(input)).join('\n')
  // 风格术语表 / 品类关键词 / 平台·商业硬约束全是游戏口径，软件档不下发这一整块。
  const keywordBlock = isApp ? '' : buildKeywordConstraintBlock(input)
  const prompts: Record<string, string> = {}
  const labels = isApp ? softwareLabels(kind) : undefined
  const agentPrompts = isApp ? softwareAgentPrompts(kind) : undefined
  for (const chapter of order) {
    const label = isApp ? (labels?.[chapter] ?? chapter) : CHAPTER_LABELS[chapter as ChapterKey]
    const meta = isApp ? softwareChapterAi(kind, chapter) : undefined
    const requirement = isApp && meta !== undefined
      ? [agentPrompts?.[meta.agentId], meta.aiHint]
          .filter((part) => part !== undefined && part !== '')
          .join('\n')
      : CHAPTER_GENERATION_HINTS[chapter as ChapterKey]
    prompts[chapter] =
      `【章节】${label}\n` +
      `【用户输入】\n${userInputText || '(无)'}\n` +
      (isApp ? '' : `【关键词与硬约束】\n${keywordBlock || '(无)'}\n`) +
      `【生成要求】${requirement}\n` +
      '输出 JSON，键为字段名，值为生成内容；只输出 JSON。'
  }
  return prompts
}

/**
 * 合并草稿章节（全量生成时把已生成结果与 meta 种子作为后续章节提示词上下文，不写盘）：
 * 逐章浅合并，未知键忽略，返回新文档对象。
 */
export function mergeChapterDraft(doc: CeshuDocument, draft: Record<string, ChapterData>): CeshuDocument {
  const next: CeshuDocument = { ...doc }
  // 与 IPC 边界共用 isChapterAllowedForDoc：应用章 draft 不再被过滤，游戏档逐项不变。
  const target = next as unknown as Record<string, ChapterData>
  for (const [key, value] of Object.entries(draft)) {
    if (!isChapterAllowedForDoc(doc, key)) continue
    target[key] = { ...chapterDataForDoc(next, key), ...value }
  }
  return next
}

function splitList(value: string | string[]): string[] {
  const parts = Array.isArray(value) ? value : value.split(',')
  return parts.map((item) => String(item).trim()).filter(Boolean)
}

function buildUserInputLines(input: FullGenerateInput): string[] {
  const lines: string[] = []
  if (input.gameName) lines.push(`游戏名称: ${input.gameName}`)
  if (input.gameType) lines.push(`游戏类型: ${input.gameType}`)
  if (input.style) lines.push(`风格: ${input.style}`)
  if (input.description) lines.push(`概念描述: ${input.description}`)
  if (input.references.length > 0) lines.push(`参考游戏: ${input.references.join(', ')}`)
  if (input.platforms.length > 0) lines.push(`目标平台: ${input.platforms.join(', ')}`)
  if (input.businessModel) lines.push(`商业模式: ${input.businessModel}`)
  return lines
}

/** 应用档全量生成的输入行：不出现「游戏类型 / 风格 / 商业模式 / 参考游戏」 */
function buildAppUserInputLines(input: FullGenerateInput): string[] {
  const lines: string[] = []
  if (input.gameName) lines.push(`项目名称: ${input.gameName}`)
  if (input.description) lines.push(`需求描述: ${input.description}`)
  if (input.references.length > 0) lines.push(`参考产品: ${input.references.join(', ')}`)
  if (input.platforms.length > 0) lines.push(`目标平台: ${input.platforms.join(', ')}`)
  return lines
}

/* ---- 成稿反审（N6；2026-10-26 由「5 维度评分」改为「7 项三级判定」，见 ceshuAiData 说明） ---- */

/**
 * 单条反审结论。
 * - `level`：`blocker`（必须修）/ `suggestion`（可改可不改）/ `pass`（未发现问题）
 * - `probe`：该品类下这一项**具体查了什么**（回显用，让作者知道判定依据）
 * - `evidence`：AI 给的依据（引用文档里的哪句话 / 哪个数字）
 */
export interface AdversarialFinding {
  key: string
  label: string
  level: AdversarialLevel
  /** 该品类下本项的追问重点（来自 `reviewProbeFor`，不依赖 AI 复述） */
  probe: string
  /** AI 给的判定依据 / 说明 */
  evidence: string
}

export interface CeshuReviewPayload {
  findings: AdversarialFinding[]
  overall: string
  suggestions: string[]
  /** 本次审阅采用的品类档案展示名（如「塔防」） */
  genreLabel: string
  /** 本次审阅针对的规则集标识（与契约、Demo 对齐） */
  rulesetId: string
  /** LLM 原始输出（解析失败时供 UI 展示排查） */
  rawText: string
  /** 是否成功解析出 findings */
  parsed: boolean
}

export interface CeshuAiReviewResult extends CeshuReviewPayload {
  model: string
  /** 总进度 0~1（LLM 提示词与报告用） */
  progressTotal: number
  /** 内置校验问题数 */
  validationCount: number
  /** 本次调用的 token 用量（v0.6 M5：成本护栏的观测数据）；本地档可能为空 */
  usage?: LlmUsage | null
}

/** 阻塞 / 建议 条数（面板与报告共用口径） */
export function countFindings(findings: readonly AdversarialFinding[]): { blockers: number; suggestions: number } {
  let blockers = 0
  let suggestions = 0
  for (const finding of findings) {
    if (finding.level === 'blocker') blockers += 1
    else if (finding.level === 'suggestion') suggestions += 1
  }
  return { blockers, suggestions }
}

/** 章节填充摘要 */
export function buildReviewSummary(doc: CeshuDocument): string {
  const parts: string[] = []
  // 游戏档保持 CHAPTER_KEYS / CHAPTER_LABELS / doc[key] 原路径（逐字节零回归）；
  // 应用档遍历自己的可见章，否则只能看到共用的 meta 段，反审会拿到一份空摘要。
  const isApp = getDocKind(doc) !== 'game'
  const keys: readonly string[] = isApp ? visibleChaptersForDoc(doc) : CHAPTER_KEYS
  for (const key of keys) {
    const chapterData: unknown = isApp ? chapterDataForDoc(doc, key) : doc[key as ChapterKey]
    if (!isPlainObject(chapterData)) continue
    const filled = Object.entries(chapterData).filter(
      ([, value]) => (typeof value === 'string' && value !== '') || (typeof value === 'number' && value !== 0)
    )
    if (filled.length === 0) continue
    const label = isApp ? chapterLabelForDoc(doc, key) : CHAPTER_LABELS[key as ChapterKey]
    parts.push(
      `【${label}】` +
        filled.map(([field, value]) => `${field}: ${String(value).slice(0, 60)}`).join(' / ')
    )
  }
  return parts.length > 0 ? parts.join('\n') : (isApp ? '(软件设计文档内容为空)' : '(策划书内容为空)')
}

/** 反审提示词（成稿反审：7 项三级判定 + 品类追问，要求严格 JSON 输出） */
export function buildReviewPrompts(
  doc: CeshuDocument,
  input: { progressTotal: number; validationCount: number }
): { system: string; prompt: string } {
  /*
   * 检查项样例从 ADVERSARIAL_CHECK_KEYS / LABELS 派生，追问从 reviewProbeFor(品类) 取：
   * 新增/改名一项只改 ceshuAiData 一处，提示词与面板自动跟上——避免双处维护。
   */
  const docKind = getDocKind(doc)
  const isApp = docKind !== 'game'
  const genre = genreReviewProfile(getGameType(doc))
  const reviewRole = isApp ? softwareReviewRole(docKind) : '资深游戏策划'
  const checkLines = ADVERSARIAL_CHECK_KEYS.map(
    (key, index) =>
      `    {"key":"${key}","label":"${ADVERSARIAL_CHECK_LABELS[key]}","level":"pass|suggestion|blocker","evidence":"依据：引用文档里的哪句话/哪个数字，或说明未发现问题"}${
        index === ADVERSARIAL_CHECK_KEYS.length - 1 ? '' : ','
      }`
  )
  const probeLines = ADVERSARIAL_CHECK_KEYS.map(
    (key, index) =>
      `${index + 1}. 【${ADVERSARIAL_CHECK_LABELS[key]}】${
        isApp ? APP_ADVERSARIAL_CHECK_PROBES[key] : reviewProbeFor(key, genre.key)
      }`
  )
  const system = [
    `你是${reviewRole}，正在对一份**成稿**做反审（审查与写作分离）：不要框「好不好」，只回答「有没有必须修的」。`,
    isApp
      ? `文档类型：${softwareDocNoun(docKind)}。以下每一项按下面的追问重点核查，结论只能是 pass / suggestion / blocker 三选一：`
      : `本品类：${genre.label}。以下每一项按本品类的追问重点核查，结论只能是 pass / suggestion / blocker 三选一：`,
    isApp
      ? '  · blocker = 存在必须修的问题（接口契约不一致、状态机不闭合、指标口径冲突、跨章结论矛盾）'
      : '  · blocker = 存在必须修的问题（数值算不通、有支配解、规则不闭合、多方口径不一致）',
    '  · suggestion = 可改可不改的改进点',
    '  · pass = 该项未发现问题',
    'JSON 格式如下：',
    '{',
    '  "findings": [',
    ...checkLines,
    '  ],',
    '  "overall":"总体结论 100-200 字：先说有没有 blocker，再说整体离交付还差什么",',
    '  "suggestions":["改进建议1","改进建议2","改进建议3"]',
    '}',
    '只输出 JSON，不要加任何解释或 markdown 标记。'
  ].join('\n')

  const prompt =
    `请对以下${isApp ? softwareDocNoun(docKind) : '策划书'}做 ${ADVERSARIAL_CHECK_KEYS.length} 项成稿反审。逐项按下面的追问核查：\n\n` +
    `${probeLines.join('\n')}\n\n` +
    `【待审${isApp ? softwareDocNoun(docKind) : '策划书'}】\n${buildReviewSummary(doc)}\n\n` +
    `完成进度: ${Math.round(input.progressTotal * 100)}%\n` +
    `内置校验问题数: ${input.validationCount}\n` +
    (isApp
      ? `文档类型: ${softwareDocNoun(docKind)}（按软件设计口径反审）, 目标平台: ${
          Array.isArray(doc.meta.platform) ? doc.meta.platform.join('、') : '未指定'
        }\n` +
        `规则集标识: ${deriveRulesetId(doc)}（接口契约/数据模型/测试用例/原型应引用同一标识）`
      : `游戏类型: ${getGameType(doc) || '未指定'}（按「${genre.label}」品类反审）, 风格: ${doc.style || '未指定'}\n` +
        `规则集标识: ${deriveRulesetId(doc)}（正文/配置/示例/Demo 应引用同一标识）`)

  return { system, prompt }
}

/** 解析反审输出：按规范顺序补全 7 项、level 兜底 pass、建议补足 3 条；失败时 parsed=false 且保留原文 */
export function parseReviewResponse(content: string): CeshuReviewPayload {
  const parsed = parseLlmJson(content)
  const rawFindings = parsed['findings']
  if (!Array.isArray(rawFindings)) {
    return { findings: [], overall: '', suggestions: [], genreLabel: '', rulesetId: '', rawText: content, parsed: false }
  }
  const byKey = new Map<string, Record<string, unknown>>()
  for (const entry of rawFindings) {
    if (isPlainObject(entry) && typeof entry['key'] === 'string') byKey.set(entry['key'], entry)
  }
  const findings: AdversarialFinding[] = ADVERSARIAL_CHECK_KEYS.map((key) => {
    const entry = byKey.get(key)
    const rawLevel = typeof entry?.['level'] === 'string' ? entry['level'].toLowerCase().trim() : ''
    const level: AdversarialLevel = (ADVERSARIAL_LEVELS as readonly string[]).includes(rawLevel)
      ? (rawLevel as AdversarialLevel)
      : 'pass'
    const label =
      typeof entry?.['label'] === 'string' && entry['label'] !== '' ? entry['label'] : ADVERSARIAL_CHECK_LABELS[key]
    const evidence = typeof entry?.['evidence'] === 'string' ? entry['evidence'] : ''
    // probe 留空：解析层看不到文档（拿不到品类），由 finalizeReview 用 doc 回填品类追问
    return { key, label, level, probe: '', evidence }
  })

  const rawSuggestions = parsed['suggestions']
  const list: unknown[] = Array.isArray(rawSuggestions)
    ? rawSuggestions
    : typeof rawSuggestions === 'string'
      ? [rawSuggestions]
      : []
  const suggestions = list.map((item) => String(item)).filter((item) => item !== '').slice(0, 3)
  while (suggestions.length < 3) suggestions.push('（暂无更多建议）')

  const overall = typeof parsed['overall'] === 'string' ? parsed['overall'] : ''
  return { findings, overall, suggestions, genreLabel: '', rulesetId: '', rawText: content, parsed: true }
}

/**
 * 用文档回填「解析层拿不到」的字段：品类档案 + 规则集标识 + 每项的品类追问。
 *
 * 为什么单独一步：`parseReviewResponse` 只吃 LLM 原文（可单测、无副作用），
 * 而品类 / 规则集来自文档——分开后两者都能独立测，且最终结果的 probe 与
 * 提示词里下发的追问**逐字一致**（同源于 `reviewProbeFor`）。
 */
export function finalizeReview(payload: CeshuReviewPayload, doc: CeshuDocument): CeshuReviewPayload {
  const docKind = getDocKind(doc)
  const isApp = docKind !== 'game'
  const genre = genreReviewProfile(getGameType(doc))
  return {
    ...payload,
    genreLabel: isApp ? softwareDocNoun(docKind) : genre.label,
    rulesetId: deriveRulesetId(doc),
    findings: payload.findings.map((finding) => ({
      ...finding,
      // probe 必须与提示词里下发的追问逐字一致：应用档取 SDD 追问表，游戏档取品类追问
      probe: isApp
        ? APP_ADVERSARIAL_CHECK_PROBES[finding.key as AdversarialCheckKey]
        : reviewProbeFor(finding.key as AdversarialCheckKey, genre.key)
    }))
  }
}

/** 反审报告 Markdown（检查项 | 判定 | 依据 + 阻塞/建议小结） */
export function buildReviewMarkdown(
  gameName: string,
  reviewedAt: string,
  result: CeshuAiReviewResult
): string {
  const counts = countFindings(result.findings)
  const lines = [
    '# 成稿反审报告',
    '',
    `**游戏名称**: ${gameName}`,
    `**审阅时间**: ${reviewedAt}`
  ]
  if (result.genreLabel) lines.push(`**品类**: ${result.genreLabel}`)
  if (result.rulesetId) lines.push(`**规则集标识**: ${result.rulesetId}`)
  lines.push(`**结论**: 阻塞 ${counts.blockers} 项 · 建议 ${counts.suggestions} 项`)
  lines.push('', '## 反审清单', '', '| 检查项 | 判定 | 依据 |', '|------|------|------|')
  for (const finding of result.findings) {
    const level = ADVERSARIAL_LEVEL_LABELS[finding.level]
    const evidence = finding.evidence.replace(/\n/g, ' ').replace(/\|/g, '\\|')
    lines.push(`| ${finding.label} | ${level} | ${evidence} |`)
  }
  lines.push('', '## 总体结论', '', result.overall || '（无）')
  lines.push('', '## Top 3 改进建议', '')
  result.suggestions.slice(0, 3).forEach((suggestion, index) => lines.push(`${index + 1}. ${suggestion}`))
  if (result.progressTotal > 0) lines.push('', `**策划书完成进度**: ${Math.round(result.progressTotal * 100)}%`)
  if (result.validationCount > 0) lines.push(`**内置校验问题数**: ${result.validationCount}`)
  return lines.join('\n')
}