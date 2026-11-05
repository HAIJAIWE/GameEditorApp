/**
 * Brain 循环的**类型契约层**（从 `brain.ts` 拆出的定义层）。
 *
 * 只放类型 / 常量，不含任何求值逻辑 —— 循环实现见 `brain/loop.ts`，
 * 上下文工具（截断/重置/评估）见 `brain/context.ts`。
 * 这样 `loop.ts` 只需关心流程，类型变更的影响面被限制在这一层。
 */

import type { SkillExecutionContext, SkillInteraction } from '../config'
import type { BrainLlmTransport, BrainToolRunner, BrainMessage } from '../runtime'
import type { LlmUsage } from '../../config/llm'
import type { AgentRunStats, AgentRunTier } from '../observability'
import type { CompactSummarizer } from '../compaction'
import type { SubagentLedgerPort } from './subagents'

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
  | 'cancelled'
  | 'no_tools'
  | 'unresolvable_tools'
  | 'transport_error'

export type BrainEvent =
  | { type: 'step_start'; order: number; tool: string }
  | { type: 'stream_chunk'; text: string }
  /**
   * 清空本轮已流出的文本（重试前发）。
   *
   * 为什么需要：模型请求失败后重试是**同 step 重放**，最终 `stream_done` 会用全文覆盖，
   * 但重试**进行中** UI 会看到「旧前半段 + 新前半段」叠着。发出本事件让消费方清空，
   * 用户看到的是「正在重试」，而不是一段越来越乱的字。
   */
  | { type: 'stream_reset' }
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
  | {
      type: 'step_done'
      tool: string
      result: string
      success: boolean
      /**
       * 本次调用的原始参数（JSON 文本）。面板据此展示「参数」段——
       * 拿不到参数时省略该字段（不要编造 `{}`，否则卡片会显示一个假参数段）。
       */
      args?: string
      /**
       * 工具返回的图像（data URL，来自 `SkillResult.images`）。面板据此在工具卡里
       * 内联渲染缩略图条（对齐 dsh `ui-tool` 的 `tool.call.images` 槽）。无图像时省略。
       */
      images?: string[]
    }
  /** 子智能体生命周期（Slice 38）：启动 / 完成，供面板展示子任务列表 */
  | { type: 'subagent_started'; id: string; task: string }
  | { type: 'subagent_done'; id: string; success: boolean; text: string }
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
      reason: 'max_turns' | 'max_tool_calls' | 'wall_clock' | 'cancelled'
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

/**
 * **执行预审**（#27，对齐 dsh experimental auto-review 的执行前审查）：
 * 工具执行**前**、人工审批**之前**由模型做一轮风险判读，其结论**顶替人工审批**。
 *
 * 语义（与 dsh Auto 预设一致）：
 * - `approve: true` ⇒ **放行并直接执行**（循环注入一次性 `dangerConfirmed` 令牌，跳过人工审批）；
 * - `approve: false` ⇒ 拒绝：`approvalPolicy === 'never'` 时**终局拒绝**（不询问）；
 *   `'ask'` 时继续走**人工审批**（人类可覆盖预审结论）；
 * - 预审实现**抛异常** ⇒ 循环按 **fail-closed 硬拒绝**（对齐 dsh `AUTO_REVIEW_FAILED`，不执行）。
 *
 * 典型实现见 `main/agent/agentService/preReview.ts`（LLM 判读 + 严格 JSON）。
 */
export interface PreExecReviewCtx {
  /** 解析后的工具 id（与 dispatcher 同口径，已归一别名） */
  tool: string
  /** 归一后的动作（如 `execute`） */
  action: string
  /** 工具参数（原始 arguments） */
  params: Record<string, unknown>
  /**
   * 该（tool, action）的**静态**风险等级数值（`RISK_LEVEL` 体系），作为预审判读的提示。
   * 由循环用 `resolveRiskLevel` 算好传入，预审实现不必再算一遍。
   */
  risk: number
  /** 取消信号（透传给预审里的 LLM 调用，用户点停止时能中断） */
  signal?: AbortSignal
}

/** 执行预审结论 */
export interface PreExecReviewVerdict {
  /** true ⇒ 放行并**直接执行**（顶替人工审批）；false ⇒ 拒绝（never 终局 / ask 转人工） */
  approve: boolean
  /** 拒绝/通过的原因（回显给面板与事件流，便于审计） */
  reason: string
  /** 预审判读的风险档位（dsh 三档；仅审计/展示，缺省不填） */
  risk?: 'low' | 'medium' | 'high'
}

export type PreExecReviewFn = (
  ctx: PreExecReviewCtx
) => Promise<PreExecReviewVerdict> | PreExecReviewVerdict

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

/**
 * 运行中收件箱（对齐 dsh inbox / Steer）：外部可在循环跑动中 `push` 一条消息，
 * 循环在**下一轮开始前** `drain` 并注入为 `user` 消息——用于「跑到一半改需求 / 追问」。
 */
export interface BrainInbox {
  push(content: string): void
  /** 取走并清空当前全部待处理消息 */
  drain(): string[]
}

/**
 * 沙箱策略（对齐 dsh `sandbox-policy`）：
 * - `'workspace-write'`（本项目默认）：允许写工作区（策划书/数据/文件）；
 * - `'read-only'`：只读——**禁止会写文件的外部后端**（如 CLI 子智能体），工具层按需自行遵守。
 *
 * 诚实说明：本项目没有 OS 级文件沙箱；`read-only` 的强制点目前是「拒绝外部 CLI 子智能体」，
 * 而不是内核级隔离。真要做 OS 级隔离（Windows ACL / 容器）是另一件事。
 */
export type SandboxPolicy = 'read-only' | 'workspace-write'

/** 子智能体任务（交给 provider 执行） */
export interface SubAgentTask {
  task: string
  /** 子级深度（父深度 + 1） */
  depth: number
  signal: AbortSignal
  /** 子级收件箱（进程内 provider 使用；外部 provider 可忽略） */
  inbox: BrainInbox
  /** 沙箱策略：外部后端应据此拒绝写操作（CLI provider 在 read-only 下直接拒绝运行） */
  sandboxPolicy: SandboxPolicy
}

/** 子智能体执行结果 */
export interface SubAgentOutcome {
  text: string
  success: boolean
}

/**
 * 子智能体 provider（对齐 dsh `ctx.subagents` 的多后端 seam）。
 *
 * 默认实现是进程内 `spawn`（递归 `runBrainLoop`）；外部后端（CLI 编码智能体 / 远程服务）
 * 只需实现本接口并注入 `subAgentProvider`，**不必改循环**。
 */
export interface SubAgentProvider {
  /** provider 名称（如 `spawn` / `cli` / `remote`） */
  id: string
  run(task: SubAgentTask): Promise<SubAgentOutcome>
}

export interface RunBrainLoopOptions {
  /** 用户本轮输入 */
  input: string
  /**
   * 本轮随输入一起发的图片（data URL）。挂到首条 user 消息上，
   * 传输层按模型是否支持视觉决定是否下发；**不落盘**（base64 不进会话记录）。
   */
  inputImages?: string[]
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
  /**
   * 审批策略（对齐 dsh `user-approval`）：
   * - `'ask'`（默认）：危险操作走 `requestApproval` 询问；无通道则拒绝（fail-closed）。
   * - `'never'`：**确定性拒绝**所有危险操作，不发审批事件——CI / 无人值守的严格无头模式。
   */
  approvalPolicy?: 'ask' | 'never'
  /** 技能交互（确认/提问）答复通道；未提供 → 视为用户未确认/未答复 */
  requestInteraction?: BrainInteractionResponder
  /** 运行中收件箱：每轮开始前 drain，注入为 user 消息（对齐 dsh inbox / Steer） */
  inbox?: BrainInbox
  /** 子智能体 provider（缺省=进程内 spawn）；注入自定义实现即可接外部后端 */
  subAgentProvider?: SubAgentProvider
  /** 沙箱策略（缺省 `'workspace-write'`，本项目 agent 本来就要写策划书/数据） */
  sandboxPolicy?: SandboxPolicy
  /**
   * 初始历史（Slice 34）：在系统提示词之后、本次用户输入之前插入的消息。
   * 用于「从事件日志恢复会话」——由 `deriveMessagesFromTurns` 重建后传入。
   */
  initialMessages?: BrainMessage[]
  /**
   * 上下文压缩摘要器（对齐 dsh `compaction-basic` 的 `summarize` 钩子）。
   * 提供时：历史超压力阈值后用它生成**结构化 checkpoint** 替代模板摘要；
   * 未提供（默认）或摘要失败时，回落既有模板压缩——零行为变化。
   */
  compactSummarizer?: CompactSummarizer
  /**
   * **超长工具输出落盘（对齐 dsh `spill`）**：工具结果超过尺寸闸时，先用它把完整内容写文件、
   * 返回「头部预览 + 文件引用」替代纯截断；未提供则回落 `clipToolResult` 截断。
   * 由宿主注入（`shared` 层不碰文件系统）。
   */
  spill?: (toolName: string, text: string) => string
  /**
   * 子智能体启动回调：拿到 `childId` 与该子循环的 `inbox`，可后续 `push` 消息
   * （即 dsh 的 `sendMessage` 对运行中子级的「插话」）；`stopChild` 用于**单独停止**
   * 该子智能体（只 abort 它自己，不牵连父循环）。
   */
  onSubAgentSpawned?: (childId: string, inbox: BrainInbox, stopChild: () => void) => void
  /**
   * 子智能体**完成即通知**（promise settle 时触发，不等父循环 `drainSubAgents`）。
   *
   * 为什么必须独立：`subagent_done` 事件只在收量阶段 emit，而收量发生在 finalize ——
   * 若工具里阻塞等待后台任务，父循环走到不了收量，注册表永远不会结算 ⇒ 死锁。
   * 宿主用它即时结算 job 注册表 / 唤醒等待者；`subagent_done` 仍负责 UI 与完成通知注入。
   * 未提供则退化为旧行为（只在收量时结算），不影响既有调用方。
   */
  onSubAgentSettled?: (childId: string, outcome: { success: boolean; text: string }) => void
  /**
   * 子智能体账本（跨轮冷恢复）：启动/完成时各埋一笔，宿主负责落盘。
   * 未提供则退化为「只在内存里」——与本轮改动前行为一致。
   */
  subagentLedger?: SubagentLedgerPort
  /**
   * 模型请求重试参数（缺省 2 次 / 800ms 起指数退避）。
   * 可注入是为了**可测**：测试传 `baseDelayMs: 0` 就不用真的等 1.6 秒。
   */
  transportRetry?: { maxRetries?: number; baseDelayMs?: number }
  /** 审批请求 id 生成器（默认进程内自增；测试可注入确定性实现） */
  newRequestId?: () => string
  /** 等待用户答复的超时（毫秒）；超时按「未确认/未答复」处理，0 表示不超时 */
  interactionTimeoutMs?: number
  /**
   * **并行工具执行**（Slice 19，opt-in，默认关）。
   *
   * 打开后：同一轮里 LLM 一次返回的多个工具调用会**并发执行**（而非逐个 await），
   * 结果仍按原顺序回灌（`step_done` / tool 消息顺序不变）。
   * 审批与技能交互仍是**串行**的（交互式，不能并发），只有真正执行阶段并行。
   *
   * ⚠️ 只对**互不依赖、非数据写**的工具安全。数据写类工具并发会有竞态，请勿开启。
   */
  parallelToolCalls?: boolean
  /** 并行执行的最大并发数（默认 4；仅 `parallelToolCalls` 为真时生效） */
  maxToolConcurrency?: number
  /**
   * **子智能体**工具名（Slice 19，默认 `'tool.spawn_subagent'`）。
   *
   * 该工具调用不会走普通技能执行，而是由循环**递归跑一轮新的 Brain 循环**（独立消息历史、
   * 相同工具面），把子任务的最终答复作为工具结果回灌。用于「把一个大任务拆给子智能体做」。
   * 设空串可关闭该行为。
   */
  subAgentTool?: string
  /** 子智能体嵌套深度（内部用；顶层调用方不传 = 0，最多允许 1 层） */
  depth?: number
  /**
   * 产出评估钩子（F4 评估闭环）：终稿前可选调用，结论只辅助诊断、绝不阻断生成。
   * 云端档建议挂一个确定性门（复用 `qualityGate` 思路），本地档一般不挂（4B 不值当）。
   */
  evaluator?: (text: string) => AgentEvalVerdict | null
  /**
   * **执行预审**（#27）：工具执行**前**、人工审批**之前**的模型预审钩子（对齐 dsh Auto）。
   * `approve:true` ⇒ 放行并直接执行（顶替人工）；`approve:false` ⇒ never 终局 / ask 转人工；
   * 抛异常 ⇒ fail-closed 硬拒绝。详见 `PreExecReviewFn` 注释。
   * 典型实现见 `main/agent/agentService/preReview.ts`（LLM 判读）。
   */
  preExecReview?: PreExecReviewFn
  context?: SkillExecutionContext
  /** 事件实时回调（A1-4 面板流式渲染用；事件同样会收集进返回值） */
  onEvent?: (event: BrainEvent) => void
  /**
   * 外部取消信号（用户点「停止」/ 窗口关闭时由调用方 abort）。
   *
   * 语义：**优雅中止** —— 与三道计数闸同款，返回 `completed: true` + 已完成的部分产出
   * （`stopReason: 'cancelled'`），而不是 reject。区别在于「谁叫停」：计数闸是预算耗尽，
   * 取消是用户明确要求。
   *
   * 实现上循环会自建一个内部 `AbortController` 并把它传给传输层，外部信号只做**转发**：
   * 这样「墙钟超时」也能真正中断一次挂死的 HTTP 调用（改前 `wallClockMs` 只是轮次间的软检查，
   * 单次调用卡住时循环无法脱身，与「三道硬闸」的说法不符）。
   */
  signal?: AbortSignal
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

/**
 * 最大 LLM 轮数默认值。
 * 本地档 = 4B 的计数式硬闸（DD-5）；云端档放宽（云端优先，2026-10-28）。
 */
export const DEFAULT_MAX_TURNS = 6
/** 云端档最大轮数（模型更强、上下文更大，允许更多轮次） */
export const CLOUD_MAX_TURNS = 12
/** 累计工具调用上限默认值（DD-5 `maxToolCalls`） */
export const DEFAULT_MAX_TOOL_CALLS = 8
/** 墙钟上限默认值（毫秒，DD-5 `wallClockMs` = 120s，本地档） */
export const DEFAULT_WALL_CLOCK_MS = 120_000
/** 云端档墙钟上限（5 分钟；云端长任务不应被本地 2 分钟卡住） */
export const CLOUD_WALL_CLOCK_MS = 300_000
/** 并行工具执行的默认并发（本地档；云端档见 `CLOUD_TOOL_CONCURRENCY`） */
export const DEFAULT_TOOL_CONCURRENCY = 4
/** 云端档并行并发（dsh 同款 `maxParallelToolCalls` = 10） */
export const CLOUD_TOOL_CONCURRENCY = 10

/**
 * 等待用户答复（危险确认 / 技能交互）的默认超时。
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
