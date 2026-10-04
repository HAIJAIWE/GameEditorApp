/**
 * Agent Brain 服务（A1-2 / A1-3）：把技能调度器、会话持久化与语义记忆接到 Brain 循环上。
 *
 * 组成：`SkillDispatcher` → `BrainToolRunner` 适配 + 提示词骨架（含记忆注入）+ LLM 传输层
 * + `AgentSessionStore`（每轮结束落盘）+ `AgentMemoryStore`（检索注入 + 回写）。
 *
 * 尚未提供审批 UI，故**危险操作一律拒绝**（`requestApproval` 缺省不传 →
 * `runBrainLoop` 视为未确认）；审批交互属 A1-4 数字员工面板。
 */

import {
  DEFAULT_MAX_ITERATIONS,
  runBrainLoop,
  type BrainApprover,
  type BrainEvent,
  type BrainInteractionResponder,
  type BrainLlmTransport,
  type BrainMessage,
  type BrainRunResult,
  type BrainToolRunner
} from '../../shared/agent/brain'
import { buildSystemPrompts } from '../../shared/agent/prompts'
import { RISK_LEVEL, resolveRiskLevel, type SkillExecutionContext } from '../../shared/agent/protocol'
import type { AgentMemoryStore } from './memoryStore'
import type { SkillDispatcher } from './dispatcher'
import { OllamaChatTransport } from './ollamaTransport'
import type { AgentSessionStore } from './sessionStore'

/** 检索注入进提示词的记忆条数上限 */
export const MEMORY_INJECT_TOP_K = 3

/** 把技能调度器适配为 Brain 的工具执行器 */
export function createDispatcherToolRunner(dispatcher: SkillDispatcher): BrainToolRunner {
  return {
    resolve: (toolName) => dispatcher.fuzzyMatch(toolName),
    needsConfirmation: (toolName, action) => resolveRiskLevel(toolName, action) >= RISK_LEVEL.SYSTEM,
    execute: (toolName, params, ctx) => dispatcher.execute(toolName, params, ctx)
  }
}

/** 单次调用可覆盖的选项（A1-4 面板注入事件流与审批） */
export interface AgentChatOptions {
  context?: SkillExecutionContext
  /** 事件流实时回调（面板流式渲染） */
  onEvent?: (event: BrainEvent) => void
  /** 本次调用的危险操作审批（优先于构造时的缺省审批） */
  requestApproval?: BrainApprover
  /** 技能交互（确认/提问）答复通道 */
  requestInteraction?: BrainInteractionResponder
  /** 审批请求 id 生成器（与 broker 配对） */
  newRequestId?: () => string
}

export interface AgentBrainServiceDeps {
  dispatcher: SkillDispatcher
  /** LLM 传输层；缺省用 Ollama `/api/chat` */
  transport?: BrainLlmTransport
  maxIterations?: number
  /** 危险操作审批回调（A1-4 接入；缺省 → 危险操作一律拒绝） */
  requestApproval?: BrainApprover
  /** 会话持久化（A1-3）；缺省不落盘 */
  sessionStore?: AgentSessionStore
  /** 语义记忆（A1-3）；缺省不检索也不回写 */
  memoryStore?: AgentMemoryStore
}

export class AgentBrainService {
  private readonly transport: BrainLlmTransport

  constructor(private readonly deps: AgentBrainServiceDeps) {
    this.transport = deps.transport ?? new OllamaChatTransport()
  }

  /** 检索相关记忆并折成一段系统提示词块（无命中返回 null） */
  private async buildMemoryBlock(input: string): Promise<string | null> {
    if (!this.deps.memoryStore) return null
    try {
      const hits = await this.deps.memoryStore.search(input, MEMORY_INJECT_TOP_K)
      const lines = hits.filter((hit) => hit.text.trim() !== '').map((hit) => `- ${hit.text}`)
      if (lines.length === 0) return null
      return `## 相关记忆\n${lines.join('\n')}`
    } catch {
      // 记忆检索失败不阻塞主流程（对齐 Python「记忆是辅助功能」的取向）
      return null
    }
  }

  /**
   * 跑一轮完整的「思考 → 工具 → 终稿」循环：
   * 1) 先按输入检索记忆并注入系统提示词；2) 跑循环；3) 落盘会话；4) 把本轮问答回写进记忆。
   *
   * `options` 供 IPC/面板按次注入：事件流回调（流式渲染）、危险操作审批、审批 id 生成器。
   */
  async chat(input: string, options: AgentChatOptions = {}): Promise<BrainRunResult> {
    const memoryBlock = await this.buildMemoryBlock(input)
    const systemPrompts = buildSystemPrompts({
      toolsDescription: this.deps.dispatcher.toolsDescription(),
      ...(memoryBlock !== null ? { extraBlocks: [memoryBlock] } : {})
    })

    const requestApproval = options.requestApproval ?? this.deps.requestApproval
    const result = await runBrainLoop({
      input,
      systemPrompts,
      transport: this.transport,
      runner: createDispatcherToolRunner(this.deps.dispatcher),
      tools: this.deps.dispatcher.toolsJsonSchema(),
      maxIterations: this.deps.maxIterations ?? DEFAULT_MAX_ITERATIONS,
      ...(requestApproval ? { requestApproval } : {}),
      ...(options.requestInteraction ? { requestInteraction: options.requestInteraction } : {}),
      ...(options.newRequestId ? { newRequestId: options.newRequestId } : {}),
      ...(options.onEvent ? { onEvent: options.onEvent } : {}),
      context: options.context ?? {}
    })

    if (this.deps.sessionStore) {
      // 会话落盘失败不阻塞本轮答复（原子写 + 串行队列已在 store 内保证）
      await this.deps.sessionStore.save(toPlainMessages(result.messages)).catch(() => undefined)
    }
    if (this.deps.memoryStore && result.text.trim() !== '') {
      await this.deps.memoryStore.add(`问：${input}\n答：${result.text}`).catch(() => undefined)
    }
    return result
  }
}

/** BrainMessage（含可选 tool_calls）→ 可 JSON 序列化的普通记录 */
function toPlainMessages(messages: BrainMessage[]): Array<Record<string, unknown>> {
  return messages.map((message) => {
    const record: Record<string, unknown> = { role: message.role, content: message.content }
    if (message.tool_calls) record.tool_calls = message.tool_calls
    if (message.tool_call_id) record.tool_call_id = message.tool_call_id
    if (message.name) record.name = message.name
    return record
  })
}
