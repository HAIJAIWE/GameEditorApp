/** 档 4 合并兼容层（2026-10-24）：真实契约已内联进 ceshuSchema/numeric.ts，此处仅 re-export。 */
import { NUMERIC_SCHEMA } from '../ceshuSchema/numeric'
import { toFieldHints } from '../ceshuSchema/types'

export const NUMERIC_FIELD_HINTS = toFieldHints(NUMERIC_SCHEMA)
