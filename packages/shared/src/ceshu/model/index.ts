/**
 * shared/ceshu/model —— 策划书文档模型：默认文档构造、章节进度与可见章节、ID/时间戳派生、文档归一化、系统配置 schema。
 *
 * 外部一律从这里 import（`.../model`），不要再深插目录内文件。
 */

export { computeChapterProgress, computeEnabledEditors, createCeshuId, createDefaultCeshu, deriveRulesetId, formatLocalTimestamp, getDocKind, getGameType, getGddScope, isEmptyRequiredValue, isFilledValue, isPlainObject, needsGameDataEditor, normalizeCeshu, resolveDocGameStyle, visibleChaptersForDoc, withChapter } from './ceshuModel'
export type { DocKind } from './ceshuModel'
export { SYSTEM_CONFIG_SCHEMA } from './systemConfigSchema'
