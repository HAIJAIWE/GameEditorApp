/** 档 4 合并兼容层（2026-10-24）：真实契约已内联进 ceshuSchema/performance.ts，此处仅 re-export。 */
import { PERFORMANCE_SCHEMA } from '../ceshuSchema/performance'
import { toFieldHints } from '../ceshuSchema/types'

export const PERFORMANCE_FIELD_HINTS = toFieldHints(PERFORMANCE_SCHEMA)
