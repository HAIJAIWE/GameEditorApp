import type { ChapterKey } from '../ceshuConstants'

import { ACCESSIBILITY_FIELD_SPLITS } from './accessibility'
import { ART_FIELD_SPLITS } from './art'
import { AUDIO_FIELD_SPLITS } from './audio'
import { COMBAT_FIELD_SPLITS } from './combat'
import { ECONOMY_FIELD_SPLITS } from './economy'
import { GAMEPLAY_FIELD_SPLITS } from './gameplay'
import { MARKET_ANALYSIS_FIELD_SPLITS } from './marketAnalysis'
import { MONETIZATION_FIELD_SPLITS } from './monetization'
import { MVP_FIELD_SPLITS } from './mvp'
import { NUMERIC_FIELD_SPLITS } from './numeric'
import { RISK_HANDLING_FIELD_SPLITS } from './riskHandling'
import { STORY_FIELD_SPLITS } from './story'
import { TECH_FIELD_SPLITS } from './tech'
import { VISION_FIELD_SPLITS } from './vision'
import type { ChapterFieldSplits } from './types'

/**
 * 按章汇总的结构拆分清单（P1：2026-10-23 拆解第二批 textarea）。
 *
 * 新增章拆分时：在下方加一行 import + 映射即可，**不要**把内容写回本文件——
 * 本文件只做汇总，清单按章分文件存放（约定见 types.ts 文件头）。
 */
export const FIELD_SPLITS: Partial<Record<ChapterKey, ChapterFieldSplits>> = {
  combat: COMBAT_FIELD_SPLITS,
  economy: ECONOMY_FIELD_SPLITS,
  gameplay: GAMEPLAY_FIELD_SPLITS,
  market_analysis: MARKET_ANALYSIS_FIELD_SPLITS,
  art: ART_FIELD_SPLITS,
  audio: AUDIO_FIELD_SPLITS,
  tech: TECH_FIELD_SPLITS,
  risk_handling: RISK_HANDLING_FIELD_SPLITS,
  mvp: MVP_FIELD_SPLITS,
  monetization: MONETIZATION_FIELD_SPLITS,
  accessibility: ACCESSIBILITY_FIELD_SPLITS,
  story: STORY_FIELD_SPLITS,
  numeric: NUMERIC_FIELD_SPLITS,
  vision: VISION_FIELD_SPLITS
}
