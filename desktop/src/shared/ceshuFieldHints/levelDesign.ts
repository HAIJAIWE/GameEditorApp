/** 档 4 合并兼容层（2026-10-24）：真实契约已内联进 ceshuSchema/level_design.ts，此处仅 re-export。 */
import { LEVEL_DESIGN_SCHEMA } from '../ceshuSchema/level_design'
import { toFieldHints } from '../ceshuSchema/types'

export const LEVEL_DESIGN_FIELD_HINTS = toFieldHints(LEVEL_DESIGN_SCHEMA)
