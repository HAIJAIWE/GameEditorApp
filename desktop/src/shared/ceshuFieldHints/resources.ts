/** 档 4 合并兼容层（2026-10-24）：真实契约已内联进 ceshuSchema/resources.ts，此处仅 re-export。 */
import { RESOURCES_SCHEMA } from '../ceshuSchema/resources'
import { toFieldHints } from '../ceshuSchema/types'

export const RESOURCES_FIELD_HINTS = toFieldHints(RESOURCES_SCHEMA)
