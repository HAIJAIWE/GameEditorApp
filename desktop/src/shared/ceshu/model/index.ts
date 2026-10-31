/**
 * shared/ceshu/model 能力入口。
 *
 * 外部一律从这里 import（`.../model`），不要再深插目录内文件。
 */

export { computeChapterProgress, computeEnabledEditors, createCeshuId, createDefaultCeshu, deriveRulesetId, formatLocalTimestamp, getGameType, getGddScope, isEmptyRequiredValue, isFilledValue, isPlainObject, normalizeCeshu, resolveDocGameStyle, visibleChaptersForDoc, withChapter } from './ceshuModel'
export { SYSTEM_CONFIG_SCHEMA } from './systemConfigSchema'
