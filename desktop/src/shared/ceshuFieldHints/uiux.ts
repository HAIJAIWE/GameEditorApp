/** 档 4 合并兼容层（2026-10-24）：真实契约已内联进 ceshuSchema/uiux.ts，此处仅 re-export。 */
import { UIUX_SCHEMA } from '../ceshuSchema/uiux'
import { toFieldHints } from '../ceshuSchema/types'

export const UIUX_FIELD_HINTS = toFieldHints(UIUX_SCHEMA)
