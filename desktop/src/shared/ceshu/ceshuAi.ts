import {
  BASE_CHAPTER_KEYS,
  CHAPTER_KEYS,
  CHAPTER_LABELS,
  GDD_SCOPE_LITE,
  isChapterKey,
  type CeshuDocument,
  type ChapterData,
  type ChapterKey,
  type GddScope
} from './ceshuConstants'
import type { LlmUsage } from '../llmConfig'
import { CESHU_CHAPTER_FIELDS } from '../domain/ceshu/ceshuFields'
import type { QualityGateVerdict } from '../agent/qualityGate'
import { isPlainObject } from './ceshuModel'
import { readText } from '../util/readText'
import { parseLlmJson } from '../util/parseLlmJson'
import {
  CHAPTER_AGENT_MAP,
  AGENT_DISPLAY,
  CHAPTER_AGENT_PROMPTS,
  STYLE_GLOSSARIES,
  REQUIREMENTS_ONLY_EMPTY,
  REQUIREMENTS_FULL,
  STYLE_LABEL_TO_KEY,
  TYPE_LABEL_TO_KEY,
  CHAPTER_GENERATION_HINTS,
  REVIEW_DIMENSION_KEYS,
  REVIEW_DIMENSION_LABELS
} from './ceshuAiData'
export * from './ceshuAiData'

/**
 * 策划书 AI 生成纯逻辑（自 Python core/agent/skills 的 ceshu_skill_generate / ceshu_agent_router
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

export function getStyleGlossary(style: string): string {
  if (!style) return ''
  return STYLE_GLOSSARIES[style] ?? ''
}

/* ---- 整章提示词组装（匹平 Python _ai_fill_chapter） ---- */

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
}

export function buildChapterPrompt(
  doc: CeshuDocument,
  chapter: ChapterKey,
  options: ChapterPromptOptions = {}
): ChapterPromptResult {
  const onlyEmpty = options.onlyEmpty === true
  const agent = agentForChapter(chapter)
  const chapterData = doc[chapter]
  const allKeys = Object.keys(chapterData)
  const fields = onlyEmpty ? allKeys.filter((key) => !isTruthyValue(chapterData[key])) : allKeys
  const fieldList = fields.join(', ')

  // 已有非空内容（仅字符串/数字，对应 Python isinstance(v, (str, int, float)) 过滤）
  const existingContent = allKeys
    .filter((key) => {
      const value = chapterData[key]
      return isTruthyValue(value) && (typeof value === 'string' || typeof value === 'number')
    })
    .map((key) => `- ${key}: ${String(chapterData[key])}`)
    .join('\n')

  // 上下文：游戏名称 / 类型 / 定位 / 风格术语表
  const contextLines: string[] = []
  const meta = doc.meta
  const gameName = readText(meta.game_name)
  const gameType = readText(meta.game_type)
  const positioning = readText(meta.positioning)
  if (gameName) contextLines.push(`游戏名称: ${gameName}`)
  if (gameType) contextLines.push(`游戏类型: ${gameType}`)
  if (positioning) contextLines.push(`市场定位: ${positioning}`)
  const style = options.styleOverride || doc.style
  if (style) {
    const glossary = getStyleGlossary(style)
    if (glossary) {
      contextLines.push(`风格: ${style}`)
      contextLines.push(`风格术语表:\n${glossary}`)
    }
  }
  const contextText = contextLines.length > 0 ? contextLines.join('\n') : '(无上下文)'

  const system = onlyEmpty
    ? `你是${agent.displayName}，正在协助编写游戏策划书的${chapter}章节。请仅补全下面列出的空字段。输出格式为 JSON，键为字段名，值为生成内容。只输出 JSON，不要加任何解释或 markdown 标记。`
    : `你是${agent.displayName}，正在协助编写游戏策划书的${chapter}章节。请生成该章节的完整内容，包括所有字段。输出格式为 JSON，键为字段名，值为生成内容（字符串或简单结构）。只输出 JSON，不要加任何解释或 markdown 标记。`

  let prompt =
    `请为策划书「${chapter}」整章生成内容。\n` +
    `章节提示: ${agent.agentPrompt}\n\n` +
    `上下文信息:\n${contextText}\n\n` +
    `该章节需要填充的字段列表:\n${fieldList}\n\n`
  if (existingContent) {
    prompt += `已有非空内容（请保留并补充其他字段）:\n${existingContent}\n\n`
  }
  prompt += onlyEmpty ? REQUIREMENTS_ONLY_EMPTY : REQUIREMENTS_FULL
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
   * 重跑 `validateCeshu` + `scoreCeshu`，给出「生成前/后」的错误数与评分变化。
   * **可选**：仅当章节 key 合法时才有值；旧调用方忽略该字段即可。
   */
  quality?: QualityGateVerdict | null
  /** 本次调用的 token 用量（v0.6 M5：成本护栏的观测数据）；本地档可能为空 */
  usage?: LlmUsage | null
}

/**
 * 清洗生成字段：仅保留该章表单字段 / 既有数据键（含点路径父键），丢弃 null 与未知键。
 * 说明：空字符串与空数组被丢弃（避免 AI 空值清空用户已填内容，与 Python 直接整章覆盖略有差异）。
 */
export function filterGeneratedFields(
  doc: CeshuDocument,
  chapter: ChapterKey,
  parsed: Record<string, unknown>
): Record<string, unknown> {
  const allowed = new Set<string>()
  for (const field of CESHU_CHAPTER_FIELDS[chapter] ?? []) allowed.add(field.key)
  for (const key of Object.keys(doc[chapter])) allowed.add(key)
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

/** Python 真值语义（''/0/false/空数组/空对象 为假） */
function isTruthyValue(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'string') return value !== ''
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (Array.isArray(value)) return value.length > 0
  if (isPlainObject(value)) return Object.keys(value).length > 0
  return true
}

/* ---- 全量生成（一键生成完整策划书，匹平 Python ai_full_generate_dialog + ceshu_skill_prompt） ---- */

/** 风格中文标签 → style key（对应 Python _map_style_to_key） */
export function mapStyleLabelToKey(label: string): string {
  return STYLE_LABEL_TO_KEY[label.trim()] ?? ''
}

/** 游戏类型中文标签 → module_type key（对应 Python _map_type_to_key） */
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

/** 归一化后的全量生成输入（对应 Python _normalize_user_input） */
export interface FullGenerateInput {
  gameName: string
  gameType: string
  style: string
  description: string
  references: string[]
  platforms: string[]
  businessModel: string
}

/** 文档信息 + 16 章生成顺序（对应 Python _build_chapter_order：market 在 vision 后、risk 在 tech 后） */
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
  return order
}

/** meta 章节种子（对应 Python _build_meta_seed；风格以中文标签写入 tags） */
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
  order: ChapterKey[]
  chapterPrompts: Partial<Record<ChapterKey, string>>
  metaSeed: ChapterData
  /** 风格 key（如 xianxia，用于提示词术语表与文档 style 写回） */
  styleKey: string
  /** 类型 key（如 rpg，用于文档 module_type 写回） */
  typeKey: string
}

/** 归一化全量生成输入（对应 Python _normalize_user_input：空白清理 + 逗号拆分） */
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
 * 组装全量生成计划（对应 Python _ai_generate_full）：章节顺序 + 每章定制提示词 + meta 种子。
 * 轻量档（lite）按基础 9 章裁剪（与 Python 对话框按 BASE_CHAPTER_KEYS 过滤一致）。
 */
export function buildFullGeneratePlan(
  raw: FullGenerateFormInput,
  options: { scope: GddScope; includeMarket: boolean; includeRisk: boolean }
): FullGeneratePlan {
  const input = normalizeFullGenerateInput(raw)
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
 * 每章定制提示词（对应 Python _build_chapter_prompts）：由全量生成流程逐章追加到默认提示之后。
 */
export function buildChapterPrompts(
  input: FullGenerateInput,
  order: ChapterKey[]
): Partial<Record<ChapterKey, string>> {
  const userInputText = buildUserInputLines(input).join('\n')
  const prompts: Partial<Record<ChapterKey, string>> = {}
  for (const chapter of order) {
    prompts[chapter] =
      `【章节】${CHAPTER_LABELS[chapter]}\n` +
      `【用户输入】\n${userInputText || '(无)'}\n` +
      `【生成要求】${CHAPTER_GENERATION_HINTS[chapter]}\n` +
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
  for (const [key, value] of Object.entries(draft)) {
    if (!isChapterKey(key)) continue
    next[key] = { ...next[key], ...value }
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

/* ---- AI 结构化审阅（N6，对应 Python CeshuSkill._ai_review + AIReviewDialog） ---- */

export interface CeshuReviewDimension {
  key: string
  label: string
  score: number
  feedback: string
}

export interface CeshuReviewPayload {
  dimensions: CeshuReviewDimension[]
  overall: string
  suggestions: string[]
  /** LLM 原始输出（解析失败时供 UI 展示排查） */
  rawText: string
  /** 是否成功解析出 dimensions */
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

/** 章节填充摘要（照抄 Python：仅标量真值、每值截断 60 字、【章节标签】+ key: value） */
export function buildReviewSummary(doc: CeshuDocument): string {
  const parts: string[] = []
  for (const key of CHAPTER_KEYS) {
    const chapterData: unknown = doc[key]
    if (!isPlainObject(chapterData)) continue
    const filled = Object.entries(chapterData).filter(
      ([, value]) => (typeof value === 'string' && value !== '') || (typeof value === 'number' && value !== 0)
    )
    if (filled.length === 0) continue
    parts.push(
      `【${CHAPTER_LABELS[key]}】` +
        filled.map(([field, value]) => `${field}: ${String(value).slice(0, 60)}`).join(' / ')
    )
  }
  return parts.length > 0 ? parts.join('\n') : '(策划书内容为空)'
}

/** 审阅提示词（照抄 Python system/user 文案；要求严格 JSON 输出） */
export function buildReviewPrompts(
  doc: CeshuDocument,
  input: { progressTotal: number; validationCount: number }
): { system: string; prompt: string } {
  const system = [
    '你是资深游戏策划审阅专家。请对策划书进行结构化审阅，输出严格 JSON。',
    'JSON 格式如下：',
    '{',
    '  "dimensions": [',
    '    {"key":"completeness","label":"内容完整性","score":1-10,"feedback":"详细反馈"},',
    '    {"key":"consistency","label":"逻辑一致性","score":1-10,"feedback":"详细反馈"},',
    '    {"key":"market","label":"市场可行性","score":1-10,"feedback":"详细反馈"},',
    '    {"key":"technical","label":"技术可行性","score":1-10,"feedback":"详细反馈"},',
    '    {"key":"creativity","label":"创意度","score":1-10,"feedback":"详细反馈"}',
    '  ],',
    '  "overall":"总体评价 100-200 字",',
    '  "suggestions":["改进建议1","改进建议2","改进建议3"]',
    '}',
    '只输出 JSON，不要加任何解释或 markdown 标记。'
  ].join('\n')

  const prompt =
    `请对以下策划书进行 5 维度结构化审阅：\n\n${buildReviewSummary(doc)}\n\n` +
    `完成进度: ${Math.round(input.progressTotal * 100)}%\n` +
    `内置校验问题数: ${input.validationCount}\n` +
    `风格: ${doc.style || '未指定'}, 模块类型: ${doc.module_type || '未指定'}\n\n` +
    '评分标准：1-3 分（严重不足）/ 4-6 分（合格）/ 7-8 分（良好）/ 9-10 分（优秀）。'

  return { system, prompt }
}

/** 解析审阅输出：维度按规范顺序补全、分数截断到 1-10、建议补足 3 条；失败时 parsed=false 且保留原文 */
export function parseReviewResponse(content: string): CeshuReviewPayload {
  const parsed = parseLlmJson(content)
  const rawDimensions = parsed['dimensions']
  if (!Array.isArray(rawDimensions)) {
    return { dimensions: [], overall: '', suggestions: [], rawText: content, parsed: false }
  }
  const byKey = new Map<string, Record<string, unknown>>()
  for (const entry of rawDimensions) {
    if (isPlainObject(entry) && typeof entry['key'] === 'string') byKey.set(entry['key'], entry)
  }
  const dimensions: CeshuReviewDimension[] = REVIEW_DIMENSION_KEYS.map((key) => {
    const entry = byKey.get(key)
    const rawScore = Number(entry?.['score'])
    let score = Number.isFinite(rawScore) ? Math.trunc(rawScore) : 0
    if (score < 1) score = 1
    if (score > 10) score = 10
    const label = typeof entry?.['label'] === 'string' && entry['label'] !== '' ? entry['label'] : REVIEW_DIMENSION_LABELS[key]
    const feedback = typeof entry?.['feedback'] === 'string' ? entry['feedback'] : ''
    return { key, label, score, feedback }
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
  return { dimensions, overall, suggestions, rawText: content, parsed: true }
}

/** 审阅报告 Markdown（照抄 Python AIReviewDialog._build_markdown） */
export function buildReviewMarkdown(
  gameName: string,
  reviewedAt: string,
  result: CeshuAiReviewResult
): string {
  const lines = [
    '# AI 智能审阅报告',
    '',
    `**游戏名称**: ${gameName}`,
    `**审阅时间**: ${reviewedAt}`,
    '',
    '## 维度评分',
    '',
    '| 维度 | 分数 | 反馈 |',
    '|------|------|------|'
  ]
  for (const dim of result.dimensions) {
    const feedback = dim.feedback.replace(/\n/g, ' ').replace(/\|/g, '\\|')
    lines.push(`| ${dim.label} | ${dim.score} / 10 | ${feedback} |`)
  }
  lines.push('', '## 总体评价', '', result.overall || '（无）')
  lines.push('', '## Top 3 改进建议', '')
  result.suggestions.slice(0, 3).forEach((suggestion, index) => lines.push(`${index + 1}. ${suggestion}`))
  if (result.progressTotal > 0) lines.push('', `**策划书完成进度**: ${Math.round(result.progressTotal * 100)}%`)
  if (result.validationCount > 0) lines.push(`**内置校验问题数**: ${result.validationCount}`)
  return lines.join('\n')
}