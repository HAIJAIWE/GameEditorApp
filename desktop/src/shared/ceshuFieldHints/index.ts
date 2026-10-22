import type { ChapterKey } from '../ceshuConstants'

import { ACCESSIBILITY_FIELD_HINTS } from './accessibility'
import { ANALYTICS_FIELD_HINTS } from './analytics'
import { ART_FIELD_HINTS } from './art'
import { AUDIO_FIELD_HINTS } from './audio'
import { COMBAT_FIELD_HINTS } from './combat'
import { ECONOMY_FIELD_HINTS } from './economy'
import { GAMEPLAY_FIELD_HINTS } from './gameplay'
import { LEVEL_DESIGN_FIELD_HINTS } from './levelDesign'
import { LIVE_OPS_FIELD_HINTS } from './liveOps'
import { MARKET_ANALYSIS_FIELD_HINTS } from './marketAnalysis'
import { MONETIZATION_FIELD_HINTS } from './monetization'
import { MVP_FIELD_HINTS } from './mvp'
import { NUMERIC_FIELD_HINTS } from './numeric'
import { PERFORMANCE_FIELD_HINTS } from './performance'
import { PUBLISHING_FIELD_HINTS } from './publishing'
import { QA_FIELD_HINTS } from './qa'
import { RESOURCES_FIELD_HINTS } from './resources'
import { RISK_HANDLING_FIELD_HINTS } from './riskHandling'
import { STORY_FIELD_HINTS } from './story'
import { TECH_FIELD_HINTS } from './tech'
import { UIUX_FIELD_HINTS } from './uiux'
import type { ChapterFieldHints } from './types'

/**
 * 按章汇总的字段契约（P0 补契约：2026-10-23 体检时覆盖率仅 19%）。
 *
 * 新增章契约时：在下方加一行 import + 映射即可，**不要**把内容写回本文件——
 * 本文件只做汇总，内容按章分文件存放（见各章文件头注释）。
 */
export const FIELD_HINTS: Partial<Record<ChapterKey, ChapterFieldHints>> = {
  combat: COMBAT_FIELD_HINTS,
  economy: ECONOMY_FIELD_HINTS,
  gameplay: GAMEPLAY_FIELD_HINTS,
  market_analysis: MARKET_ANALYSIS_FIELD_HINTS,
  art: ART_FIELD_HINTS,
  audio: AUDIO_FIELD_HINTS,
  tech: TECH_FIELD_HINTS,
  resources: RESOURCES_FIELD_HINTS,
  risk_handling: RISK_HANDLING_FIELD_HINTS,
  mvp: MVP_FIELD_HINTS,
  monetization: MONETIZATION_FIELD_HINTS,
  accessibility: ACCESSIBILITY_FIELD_HINTS,
  story: STORY_FIELD_HINTS,
  numeric: NUMERIC_FIELD_HINTS,
  // P2 扩展设计 7 章（2026-10-23）
  uiux: UIUX_FIELD_HINTS,
  level_design: LEVEL_DESIGN_FIELD_HINTS,
  live_ops: LIVE_OPS_FIELD_HINTS,
  analytics: ANALYTICS_FIELD_HINTS,
  qa: QA_FIELD_HINTS,
  publishing: PUBLISHING_FIELD_HINTS,
  performance: PERFORMANCE_FIELD_HINTS
}
