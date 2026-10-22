import type { ChapterFieldHints } from './types'

/**
 * 第七章·数值设计 的字段契约（P0 补契约，2026-10-23）。
 *
 * 本章要点：数值章的内容**必须可计算**——AI 最容易在这里写出
 * 「引用未定义变量」的公式。契约要求每个公式的变量在本章或战斗章有定义。
 */
export const NUMERIC_FIELD_HINTS: ChapterFieldHints = {
  balance_principles: {
    aiHint: '3-5 条平衡原则，每条一句：原则 + 量化表现（如「单次战斗时长 3-5 分钟」）',
    reviewHint: '原则是否可验证；与核心公式、战斗章数值是否自洽'
  },
  economic_model: {
    aiHint: '一段话讲清货币流转模型；公式与变量引用战斗章/本章已定义项，不要重复伤害公式',
    reviewHint: '变量是否都有定义；与经济章是否重复（经济设计归经济章，此处只讲数值模型）'
  }
}
