/**
 * shared/ceshu/data 能力入口。
 *
 * 外部一律从这里 import（`.../data`），不要再深插目录内文件。
 */

export { DATA_GEN_BACKGROUND_MAX_LENGTH, DATA_GEN_DEFAULT_COUNT, DATA_GEN_ERROR_EMPTY, DATA_GEN_ERROR_NO_TYPE, DATA_GEN_ERROR_UNPARSABLE, DATA_GEN_FIELD_HINT_LIMIT, DATA_GEN_MAX_COUNT, DATA_GEN_MIN_COUNT, DATA_GEN_NO_BACKGROUND, DATA_GEN_SYSTEM_NAME_LIMIT, buildDataGenBackground, buildDataGenPrompt, buildDataGenSummaryMessage, buildDataGenTypeHints, clampDataGenCount, dataTypeFieldHints, normalizeDataGenCandidates, resolveSelectedDataTypes, summarizeCandidateItem } from './ceshuDataGen'
export type { CeshuDataGenResult, DataGenCandidates, DataGenPrompt, NormalizedCandidates, SelectedDataType } from './ceshuDataGen'
export { checkDataTablePlan, parseDataTableRequirements, parseExpectedCount, readDataTableRows, resolveDataTable } from './ceshuDataTableCheck'
export type { DataTableActual, DataTableCheckResult, DataTableIssue, DataTableIssueKind, DataTableRequirement, ResolvedTable } from './ceshuDataTableCheck'
export { applyDataTableScaffold, guessFieldKey, guessFieldType, planDataTableScaffold } from './ceshuDataTableScaffold'
export type { ScaffoldAction, ScaffoldApplyResult, ScaffoldFieldPlan, ScaffoldPlan, ScaffoldTablePlan } from './ceshuDataTableScaffold'
export { applyCeshuPatch, parseCeshuIssues, parseCeshuPatch, previewPatchValue } from './ceshuImportPatch'
export type { ApplyPatchResult, CeshuIssueItem, CeshuIssueParseResult, CeshuPatchItem, CeshuPatchParseResult } from './ceshuImportPatch'
export { V5_NEW_CHAPTER_KEYS, migrateV4ToV5, needsV4Migration } from './ceshuMigration'
export { OVERLAP_SPECS, SPLIT_SPECS, migrateCeshuFieldSplits, migrationSplitTitle, pendingSplitCount, planCeshuMigration, splitNarrative } from './ceshuMigrationPlan'
export type { MigrationOverlap, MigrationPlan, MigrationRunResult, MigrationSplit } from './ceshuMigrationPlan'
