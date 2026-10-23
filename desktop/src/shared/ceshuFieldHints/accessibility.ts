/** 档 4 合并兼容层（2026-10-24）：真实契约已内联进 ceshuSchema/accessibility.ts，此处仅 re-export。 */
import { ACCESSIBILITY_SCHEMA } from '../ceshuSchema/accessibility'
import { toFieldHints } from '../ceshuSchema/types'

export const ACCESSIBILITY_FIELD_HINTS = toFieldHints(ACCESSIBILITY_SCHEMA)
