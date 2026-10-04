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

import type { SkillExecutionContext, SkillResult } from './protocol'

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
  | { type: 'approval_required'; tool: string; action: string; params: Record<string, unknown> }
  | { type: 'step_done'; tool: string; result: string; success: boolean }
  | { type: 'done'; text: string }
  | { type: 'error'; message: string }

/** 审批请求（由调用方弹窗/回传；返回 true 才放行） */
export interface BrainApprovalRequest {
  tool: string
  action: string
  params: Record<string, unknown>
}

export type BrainApprover = (request: BrainApprovalRequest) => Promise<boolean> | boolean

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
}

export const DEFAULT_MAX_ITERATIONS = 8

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
  const { input, systemPrompts, transport, runner, requestApproval, onEvent } = options
  const maxIterations = options.maxIterations ?? DEFAULT_MAX_ITERATIONS
  const context: SkillExecutionContext = options.context ?? {}
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

  for (let iteration = 0; iteration < maxIterations; iteration++) {
    emit({ type: 'step_start', order: iteration, tool: 'llm_think' })

    let reply: BrainLlmReply
    try {
      reply = await transport.complete({
        messages: [...messages],
        tools,
        onChunk: (text) => emit({ type: 'stream_chunk', text })
      })
    } catch (error) {
      emit({ type: 'error', message: error instanceof Error ? error.message : String(error) })
      return { text: fallbackAnswer(results), events, completed: false, messages }
    }

    emit({ type: 'stream_done', fullText: reply.content })
    messages.push(buildAssistantMessage(reply))

    if (reply.finishReason === 'stop' && reply.toolCalls.length === 0) {
      const text = reply.content.trim()
      emit({ type: 'done', text })
      return { text, events, completed: true, messages }
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
        emit({ type: 'approval_required', tool: resolved, action, params: call.arguments })
        const approved = requestApproval
          ? await requestApproval({ tool: resolved, action, params: call.arguments })
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
  return { text, events, completed: true, messages }
}
