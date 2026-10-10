/**
 * Agent Brain 服务（A1-2 / A1-3）：把技能调度器、会话持久化与语义记忆接到 Brain 循环上。
 *
 * 组成：`SkillDispatcher` → `BrainToolRunner` 适配 + 提示词骨架（含记忆注入）+ LLM 传输层
 * + `AgentSessionStore`（每轮结束落盘）+ `AgentMemoryStore`（检索注入 + 回写）。
 *
 * M3 档位路由：`chat()` 按 `options.config` 经 `resolveLlmTier` 解析生效档位 ⇒
 * ① 选传输层（云端=OpenAI 兼容 / 本地=Ollama，见 `agentTransport.ts`）；
 * ② 装配**按场景分组、按档位限量**的工具面（见 `shared/agent/toolGroups.ts`）；
 * ③ 把档位注入循环（`runBrainLoop({ tier })`）供观测与提示词口径使用。
 *
 * 尚未提供审批 UI，故**危险操作一律拒绝**（`requestApproval` 缺省不传 →
 * `runBrainLoop` 视为未确认）；审批交互属 A1-4 数字员工面板。
 */

import {
  DEFAULT_MAX_TURNS,
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
import { buildPersonalizedContext } from '../../shared/agent/personalization'
import {
  RISK_LEVEL,
  resolveRiskLevel,
  toJsonSchema,
  type SkillExecutionContext
} from '../../shared/agent/protocol'
import { buildToolFace } from '../../shared/agent/toolGroups'
import type { StoredLlmConfig } from '../../shared/llmConfig'
import type { AgentMemoryStore } from './memoryStore'
import type { PreferenceStore } from './preferenceStore'
import type { SkillDispatcher } from './dispatcher'
import { resolveAgentTier, resolveAgentTransport } from './agentTransport'
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
  /**
   * 本次调用的生效配置（非敏感镜像，来自 `llm:configure`）。
   * M3 档位路由：据此经 `resolveLlmTier` 解析档位 ⇒ 决定传输层与工具面。
   * `undefined` ⇒ 未配置（回本地 Ollama，见 `agentTransport.ts`）。
   */
  config?: StoredLlmConfig
  /** 云端档 API Key（由 ipc 从 secretStore 现取；本地/未配置档忽略） */
  apiKey?: string
  /**
   * 用户**显式选定**的工具 id（DD-4 兜底）。
   * 本地档默认不做模型软路由；面板把用户勾选的技能传进来即可收窄工具面。
   */
  explicitTools?: readonly string[]
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
  /**
   * 固定 LLM 传输层（测试注入 / 定制场景）。**缺省** ⇒ 按每次调用的配置做档位路由
   * （M3：云端=OpenAI 兼容 `/chat/completions`，本地/未配置=Ollama `/api/chat`，见 `agentTransport.ts`）。
   */
  transport?: BrainLlmTransport
  /** 最大 LLM 轮数（DD-5 maxTurns）；缺省 `DEFAULT_MAX_TURNS` */
  maxTurns?: number
  /** 累计工具调用上限（DD-5 maxToolCalls）；缺省 `DEFAULT_MAX_TOOL_CALLS` */
  maxToolCalls?: number
  /** 墙钟上限（毫秒，DD-5 wallClockMs）；缺省 `DEFAULT_WALL_CLOCK_MS` */
  wallClockMs?: number
  /** 危险操作审批回调（A1-4 接入；缺省 → 危险操作一律拒绝） */
  requestApproval?: BrainApprover
  /** 会话持久化（A1-3）；缺省不落盘 */
  sessionStore?: AgentSessionStore
  /** 语义记忆（A1-3）；缺省不检索也不回写 */
  memoryStore?: AgentMemoryStore
  /** 用户偏好（来自历史反馈，确定性键值）；缺省不注入个性化片段 */
  preferences?: PreferenceStore
  /** 工具执行器覆盖（E3-2）：接线层可传入包了记录器的 runner，Brain 本身不感知记录逻辑 */
  runner?: BrainToolRunner
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
    // M3 档位路由：由本次配置解析生效档位（cloud/local），据此选传输层 + 装配工具面
    const tier = resolveAgentTier(options.config)
    const transport = this.resolveTransport(options)
    const face = buildToolFace(this.deps.dispatcher.list(), tier, options.explicitTools)

    const memoryBlock = await this.buildMemoryBlock(input)
    const extraBlocks: string[] = []
    if (memoryBlock !== null) extraBlocks.push(memoryBlock)
    // 个性化片段：偏好来自历史反馈，冷启动为空时不注入（与 Python Learner 一致）
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
      tools: face.exposed.map((skill) => toJsonSchema(skill)),
      tier,
      maxTurns: this.deps.maxTurns ?? DEFAULT_MAX_TURNS,
      ...(this.deps.maxToolCalls !== undefined ? { maxToolCalls: this.deps.maxToolCalls } : {}),
      ...(this.deps.wallClockMs !== undefined ? { wallClockMs: this.deps.wallClockMs } : {}),
      ...(requestApproval ? { requestApproval } : {}),
      ...(options.requestInteraction ? { requestInteraction: options.requestInteraction } : {}),
      ...(options.newRequestId ? { newRequestId: options.newRequestId } : {}),
      ...(options.onEvent ? { onEvent: options.onEvent } : {}),
      context
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
