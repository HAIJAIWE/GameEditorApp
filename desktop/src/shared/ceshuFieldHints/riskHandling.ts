/** 档 4 合并兼容层（2026-10-24）：真实契约已内联进 ceshuSchema/risk_handling.ts，此处仅 re-export。 */
import { RISK_HANDLING_SCHEMA } from '../ceshuSchema/risk_handling'
import { toFieldHints } from '../ceshuSchema/types'

export const RISK_HANDLING_FIELD_HINTS = toFieldHints(RISK_HANDLING_SCHEMA)
