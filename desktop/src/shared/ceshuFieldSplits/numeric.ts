import type { ChapterFieldSplits } from './types'

/**
 * 第七章·数值设计的结构拆分清单（P1，2026-10-23）。
 *
 * 只拆 economic_model：它原本是「一段话讲清货币流转模型」的开放文本，
 * 而数值章的价值在**可核对的公式与参数**。拆出要点清单装公式/参数定义，
 * 本体只留模型概述——同时收窄与经济章的重叠（经济设计归经济章）。
 */
export const NUMERIC_FIELD_SPLITS: ChapterFieldSplits = ['economic_model']
