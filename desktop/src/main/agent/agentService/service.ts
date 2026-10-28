/**
 * Agent Brain 服务实现（从 `brainService.ts` 拆出）。
 *
 * 组成：`SkillDispatcher` → `BrainToolRunner` 适配 + 提示词骨架（记忆/域上下文/偏好注入）
 * + LLM 传输层 + `AgentSessionStore`（每轮落盘 + 运行统计）+ `AgentMemoryStore`（检索/回写）。
 *
 * M3 档位路由：`chat()` 按 `options.config` 解析生效档位 ⇒ 选传输层、装配工具面、注入循环。
 */

import {
  runBrainLoop,
  type BrainEvent,
  type BrainInbox,
  type BrainLlmTransport,
  type BrainMessage,
  type BrainRunResult,
  type BrainToolRunner
} from '../../../shared/agent/brain'
import { deriveMessagesFromTurns } from '../../../shared/agent/session'
import { buildSystemPrompts } from '../../../shared/agent/prompts'
import { presetLabel, presetPersona } from '../../../shared/agent/presets'
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
   * 本轮运行中的子智能体注册表（Slice 40）：`onSubAgentSpawned` 把 `childId → { inbox, stop }` 登记进来，
   * 渲染层经 IPC `agent:subagentSend` / `agent:subagentStop` 对运行中的子智能体「插话 / 单独停止」。
   * 每次 `chat()` 开始时清空——避免上一轮遗留的 `sub_1` 与新轮的 `sub_1` 撞 id（id 是每轮本地自增）。
   * 子智能体 `subagent_done` 时从表里摘除（见下方 `onEvent` 包装），只留运行中的条目。
   */
  private readonly subagents = new Map<string, { inbox: BrainInbox; stop: () => void }>()

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

  /**
   * 对运行中的子智能体「插话」（对齐 dsh 的 `sendMessage` / Steer）。
   * 把一条消息 push 进它的收件箱，父/子循环在下一轮开始前会把它注入为 `user` 消息。
   * 返回 `false` 表示该 id 不在注册表（已完成 / 不存在 / 跨轮）。
   */
  sendToSubagent(id: string, content: string): boolean {
    const entry = this.subagents.get(id)
    if (entry === undefined) return false
    entry.inbox.push(content)
    return true
  }

  /**
   * 单独停止某个运行中的子智能体（只 abort 它自己，不牵连父循环）。
   * 返回 `false` 表示该 id 不在注册表（已完成 / 不存在 / 跨轮）。
   */
  stopSubagent(id: string): boolean {
    const entry = this.subagents.get(id)
    if (entry === undefined) return false
    entry.stop()
    return true
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
    // 新一轮：清空上一轮子智能体注册表（见字段注释的 id 碰撞说明）
    this.subagents.clear()

    const memoryBlock = await buildMemoryBlock(this.deps.memoryStore, input)
    const extraBlocks: string[] = []
    if (memoryBlock !== null) extraBlocks.push(memoryBlock)
    // F8 域 grounding：章节结构常驻注入（不计入 30 行核心区，DD-6）
    extraBlocks.push(buildDomainContextBlock())
    // 个性化片段：偏好来自历史反馈，冷启动为空时不注入
    if (this.deps.preferences) {
      const prefBlock = buildPersonalizedContext(this.deps.preferences.getAll())
      if (prefBlock !== '') extraBlocks.push(prefBlock)
    }
    // 智能体预设（借 dsh agent-preset）：注入角色定位 system prompt，锁定本轮对话视角。
    // 未知 preset 静默忽略——不阻断对话，也不污染默认通用助手行为。
    if (options.preset !== undefined) {
      const persona = presetPersona(options.preset)
      if (persona !== null) {
        extraBlocks.push(`【智能体预设】${presetLabel(options.preset)}：${persona}`)
      }
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
    // Slice 34：从轮次日志恢复历史（需调用方传稳定 sessionId；无历史则为空）
    const priorMessages =
      options.resumeHistory === true && this.deps.sessionStore !== undefined
        ? deriveMessagesFromTurns(this.deps.sessionStore.readTurns(context.sessionId))
        : []
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
      // Slice 31：外部子智能体 provider（CLI/远程）；缺省由循环用进程内 spawn
      ...(this.deps.subAgentProvider !== undefined
        ? { subAgentProvider: this.deps.subAgentProvider }
        : {}),
      // Slice 32：沙箱策略（read-only 会拒绝外部 CLI 子智能体）
      ...(this.deps.sandboxPolicy !== undefined ? { sandboxPolicy: this.deps.sandboxPolicy } : {}),
      // Slice 34：从轮次日志恢复的历史（系统提示词之后、本次输入之前）
      ...(priorMessages.length > 0
        ? { initialMessages: priorMessages as unknown as BrainMessage[] }
        : {}),
      // 不显式兜底：让循环按档位取默认（云端 12 / 本地 6）。显式传值会盖掉 tier-aware 默认。
      ...(this.deps.maxTurns !== undefined ? { maxTurns: this.deps.maxTurns } : {}),
      ...(this.deps.maxToolCalls !== undefined ? { maxToolCalls: this.deps.maxToolCalls } : {}),
      ...(this.deps.wallClockMs !== undefined ? { wallClockMs: this.deps.wallClockMs } : {}),
      ...(requestApproval ? { requestApproval } : {}),
      // #27 执行预审：本次选项优先，否则构造时的缺省 provider（经 IPC 开关装配）
      ...(options.preExecReview
        ? { preExecReview: options.preExecReview }
        : this.deps.preExecReview
          ? { preExecReview: this.deps.preExecReview }
          : {}),
      ...(options.requestInteraction ? { requestInteraction: options.requestInteraction } : {}),
      ...(options.newRequestId ? { newRequestId: options.newRequestId } : {}),
      // Slice 40：子智能体「继续对话」——把运行中的 childId 与其 inbox / stop 登记进注册表，
      // 渲染层经 IPC 即可对运行中子智能体插话 / 单独停止（不牵连父循环）。
      onSubAgentSpawned: (childId, inbox, stopChild) => {
        this.subagents.set(childId, { inbox, stop: stopChild })
      },
      // 事件包装**始终安装**：子智能体收量即从注册表摘除（只留运行中的条目）。
      // 不能只在调用方传了 onEvent 时才装——否则无 onEvent 的调用（测试/内嵌）会留下陈旧条目。
      onEvent: (payload: BrainEvent): void => {
        if (payload.type === 'subagent_done') this.subagents.delete(payload.id)
        options.onEvent?.(payload)
      },
      ...(options.signal ? { signal: options.signal } : {}),
      context
    })

    if (this.deps.sessionStore) {
      // 会话落盘失败不阻塞本轮答复（原子写 + 串行队列已在 store 内保证）
      await this.deps.sessionStore.save(toPlainMessages(result.messages)).catch(() => undefined)
      // F11 观测闭环：落盘本次运行统计，供跨会话成本汇总 / 超预算自动降级（DD-5b 真降级）
      await this.deps.sessionStore.recordRunStats(result.stats).catch(() => undefined)
      // Slice 29：事件日志 append-only（审计/回放；与快照分开，只追加不覆盖）
      await this.deps.sessionStore
        .recordEvents(result.events, { sessionId: context.sessionId })
        .catch(() => undefined)
      // Slice 34：追加本轮消息增量（append-only 会话历史，供 resumeHistory 重建）
      // 增量 = 去掉系统提示词与已恢复的历史，只留本轮新增（user 输入 + assistant/tool …）
      const seeded = priorMessages.length
      const delta = result.messages.slice(systemPrompts.length + seeded)
      await this.deps.sessionStore.appendTurn(context.sessionId, delta).catch(() => undefined)
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
