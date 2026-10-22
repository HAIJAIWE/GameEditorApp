import type { ChapterFieldSplits } from './types'

/**
 * 第五章·战斗系统设计的结构拆分清单（P1，2026-10-23）。
 *
 * 拆 8 个开放式 textarea 为「本体 + xxx_points + xxx_notes」三件套；
 * damage_formula 已手工拆过，不重复列入。
 */
export const COMBAT_FIELD_SPLITS: ChapterFieldSplits = [
  'skill_system',
  'buff_debuff',
  'element_system',
  'team_formation',
  'pvp_design',
  'pve_design',
  'boss_mechanics',
  'balance_strategy',
  'combat_progression'
]
