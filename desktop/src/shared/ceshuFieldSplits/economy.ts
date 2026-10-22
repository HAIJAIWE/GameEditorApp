import type { ChapterFieldSplits } from './types'

/**
 * 第六章·经济系统设计的结构拆分清单（P1，2026-10-23）。
 *
 * 拆 4 个开放式 textarea 为「本体 + xxx_points + xxx_notes」三件套；
 * currency_types / drop_tables 已是结构化字段，不拆。
 */
export const ECONOMY_FIELD_SPLITS: ChapterFieldSplits = [
  'production_chain',
  'market_design',
  'inflation_control',
  'economic_goals'
]
