/**
 * Agent Brain 服务（A1-2）：把 A1-1 的技能调度器接到 Brain 循环上。
 *
 * 组成：`SkillDispatcher` → `BrainToolRunner` 适配 + 提示词骨架 + LLM 传输层。
 * A1-2 尚未提供审批 UI，故**危险操作一律拒绝**（`requestApproval` 缺省不传 →
 * `runBrainLoop` 视为未确认）；审批交互属 A1-4 数字员工面板。
 */

import {
  DEFAULT_MAX_ITERATIONS,
  runBrainLoop,
  type BrainApprover,
  type BrainLlmTransport,
  type BrainRunResult,
  type BrainToolRunner
} from '../../shared/agent/brain'
import { buildSystemPrompts } from '../../shared/agent/prompts'
import { RISK_LEVEL, resolveRiskLevel, type SkillExecutionContext } from '../../shared/agent/protocol'
import type { SkillDispatcher } from './dispatcher'
import { OllamaChatTransport } from './ollamaTransport'

/** 把技能调度器适配为 Brain 的工具执行器 */
export function createDispatcherToolRunner(dispatcher: SkillDispatcher): BrainToolRunner {
  return {
    resolve: (toolName) => dispatcher.fuzzyMatch(toolName),
    needsConfirmation: (toolName, action) => resolveRiskLevel(toolName, action) >= RISK_LEVEL.SYSTEM,
    execute: (toolName, params, ctx) => dispatcher.execute(toolName, params, ctx)
  }
}

export interface AgentBrainServiceDeps {
  dispatcher: SkillDispatcher
  /** LLM 传输层；缺省用 Ollama `/api/chat` */
  transport?: BrainLlmTransport
  maxIterations?: number
  /** 危险操作审批回调（A1-4 接入；缺省 → 危险操作一律拒绝） */
  requestApproval?: BrainApprover
}

export class AgentBrainService {
  private readonly transport: BrainLlmTransport

  constructor(private readonly deps: AgentBrainServiceDeps) {
    this.transport = deps.transport ?? new OllamaChatTransport()
  }

  /** 跑一轮完整的「思考 → 工具 → 终稿」循环，返回事件流与最终文本 */
  async chat(input: string, context: SkillExecutionContext = {}): Promise<BrainRunResult> {
    return runBrainLoop({
      input,
      systemPrompts: buildSystemPrompts({ toolsDescription: this.deps.dispatcher.toolsDescription() }),
      transport: this.transport,
      runner: createDispatcherToolRunner(this.deps.dispatcher),
      tools: this.deps.dispatcher.toolsJsonSchema(),
      maxIterations: this.deps.maxIterations ?? DEFAULT_MAX_ITERATIONS,
      ...(this.deps.requestApproval ? { requestApproval: this.deps.requestApproval } : {}),
      context
    })
  }
}
