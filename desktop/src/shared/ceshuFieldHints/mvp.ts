/** 档 4 合并兼容层（2026-10-24）：真实契约已内联进 ceshuSchema/mvp.ts，此处仅 re-export。 */
import { MVP_SCHEMA } from '../ceshuSchema/mvp'
import { toFieldHints } from '../ceshuSchema/types'

export const MVP_FIELD_HINTS = toFieldHints(MVP_SCHEMA)
