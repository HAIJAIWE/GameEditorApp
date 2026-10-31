/**
 * shared/ceshu/validation 能力入口。
 *
 * 外部一律从这里 import（`.../validation`），不要再深插目录内文件。
 */

export { VALIDATION_SEVERITY_LABELS, classifyValidationMessage, countValidationBySeverity, groupValidationMessages, summarizeValidation } from './ceshuValidationGroups'
export type { ClassifiedValidationItem, ValidationGroup, ValidationKind, ValidationSeverity } from './ceshuValidationGroups'
export { RE_CHINESE_CHARS, RE_ENGLISH_WORDS, countWordsInChapter } from './ceshuWordCount'
export { ANALYSIS_MIN_CHARS, CLICHE_COUNT_THRESHOLD, CLICHE_PHRASES, CLICHE_RATE_THRESHOLD, LIST_MIN_LINES, LIST_RATE_THRESHOLD, LONG_SENTENCE_CHARS, LONG_SENTENCE_RATE_THRESHOLD, NUMERIC_MIN_CHARS, NUMERIC_RATE_THRESHOLD, analyzeChapterQuality, analyzeTextQuality, contentQualityIssues } from './ceshuContentQuality'
export type { ContentQualitySignal } from './ceshuContentQuality'
export { buildContract, checkContract, compareDemoRuleset, validateContract } from './ceshuContract'
export type { ContractAssertion, ContractFinding, ContractParameter, ContractPrototypeCheck, ContractReport, DesignContract } from './ceshuContract'
export { buildPrototypeResults, checkDesignClaims, checkDesignClaimsWith, checkNumericAssertions, evaluateAssertions, evaluateExpression, extractIdentifiers, parseAcceptance, parseNumericParameters, parseParameterNames, parseParameterValue } from './ceshuNumericAssert'
export type { AssertionResult } from './ceshuNumericAssert'
export { CESHU_CHECKS, buildCheckContext, validateCeshu } from './ceshuValidation'
export type { CeshuCheck, CeshuCheckContext } from './ceshuValidation'
export { resolveValidationChapter, resolveValidationTarget } from './ceshuValidationJump'
export type { ValidationJumpTarget } from './ceshuValidationJump'
