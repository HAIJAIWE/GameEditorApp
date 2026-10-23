/** 档 4 合并兼容层（2026-10-24）：真实契约已内联进 ceshuSchema/monetization.ts，此处仅 re-export。 */
import { MONETIZATION_SCHEMA } from '../ceshuSchema/monetization'
import { toFieldHints } from '../ceshuSchema/types'

export const MONETIZATION_FIELD_HINTS = toFieldHints(MONETIZATION_SCHEMA)
