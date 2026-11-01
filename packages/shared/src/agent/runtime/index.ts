/**
 * shared/agent/runtime —— Agent 运行时支撑：token 预算评估、质量门（章节草稿/数据候选评审）、消息与工具调用消息的构造与解析。
 *
 * 外部一律从这里 import（`.../runtime`），不要再深插目录内文件。
 */

export { estimateTaskTokens, estimateTokens, evaluateBudget, taskBudget } from './budget'
export type { BudgetLevel, BudgetScale, BudgetStatus, LlmTaskType } from './budget'
export { applyJudge, evaluateChapterDraft, evaluateDataCandidates } from './qualityGate'
export { FALLBACK_ANSWER, buildAssistantMessage, buildToolMessage, fallbackAnswer, formatToolResult, parseToolArguments, terminationDetail } from './brainMessages'
export type { BrainLlmReply, BrainLlmRequest, BrainLlmTransport, BrainMessage, BrainToolCall, BrainToolRunner } from './brainMessages'
