/**
 * shared/util/data 能力入口。
 *
 * 外部一律从这里 import（`.../data`），不要再深插目录内文件。
 */

export { BALANCE_STD_RATIO, BALANCE_VERDICT_LABELS, assessBalance, countByType, mean, numericFieldNames, stdev, summarizeNumeric } from './dataStats'
export type { NumericSummary, TypeCountRow } from './dataStats'
export { ADJUST_MODES, ADJUST_MODE_LABELS, BATCH_OP_KINDS, BATCH_OP_LABELS, ITEM_SEARCH_FIELDS, applyBatchOp, filterItemRecords, withRenamedName } from './dataTableOps'
export type { AdjustMode, BatchOp, BatchOpKind } from './dataTableOps'
export { BASE_ATTR_EFFECTS, DEFAULT_BASE_ATTRS, buildFormulaFromCoeffs, defaultCoeffsFor, formatCoeff, initialEntries, parseFormulaToCoeffs, resolveBuilderAttrs } from './formulaBuilder'
export type { FormulaBuilderInitial, FormulaCoeffEntry, ParseFormulaResult } from './formulaBuilder'
export { buildCountConstraintMessage, countLimitFieldNames, exceedsCountConstraint, findCountConstraint, resolveCountLimit } from './dataCountConstraint'
export type { CountConstraint } from './dataCountConstraint'
export { DROP_COUNT_MAX, DROP_COUNT_MIN, DROP_RATE_MAX, DROP_RATE_MIN, canParseAsDropTable, clampDropCount, clampDropRate, dropSourceLabel, dropSourceTypeId, normalizeDropEntries, normalizeDropRange, serializeDropEntries } from './dropTable'
export type { DropEntry } from './dropTable'
export { collectLeaves, diffItems, diffLibraries, diffValues, summarizeDiff } from './itemDiff'
export type { DiffEntry, DiffLeaf, ItemDiffType, LibraryDiffGroup } from './itemDiff'
export { bucketize } from './dataBuckets'
