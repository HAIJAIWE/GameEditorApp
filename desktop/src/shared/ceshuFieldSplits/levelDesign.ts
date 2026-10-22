import type { ChapterFieldSplits } from './types'

/**
 * 第十八章·关卡与内容设计的结构拆分清单（P2，2026-10-23）。
 *
 * 留空：本章需要逐条核对的长文（难度曲线）已在字段定义里手工拆好三件套
 * （difficulty_curve_points / difficulty_curve_notes）。
 * 拆分配置只用于「单体 textarea 让机制自动生成配套字段」的场景，
 * 已手工拆过的再进清单只会重复插入，故不填。
 */
export const LEVEL_DESIGN_FIELD_SPLITS: ChapterFieldSplits = ['level_principles']
