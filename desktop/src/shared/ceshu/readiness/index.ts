/**
 * shared/ceshu/readiness 能力入口。
 *
 * 外部一律从这里 import（`.../readiness`），不要再深插目录内文件。
 */

export { READINESS_STAGE_ORDER } from './ceshuReadinessData'
export type { CeshuChapterReadiness, CeshuReadinessReport, CeshuStageReadiness } from './ceshuReadinessData'
export { buildReadinessReportMarkdown, computeReadiness, readinessFillGap, readinessStageLabel } from './ceshuReadiness'
