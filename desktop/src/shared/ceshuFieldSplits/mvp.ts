import type { ChapterFieldSplits } from './types'

/**
 * 第十四章·MVP 规划的结构拆分清单（P1，2026-10-23）。
 *
 * 拆 2 个开放式 textarea 为「本体 + xxx_points + xxx_notes」三件套：
 * 本体留判定逻辑/整体安排，可量化指标与每轮试玩安排进要点字段逐条核对。
 * budget_estimate 是人定字段（AI 不起草），按约定不拆。
 */
export const MVP_FIELD_SPLITS: ChapterFieldSplits = ['success_criteria', 'playtest_plan', 'prototype_plan']
