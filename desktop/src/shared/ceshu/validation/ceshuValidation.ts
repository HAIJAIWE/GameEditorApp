import {
  CHAPTER_LABELS,
  CHAPTER_REQUIRED_FIELDS,
  chapterOrdinalCn,
  checkSystemDependencies,
  type ChapterData,
  type CeshuDocument
} from '../reference/ceshuConstants'
import { normalizeValue } from '../workflow/ceshuDiff'
import { couplingMessages } from '../workflow/ceshuCoupling'
import { detectFieldOverlaps, fieldOverlapMessage } from '../workflow/ceshuOverlap'
import { detectTerminologyConflicts, terminologyConflictMessages } from '../reference/ceshuTerminology'
import {
  analyzeTextQuality,
  contentQualityIssues,
  ANALYSIS_MIN_CHARS as QUALITY_MIN_CHARS
} from './ceshuContentQuality'
import { CESHU_CHAPTER_FIELDS } from '../fields/ceshuFields'
import { isEmptyRequiredValue, isPlainObject, visibleChaptersForDoc } from '../model/ceshuModel'
import {
  buildPrototypeResults,
  checkDesignClaimsWith,
  evaluateAssertions,
  type AssertionResult
} from './ceshuNumericAssert'
import { checkLedger, checkPrototypeAcceptanceResults, checkTestCaseList } from '../notes/ceshuEvidence'
import { column } from '../workflow/ceshuPipeRows'
import { readText } from '../../util/readText'

/**
 * 策划书数据完整性校验。
 * 校验范围：必填字段非空 + 11 项章节间一致性检查 + 内容重复检测 + 术语一致性 + 内容质量提示；返回错误/警告文案列表（空数组=全部通过）。
 *
 * ## 2026-10-24 重构为 CHECKS 注册表（改造档3）
 * 原 308 行平铺的「for 循环塞检查」改为 `CESHU_CHECKS` 注册表：每项 `{ id, run(ctx) }`
 * 独立、可单测、可单独开关。校验上下文（文档 + 已复算的断言结论 + 原型验收映射）
 * 只构建一次，消除 `checkDesignClaims` 与 `checkNumericAssertions` 各自重算
 * `evaluateAssertions` 的重复计算。消息文案与重构前逐字节一致（由 ceshuValidation
 * 现有单测 + ceshuValidation.checks 守卫）。
 */

/** 校验上下文：整份文档只构建一次，供所有检查共享 */
export interface CeshuCheckContext {
  doc: CeshuDocument
  /** `evaluateAssertions(doc)` 的结论（数值断言复算，只算一次） */
  assertionResults: AssertionResult[]
  /** QA 原型验收（检查项 → 结果）映射，供实测类主张核对 */
  prototypeResults: Map<string, string>
}

/** 单条校验：给定上下文，返回该检查产出的消息（可能多条，也可能为空） */
export interface CeshuCheck {
  id: string
  run(ctx: CeshuCheckContext): string[]
}

/** 构建校验上下文（只算一次 evaluateAssertions，避免重复复算） */
export function buildCheckContext(doc: CeshuDocument): CeshuCheckContext {
  return {
    doc,
    assertionResults: evaluateAssertions(doc),
    prototypeResults: buildPrototypeResults(doc)
  }
}

export function validateCeshu(doc: CeshuDocument): string[] {
  const context = buildCheckContext(doc)
  return CESHU_CHECKS.flatMap((check) => check.run(context))
}

/** 校验注册表（顺序即消息产出顺序，与重构前一致；新增检查 = 追加一项） */
export const CESHU_CHECKS: CeshuCheck[] = [
  { id: 'requiredFields', run: checkRequiredFields },
  { id: 'crossChapterConsistency', run: checkCrossChapterConsistency },
  { id: 'contentQuality', run: checkContentQuality },
  { id: 'numericAssertions', run: checkNumericAssertionsMessages },
  { id: 'designClaims', run: checkDesignClaimsMessages },
  { id: 'prototypeAcceptance', run: checkPrototypeAcceptanceMessages },
  { id: 'testCaseList', run: (ctx) => checkTestCaseList(ctx.doc) },
  { id: 'ledger', run: (ctx) => checkLedger(ctx.doc) },
  // 可开发性缺口（字段联动）：填了 A 却没填 B，完备度是绿的但开不了工
  { id: 'fieldCoupling', run: (ctx) => couplingMessages(ctx.doc) }
]

// ---------- 各检查实现（body 与重构前逐字节一致） ----------

function checkRequiredFields(ctx: CeshuCheckContext): string[] {
  const { doc } = ctx
  const errors: string[] = []

  // 基础必填字段检查（按档位可见章节：lite 只校验基础 9 章）
  for (const key of visibleChaptersForDoc(doc)) {
    if (key === 'systems') continue // 游戏系统无必填字段
    const required = CHAPTER_REQUIRED_FIELDS[key]
    if (required.length === 0) continue
    const label = CHAPTER_LABELS[key]
    const data = doc[key]
    if (!isPlainObject(data)) {
      errors.push(`${label}：章节数据格式异常`)
      continue
    }
    for (const field of required) {
      if (isEmptyRequiredValue(data[field])) {
        /*
         * 人定必填字段（aiDraftable=false：引擎选型、NPC 数量这类决策项）单独措辞。
         * 2026-10-23 复刻演练发现：它们被报成「为必填项」的硬错误，但 AI 按契约
         * 永远不生成它们 ⇒ 这条错误无法通过生成消除，只能手填，却混在必填缺失里
         * 一起催人。改为「由人确定，尚未填写」——同样醒目，但归入建议检查分组。
         */
        const fieldDef = (CESHU_CHAPTER_FIELDS[key] ?? []).find((item) => item.key === field)
        if (fieldDef !== undefined && fieldDef.aiDraftable === false) {
          errors.push(`${label}：字段 '${field}' 由人确定，尚未填写（AI 不起草，需人工决断）`)
          continue
        }
        errors.push(`${label}：字段 '${field}' 为必填项`)
      }
    }
  }

  return errors
}

function checkCrossChapterConsistency(ctx: CeshuCheckContext): string[] {
  const { doc } = ctx
  const errors: string[] = []

  const battleConfig = systemConfig(doc, 'battle')
  const economyConfig = systemConfig(doc, 'economy')

  // 1. combat.combat_mode 与 systems.battle.config.turn_mode 应一致
  const combatMode = readText(doc.combat?.combat_mode)
  const battleTurnMode = readText(battleConfig['turn_mode'])
  if (combatMode && battleTurnMode && combatMode !== battleTurnMode) {
    errors.push(
      `一致性冲突：第${chapterOrdinalCn('combat')}章 combat.combat_mode='${combatMode}' 与 第${chapterOrdinalCn('systems')}章 systems.battle.config.turn_mode='${battleTurnMode}' 不一致`
    )
  }

  // 2. monetization.payment_model 与 systems.economy.config.payment_system 应一致
  const paymentModel = readText(doc.monetization?.payment_model)
  const economyPayment = readText(economyConfig['payment_system'])
  if (paymentModel && economyPayment && paymentModel !== economyPayment) {
    errors.push(
      `一致性冲突：第${chapterOrdinalCn('monetization')}章 monetization.payment_model='${paymentModel}' 与 第${chapterOrdinalCn('systems')}章 systems.economy.config.payment_system='${economyPayment}' 不一致`
    )
  }

  /*
   * 3. resources 的 TOP 风险应出现在 risk_handling 矩阵里。
   * P1 已把两边契约划界（resources=资源视角 TOP 概要、risk_handling=完整五列矩阵），
   * 内容必然不同 ⇒ 2026-10-23 复刻演练暴露旧的「逐字不同就报不一致」已过时
   * （三份不同游戏的产出全部误报）。新语义：概要列出的每条风险，详细矩阵里
   * 必须能找到对应——概要不是详情的子集才是真问题。
   */
  const riskHandlingText = JSON.stringify(doc.risk_handling?.risk_matrix ?? [])
  const missingTopRisks: string[] = []
  const resourceRiskMatrix = doc.resources?.risk_matrix
  for (const entry of Array.isArray(resourceRiskMatrix) ? resourceRiskMatrix : []) {
    const name = topRiskName(entry)
    if (name !== '' && !riskHandlingText.includes(name)) missingTopRisks.push(name)
  }
  if (missingTopRisks.length > 0) {
    errors.push(
      `一致性警告：资源规划列出的 TOP 风险未出现在第十三章矩阵：${missingTopRisks.join('、')}，建议补充或改由十三章统一维护`
    )
  }

  // 4. worldview.factions 与 social.faction_system 应协同
  const factions = nonEmptyArray(doc.story?.factions)
  const factionSystem = readText(systemConfig(doc, 'social')['faction_system'])
  if (factions && factionSystem === 'none') {
    errors.push(`一致性冲突：第${chapterOrdinalCn('story')}章 story.factions 已设定阵营，但 systems.social.config.faction_system='none'`)
  }

  // 5. art.art_style 与 audio.music_style 风格应协同（像素风 ↔ 交响乐提示）
  const artStyle = readText(doc.art?.art_style)
  const musicStyle = readText(doc.audio?.music_style)
  if (artStyle && musicStyle) {
    const artLower = artStyle.toLowerCase()
    const musicLower = musicStyle.toLowerCase()
    if ((artStyle.includes('像素') || artLower.includes('pixel')) && (musicStyle.includes('交响') || musicLower.includes('symphony'))) {
      errors.push(
        `一致性警告：第${chapterOrdinalCn('art')}章 art.art_style='${artStyle}' 与 第${chapterOrdinalCn('audio')}章 audio.music_style='${musicStyle}' 风格不协调，建议匹配`
      )
    }
  }

  // 6. mvp.milestones 与 tech.milestones 应一致
  // 两字段存储形态不同：mvp.milestones 带 columns（对象行），tech.milestones 无 columns（字符串行）。
  // 形态不同时逐字比对必然不等 → 永久误报，故仅在「同为对象行 / 同为字符串行」时比对。
  const mvpMilestones = nonEmptyArray(doc.mvp?.milestones)
  const techMilestones = nonEmptyArray(doc.tech?.milestones)
  const milestonesSameShape =
    mvpMilestones !== null &&
    techMilestones !== null &&
    isPlainObject(mvpMilestones[0]) === isPlainObject(techMilestones[0])
  if (milestonesSameShape && normalizeValue(mvpMilestones) !== normalizeValue(techMilestones)) {
    errors.push(`一致性警告：第${chapterOrdinalCn('mvp')}章 mvp.milestones 与 第${chapterOrdinalCn('tech')}章 tech.milestones 不一致，MVP 里程碑应与技术里程碑对齐`)
  }

  // 7. monetization.pricing_tiers 与 systems.economy.config.recharge_tiers 应一致
  const pricingTiers = nonEmptyArray(doc.monetization?.pricing_tiers)
  const rechargeRaw = economyConfig['recharge_tiers']
  if (pricingTiers && rechargeRaw) {
    const rechargeTiers = typeof rechargeRaw === 'string'
      ? rechargeRaw.split(',').map((item) => item.trim()).filter((item) => item !== '')
      : Array.isArray(rechargeRaw)
        ? rechargeRaw
        : []
    if (rechargeTiers.length > 0 && normalizeValue(rechargeTiers) !== normalizeValue(pricingTiers)) {
      errors.push(`一致性警告：第${chapterOrdinalCn('monetization')}章 monetization.pricing_tiers 与 systems.economy.config.recharge_tiers 不一致，建议统一`)
    }
  }

  // 8. accessibility.language_list 与 resources.localization 应一致
  const languageList = nonEmptyArray(doc.accessibility?.language_list)
  const localization = nonEmptyArray(doc.resources?.localization)
  if (languageList && localization && normalizeValue(languageList) !== normalizeValue(localization)) {
    errors.push(`一致性警告：第${chapterOrdinalCn('accessibility')}章 accessibility.language_list 与 第${chapterOrdinalCn('resources')}章 resources.localization 不一致，建议统一`)
  }

  // 9. characters.main_npc_count 与 characters.npc_list 数量应一致
  const npcCount = doc.story?.main_npc_count
  const npcList = nonEmptyArray(doc.story?.npc_list)
  if (typeof npcCount === 'number' && npcCount !== 0 && npcList && Math.abs(npcCount - npcList.length) > Math.max(2, Math.trunc(npcCount * 0.2))) {
    errors.push(`一致性警告：第${chapterOrdinalCn('story')}章 story.main_npc_count=${npcCount} 与 npc_list 实际数量=${npcList.length} 差异较大，请核对`)
  }

  // 10. economy.currency_types 与 systems.economy.config.currency_types 应一致
  const economyCurrencies = nonEmptyArray(doc.economy?.currency_types)
  const systemCurrencies = economyConfig['currency_types']
  if (economyCurrencies && systemCurrencies) {
    const economyNames = extractNames(economyCurrencies)
    const systemNames = typeof systemCurrencies === 'string'
      ? systemCurrencies.split(',').map((item) => item.trim()).filter((item) => item !== '')
      : Array.isArray(systemCurrencies)
        ? extractNames(systemCurrencies)
        : []
    const economySet = new Set(economyNames.filter(Boolean))
    const systemSet = new Set(systemNames.filter(Boolean))
    if (economySet.size > 0 && systemSet.size > 0 && !sameStringSet(economySet, systemSet)) {
      errors.push(`一致性警告：第${chapterOrdinalCn('economy')}章 economy.currency_types 与 systems.economy.config.currency_types 不一致，建议统一`)
    }
  }

  // 11. 游戏系统依赖检查：启用某系统时，其依赖的系统必须也已启用
  const systemsData = isPlainObject(doc.systems) ? doc.systems : {}
  const enabledSystems = Object.entries(systemsData)
    .filter(([, value]) => isPlainObject(value) && (value.enabled === undefined ? true : Boolean(value.enabled)))
    .map(([key]) => key)
  for (const item of checkSystemDependencies(enabledSystems)) {
    errors.push(`依赖缺失：第${chapterOrdinalCn('systems')}章 systems.${item.system} 已启用，但其依赖系统 [${item.missing.join('、')}] 未启用`)
  }

  // 12. 字段内容重复检测：语义重叠的字段组被 AI 各写一遍时给出警告（附分工建议）
  for (const overlap of detectFieldOverlaps(doc)) {
    errors.push(fieldOverlapMessage(overlap))
  }

  // 13. 术语一致性：同一概念在全文用了不同叫法（如 生命值 / 血量）时提示统一
  for (const message of terminologyConflictMessages(detectTerminologyConflicts(doc))) {
    errors.push(message)
  }

  return errors
}

function checkContentQuality(ctx: CeshuCheckContext): string[] {
  const { doc } = ctx
  const errors: string[] = []

  /*
   * 14. 内容质量（「写对」代理指标）：机器可判定的空话/长句/数字具体性。
   *
   * 为什么单独一项：此前的「内容质量」评分只看**字数是否落在基准区间**，
   * 等于奖励「写满」；本项补上「写对」的机器信号，与评分互补（不替代）。
   * 只查 schema 内的自由文本字段，且只输出经过人类写作基线校准的判据
   * （2026-10-23 用 docs/ 161 段真实写作校准，见 ceshuContentQuality 内注释）。
   */
  for (const key of visibleChaptersForDoc(doc)) {
    const label = CHAPTER_LABELS[key]
    const data = doc[key]
    if (!isPlainObject(data)) continue
    for (const field of CESHU_CHAPTER_FIELDS[key] ?? []) {
      const raw = readQualityText(data, field.key)
      if (raw === null) continue // 非字符串 / 太短：没有分析价值
      const issues = contentQualityIssues(analyzeTextQuality(raw), {
        chapterLabel: label,
        fieldName: field.label
      })
      for (const message of issues) errors.push(message)
    }
  }

  return errors
}

function checkNumericAssertionsMessages(ctx: CeshuCheckContext): string[] {
  // 15. 数值断言复算：复用校验上下文里已复算的结论（只算一次，不重复 evaluateAssertions）
  return ctx.assertionResults.flatMap((result) => result.messages)
}

function checkDesignClaimsMessages(ctx: CeshuCheckContext): string[] {
  // 16. 设计主张证据核对：基于预计算的断言结论与原型验收映射（见 ceshuNumericAssert.checkDesignClaimsWith）
  return checkDesignClaimsWith(ctx.doc, ctx.assertionResults, ctx.prototypeResults)
}

function checkPrototypeAcceptanceMessages(ctx: CeshuCheckContext): string[] {
  // 17. 原型验收结果列受控枚举（2026-10-24 收敛）：无法识别的写法独立提醒，防模糊措辞糊弄「实测」核对
  return checkPrototypeAcceptanceResults(ctx.doc)
}

// ---------- 检查用模块级辅助 ----------

/** 内容质量检查的入参文本：只取长度达标的字符串（点路径支持；其余形态不参与） */
function readQualityText(data: ChapterData, path: string): string | null {
  let node: unknown = data
  for (const part of path.split('.')) {
    if (!isPlainObject(node)) return null
    node = node[part]
  }
  if (typeof node !== 'string') return null
  return node.length >= QUALITY_MIN_CHARS ? node : null
}

/** 读取系统 config（缺省为空对象） */
function systemConfig(doc: CeshuDocument, systemId: string): Record<string, unknown> {
  // 守卫：章节本身可能缺失（部分文档 / 跨章一致性校验在缺 systems 时不应抛错）。
  const systems = isPlainObject(doc.systems) ? doc.systems : {}
  const entry = systems[systemId]
  if (!isPlainObject(entry) || !isPlainObject(entry.config)) return {}
  return entry.config
}

function nonEmptyArray(value: unknown): unknown[] | null {
  return Array.isArray(value) && value.length > 0 ? value : null
}

/**
 * 取风险条目的「风险名」用于跨章包含检查：
 * - 字符串（pipeList/stringList）：取 `|` 或 `：` 前的第一段（列分隔或「名：描述」）
 * - 对象：取 risk / name 字段
 * 取不到返回空串（调用方跳过）。
 */
function topRiskName(entry: unknown): string {
  if (typeof entry === 'string') {
    return column(entry, 0).split('：')[0]?.trim() ?? ''
  }
  if (isPlainObject(entry)) {
    const risk = entry.risk ?? entry.name
    return typeof risk === 'string' ? risk.trim() : ''
  }
  return ''
}

/** 提取货币名称：dict 取 name，字符串原样 */
function extractNames(items: unknown[]): string[] {
  return items.map((item) => {
    if (isPlainObject(item)) return typeof item.name === 'string' ? item.name : ''
    if (typeof item === 'string') return item
    return ''
  })
}

function sameStringSet(left: Set<string>, right: Set<string>): boolean {
  if (left.size !== right.size) return false
  for (const item of left) {
    if (!right.has(item)) return false
  }
  return true
}
