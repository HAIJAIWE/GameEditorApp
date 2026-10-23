/** 档 4 合并兼容层（2026-10-24）：真实契约已内联进 ceshuSchema/analytics.ts，此处仅 re-export。 */
import { ANALYTICS_SCHEMA } from '../ceshuSchema/analytics'
import { toFieldHints } from '../ceshuSchema/types'

export const ANALYTICS_FIELD_HINTS = toFieldHints(ANALYTICS_SCHEMA)
