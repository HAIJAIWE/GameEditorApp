import type { ChapterFieldSplits } from './types'

/**
 * 第八章·美术设计的结构拆分清单（P1，2026-10-23）。
 *
 * 拆 2 个开放式 textarea 为「本体 + xxx_points + xxx_notes」三件套：
 * 本体留整体风格，可验收的字体名/特效类型进要点字段逐条核对。
 */
export const ART_FIELD_SPLITS: ChapterFieldSplits = ['typography', 'vfx']
