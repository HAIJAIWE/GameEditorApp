import type { ChapterFieldSplits } from './types'

/**
 * 第二十三章·性能与适配的结构拆分清单（P2，2026-10-23）。
 *
 * 留空：memory_package 的「本体 + 要点 + 补充」三件套已在
 * ceshuChapterFields/performance.ts 直接定义，无需机制自动插入。
 * network_adaptation / thermal_power 为单体 textarea，暂无拆分必要。
 */
export const PERFORMANCE_FIELD_SPLITS: ChapterFieldSplits = ['network_adaptation', 'thermal_power']
