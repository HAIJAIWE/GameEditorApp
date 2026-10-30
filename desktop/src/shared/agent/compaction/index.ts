// 上下文压缩子包（dsh 式单职责）：压力阈值 / 工具结果剪枝 / 工具配对 / 编排。
// 设计出处见各文件头注释（对齐 dsh `compaction-basic` / `compaction-tool-result-pruner` / `compaction/tool-pairing`）。
export * from './compact'
export * from './pairing'
export * from './pressure'
export * from './prune'
