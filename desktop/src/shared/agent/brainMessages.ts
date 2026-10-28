/**
 * `brain.ts` 的传输契约层：LLM 消息模型类型与构建 / 归一化辅助函数。
 * 由 `brain.ts` 再导出，外部 `import { ... } from './brain'` 站点保持不变。
 */

import type { SkillExecutionContext, SkillResult } from './protocol'
import type { LlmUsage } from '../config/llmConfig'

/* ---- 消息与传输层 ---- */

export interface BrainToolCall {
  id: string
  name: string
  /** 已解析的参数 */
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
  /** 对齐 旧版 `finish_reason`（缺省 stop） */
  finishReason: string
  /** 实际调用的模型（M1 观测：Ollama 传输层回报；脚本化桩可留空） */
  model?: string
  /** 本次响应的 token 用量（M1 观测；本地档 Ollama 取 `prompt_eval_count` / `eval_count`） */
  usage?: LlmUsage
}

export interface BrainLlmRequest {
  messages: BrainMessage[]
  /**
   * 工具清单 —— **Function Calling 线格式**（`[{type:'function', function:{name,description,parameters}}]`）。
   *
   * ⚠️ 传输层**原样下发、不做包装**。由 `SkillDispatcher.toolsJsonSchema()`（内层形态）到线格式的
   * 转换在 `brainService.chat()` 一处完成（`toFunctionCallingTools`）——见该函数注释里的两个后果。
   */
  tools: unknown[]
  /** 流式增量回调 */
  onChunk?: (text: string) => void
  /**
   * 取消信号（可选中止）。
   *
   * 传输层必须把它透传给 `fetch(..., { signal })`，**并且不得把 `AbortError` 包装成业务错误**——
   * 否则循环无法区分「用户点了停止」与「网络真的失败」，会把取消误报成 `transport_error`。
   * 见 `main/agent/agentStream.ts::isAbortError` 与两个传输层的 `catch` 分支。
   */
  signal?: AbortSignal
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

/** 无法继续时的兜底答复 */
export const FALLBACK_ANSWER = '抱歉，暂时无法处理这个请求。'

/** 工具调用参数解析：容忍 JSON 字符串或已是对象；失败回落 {} */
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

/** 兜底答复：取首个非空结果 */
export function fallbackAnswer(results: string[]): string {
  for (const result of results) {
    if (result.trim() !== '') return result.trim()
  }
  return FALLBACK_ANSWER
}

/** 把技能执行结果折叠成回灌给 LLM 的一行文本 */
export function formatToolResult(result: SkillResult): string {
  if (result.success) return result.message
  return `执行失败: ${result.error !== undefined && result.error !== '' ? result.error : '未知'}`
}

/** 三道计数闸 + 用户取消的中文提示文案（面板「诚实显示」用；与闸判定同源，避免两处口径漂移） */
export function terminationDetail(
  reason: 'max_turns' | 'max_tool_calls' | 'wall_clock' | 'cancelled',
  limits: { maxTurns: number; maxToolCalls: number; wallClockMs: number }
): string {
  if (reason === 'cancelled') {
    return '已按要求停止，以下是已完成的部分结果'
  }
  if (reason === 'max_tool_calls') {
    return `已达工具调用上限（${limits.maxToolCalls} 次），以下是已完成的部分结果`
  }
  if (reason === 'wall_clock') {
    return `已达时间上限（${Math.round(limits.wallClockMs / 1000)} 秒），以下是已完成的部分结果`
  }
  return `已达轮次上限（${limits.maxTurns} 轮），以下是已完成的部分结果`
}
