import type { ChapterFieldSplits } from './types'

/**
 * 第二十章·数据埋点与指标的结构拆分清单（P2，2026-10-23）。
 *
 * 本章的三件套（key_funnels → key_funnels_points / key_funnels_notes）
 * 已在 `ceshuChapterFields/analytics.ts` 字段定义里直接手工拆好，此处留空，
 * 不交给导出时的自动拆分（避免重复插入）。
 */
export const ANALYTICS_FIELD_SPLITS: ChapterFieldSplits = []
