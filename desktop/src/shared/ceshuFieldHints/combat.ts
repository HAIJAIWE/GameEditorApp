/** 档 4 合并兼容层（2026-10-24）：真实契约已内联进 ceshuSchema/combat.ts，此处仅 re-export。 */
import { COMBAT_SCHEMA } from '../ceshuSchema/combat'
import { toFieldHints } from '../ceshuSchema/types'

export const COMBAT_FIELD_HINTS = toFieldHints(COMBAT_SCHEMA)
