/** 档 4 合并兼容层（2026-10-24）：真实契约已内联进 ceshuSchema/live_ops.ts，此处仅 re-export。 */
import { LIVE_OPS_SCHEMA } from '../ceshuSchema/live_ops'
import { toFieldHints } from '../ceshuSchema/types'

export const LIVE_OPS_FIELD_HINTS = toFieldHints(LIVE_OPS_SCHEMA)
