/** 档 4 合并兼容层（2026-10-24）：真实契约已内联进 ceshuSchema/art.ts，此处仅 re-export。 */
import { ART_SCHEMA } from '../ceshuSchema/art'
import { toFieldHints } from '../ceshuSchema/types'

export const ART_FIELD_HINTS = toFieldHints(ART_SCHEMA)
