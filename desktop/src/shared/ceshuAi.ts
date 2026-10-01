import {
  type CeshuDocument,
  type ChapterKey
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

export function buildChapterPrompt(
  doc: CeshuDocument,
  chapter: ChapterKey,
  options: { onlyEmpty?: boolean } = {}
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
  if (doc.style) {
    const glossary = getStyleGlossary(doc.style)
    if (glossary) {
      contextLines.push(`风格: ${doc.style}`)
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