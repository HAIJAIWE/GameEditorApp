import type { ChapterFieldSplits } from './types'

/**
 * 第二章·故事剧情的结构拆分清单（P1，2026-10-23）。
 *
 * 拆 2 个开放式 textarea 为「本体 + xxx_points + xxx_notes」三件套。
 * architecture / main_plot 已在字段定义中手工拆过（architecture_notes /
 * main_plot_notes 即其拆分产物，再拆会出 `_notes_points` 荒谬键），不重复列入。
 */
export const STORY_FIELD_SPLITS: ChapterFieldSplits = ['geography', 'companion_system']
