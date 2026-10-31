/**
 * shared/util/data —— 数据表运算：数值统计与平衡评估、批量操作与筛选、数量上限约束、掉落表、分桶。
 *
 * 外部一律从这里 import（`.../data`），不要深插目录内文件。
 */

export { BALANCE_STD_RATIO, BALANCE_VERDICT_LABELS, assessBalance, countByType, mean, numericFieldNames, stdev, summarizeNumeric } from './dataStats'
export type { NumericSummary, TypeCountRow } from './dataStats'
export { ADJUST_MODES, ADJUST_MODE_LABELS, BATCH_OP_KINDS, BATCH_OP_LABELS, ITEM_SEARCH_FIELDS, applyBatchOp, filterItemRecords, withRenamedName } from './dataTableOps'
export type { AdjustMode, BatchOp, BatchOpKind } from './dataTableOps'
export { buildCountConstraintMessage, countLimitFieldNames, exceedsCountConstraint, findCountConstraint, resolveCountLimit } from './dataCountConstraint'
export type { CountConstraint } from './dataCountConstraint'
export { DROP_COUNT_MAX, DROP_COUNT_MIN, DROP_RATE_MAX, DROP_RATE_MIN, canParseAsDropTable, clampDropCount, clampDropRate, dropSourceLabel, dropSourceTypeId, normalizeDropEntries, normalizeDropRange, serializeDropEntries } from './dropTable'
export type { DropEntry } from './dropTable'
export { bucketize } from './dataBuckets'
