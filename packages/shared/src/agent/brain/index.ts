/**
 * shared/agent/brain —— Agent 大脑主循环：事件/选项/结果契约、工具结果截断与上下文重置、评估器安全调用、runBrainLoop。
 *
 * Brain 包对外桶（保持 `brain.ts` 原有公共 API 不变）。
 *
 * - `types`   ：事件 / 选项 / 结果契约与常量
 * - `context` ：工具结果截断、上下文重置、评估器安全调用
 * - `loop`    ：`runBrainLoop` 主循环
 *
 * 另转出 `brainMessages`（消息契约），与原 `brain.ts` 的 barrel 行为一致。
 * 它现在住在 `shared/agent/runtime/` 下，原先那条 `'../runtime/brainMessages'` 深插
 * 已被 `local/no-deep-capability-import` 禁止，故改为走 runtime 的能力入口。
 */

export * from '../runtime'

export {
  CLOUD_MAX_TURNS,
  CLOUD_TOOL_CONCURRENCY,
  CLOUD_WALL_CLOCK_MS,
  DEFAULT_INTERACTION_TIMEOUT_MS,
  DEFAULT_MAX_TOOL_CALLS,
  DEFAULT_MAX_TURNS,
  DEFAULT_TOOL_CONCURRENCY,
  DEFAULT_WALL_CLOCK_MS
} from './types'
export type {
  AgentEvalVerdict,
  BrainApprovalRequest,
  BrainApprover,
  BrainEvent,
  BrainInbox,
  BrainInteractionAnswer,
  BrainInteractionRequest,
  BrainInteractionResponder,
  BrainRunResult,
  BrainStopReason,
  PreExecReviewCtx,
  PreExecReviewFn,
  PreExecReviewVerdict,
  RunBrainLoopOptions,
  SandboxPolicy,
  SubAgentOutcome,
  SubAgentProvider,
  SubAgentTask
} from './types'
export { SUBAGENT_LEDGER_LIMIT, reconcileInterrupted, trimLedger } from './subagents'
export type {
  ReconcileResult,
  SubagentLedgerPort,
  SubagentRecord,
  SubagentStatus
} from './subagents'
export { clipToolResult, maybeResetContext, maybeResetContextAsync, safeRunEvaluator } from './context'
export {
  checkStructuredReply,
  coerceOutputSchema,
  parseStructuredReply,
  renderStructured,
  structuredInstruction,
  structuredRepairPrompt
} from './subagentStructured'
export type { StructuredCheck, StructuredParse } from './subagentStructured'
export { createInbox, runBrainLoop } from './loop'
