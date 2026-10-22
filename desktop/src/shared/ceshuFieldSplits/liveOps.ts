import type { ChapterFieldSplits } from './types'

/**
 * 第十九章·运营与活动的结构拆分清单（P2，2026-10-23）。
 *
 * 本章的三件套（activity_system → activity_system_points / activity_system_notes）
 * 已在 `ceshuChapterFields/liveOps.ts` 字段定义里直接手工拆好，此处留空，
 * 不交给导出时的自动拆分（避免重复插入）。
 */
export const LIVE_OPS_FIELD_SPLITS: ChapterFieldSplits = []
