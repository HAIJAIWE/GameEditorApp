/**
 * shared/ceshu/fields 能力入口。
 *
 * 外部一律从这里 import（`.../fields`），不要再深插目录内文件。
 */

export { FIELD_ACTIONS, FIELD_ACTION_INSTRUCTIONS, FIELD_ACTION_LABELS, FIELD_ACTION_TITLES, buildFieldActionInstruction } from './ceshuFieldAction'
export type { FieldAction } from './ceshuFieldAction'
export { displayFieldValue, optionLabel } from './ceshuFieldDisplay'
export { CESHU_CHAPTER_FIELDS, fieldColumns, fieldLabelOf, resolveFieldMeta } from './ceshuFields'
export type { ResolvedFieldMeta } from './ceshuFields'
export { FIELD_STATUS_KEY, fieldStatusOf, getFieldStatus, pendingFieldKeys, readFieldStatus, setFieldStatuses } from './ceshuFieldStatus'
export type { ChapterFieldStatus, FieldReviewStatus, FieldStatusEntry, FieldStatusMap } from './ceshuFieldStatus'
export { countDocPendingFields, countFieldStatuses, formatFieldStatusSummary } from './ceshuFieldStatusStats'
export type { FieldStatusCounts } from './ceshuFieldStatusStats'
