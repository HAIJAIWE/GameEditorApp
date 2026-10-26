/**
 * Agent Brain 服务实现（从 `brainService.ts` 拆出）。
 *
 * 组成：`SkillDispatcher` → `BrainToolRunner` 适配 + 提示词骨架（记忆/域上下文/偏好注入）
 * + LLM 传输层 + `AgentSessionStore`（每轮落盘 + 运行统计）+ `AgentMemoryStore`（检索/回写）。
 *
 * M3 档位路由：`chat()` 按 `options.config` 解析生效档位 ⇒ 选传输层、装配工具面、注入循环。
 */

import {
  DEFAULT_MAX_TURNS,
  runBrainLoop,
  type BrainLlmTransport,
  type BrainMessage,
  type BrainRunResult,
  type BrainToolRunner
} from '../../../shared/agent/brain'
import { buildSystemPrompts } from '../../../shared/agent/prompts'
import { buildPersonalizedContext } from '../../../shared/agent/personalization'
import {
  RISK_LEVEL,
  resolveRiskLevel,
  toFunctionCallingTools,
  toJsonSchema,
  type SkillExecutionContext
} from '../../../shared/agent/protocol'
import { buildToolFace } from '../../../shared/agent/toolGroups'
import { estimateTokens, evaluateBudget } from '../../../shared/agent/budget'
import { extractLearnings } from '../memoryStore'
import type { SkillDispatcher } from '../dispatcher'
import { resolveAgentTier, resolveAgentTransport } from '../agentTransport'
import { buildDomainContextBlock, defaultDialogueEvaluator } from './domainContext'
import { buildMemoryBlock } from './memory'
import type { AgentBrainServiceDeps, AgentChatOptions } from './types'

/** 云端对话档的 token 预算（F1/DD-5b 护栏级，保守粗估；超预算仅记录指标，不阻断） */
const CLOUD_CHAT_BUDGET = 8000

/** 把技能调度器适配为 Brain 的工具执行器 */
export function createDispatcherToolRunner(dispatcher: SkillDispatcher): BrainToolRunner {
  return {
    resolve: (toolName) => dispatcher.fuzzyMatch(toolName),
    needsConfirmation: (toolName, action) => resolveRiskLevel(toolName, action) >= RISK_LEVEL.SYSTEM,
    execute: (toolName, params, ctx) => dispatcher.execute(toolName, params, ctx)
  }
}

export class AgentBrainService {
  /** 注入的固定传输层（测试/定制）；缺省 ⇒ 每次调用按配置做档位路由（M3） */
  private readonly fixedTransport?: BrainLlmTransport
  private sessionSeq = 0

  /**
   * 生成会话 id。**本刀的回滚范围是单次对话轮次**（一次 `chat()` 内的全部数据变更）——
   * 取最小爆炸半径：宁可只撤销「刚才那一下」，也不误伤更早的改动。
   * 跨轮次的会话级回滚需会话 id 持久化，属后续工作。
   */
  private nextSessionId(): string {
    this.sessionSeq += 1
    return `chat_${Date.now().toString(36)}_${this.sessionSeq}`
  }

  constructor(private readonly deps: AgentBrainServiceDeps) {
    this.fixedTransport = deps.transport
  }

  /** 选本次调用的传输层：注入的固定层优先，否则由配置解析（M3 档位路由） */
  private resolveTransport(options: AgentChatOptions): BrainLlmTransport {
    return this.fixedTransport ?? resolveAgentTransport(options.config, options.apiKey ?? '')
  }

  /**
   * 跑一轮完整的「思考 → 工具 → 终稿」循环：
   * 1) 装配记忆/域上下文/偏好；2) 跑循环；3) 落盘会话与统计；4) 回写记忆与 learnings。
   */
  async chat(input: string, options: AgentChatOptions = {}): Promise<BrainRunResult> {
    // M3 档位路由：由本次配置解析生效档位（cloud/local/unconfigured）
    const tier = resolveAgentTier(options.config)
    const transport = this.resolveTransport(options)
    const face = buildToolFace(this.deps.dispatcher.list(), tier, options.explicitTools)

    const memoryBlock = await buildMemoryBlock(this.deps.memoryStore, input)
    const extraBlocks: string[] = []
    if (memoryBlock !== null) extraBlocks.push(memoryBlock)
    // F8 域 grounding：章节结构常驻注入（不计入 30 行核心区，DD-6）
    extraBlocks.push(buildDomainContextBlock())
    // 个性化片段：偏好来自历史反馈，冷启动为空时不注入（与 旧版 Learner 一致）
    if (this.deps.preferences) {
      const prefBlock = buildPersonalizedContext(this.deps.preferences.getAll())
      if (prefBlock !== '') extraBlocks.push(prefBlock)
    }
    const systemPrompts = buildSystemPrompts({
      // M2/G7 + M3/DD-3：注入**按场景分组、按档位限量**的紧凑能力目录（每工具一行）
      capabilityCatalog: face.catalog,
      ...(extraBlocks.length > 0 ? { extraBlocks } : {})
    })

    const requestApproval = options.requestApproval ?? this.deps.requestApproval
    // E3-2：为本次对话轮次补一个会话 id，使操作记录器与回滚技能能按「这一轮」分组
    const context: SkillExecutionContext = { ...(options.context ?? {}) }
    if (typeof context.sessionId !== 'string' || context.sessionId.trim() === '') {
      context.sessionId = this.nextSessionId()
    }
    const result = await runBrainLoop({
      input,
      systemPrompts,
      transport,
      runner: this.deps.runner ?? createDispatcherToolRunner(this.deps.dispatcher),
      // ⚠️ `toJsonSchema` 给的是**内层** `{name,description,parameters}`；
      // 下发前必须套 Function Calling 线格式外层，否则云端 400 / 本地 Ollama 静默失效
      // （见 `toFunctionCallingTools` 的注释）。此处是**全项目唯一的转换点**。
      tools: toFunctionCallingTools(face.exposed.map((skill) => toJsonSchema(skill))),
      tier,
      // F4 评估闭环：云端档挂默认评估器（确定性底线检查，不阻断）；本地 4B 一般不挂
      ...(tier === 'cloud' ? { evaluator: defaultDialogueEvaluator } : {}),
      maxTurns: this.deps.maxTurns ?? DEFAULT_MAX_TURNS,
      ...(this.deps.maxToolCalls !== undefined ? { maxToolCalls: this.deps.maxToolCalls } : {}),
      ...(this.deps.wallClockMs !== undefined ? { wallClockMs: this.deps.wallClockMs } : {}),
      ...(requestApproval ? { requestApproval } : {}),
      ...(options.requestInteraction ? { requestInteraction: options.requestInteraction } : {}),
      ...(options.newRequestId ? { newRequestId: options.newRequestId } : {}),
      ...(options.onEvent ? { onEvent: options.onEvent } : {}),
      ...(options.signal ? { signal: options.signal } : {}),
      context
    })

    if (this.deps.sessionStore) {
      // 会话落盘失败不阻塞本轮答复（原子写 + 串行队列已在 store 内保证）
      await this.deps.sessionStore.save(toPlainMessages(result.messages)).catch(() => undefined)
      // F11 观测闭环：落盘本次运行统计，供跨会话成本汇总 / 超预算自动降级（DD-5b 真降级）
      await this.deps.sessionStore.recordRunStats(result.stats).catch(() => undefined)
      // F1/DD-5b 护栏级：云端档超预算记一次指标（真降级待补）
      if (tier === 'cloud') {
        const est = estimateTokens(systemPrompts.join('\n') + '\n' + input)
        const status = evaluateBudget(est, CLOUD_CHAT_BUDGET, true)
        if (status.over) {
          await this.deps.sessionStore
            .recordMetric('budget_over', { estimated: est, budget: status.budget })
            .catch(() => undefined)
        }
      }
    }
    if (this.deps.memoryStore && result.text.trim() !== '') {
      await this.deps.memoryStore.add(`问：${input}\n答：${result.text}`).catch(() => undefined)
      // F3 反思萃取：把回答里显式的「记住/约定/规则」类陈述沉淀为 learnings
      for (const learning of extractLearnings(result.text)) {
        await this.deps.memoryStore.recordLearning(learning).catch(() => undefined)
      }
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
