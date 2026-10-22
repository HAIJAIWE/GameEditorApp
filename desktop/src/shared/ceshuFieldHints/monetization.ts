import type { ChapterFieldHints } from './types'

/**
 * 第十五章·商业化设计的字段契约（P0 补契约，2026-10-23；P1 三件套拆分，2026-10-23）。
 *
 * 本章要点：商业化直接关系收入与合规，AI 易生成诱导付费与激进定价，
 * 契约要求模式、档位、内购互相自洽且可核对；大 R 策略与 ARPU 目标属商业决策，标人定不交 AI。
 *
 * P1 拆分（三件套）：ad_strategy / subscription_design / season_pass / vip_system /
 * f2p_experience 五个本体保留概述，逐条可核对的细节归 `xxx_points`，
 * 其余说明归 `xxx_notes`。whale_strategy、arpu_target 为人定字段，不拆。
 */
export const MONETIZATION_FIELD_HINTS: ChapterFieldHints = {
  payment_model: {
    aiHint: '从候选中选 1-2 个主模式并说明理由；模式须与定价档位、内购设计自洽',
    reviewHint: '所选模式是否与档位内购一致；理由是否结合品类'
  },
  pricing_tiers: {
    aiHint: '每行一个价格档位，按价格从低到高排列；覆盖小额首充到大额，标注币种',
    reviewHint: '档位是否递进；是否覆盖不同付费层级；是否标注币种'
  },
  iap_design: {
    aiHint: '每行一个内购项，按物品/价格/价值/目标用户四列填写；价值需与价格匹配',
    reviewHint: '价格与价值是否匹配；目标用户是否明确；是否与定价档位一致'
  },
  ad_strategy: {
    aiHint: '一段概述：广告策略的目标与插入原则；广告位、频次、激励方式等细节走「要点」字段',
    reviewHint: '广告频次是否有上限；是否影响核心体验；激励视频是否可选'
  },
  ad_strategy_points: {
    aiHint: '3-6 条：广告位、每日频次上限、激励方式与不破坏核心循环的插入原则',
    reviewHint: '每条是否可逐条核对；频次是否有上限；是否与订阅、内购权益冲突'
  },
  ad_strategy_notes: {
    aiHint: '广告收益预期与 A/B 实验计划等要点之外的补充说明，可留空',
    reviewHint: '补充是否与要点重复；收益预期是否注明为估算'
  },
  subscription_design: {
    aiHint: '一段概述：订阅制的定位与设计原则；周期、价格、权益列表等细节走「要点」字段',
    reviewHint: '权益是否可交付；是否破坏付费平衡；周期价格是否明确'
  },
  subscription_design_points: {
    aiHint: '3-6 条：订阅周期、价格、权益项与每项权益的交付方式',
    reviewHint: '权益是否可逐条交付；是否破坏付费平衡；是否与定价档位一致'
  },
  subscription_design_notes: {
    aiHint: '订阅转化预期与取消/退款政策等要点之外的补充说明，可留空',
    reviewHint: '补充是否具体；是否提及取消或退款政策'
  },
  season_pass: {
    aiHint: '一段概述：赛季通行证的定位与设计原则；周期、价格、奖励结构与免费线走「要点」字段',
    reviewHint: '免费线奖励是否可得；付费奖励是否只含外观或便利；周期价格是否明确'
  },
  season_pass_points: {
    aiHint: '3-6 条：赛季周期、价格、免费线奖励与付费奖励结构',
    reviewHint: '免费线奖励是否可不付费获得；付费奖励是否只含外观便利；周期价格是否明确'
  },
  season_pass_notes: {
    aiHint: '赛季更替规则与老玩家衔接等要点之外的补充说明，可留空',
    reviewHint: '补充是否与要点重复；是否说明赛季切换时的衔接'
  },
  vip_system: {
    aiHint: '一段概述：VIP 体系的目标与设计原则；等级、成长值与各等级权益走「要点」字段',
    reviewHint: '成长值来源是否明确；是否出现数值售卖；权益是否可交付'
  },
  vip_system_points: {
    aiHint: '3-6 条：VIP 等级、每级权益、定价锚点、与免费线的区隔',
    reviewHint: '权益是否可逐条核对；与「定价档位」字段是否重复；是否出现数值售卖'
  },
  vip_system_notes: {
    aiHint: '成长值获取途径与保级规则等要点之外的补充说明，可留空',
    reviewHint: '成长值来源是否明确；补充是否可落地'
  },
  whale_strategy: {
    aiDraftable: false,
    reviewHint: '是否规避诱导与概率陷阱；是否守住合规与口碑底线；是否与定价档位匹配'
  },
  f2p_experience: {
    aiHint: '一段概述：免费玩家体验的目标与设计原则；内容边界、成长节奏、卡点设计走「要点」字段',
    reviewHint: '免费内容是否覆盖主线；卡点是否过度；是否与付费点冲突'
  },
  f2p_experience_points: {
    aiHint: '3-6 条：免费内容边界、成长节奏、卡点位置与付费墙说明',
    reviewHint: '免费内容是否覆盖主线；卡点是否逐条可判定；是否与付费点冲突'
  },
  f2p_experience_notes: {
    aiHint: '免费向付费的转化路径等要点之外的补充说明，可留空',
    reviewHint: '转化路径是否自然；是否与「广告策略」重复'
  },
  arpu_target: {
    aiDraftable: false,
    reviewHint: '目标值是否结合品类基准；是否与付费模式、团队成本匹配'
  }
}
