/**
 * v4.0（9 章）→ v5.0（18 章）策划书数据迁移（自 Python `core/ceshu/ceshu_migration.py` 匹平迁移）。
 *
 * 由 `normalizeCeshu` 在检测到 `version === "4.0"` 或缺失任一新增章节时调用（对齐 Python
 * `CeshuModel.from_dict` 的懒加载迁移）：把散落在旧章节中的相关字段抽取到新章节，缺失字段
 * 取默认值，最后把版本号升级为 "5.0"。
 *
 * 语义要点（与 Python 逐条对齐）：
 *  - 旧 9 章原始数据保持不变（向后兼容），只读取不覆写；
 *  - 所有派生均带「目标为空才填」守卫，故重复执行幂等；
 *  - 真值判断一律用 Python `bool()` 语义（空数组/空对象为假），不可用 JS 原生真值。
 *
 * 注意：本模块刻意本地定义 `isPlainObject` / `pyTruthy`，以避免与 `ceshuModel` 形成循环导入
 * （`ceshuModel` → `ceshuMigration` → `ceshuModel`）；`ceshuCompetitiveChart.ts` 亦为同样处理。
 */

import { createDefaultChapters } from '../domain/ceshu/ceshuDefaults'

/** v5.0 相对 v4.0 新增的 9 章（顺序与 Python `from_dict` 缺章检测一致） */
export const V5_NEW_CHAPTER_KEYS = [
  'market_analysis',
  'story',
  'combat',
  'economy',
  'monetization',
  'mvp',
  'risk_handling',
  'audio',
  'accessibility'
] as const

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

/** Python 真值语义：null/undefined/''/0/false/空数组/空对象 → false */
function pyTruthy(value: unknown): boolean {
  if (value === null || value === undefined) return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return value !== ''
  if (Array.isArray(value)) return value.length > 0
  if (typeof value === 'object') return Object.keys(value).length > 0
  return true
}

/** 逗号分隔字符串 → 去空白后的非空项（对齐 Python `[x.strip() for x in s.split(',') if x.strip()]`） */
function splitCommaList(raw: string): string[] {
  return raw
    .split(',')
    .map((item) => item.trim())
    .filter((item) => item !== '')
}

/**
 * 是否需要 v4.0 → v5.0 迁移（对齐 Python `CeshuModel.from_dict` 的 `needs_migration` 判定）：
 * `version === "4.0"` 或任一新增章节缺失。
 */
export function needsV4Migration(raw: Record<string, unknown>): boolean {
  if (raw.version === '4.0') return true
  return V5_NEW_CHAPTER_KEYS.some((key) => !(key in raw))
}

/**
 * 把 v4.0（9 章）数据迁移到 v5.0（18 章）结构。
 *
 * 策略（对齐 Python `migrate_v4_to_v5`）：
 *  - 新 9 章缺失时补默认值（Python `setdefault`）；
 *  - 从旧章节派生新章节字段（仅在目标为空时填充）；
 *  - `version` 升级为 "5.0"。
 *
 * 注：与 Python `dict(data)` 一致，仅对顶层做浅拷贝——已存在的新章节对象会就地修改。
 */
export function migrateV4ToV5(raw: Record<string, unknown>): Record<string, unknown> {
  const defaults = createDefaultChapters()
  const data: Record<string, unknown> = { ...raw }

  // 1) 新 9 章缺失时补默认值
  const storyDefaults = isPlainObject(defaults.story) ? defaults.story : {}
  const worldviewSource = isPlainObject(data.worldview) ? data.worldview : {}
  const charactersSource = isPlainObject(data.characters) ? data.characters : {}
  data.story = { ...storyDefaults, ...worldviewSource, ...charactersSource, ...(isPlainObject(data.story) ? data.story : {}) }

  for (const key of V5_NEW_CHAPTER_KEYS) {
    if (!isPlainObject(data[key])) data[key] = defaults[key]
  }

  const marketAnalysis = data.market_analysis as Record<string, unknown>
  const story = isPlainObject(data.story) ? data.story : {}
  const combat = data.combat as Record<string, unknown>
  const economy = data.economy as Record<string, unknown>
  const monetization = data.monetization as Record<string, unknown>
  const mvp = data.mvp as Record<string, unknown>
  const riskHandling = data.risk_handling as Record<string, unknown>
  const audio = data.audio as Record<string, unknown>
  const accessibility = data.accessibility as Record<string, unknown>

  // 2) vision → market_analysis / monetization
  const vision = isPlainObject(data.vision) ? data.vision : {}
  if (pyTruthy(vision.competitive_analysis) && !pyTruthy(marketAnalysis.competitors)) {
    const oldCompetitors = vision.competitive_analysis
    if (Array.isArray(oldCompetitors)) {
      marketAnalysis.competitors = oldCompetitors.map((item) =>
        typeof item === 'string'
          ? { name: item, type: '', strengths: '', weaknesses: '', market_share: '' }
          : item
      )
    }
  }
  if (pyTruthy(vision.business_model) && !pyTruthy(monetization.payment_model)) {
    monetization.payment_model = vision.business_model
  }

  // 3) worldview.character_network → story.npc_list
  const worldview = isPlainObject(data.worldview) ? data.worldview : {}
  if (pyTruthy(worldview.character_network) && !pyTruthy(story.npc_list)) {
    const network = worldview.character_network
    if (Array.isArray(network)) story.npc_list = network
  }

  // 4) systems.battle.config → combat
  const systems = isPlainObject(data.systems) ? data.systems : {}
  const battleSystem = isPlainObject(systems.battle) ? systems.battle : {}
  const battleConfig = isPlainObject(battleSystem.config) ? battleSystem.config : {}
  if (pyTruthy(battleConfig.damage_formula) && !pyTruthy(combat.damage_formula)) {
    combat.damage_formula = battleConfig.damage_formula
  }
  if (pyTruthy(battleConfig.turn_mode) && !pyTruthy(combat.combat_mode)) {
    combat.combat_mode = battleConfig.turn_mode
  }
  if (pyTruthy(battleConfig.combat_pace) && !pyTruthy(combat.combat_pace)) {
    combat.combat_pace = battleConfig.combat_pace
  }

  // 5) systems.economy.config → economy
  const economySystem = isPlainObject(systems.economy) ? systems.economy : {}
  const economyConfig = isPlainObject(economySystem.config) ? economySystem.config : {}
  if (pyTruthy(economyConfig.currency_types) && !pyTruthy(economy.currency_types)) {
    const currencyTypes = economyConfig.currency_types
    if (typeof currencyTypes === 'string') {
      // 旧字段是逗号分隔字符串，新字段是对象列表
      economy.currency_types = splitCommaList(currencyTypes).map((name) => ({
        name,
        source: '',
        sink: '',
        exchange_rate: ''
      }))
    } else if (Array.isArray(currencyTypes)) {
      economy.currency_types = currencyTypes
    }
  }
  if (pyTruthy(economyConfig.source_mechanisms) && !pyTruthy(economy.source_sink)) {
    economy.source_sink = economyConfig.source_mechanisms
  }
  if (pyTruthy(economyConfig.inflation_control) && !pyTruthy(economy.inflation_control)) {
    economy.inflation_control = economyConfig.inflation_control
  }

  // 6) systems.economy.config → monetization
  if (pyTruthy(economyConfig.payment_system) && !pyTruthy(monetization.payment_model)) {
    monetization.payment_model = economyConfig.payment_system
  }
  if (pyTruthy(economyConfig.recharge_tiers) && !pyTruthy(monetization.pricing_tiers)) {
    const rechargeTiers = economyConfig.recharge_tiers
    if (typeof rechargeTiers === 'string') {
      monetization.pricing_tiers = splitCommaList(rechargeTiers)
    } else if (Array.isArray(rechargeTiers)) {
      monetization.pricing_tiers = rechargeTiers
    }
  }
  // 注意：此处判定是 `is not None`（非真值）：显式 false 也要转成「未启用」
  if (
    economyConfig.vip_system !== undefined &&
    economyConfig.vip_system !== null &&
    !pyTruthy(monetization.vip_system)
  ) {
    monetization.vip_system = pyTruthy(economyConfig.vip_system) ? '启用' : '未启用'
  }
  if (
    economyConfig.season_pass !== undefined &&
    economyConfig.season_pass !== null &&
    !pyTruthy(monetization.season_pass)
  ) {
    monetization.season_pass = pyTruthy(economyConfig.season_pass) ? '启用' : '未启用'
  }

  // 7) resources → audio / risk_handling / accessibility
  const resources = isPlainObject(data.resources) ? data.resources : {}
  if (pyTruthy(resources.audio_assets) && !pyTruthy(audio.sfx_list)) {
    const audioAssets = resources.audio_assets
    if (Array.isArray(audioAssets)) audio.sfx_list = audioAssets
  }
  if (pyTruthy(resources.risk_matrix) && !pyTruthy(riskHandling.risk_matrix)) {
    riskHandling.risk_matrix = resources.risk_matrix
  }
  if (pyTruthy(resources.contingency_plan) && !pyTruthy(riskHandling.contingency_plan)) {
    riskHandling.contingency_plan = resources.contingency_plan
  }
  if (pyTruthy(resources.localization) && !pyTruthy(accessibility.language_list)) {
    const localization = resources.localization
    if (Array.isArray(localization)) accessibility.language_list = localization
  }

  // 8) tech.milestones → mvp.milestones
  const tech = isPlainObject(data.tech) ? data.tech : {}
  if (pyTruthy(tech.milestones) && !pyTruthy(mvp.milestones)) {
    mvp.milestones = tech.milestones
  }

  // 9) 升级版本号
  data.version = '5.0'
  return data
}
