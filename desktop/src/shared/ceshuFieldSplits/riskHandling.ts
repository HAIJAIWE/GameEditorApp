import type { ChapterFieldSplits } from './types'

/**
 * 第十三章·风险控制的结构拆分清单（P1，2026-10-23）。
 *
 * 拆 2 个开放式 textarea 为「本体 + xxx_points + xxx_notes」三件套：
 * 本体留总体机制，可执行规则与具体安排进要点字段逐条核对。
 */
export const RISK_HANDLING_FIELD_SPLITS: ChapterFieldSplits = ['risk_monitoring', 'crisis_management']
