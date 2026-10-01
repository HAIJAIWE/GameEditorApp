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
import { CESHU_CHAPTER_FIELDS } from './ceshuFields'
import { isPlainObject } from './ceshuModel'

/**
 * 策划书 AI 生成纯逻辑（自 Python core/agent/skills 的 ceshu_skill_generate / ceshu_agent_router
 * / ceshu_style_helpers 匹平迁移）：子智能体路由、风格术语表、整章提示词组装、LLM 输出容错解析。
 */

/* ---- 子智能体路由（匹平 Python AgentRouter，18 章完整映射） ---- */

const CHAPTER_AGENT_MAP: Record<ChapterKey, string> = {
  meta: '通用策划助手',
  vision: '通用策划助手',
  worldview: 'content_writer',
  gameplay: '通用策划助手',
  systems: 'game_designer',
  numeric: 'data_analyst',
  art: '通用策划助手',
  tech: 'code_assistant',
  resources: '通用策划助手',
  market_analysis: 'data_analyst',
  characters: 'content_writer',
  combat: 'game_designer',
  economy: 'data_analyst',
  monetization: '通用策划助手',
  mvp: 'code_assistant',
  risk_handling: '通用策划助手',
  audio: '通用策划助手',
  accessibility: '通用策划助手'
}

const AGENT_DISPLAY: Record<string, string> = {
  game_designer: '策划专家',
  content_writer: '文案写手',
  data_analyst: '数据分析师',
  code_assistant: '代码助手',
  通用策划助手: '通用策划助手'
}

const CHAPTER_AGENT_PROMPTS: Record<ChapterKey, string> = {
  meta: '请根据当前项目元信息，补充游戏名称和类型建议。',
  vision: '请分析市场定位和竞品，给出差异化建议。',
  worldview: '请为世界观设定提出创意构思或优化现有设定。',
  gameplay: '请分析核心玩法设计，提出改进建议。',
  systems: '请设计或审查游戏系统规则和参数。',
  numeric: '请分析数值框架，提供平衡性建议。',
  art: '请提供美术风格方向和配色方案建议。',
  tech: '请提供技术选型、架构方案和开发计划建议。',
  resources: '请协助规划资源清单和风险评估。',
  market_analysis: '请分析目标市场、竞品和用户画像，提供市场定位建议。',
  characters: '请设计主角、NPC、反派和 Boss 角色，包含背景与成长弧线。',
  combat: '请设计战斗机制、技能系统、伤害公式和平衡策略。',
  economy: '请设计货币体系、产出回收机制和通胀控制策略。',
  monetization: '请设计付费模式、定价档位和运营策略，平衡免费与付费体验。',
  mvp: '请规划 MVP 范围、里程碑和验收标准，确保核心玩法可验证。',
  risk_handling: '请识别技术/市场/团队/进度风险，制定应对和监控策略。',
  audio: '请设计音乐风格、音效清单和音频技术规格。',
  accessibility: '请规划多语言支持、无障碍特性和分级认证。'
}

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

/* ---- 风格术语表（匹平 Python _STYLE_GLOSSARIES） ---- */

export const STYLE_GLOSSARIES: Record<string, string> = {
  xianxia:
    '气血=HP, 灵力=MP, 修为=经验, 渡劫=升级关键节点\n境界划分: 练气→筑基→金丹→元婴→化神→渡劫→大乘→飞升\n宗门/门派系统, 法宝=装备, 丹药=消耗品, 功法=技能\n灵石=货币, 天地人=品质分级, 仙魔妖=阵营',
  wuxia:
    '气血=HP, 内力=MP, 经验=阅历\n境界: 三流→二流→一流→后天→先天→宗师→大成\n门派/帮派系统, 兵器=装备, 秘籍=技能书\n银两=货币, 武功=技能, 经脉=属性系统',
  'sci-fi':
    'HP=生命值, MP=能量/护盾, 经验=数据/经验值\n等级=军衔/阶级, 装备=武器/护甲/模块\n货币=信用点/星币, 阵营=联邦/帝国/自由联盟\n技能=战术模块, 消耗品=医疗包/能量电池',
  fantasy:
    'HP=生命值, MP=魔法值, 经验=经验值\n种族: 人类/精灵/矮人/兽人/龙裔\n职业: 战士/法师/牧师/盗贼/游侠/圣骑士\n装备=武器/护甲/饰品, 货币=金币/银币/铜币\n魔法=元素: 火/水/土/风/光/暗',
  post_apoc:
    'HP=生命值, 辐射值=Radiation, 饥饿度/口渴度\n资源= scrap(废料)/弹药/食物/水/燃料\n装备=武器/护甲/防毒面具, 阵营=幸存者/掠夺者/军方\n技能=生存技能, 消耗品=治疗针/抗辐射药',
  realistic:
    'HP=生命值, 体力=Stamina, 经验=经验值\n装备=武器/护甲/配件, 货币=游戏币/真实货币\n等级=军衔/段位, 技能=主动/被动技能'
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

const REQUIREMENTS_ONLY_EMPTY = [
  '要求：',
  '1. 只输出上面字段列表中列出的空字段，已填字段一律不要输出',
  '2. 字段值要具体、专业、符合游戏类型和风格',
  '3. 字符串字段生成 50-300 字的专业内容',
  '4. 列表字段生成 2-5 个元素的列表',
  '5. 数字字段生成合理的整数值',
  '6. 只输出 JSON，不要加任何解释'
].join('\n')

const REQUIREMENTS_FULL = [
  '要求：',
  '1. 必须为字段列表中的每个字段都生成内容（即使是空字符串也要包含键）',
  '2. 字段值要具体、专业、符合游戏类型和风格',
  '3. 字符串字段生成 50-300 字的专业内容',
  '4. 列表字段生成 2-5 个元素的列表',
  '5. 数字字段生成合理的整数值',
  '6. 只输出 JSON，不要加任何解释'
].join('\n')

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
}

/**
 * 解析 LLM 返回的 JSON（匹平 Python _parse_llm_json 容错）：
 * 去 markdown 代码块围栏 → 截取首尾大括号 → 解析失败再去尾逗号重试；失败返回 {}。
 */
export function parseLlmJson(content: string): Record<string, unknown> {
  if (!content) return {}
  let text = content.trim()
  if (text.startsWith('```')) {
    const lines = text.split('\n')
    if (lines[0]?.startsWith('```')) lines.shift()
    if (lines.length > 0 && lines[lines.length - 1]?.startsWith('```')) lines.pop()
    text = lines.join('\n')
  }
  const start = text.indexOf('{')
  const end = text.lastIndexOf('}')
  if (start >= 0 && end > start) text = text.slice(start, end + 1)

  const parsed = tryParseObject(text)
  if (parsed) return parsed
  const cleaned = text.replace(/,\s*}/g, '}').replace(/,\s*]/g, ']')
  return tryParseObject(cleaned) ?? {}
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

function tryParseObject(text: string): Record<string, unknown> | null {
  try {
    const parsed: unknown = JSON.parse(text)
    return isPlainObject(parsed) ? parsed : null
  } catch {
    return null
  }
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

function readText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/* ---- 全量生成（一键生成完整策划书，匹平 Python ai_full_generate_dialog + ceshu_skill_prompt） ---- */

export const FULL_GEN_GAME_TYPES = [
  'RPG',
  'MMORPG',
  'ARPG',
  'MOBA',
  'FPS',
  'SLG',
  '休闲',
  '放置',
  '卡牌',
  '塔防',
  'Roguelike',
  '策略'
]

export const FULL_GEN_STYLES = [
  '仙侠',
  '武侠',
  '科幻',
  '现代',
  '奇幻',
  '末日',
  '历史',
  '二次元',
  '暗黑',
  '赛博朋克',
  '蒸汽朋克'
]

export const FULL_GEN_BUSINESS_MODELS = ['F2P', 'P2P', 'Buyonce', '混合']

export const FULL_GEN_PLATFORMS = ['PC', '移动端', '主机', 'Web']

const STYLE_LABEL_TO_KEY: Record<string, string> = {
  仙侠: 'xianxia',
  武侠: 'wuxia',
  科幻: 'sci-fi',
  现代: 'realistic',
  奇幻: 'fantasy',
  末日: 'post_apoc',
  历史: 'realistic',
  二次元: 'anime',
  暗黑: 'dark',
  赛博朋克: 'cyberpunk',
  蒸汽朋克: 'steampunk'
}

const TYPE_LABEL_TO_KEY: Record<string, string> = {
  RPG: 'rpg',
  MMORPG: 'mmorpg',
  ARPG: 'arpg',
  MOBA: 'moba',
  FPS: 'fps',
  SLG: 'slg',
  休闲: 'casual',
  放置: 'casual',
  卡牌: 'card',
  塔防: 'tower_defense',
  Roguelike: 'roguelike',
  策略: 'strategy'
}

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

/** 18 章生成顺序（对应 Python _build_chapter_order：market 在 vision 后、risk 在 tech 后） */
export function buildChapterOrder(includeMarket: boolean, includeRisk: boolean): ChapterKey[] {
  const order: ChapterKey[] = ['meta', 'vision']
  if (includeMarket) order.push('market_analysis')
  order.push(
    'worldview',
    'characters',
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

/** 18 章生成要求（照抄 Python chapter_hint，供全量生成逐章追加提示） */
export const CHAPTER_GENERATION_HINTS: Record<ChapterKey, string> = {
  meta: '请生成项目元信息：游戏名称、类型、市场定位（一句话）、标签列表（3-5个）。',
  vision: '请生成产品愿景：设计愿景、差异化卖点、用户画像（主/次/潜在）、商业模式。',
  market_analysis: '请生成市场分析：目标市场、市场容量、用户画像、竞品列表、市场定位、进入壁垒、市场趋势、KPI预测。',
  worldview: '请生成世界观：世界观架构、历史时代、阵营列表、地理设定、主线剧情、分支结局、角色关系网。',
  characters: '请生成角色设计：主角设定、主要NPC数量与列表、反派设计、Boss设计、敌人类型、同伴系统、角色成长弧线。',
  gameplay: '请生成核心玩法：核心循环、操作方案、首30分钟体验、游戏模式、胜负条件、新手引导。',
  combat: '请生成战斗系统：战斗模式、伤害公式、技能系统、Buff机制、元素系统、战斗节奏、PVP/PVE设计、Boss机制。',
  systems: '请生成游戏系统：基于玩法需求推荐应启用的游戏系统及配置（保留 systems 结构中 enabled/config 字段）。',
  economy: '请生成经济系统：货币类型、产出与回收机制、掉落表、生产链、市场设计、通胀控制、经济目标。',
  monetization: '请生成商业化设计：付费模式、定价档位、内购设计、广告策略、订阅制、赛季通行证、VIP系统、收入预测。',
  numeric: '请生成数值设计：核心公式、成长曲线、掉落表、经济模型、平衡原则。',
  art: '请生成美术设计：美术风格、角色设计、环境设计、UI设计语言、色彩系统、字体、特效、动画、多分辨率。',
  audio: '请生成音频设计：音乐风格、音效数量、配乐清单、音效清单、配音设计、音频引擎、动态音频、音频预算。',
  tech: '请生成技术规格：引擎选型、核心架构、第三方依赖、性能目标、里程碑、团队结构、QA计划。',
  risk_handling: '请生成风险控制：风险矩阵、应急预案、技术风险、市场风险、团队风险、法律风险、进度风险、监控机制。',
  mvp: '请生成MVP规划：MVP范围、时间线、核心特性、暂缓特性、原型特性、里程碑、成功标准、团队规模、预算估算。',
  resources: '请生成资源规划：美术资产、音频资产、本地化、外包、预算、风险矩阵、应急预案、IP、附录。',
  accessibility: '请生成可访问性与本地化：支持语言列表、本地化策略、文化适配、无障碍特性、字幕设计、色盲支持、分级认证。'
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

/** 5 维顺序（固定为规范顺序；Python 用 set 遍历、顺序不稳定，已修正） */
export const REVIEW_DIMENSION_KEYS = ['completeness', 'consistency', 'market', 'technical', 'creativity'] as const
export type ReviewDimensionKey = (typeof REVIEW_DIMENSION_KEYS)[number]

export const REVIEW_DIMENSION_LABELS: Record<ReviewDimensionKey, string> = {
  completeness: '内容完整性',
  consistency: '逻辑一致性',
  market: '市场可行性',
  technical: '技术可行性',
  creativity: '创意度'
}

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