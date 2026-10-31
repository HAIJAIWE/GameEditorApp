// 上下文压缩子包（dsh 式单职责）：压力阈值 / 工具结果剪枝 / 工具配对 / 编排。
// 设计出处见各文件头注释（对齐 dsh `compaction-basic` / `compaction-tool-result-pruner` / `compaction/tool-pairing`）。

export { cutBalanced, pairingDelta, safeTailCount } from './pairing'
export { PRUNE_MARKER, PRUNE_PRESETS, codePointLength, pruneText, pruneToolResult } from './prune'
export type { PruneOptions } from './prune'
export { CLOUD_TIER_THRESHOLD, LOCAL_ASSUMED_WINDOW, LOCAL_TIER_THRESHOLD, RETAIN_RATIO, THRESHOLD_RATIO, resolvePressureBudget } from './pressure'
export type { PressureBudget } from './pressure'
export { compactHistory, estimateTokensOf } from './compact'
export type { CompactOptions, CompactResult } from './compact'
