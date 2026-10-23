/** 档 4 合并兼容层（2026-10-24）：真实契约已内联进 ceshuSchema/gameplay.ts，此处仅 re-export。 */
import { GAMEPLAY_SCHEMA } from '../ceshuSchema/gameplay'
import { toFieldHints } from '../ceshuSchema/types'

export const GAMEPLAY_FIELD_HINTS = toFieldHints(GAMEPLAY_SCHEMA)
