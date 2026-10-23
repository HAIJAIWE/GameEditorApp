/** 档 4 合并兼容层（2026-10-24）：真实契约已内联进 ceshuSchema/audio.ts，此处仅 re-export。 */
import { AUDIO_SCHEMA } from '../ceshuSchema/audio'
import { toFieldHints } from '../ceshuSchema/types'

export const AUDIO_FIELD_HINTS = toFieldHints(AUDIO_SCHEMA)
