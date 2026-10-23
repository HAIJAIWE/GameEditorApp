/** 档 4 合并兼容层（2026-10-24）：真实契约已内联进 ceshuSchema/tech.ts，此处仅 re-export。 */
import { TECH_SCHEMA } from '../ceshuSchema/tech'
import { toFieldHints } from '../ceshuSchema/types'

export const TECH_FIELD_HINTS = toFieldHints(TECH_SCHEMA)
