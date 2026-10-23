/** 档 4 合并兼容层（2026-10-24）：真实契约已内联进 ceshuSchema/story.ts，此处仅 re-export。 */
import { STORY_SCHEMA } from '../ceshuSchema/story'
import { toFieldHints } from '../ceshuSchema/types'

export const STORY_FIELD_HINTS = toFieldHints(STORY_SCHEMA)
