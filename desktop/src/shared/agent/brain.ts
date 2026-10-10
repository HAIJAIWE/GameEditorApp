/**
 * Agent Brain 循环与事件流（自 Python `core/agent/brain_llm.py` 的 `_run_llm_iterations`
 * + `brain_subagent._fallback_answer` 匹平迁移，A1-2）。
 *
 * 设计：**把循环写成纯逻辑**——LLM 传输层（`BrainLlmTransport`）与工具执行器
 * （`BrainToolRunner`）都是注入的接口，故可在 Node 环境用脚本化传输层完整单测
 * 「思考 → 工具 → 结果 → 终稿」的事件序列。
 *
 * 事件流（对齐 Python callback 的 `step_start` / `stream_chunk` / `stream_done` / `step_done`，
 * 并把「需用户确认」显式化为 `approval_required`）：
 *   step_start → stream_chunk* → stream_done →（tool 批）step_start → approval_required? → step_done* → … → done
 *
 * 有意偏离 Python（已在 `docs/a-tier-plan.md` §6 记录）：
 *  - **无确认即拒绝**：Python `_check_dangerous` 在「无法弹出对话框」时注释写「允许继续」、
 *    实为拦截；TS 明确统一为「未拿到显式批准一律不执行」，并把结果回灌给 LLM。
 *  - **每个 tool_call 都产出 tool 消息**：Python 在用户取消时会 `return` 提前结束整批，
 *    留下「assistant 有 tool_calls 却没有对应 tool 结果」的**非法消息序列**（OpenAI/Ollama 协议
 *    要求一一对应）；TS 一律补齐，保持会话协议合法。
 *  - **不移植**：滑动窗口压缩、会话持久化、插件钩子、性能统计、团队模式白名单、
 *    计划驱动执行（`_plan` / `_execute_plan`）——分别属 A1-3（会话与记忆）与 A1-5（业务接线）。
 */

import { isSkillInteraction, type SkillExecutionContext, type SkillInteraction, type SkillResult } from './protocol'
import type { LlmUsage } from '../llmConfig'
import {
  accumulateTurn,
  type AgentRunStats,
  type AgentRunTier,
  emptyAgentRunStats,
  turnStatFromReply
} from './observability'

/* ---- 消息与传输层 ---- */

export interface BrainToolCall {
  id: string
  name: string
  /** 已解析的参数（解析失败为空对象，对齐 Python `json.loads` 失败回落 {}） */
  arguments: Record<string, unknown>
}

/** OpenAI/Ollama 协议消息（tool_calls 只出现在 assistant 消息上） */
export interface BrainMessage {
  role: 'system' | 'user' | 'assistant' | 'tool'
  content: string
  tool_calls?: Array<{ id: string; type: 'function'; function: { name: string; arguments: string } }>
  tool_call_id?: string
  name?: string
}

export interface BrainLlmReply {
  content: string
  toolCalls: BrainToolCall[]
  /** 对齐 Python `finish_reason`（缺省 stop） */
  finishReason: string
  /** 实际调用的模型（M1 观测：Ollama 传输层回报；脚本化桩可留空） */
  model?: string
  /** 本次响应的 token 用量（M1 观测；本地档 Ollama 取 `prompt_eval_count` / `eval_count`） */
  usage?: LlmUsage
}

export interface BrainLlmRequest {
  messages: BrainMessage[]
  /** 工具 JSON Schema（OpenAI Function Calling 形态） */
  tools: unknown[]
  /** 流式增量回调（对齐 Python `on_chunk`） */
  onChunk?: (text: string) => void
}

/** LLM 传输层：A1-2 实现为 Ollama `/api/chat`；单测注入脚本化桩 */
export interface BrainLlmTransport {
  complete(request: BrainLlmRequest): Promise<BrainLlmReply>
}

/** 工具执行器：由 `SkillDispatcher` 适配（见 `main/agent/brainRunner.ts`） */
export interface BrainToolRunner {
  /** 名称解析（模糊匹配）；无法解析返回 null */
  resolve(toolName: string): string | null
  /** 该 (工具, 操作) 是否需要用户二次确认 */
  needsConfirmation(toolName: string, action: string): boolean
  execute(toolName: string, params: Record<string, unknown>, ctx: SkillExecutionContext): Promise<SkillResult>
}

/* ---- 事件 ---- */

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
  /** 最大迭代轮数（对齐 Python `_max_iterations`） */
  maxIterations?: number
  /** 危险操作审批；未提供 → 一律视为未确认（拒绝） */
  requestApproval?: BrainApprover
  /** 技能交互（确认/提问）答复通道；未提供 → 视为用户未确认/未答复 */
  requestInteraction?: BrainInteractionResponder
  /** 审批请求 id 生成器（默认进程内自增；测试可注入确定性实现） */
  newRequestId?: () => string
  /** 等待用户答复的超时（毫秒）；超时按「未确认/未答复」处理，0 表示不超时 */
  interactionTimeoutMs?: number
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
}

export const DEFAULT_MAX_ITERATIONS = 8

/**
 * 等待用户答复（危险确认 / 技能交互）的默认超时（毫秒，对齐 Python `ask_user` 的 `timeout=120`）。
 * 超时按「未确认/未答复」处理——无人值守时不会永久挂住循环。设为 0 或负数表示不超时。
 */
export const DEFAULT_INTERACTION_TIMEOUT_MS = 120_000

/** 无法继续时的兜底答复（对齐 Python `_fallback_answer`） */
export const FALLBACK_ANSWER = '抱歉，暂时无法处理这个请求。'

/** 工具调用参数解析：容忍 JSON 字符串或已是对象；失败回落 {}（对齐 Python `json.loads` 失败分支） */
export function parseToolArguments(raw: unknown): Record<string, unknown> {
  if (raw !== null && typeof raw === 'object' && !Array.isArray(raw)) {
    return raw as Record<string, unknown>
  }
  if (typeof raw !== 'string' || raw.trim() === '') return {}
  try {
    const parsed: unknown = JSON.parse(raw)
    return parsed !== null && typeof parsed === 'object' && !Array.isArray(parsed)
      ? (parsed as Record<string, unknown>)
      : {}
  } catch {
    return {}
  }
}

/** 由 LLM 回复构造 assistant 消息（tool_calls 需原样回灌以符合协议） */
export function buildAssistantMessage(reply: BrainLlmReply): BrainMessage {
  const message: BrainMessage = { role: 'assistant', content: reply.content }
  if (reply.toolCalls.length > 0) {
    message.tool_calls = reply.toolCalls.map((call) => ({
      id: call.id,
      type: 'function',
      function: { name: call.name, arguments: JSON.stringify(call.arguments) }
    }))
  }
  return message
}

/** 构造 tool 结果消息（协议要求与 tool_call id 一一对应） */
export function buildToolMessage(toolCallId: string, toolName: string, content: string): BrainMessage {
  return { role: 'tool', tool_call_id: toolCallId, name: toolName, content }
}

/** 兜底答复：取首个非空结果（对齐 Python `_fallback_answer`） */
export function fallbackAnswer(results: string[]): string {
  for (const result of results) {
    if (result.trim() !== '') return result.trim()
  }
  return FALLBACK_ANSWER
}

/** 把技能执行结果折叠成回灌给 LLM 的一行文本（对齐 Python `_execute_and_reflect` 的取值） */
export function formatToolResult(result: SkillResult): string {
  if (result.success) return result.message
  return `执行失败: ${result.error !== undefined && result.error !== '' ? result.error : '未知'}`
}

/**
 * 运行 Brain 循环：推理 → 决策 → 执行 → 反思（最多 `maxIterations` 轮）。
 *
 * 终止条件（对齐 Python）：
 *  1. `finishReason === 'stop'` 且无工具调用 → 以该轮文本为终稿；
 *  2. 无工具调用（但 finishReason 不是 stop）→ 退出循环，走兜底答复；
 *  3. 工具全部无法解析 → 退出循环；
 *  4. LLM 传输失败 → 发 error 事件后中断（`completed: false`）；
 *  5. 迭代用尽 → 兜底答复。
 */
export async function runBrainLoop(options: RunBrainLoopOptions): Promise<BrainRunResult> {
  const { input, systemPrompts, transport, runner, requestApproval, requestInteraction, onEvent } = options
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS
  const context: SkillExecutionContext = options.context ?? {}
  let requestSeq = 0
  const newRequestId = options.newRequestId ?? ((): string => `approval_${++requestSeq}`)
  const interactionTimeoutMs = options.interactionTimeoutMs ?? DEFAULT_INTERACTION_TIMEOUT_MS

  /** 等待答复的超时保护：超时按「未答复」回落，避免无人值守时永久挂住 */
  const withAnswerTimeout = async <T>(task: Promise<T>, fallback: T): Promise<T> => {
    if (interactionTimeoutMs <= 0) return task
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        task,
        new Promise<T>((resolve) => {
          timer = setTimeout(() => resolve(fallback), interactionTimeoutMs)
        })
      ])
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }
  const tools = options.tools ?? []

  const events: BrainEvent[] = []
  const emit = (event: BrainEvent): void => {
    events.push(event)
    onEvent?.(event)
  }

  const messages: BrainMessage[] = [
    ...systemPrompts.map((content) => ({ role: 'system' as const, content })),
    { role: 'user', content: input }
  ]
  const results: string[] = []
  // M1 观测：本轮运行的累计消耗（每轮 LLM 调用后并入；数字员工对话面在 M3 接档位路由之前恒为 local）
  let runStats: AgentRunStats = emptyAgentRunStats('local')

  /**
   * 处理技能提出的交互请求：
   *  - confirm：批准后带 `confirm: true` **重执行一次**（不做多次重试，避免自旋）；拒绝则记 `[STOP]`
   *  - question：把用户答复作为工具结果回灌（不重执行）
   * 未提供答复通道 / 用户未答复 → 一律按未确认处理（与危险确认门同一取向：不做隐式放行）
   */
  const settleInteraction = async (
    interaction: SkillInteraction,
    toolId: string,
    action: string,
    params: Record<string, unknown>
  ): Promise<{ text: string; success: boolean }> => {
    const requestId = newRequestId()
    emit({ type: 'interaction_required', requestId, tool: toolId, action, interaction })
    const answer = requestInteraction
      ? await withAnswerTimeout(Promise.resolve(requestInteraction({ requestId, tool: toolId, action, interaction })), {})
      : {}

    if (interaction.kind === 'confirm') {
      if (answer.approved !== true) {
        return { text: `[STOP] 用户未确认该操作: ${toolId}`, success: false }
      }
      try {
        const retried = await runner.execute(toolId, { ...params, confirm: true }, context)
        if (retried.interaction !== undefined) {
          return { text: `[STOP] 确认后该操作仍要求再次确认: ${toolId}`, success: false }
        }
        return { text: formatToolResult(retried), success: retried.success }
      } catch (error) {
        return {
          text: `执行失败: ${error instanceof Error ? error.message : String(error)}`,
          success: false
        }
      }
    }

    // 多问题形态（对齐 Python `questions` 数组）：按下标取 answers，缺一不可
    if (interaction.questions !== undefined && interaction.questions.length > 0) {
      const questions = interaction.questions
      const raw = Array.isArray(answer.answers) ? answer.answers : []
      const normalized = questions.map((_, index) => {
        const value = raw[index]
        return typeof value === 'string' ? value.trim() : ''
      })
      const missing = normalized.filter((text) => text === '').length
      if (missing > 0) {
        return {
          text: `[STOP] 用户未解答全部提问（缺 ${missing}/${questions.length}）`,
          success: false
        }
      }
      const lines = questions.map((question, index) => `${index + 1}. ${question.prompt} → ${normalized[index]}`)
      return { text: `用户回答：\n${lines.join('\n')}`, success: true }
    }

    // 单问题形态
    const answerText = typeof answer.answer === 'string' ? answer.answer.trim() : ''
    if (answerText === '') {
      return { text: `[STOP] 用户未解答提问: ${interaction.prompt}`, success: false }
    }
    return { text: `用户回答：${answerText}`, success: true }
  }

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    emit({ type: 'step_start', order: iteration, tool: 'llm_think' })

    let reply: BrainLlmReply
    const turnStartedAt = Date.now()
    try {
      reply = await transport.complete({
        messages: [...messages],
        tools,
        onChunk: (text) => emit({ type: 'stream_chunk', text })
      })
    } catch (error) {
      emit({ type: 'error', message: error instanceof Error ? error.message : String(error) })
      return { text: fallbackAnswer(results), events, completed: false, messages, stats: runStats }
    }

    // M1 观测：本论消耗点（token 用量来自响应；本地档 Ollama 经传输层取 prompt_eval_count/eval_count）
    const turnLatencyMs = Date.now() - turnStartedAt
    const turnUsage = reply.usage
    const turnToolCalls = reply.toolCalls.length
    const turnModel = reply.model ?? ''
    runStats = accumulateTurn(
      runStats,
      turnStatFromReply(iteration, turnModel, 'local', turnUsage, turnLatencyMs, turnToolCalls)
    )
    emit({
      type: 'turn_stats',
      turn: iteration,
      model: turnModel,
      tier: 'local',
      usage: turnUsage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      latencyMs: turnLatencyMs,
      toolCalls: turnToolCalls
    })

    emit({ type: 'stream_done', fullText: reply.content })
    messages.push(buildAssistantMessage(reply))

    if (reply.finishReason === 'stop' && reply.toolCalls.length === 0) {
      const text = reply.content.trim()
      emit({ type: 'done', text })
      return { text, events, completed: true, messages, stats: runStats }
    }

    if (reply.toolCalls.length === 0) break

    emit({ type: 'step_start', order: iteration, tool: `并行${reply.toolCalls.length}工具` })

    let executedAny = false
    for (const call of reply.toolCalls) {
      const resolved = runner.resolve(call.name)
      if (resolved === null) {
        const text = `未知工具: ${call.name}`
        results.push(text)
        emit({ type: 'step_done', tool: call.name, result: text, success: false })
        messages.push(buildToolMessage(call.id, call.name, text))
        continue
      }

      const action = typeof call.arguments.action === 'string' ? call.arguments.action : ''
      if (runner.needsConfirmation(resolved, action)) {
        const requestId = newRequestId()
        emit({ type: 'approval_required', requestId, tool: resolved, action, params: call.arguments })
        const approved = requestApproval
          ? await withAnswerTimeout(
              Promise.resolve(requestApproval({ requestId, tool: resolved, action, params: call.arguments })),
              false
            )
          : false
        if (approved !== true) {
          const text = `[STOP] 用户未确认危险操作: ${resolved}`
          results.push(text)
          emit({ type: 'step_done', tool: resolved, result: text, success: false })
          messages.push(buildToolMessage(call.id, resolved, text))
          continue
        }
        context.dangerConfirmed = { tool: resolved, action }
      }

      let text: string
      let success: boolean
      try {
        const result = await runner.execute(resolved, call.arguments, context)
        success = result.success
        text = formatToolResult(result)

        // 技能要求交互（确认破坏性动作 / 提问澄清）→ 暂停并等用户回答
        if (isSkillInteraction(result.interaction)) {
          const settled = await settleInteraction(result.interaction, resolved, action, call.arguments)
          text = settled.text
          success = settled.success
        }
      } catch (error) {
        success = false
        text = `执行失败: ${error instanceof Error ? error.message : String(error)}`
      }
      results.push(text)
      emit({ type: 'step_done', tool: resolved, result: text, success })
      messages.push(buildToolMessage(call.id, resolved, text))
      executedAny = true
    }

    if (!executedAny && reply.toolCalls.length > 0) {
      // 全部工具均无法解析 → 退出循环，避免无意义空转
      break
    }
  }

  const text = fallbackAnswer(results)
  emit({ type: 'done', text })
  return { text, events, completed: true, messages, stats: runStats }
}
