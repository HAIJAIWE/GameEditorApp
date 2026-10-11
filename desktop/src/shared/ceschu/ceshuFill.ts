import type { CeshuDocument } from './ceshuConstants'
import { isFilledValue } from './ceshuModel'

/**
 * 策划书必填字段自动填充（自 Python core/ceshu/ceshu_fill.py 匹平迁移）。
 * 纯规则推导（不调用 LLM）：按既有上下文（game_name / game_type）生成合理占位值，避免空白校验失败。
 * 与 Python 就地变异不同：本函数返回新文档对象 + 实际填充字段数，便于主进程经写队列整文档落盘。
 */

export interface AutoFillResult {
  doc: CeshuDocument
  filled: number
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** Python 真值取反：'' / 0 / false / null / 空数组 / 空对象 均为「未填」 */
function isFalsy(value: unknown): boolean {
  return !isFilledValue(value)
}

/** 自动填充所有空必填字段，返回填充后的文档与实际填充字段数 */
export function autoFillRequiredFields(doc: CeshuDocument): AutoFillResult {
  const next = structuredClone(doc)
  let filled = 0

  const meta = next.meta
  const gameName = readText(meta.game_name) || '未命名项目'
  const gameType = readText(meta.game_type) || 'RPG'

  // 第一章 meta
  if (isFalsy(meta.positioning)) {
    meta.positioning = `${gameName} - ${gameType} 类型项目`
    filled += 1
  }
  if (isFalsy(meta.tags)) {
    meta.tags = [gameType.toLowerCase(), '原创', '策划中']
    filled += 1
  }

  // 第二章 vision
  if (isFalsy(next.vision.design_vision)) {
    next.vision.design_vision = `打造一款具有差异化体验的${gameType}游戏，核心乐趣聚焦于玩法深度与长期留存`
    filled += 1
  }
  if (isFalsy(next.vision.differentiation)) {
    next.vision.differentiation = '差异化卖点待细化（建议结合市场分析补充）'
    filled += 1
  }

  // 第三章 worldview
  if (isFalsy(next.story.architecture)) {
    next.story.architecture = '世界观架构待补充：建议包含时空背景、势力格局、核心冲突'
    filled += 1
  }
  if (isFalsy(next.story.main_plot)) {
    next.story.main_plot = '主线剧情待补充：建议设定开端-发展-高潮-结局四幕结构'
    filled += 1
  }

  // 第四章 gameplay
  if (isFalsy(next.gameplay.core_loop)) {
    next.gameplay.core_loop = '核心循环待补充：建议定义 玩家行为→反馈→奖励→下一目标 的闭环'
    filled += 1
  }
  if (isFalsy(next.gameplay.game_modes)) {
    next.gameplay.game_modes = ['主线剧情', '自由探索']
    filled += 1
  }

  // 第六章 numeric
  if (isFalsy(next.numeric.core_formulas)) {
    next.numeric.core_formulas = '核心数值公式待补充：建议包含伤害公式、成长曲线、掉落概率'
    filled += 1
  }
  if (isFalsy(next.numeric.balance_principles)) {
    next.numeric.balance_principles = '平衡原则：早期易上手、中期有深度、后期有目标'
    filled += 1
  }

  // 第七章 art
  if (isFalsy(next.art.art_style)) {
    next.art.art_style = `${gameType} 通用美术风格`
    filled += 1
  }
  if (isFalsy(next.art.color_system)) {
    next.art.color_system = '主色调 + 辅助色 + 强调色（建议3-5色）'
    filled += 1
  }

  // 第八章 tech
  if (isFalsy(next.tech.engine)) {
    next.tech.engine = '引擎选型待确定（Unity / Unreal / 自研）'
    filled += 1
  }
  if (isFalsy(next.tech.milestones)) {
    next.tech.milestones = ['原型期', 'Alpha', 'Beta', '上线']
    filled += 1
  }

  // 第九章 resources
  if (isFalsy(next.resources.budget)) {
    next.resources.budget = { total: '', art: '', dev: '', marketing: '' }
    filled += 1
  }
  if (isFalsy(next.resources.risk_matrix)) {
    next.resources.risk_matrix = [{ risk: '进度风险', level: '中', mitigation: '里程碑管控' }]
    filled += 1
  }

  // 第十章 market_analysis
  if (isFalsy(next.market_analysis.target_market)) {
    next.market_analysis.target_market = '目标市场待补充：建议明确平台、地域、用户画像'
    filled += 1
  }
  if (isFalsy(next.market_analysis.competitors)) {
    next.market_analysis.competitors = [{ name: '待补充竞品', type: '同类型' }]
    filled += 1
  }

  // 第十一章 characters
  if (isFalsy(next.story.protagonist)) {
    next.story.protagonist = '主角设定待补充：背景、性格、外观、能力'
    filled += 1
  }
  if (isFalsy(next.story.main_npc_count)) {
    next.story.main_npc_count = 5
    filled += 1
  }

  // 第十二章 combat
  if (isFalsy(next.combat.combat_mode)) {
    next.combat.combat_mode = gameType.toUpperCase().includes('RPG') ? '回合制' : '即时制'
    filled += 1
  }
  if (isFalsy(next.combat.damage_formula)) {
    next.combat.damage_formula = '伤害 = 攻击力 × 技能倍率 - 防御力 × 减伤系数'
    filled += 1
  }

  // 第十三章 economy
  if (isFalsy(next.economy.currency_types)) {
    next.economy.currency_types = [{ name: '金币', source: '任务/掉落', sink: '商店购买' }]
    filled += 1
  }
  if (isFalsy(next.economy.source_sink)) {
    next.economy.source_sink = '产出渠道：任务/战斗/活动；回收渠道：商店/强化/抽卡'
    filled += 1
  }

  // 第十四章 monetization
  if (isFalsy(next.monetization.payment_model)) {
    next.monetization.payment_model = 'f2p' // 默认免费 + 内购
    filled += 1
  }
  if (isFalsy(next.monetization.pricing_tiers)) {
    next.monetization.pricing_tiers = ['月卡 30元', '通行证 68元', '礼包 128元']
    filled += 1
  }

  // 第十五章 mvp
  if (isFalsy(next.mvp.mvp_scope)) {
    next.mvp.mvp_scope = 'MVP 范围待补充：建议包含核心玩法 + 1个完整章节 + 基础UI'
    filled += 1
  }
  if (isFalsy(next.mvp.mvp_timeline)) {
    next.mvp.mvp_timeline = 'MVP 时间线待补充：建议 3-6 个月'
    filled += 1
  }

  // 第十六章 risk_handling
  if (isFalsy(next.risk_handling.risk_matrix)) {
    next.risk_handling.risk_matrix = Array.isArray(next.resources.risk_matrix) ? next.resources.risk_matrix : []
    filled += 1
  }
  if (isFalsy(next.risk_handling.contingency_plan)) {
    next.risk_handling.contingency_plan = '应急预案：进度延期→砍次要特性；技术风险→备选方案'
    filled += 1
  }

  // 第十七章 audio
  if (isFalsy(next.audio.music_style)) {
    next.audio.music_style = `与${readText(next.art.art_style) || '美术风格'}协调的音乐风格`
    filled += 1
  }
  if (isFalsy(next.audio.sfx_count)) {
    next.audio.sfx_count = 50 // 默认 50 个音效
    filled += 1
  }

  // 第十八章 accessibility
  if (isFalsy(next.accessibility.language_list)) {
    next.accessibility.language_list = ['简体中文']
    filled += 1
  }
  if (isFalsy(next.accessibility.accessibility_features)) {
    next.accessibility.accessibility_features = ['色盲模式', '字幕', '键位自定义']
    filled += 1
  }

  return { doc: next, filled }
}