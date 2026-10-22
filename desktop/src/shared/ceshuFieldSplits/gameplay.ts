import type { ChapterFieldSplits } from './types'

/**
 * 第三章·核心玩法的结构拆分清单（P1，2026-10-23）。
 *
 * 只拆 first_30_min：新手体验原本是一大段时间线文本，审的时候要逐段核对
 * 「每段有没有具体动作与反馈」。拆出要点清单按段装可核对条目，本体留设计意图。
 * （core_loop 三件套早已手工拆好，core_loop_notes 是拆分产物，均不再动。）
 */
export const GAMEPLAY_FIELD_SPLITS: ChapterFieldSplits = ['first_30_min']
