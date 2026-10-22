import type { ChapterFieldSplits } from './types'

/**
 * 第十章·技术规格的结构拆分清单（P1，2026-10-23）。
 *
 * 拆 1 个开放式 textarea 为「本体 + xxx_points + xxx_notes」三件套：
 * 本体留架构总体形态，关键模块与通信方式进要点字段逐条列。
 * team_structure 是人定字段（AI 不起草），按约定不拆。
 */
export const TECH_FIELD_SPLITS: ChapterFieldSplits = ['core_architecture', 'performance_targets', 'qa_plan']
