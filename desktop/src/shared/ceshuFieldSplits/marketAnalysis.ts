import type { ChapterFieldSplits } from './types'

/**
 * 第十二章·市场分析的结构拆分清单（P1，2026-10-23）。
 *
 * 拆 4 个开放式 textarea 为「本体 + xxx_points + xxx_notes」三件套：
 * 本体留概述，可逐条核对的数据/画像/优势/壁垒进要点字段。
 */
export const MARKET_ANALYSIS_FIELD_SPLITS: ChapterFieldSplits = [
  'market_size',
  'user_demographics',
  'market_positioning',
  'entry_barriers'
]
