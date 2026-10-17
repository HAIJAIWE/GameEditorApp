/**
 * Brain 循环的**类型契约层**（从 `brain.ts` 拆出的定义层）。
 *
 * 只放类型 / 常量，不含任何求值逻辑 —— 循环实现见 `brain/loop.ts`，
 * 上下文工具（截断/重置/评估）见 `brain/context.ts`。
 * 这样 `loop.ts` 只需关心流程，类型变更的影响面被限制在这一层。
 */

import type { SkillExecutionContext, SkillInteraction } from '../protocol'
import type { BrainLlmTransport, BrainToolRunner, BrainMessage } from '../brainMessages'
import type { LlmUsage } from '../../config/llmConfig'
import type { AgentRunStats, AgentRunTier } from '../observability'

/* ---- 事件 ---- */

/**
 * 本轮运行的中止原因（M0.5 / DD-5）。
 * `final` = 正常走到终稿；三道计数闸（`max_turns` / `max_tool_calls` / `wall_clock`）为**优雅中止**
 * （仍 `completed: true`，返回部分产出）；其余为边界情形。
 */
export type BrainStopReason =
  | 'final'
  | 'max_turns'
  | 'max_tool_calls'
  | 'wall_clock'
  | 'no_tools'
  | 'unresolvable_tools'
  | 'transport_error'

export type BrainEvent =
  | { type: 'step_start'; order: number; tool: string }
  | { type: 'stream_chunk'; text: string }
  | { type: 'stream_done'; fullText: string }
  | {
      type: 'approval_required'
      /** 与审批回传配对的请求 id（面板据此回传决定） */
      requestId: string
      tool: string
      action: string
      params: Record<string, unknown>
    }
  | {
      /** 技能要求与用户交互（确认破坏性动作 / 提问澄清参数） */
      type: 'interaction_required'
      requestId: string
      tool: string
      action: string
      interaction: SkillInteraction
    }
  | { type: 'step_done'; tool: string; result: string; success: boolean }
  | { type: 'done'; text: string }
  /** M1 观测：每轮 LLM 调用结束后的消耗点（与 `AgentTurnStat` 同形） */
  | {
      type: 'turn_stats'
      turn: number
      model: string
      tier: AgentRunTier
      usage: LlmUsage
      latencyMs: number
      toolCalls: number
    }
  /** M0.5 终止闸（DD-5）：命中三道计数闸之一时发；`detail` 供面板「诚实显示」本次为何中止 */
  | {
      type: 'terminated'
      reason: 'max_turns' | 'max_tool_calls' | 'wall_clock'
      detail: string
    }
  | { type: 'error'; message: string }

/** 审批请求（由调用方弹窗/回传；返回 true 才放行） */
export interface BrainApprovalRequest {
  requestId: string
  tool: string
  action: string
  params: Record<string, unknown>
}

export type BrainApprover = (request: BrainApprovalRequest) => Promise<boolean> | boolean

/** 交互请求（技能要求确认或提问） */
export interface BrainInteractionRequest {
  requestId: string
  tool: string
  action: string
  interaction: SkillInteraction
}

/** 交互答复：confirm 用 `approved`；question 单问题用 `answer`、多问题用 `answers`（按下标对齐） */
export interface BrainInteractionAnswer {
  approved?: boolean
  answer?: string
  answers?: readonly string[]
}

export type BrainInteractionResponder = (
  request: BrainInteractionRequest
) => Promise<BrainInteractionAnswer> | BrainInteractionAnswer

export interface RunBrainLoopOptions {
  /** 用户本轮输入 */
  input: string
  /** 系统提示词（可多条，按顺序注入；见 `prompts.ts`） */
  systemPrompts: string[]
  transport: BrainLlmTransport
  runner: BrainToolRunner
  /** 暴露给 LLM 的工具 JSON Schema 列表（通常来自 `SkillDispatcher.toolsJsonSchema()`） */
  tools?: unknown[]
  /**
   * 生效档位（M3 档位路由）：由调用方经 `resolveLlmTier(config)` 解析后注入，
   * 决定 `turn_stats.tier` / `AgentRunStats.tier` 的取值与提示词里的工具面口径。
   * 缺省 `'local'`（数字员工对话面在本版默认仍走本地 Ollama 传输层）。
   */
  tier?: AgentRunTier
  /** 最大 LLM 轮数（DD-5 `maxTurns`，默认 6；计数式硬闸，取代原先的 `maxIterations`） */
  maxTurns?: number
  /** 累计工具调用上限（DD-5 `maxToolCalls`，默认 8）；超出即带部分产出 finalize。≤0 表示不限制 */
  maxToolCalls?: number
  /** 墙钟上限（毫秒，DD-5 `wallClockMs`，默认 120000）；超出即带部分产出 finalize。≤0 表示不限制 */
  wallClockMs?: number
  /** 危险操作审批；未提供 → 一律视为未确认（拒绝） */
  requestApproval?: BrainApprover
  /** 技能交互（确认/提问）答复通道；未提供 → 视为用户未确认/未答复 */
  requestInteraction?: BrainInteractionResponder
  /** 审批请求 id 生成器（默认进程内自增；测试可注入确定性实现） */
  newRequestId?: () => string
  /** 等待用户答复的超时（毫秒）；超时按「未确认/未答复」处理，0 表示不超时 */
  interactionTimeoutMs?: number
  /**
   * 产出评估钩子（F4 评估闭环）：终稿前可选调用，结论只辅助诊断、绝不阻断生成。
   * 云端档建议挂一个确定性门（复用 `qualityGate` 思路），本地档一般不挂（4B 不值当）。
   */
  evaluator?: (text: string) => AgentEvalVerdict | null
  context?: SkillExecutionContext
  /** 事件实时回调（A1-4 面板流式渲染用；事件同样会收集进返回值） */
  onEvent?: (event: BrainEvent) => void
}

export interface BrainRunResult {
  text: string
  events: BrainEvent[]
  /** 是否走到最终答复（false 表示因 LLM 传输失败中断） */
  completed: boolean
  /** 本轮完整消息序列（供会话持久化复用，见 `main/agent/sessionStore.ts`） */
  messages: BrainMessage[]
  /** M1 观测：本轮运行的累计消耗（面板「本次消耗」与历史统计的数据源） */
  stats: AgentRunStats
  /** M0.5 终止原因（`final` = 正常终稿；其余见 `BrainStopReason`） */
  stopReason: BrainStopReason
  /** F4 评估钩子结论（可选；`null` 表示未挂评估器或评估器降级） */
  verdict?: AgentEvalVerdict | null
}

/** 最大 LLM 轮数默认值（DD-5 `maxTurns`：本地档 4B 的计数式硬闸；云端档可在 M3 放宽） */
export const DEFAULT_MAX_TURNS = 6
/** 累计工具调用上限默认值（DD-5 `maxToolCalls`） */
export const DEFAULT_MAX_TOOL_CALLS = 8
/** 墙钟上限默认值（毫秒，DD-5 `wallClockMs` = 120s） */
export const DEFAULT_WALL_CLOCK_MS = 120_000

/**
 * 等待用户答复（危险确认 / 技能交互）的默认超时（毫秒，对齐 Python `ask_user` 的 `timeout=120`）。
 * 超时按「未确认/未答复」处理——无人值守时不会永久挂住循环。设为 0 或负数表示不超时。
 */
export const DEFAULT_INTERACTION_TIMEOUT_MS = 120_000

/**
 * agent 循环产出评估结论（F4 评估钩子）：极简结构，循环在终稿前可选调用。
 * `level: 'ok'` 表示无明显问题；`'flagged'` 表示触发了某条确定性红线（如空产出 / 合规关键词）。
 * 评估器**只辅助诊断、绝不阻断**正文生成（与 `qualityJudge` 降级铁律一致）。
 */
export interface AgentEvalVerdict {
  level: 'ok' | 'flagged'
  reason?: string
}
