/** 档 4 合并兼容层（2026-10-24）：真实契约已内联进 ceshuSchema/qa.ts，此处仅 re-export。 */
import { QA_SCHEMA } from '../ceshuSchema/qa'
import { toFieldHints } from '../ceshuSchema/types'

export const QA_FIELD_HINTS = toFieldHints(QA_SCHEMA)
