import {
  CHAPTER_LABELS,
  CHAPTER_REQUIRED_FIELDS,
  chapterOrdinalCn,
  checkSystemDependencies,
  visibleChapterKeys,
  type ChapterData,
  type CeshuDocument
} from './ceshuConstants'
import { normalizeValue } from './ceshuDiff'
import { detectFieldOverlaps, fieldOverlapMessage } from './ceshuOverlap'
import { detectTerminologyConflicts, terminologyConflictMessages } from './ceshuTerminology'
import {
  analyzeTextQuality,
  contentQualityIssues,
  ANALYSIS_MIN_CHARS as QUALITY_MIN_CHARS
} from './ceshuContentQuality'
import { CESHU_CHAPTER_FIELDS } from './ceshuFields'
import { getGddScope, isEmptyRequiredValue, isPlainObject } from './ceshuModel'
import { readText } from './util/readText'

/**
 * 策划书数据完整性校验（自 Python ceshu_validation.py 匹平迁移）。
 * 校验范围：必填字段非空 + 11 项章节间一致性检查 + 内容重复检测 + 术语一致性 + 内容质量提示；返回错误/警告文案列表（空数组=全部通过）。
 */
export function validateCeshu(doc: CeshuDocument): string[] {
  const errors: string[] = []

  // 基础必填字段检查（按档位可见章节：lite 只校验基础 9 章）
  for (const key of visibleChapterKeys(getGddScope(doc))) {
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
        errors.push(`${label}：字段 '${field}' 为必填项`)
      }
    }
  }

  // === 章节间一致性检查 ===

  const battleConfig = systemConfig(doc, 'battle')
  const economyConfig = systemConfig(doc, 'economy')

  // 1. combat.combat_mode 与 systems.battle.config.turn_mode 应一致
  const combatMode = readText(doc.combat.combat_mode)
  const battleTurnMode = readText(battleConfig['turn_mode'])
  if (combatMode && battleTurnMode && combatMode !== battleTurnMode) {
    errors.push(
      `一致性冲突：第${chapterOrdinalCn('combat')}章 combat.combat_mode='${combatMode}' 与 第${chapterOrdinalCn('systems')}章 systems.battle.config.turn_mode='${battleTurnMode}' 不一致`
    )
  }

  // 2. monetization.payment_model 与 systems.economy.config.payment_system 应一致
  const paymentModel = readText(doc.monetization.payment_model)
  const economyPayment = readText(economyConfig['payment_system'])
  if (paymentModel && economyPayment && paymentModel !== economyPayment) {
    errors.push(
      `一致性冲突：第${chapterOrdinalCn('monetization')}章 monetization.payment_model='${paymentModel}' 与 第${chapterOrdinalCn('systems')}章 systems.economy.config.payment_system='${economyPayment}' 不一致`
    )
  }

  // 3. risk_handling.risk_matrix 与 resources.risk_matrix 应同步
  const riskHandling = nonEmptyArray(doc.risk_handling.risk_matrix)
  const resourcesRisk = nonEmptyArray(doc.resources.risk_matrix)
  if (riskHandling && resourcesRisk && normalizeValue(riskHandling) !== normalizeValue(resourcesRisk)) {
    errors.push('一致性警告：risk_handling.risk_matrix 与 resources.risk_matrix 内容不一致，建议统一')
  }

  // 4. worldview.factions 与 social.faction_system 应协同
  const factions = nonEmptyArray(doc.story.factions)
  const factionSystem = readText(systemConfig(doc, 'social')['faction_system'])
  if (factions && factionSystem === 'none') {
    errors.push(`一致性冲突：第${chapterOrdinalCn('story')}章 story.factions 已设定阵营，但 systems.social.config.faction_system='none'`)
  }

  // 5. art.art_style 与 audio.music_style 风格应协同（像素风 ↔ 交响乐提示）
  const artStyle = readText(doc.art.art_style)
  const musicStyle = readText(doc.audio.music_style)
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
  const mvpMilestones = nonEmptyArray(doc.mvp.milestones)
  const techMilestones = nonEmptyArray(doc.tech.milestones)
  if (mvpMilestones && techMilestones && normalizeValue(mvpMilestones) !== normalizeValue(techMilestones)) {
    errors.push(`一致性警告：第${chapterOrdinalCn('mvp')}章 mvp.milestones 与 第${chapterOrdinalCn('tech')}章 tech.milestones 不一致，MVP 里程碑应与技术里程碑对齐`)
  }

  // 7. monetization.pricing_tiers 与 systems.economy.config.recharge_tiers 应一致
  const pricingTiers = nonEmptyArray(doc.monetization.pricing_tiers)
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
  const languageList = nonEmptyArray(doc.accessibility.language_list)
  const localization = nonEmptyArray(doc.resources.localization)
  if (languageList && localization && normalizeValue(languageList) !== normalizeValue(localization)) {
    errors.push(`一致性警告：第${chapterOrdinalCn('accessibility')}章 accessibility.language_list 与 第${chapterOrdinalCn('resources')}章 resources.localization 不一致，建议统一`)
  }

  // 9. characters.main_npc_count 与 characters.npc_list 数量应一致
  const npcCount = doc.story.main_npc_count
  const npcList = nonEmptyArray(doc.story.npc_list)
  if (typeof npcCount === 'number' && npcCount !== 0 && npcList && Math.abs(npcCount - npcList.length) > Math.max(2, Math.trunc(npcCount * 0.2))) {
    errors.push(`一致性警告：第${chapterOrdinalCn('story')}章 story.main_npc_count=${npcCount} 与 npc_list 实际数量=${npcList.length} 差异较大，请核对`)
  }

  // 10. economy.currency_types 与 systems.economy.config.currency_types 应一致
  const economyCurrencies = nonEmptyArray(doc.economy.currency_types)
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
  const enabledSystems = Object.entries(doc.systems)
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

  /*
   * 14. 内容质量（「写对」代理指标）：机器可判定的空话/长句/数字具体性。
   *
   * 为什么单独一项：此前的「内容质量」评分只看**字数是否落在基准区间**，
   * 等于奖励「写满」；本项补上「写对」的机器信号，与评分互补（不替代）。
   * 只查 schema 内的自由文本字段，且只输出经过人类写作基线校准的判据
   * （2026-10-23 用 docs/ 161 段真实写作校准，见 ceshuContentQuality 内注释）。
   */
  for (const key of visibleChapterKeys(getGddScope(doc))) {
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
  const entry = doc.systems[systemId]
  if (!isPlainObject(entry) || !isPlainObject(entry.config)) return {}
  return entry.config
}

function nonEmptyArray(value: unknown): unknown[] | null {
  return Array.isArray(value) && value.length > 0 ? value : null
}

/** 提取货币名称：dict 取 name，字符串原样（对应 Python 名称提取规则） */
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