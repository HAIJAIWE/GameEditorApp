/**
 * shared/ceshu/readiness —— 就绪度评估：按阶段计算章节填充度、汇总就绪报告并给出缺口提示。
 *
 * 外部一律从这里 import（`.../readiness`），不要再深插目录内文件。
 */

export { READINESS_STAGE_ORDER } from './ceshuReadinessData'
export type { CeshuChapterReadiness, CeshuReadinessReport, CeshuStageReadiness } from './ceshuReadinessData'
export { buildReadinessReportMarkdown, computeReadiness, readinessFillGap, readinessStageLabel } from './ceshuReadiness'
