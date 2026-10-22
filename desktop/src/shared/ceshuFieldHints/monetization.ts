import type { ChapterFieldHints } from './types'

/**
 * 第十五章·商业化设计的字段契约（P0 补契约，2026-10-23）。
 *
 * 本章要点：商业化直接关系收入与合规，AI 易生成诱导付费与激进定价，
 * 契约要求模式、档位、内购互相自洽且可核对；大 R 策略与 ARPU 目标属商业决策，标人定不交 AI。
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
    aiHint: '说明广告位、频次与激励方式；给出不破坏核心循环的插入原则',
    reviewHint: '广告频次是否有上限；是否影响核心体验；激励视频是否可选'
  },
  subscription_design: {
    aiHint: '写出订阅周期、价格与权益列表；权益需可交付且不影响公平性',
    reviewHint: '权益是否可交付；是否破坏付费平衡；周期价格是否明确'
  },
  season_pass: {
    aiHint: '给出赛季周期、价格、奖励结构与免费线；免费奖励需可不付费获得',
    reviewHint: '免费线奖励是否可得；付费奖励是否只含外观或便利；周期价格是否明确'
  },
  vip_system: {
    aiHint: '写出 VIP 等级、成长值与各等级权益；权益以便利和外观为主，不卖数值',
    reviewHint: '成长值来源是否明确；是否出现数值售卖；权益是否可交付'
  },
  whale_strategy: {
    aiDraftable: false,
    reviewHint: '是否规避诱导与概率陷阱；是否守住合规与口碑底线；是否与定价档位匹配'
  },
  f2p_experience: {
    aiHint: '说明免费玩家的内容边界、成长节奏与卡点设计；保证不付费可体验完整主线',
    reviewHint: '免费内容是否覆盖主线；卡点是否过度；是否与付费点冲突'
  },
  arpu_target: {
    aiDraftable: false,
    reviewHint: '目标值是否结合品类基准；是否与付费模式、团队成本匹配'
  }
}
