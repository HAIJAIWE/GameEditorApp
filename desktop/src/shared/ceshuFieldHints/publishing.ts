/** 档 4 合并兼容层（2026-10-24）：真实契约已内联进 ceshuSchema/publishing.ts，此处仅 re-export。 */
import { PUBLISHING_SCHEMA } from '../ceshuSchema/publishing'
import { toFieldHints } from '../ceshuSchema/types'

export const PUBLISHING_FIELD_HINTS = toFieldHints(PUBLISHING_SCHEMA)
