import type { ChapterFieldSplits } from './types'

/**
 * 第十六章·可访问性与本地化的结构拆分清单（P1，2026-10-23）。
 *
 * 拆 6 个开放式 textarea：本地化策略、文化适配、字幕设计、色盲支持、
 * 运动无障碍、认知无障碍。
 * 注：compliance_notes 虽为 textarea，但 key 以 `_notes` 结尾属拆分产物，守卫测试禁拆。
 */
export const ACCESSIBILITY_FIELD_SPLITS: ChapterFieldSplits = [
  'localization_strategy',
  'cultural_adaptation',
  'subtitle_design',
  'color_blind_support',
  'motor_accessibility',
  'cognitive_accessibility'
]
