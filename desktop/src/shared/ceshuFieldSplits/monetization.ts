import type { ChapterFieldSplits } from './types'

/**
 * 第十五章·商业化设计的结构拆分清单（P1，2026-10-23）。
 *
 * 拆 5 个开放式 textarea：广告策略、订阅制、赛季通行证、VIP 系统、免费玩家体验。
 * 大 R 策略（whale_strategy）与 ARPU 目标（arpu_target）是 P0 标记的人定字段，不拆。
 */
export const MONETIZATION_FIELD_SPLITS: ChapterFieldSplits = [
  'ad_strategy',
  'subscription_design',
  'season_pass',
  'vip_system',
  'f2p_experience'
]
