import type { ChapterFieldSplits } from './types'

/**
 * 第二十二章·上线与发行的结构拆分清单（P2，2026-10-23）。
 *
 * 留空：publish_plan 与 soft_launch 的「本体 + 要点 + 补充」三件套已在
 * ceshuChapterFields/publishing.ts 直接定义，无需机制自动插入。
 * 其余单体 textarea（compliance 人定不拆、marketing_rhythm 体量适中）
 * 暂无拆分必要。
 */
export const PUBLISHING_FIELD_SPLITS: ChapterFieldSplits = ['marketing_rhythm']
