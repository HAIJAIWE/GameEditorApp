/**
 * Brain 包对外桶（保持 `brain.ts` 原有公共 API 不变）。
 *
 * - `types`   ：事件 / 选项 / 结果契约与常量
 * - `context` ：工具结果截断、上下文重置、评估器安全调用
 * - `loop`    ：`runBrainLoop` 主循环
 * 另转出 `brainMessages`（消息契约），与原 `brain.ts` 的 barrel 行为一致。
 */

export * from './types'
export * from './context'
export * from './loop'
export * from '../brainMessages'
