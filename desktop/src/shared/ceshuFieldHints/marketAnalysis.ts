/** 档 4 合并兼容层（2026-10-24）：真实契约已内联进 ceshuSchema/market_analysis.ts，此处仅 re-export。 */
import { MARKET_ANALYSIS_SCHEMA } from '../ceshuSchema/market_analysis'
import { toFieldHints } from '../ceshuSchema/types'

export const MARKET_ANALYSIS_FIELD_HINTS = toFieldHints(MARKET_ANALYSIS_SCHEMA)
