// shared/agent/compaction —— 上下文压缩：压力预算阈值、工具结果剪枝、工具调用配对、历史压缩编排。
// 设计出处见各文件头注释（对齐 dsh `compaction-basic` / `compaction-tool-result-pruner` / `compaction/tool-pairing`）。

export { cutBalanced, pairingDelta, safeTailCount } from './pairing'
export { PRUNE_MARKER, PRUNE_PRESETS, codePointLength, pruneText, pruneToolResult } from './prune'
export type { PruneOptions } from './prune'
export { CLOUD_TIER_THRESHOLD, LOCAL_ASSUMED_WINDOW, LOCAL_TIER_THRESHOLD, RETAIN_RATIO, THRESHOLD_RATIO, resolvePressureBudget } from './pressure'
export type { PressureBudget } from './pressure'
export {
  buildCompactedMessages,
  compactHistory,
  estimateTokensOf,
  planCompaction,
  shouldCompact
} from './compact'
export type { CompactOptions, CompactResult, CompactSummarizer, CompactionPlan } from './compact'
export { COMPACTION_INSTRUCTION, createCompactSummarizer } from './summarizer'
