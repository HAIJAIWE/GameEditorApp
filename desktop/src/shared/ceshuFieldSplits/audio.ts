import type { ChapterFieldSplits } from './types'

/**
 * 第九章·音频设计的结构拆分清单（P1，2026-10-23）。
 *
 * 拆 3 个开放式 textarea：配音设计、动态音频、音频本地化。
 * 音频预算（audio_budget）是人定字段，不拆。
 */
export const AUDIO_FIELD_SPLITS: ChapterFieldSplits = ['voice_acting', 'dynamic_audio', 'audio_localization']
