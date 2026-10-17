/**
 * AgentBrainService 的对外契约（从 `brainService.ts` 拆出）。
 * 只放接口/类型，不依赖运行时实现，供 IPC 与测试引用。
 */

import type {
  BrainApprover,
  BrainEvent,
  BrainInteractionResponder,
  BrainLlmTransport,
  BrainToolRunner
} from '../../../shared/agent/brain'
import type { SkillExecutionContext } from '../../../shared/agent/protocol'
import type { StoredLlmConfig } from '../../../shared/config/llmConfig'
import type { AgentMemoryStore } from '../memoryStore'
import type { PreferenceStore } from '../preferenceStore'
import type { SkillDispatcher } from '../dispatcher'
import type { AgentSessionStore } from '../sessionStore'

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
  /**
   * 外部取消信号（IPC 侧由 `agent:cancel` 触发）。
   * 循环据此优雅中止并返回部分产出（`stopReason: 'cancelled'`），不是 reject。
   */
  signal?: AbortSignal
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
