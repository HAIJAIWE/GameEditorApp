/**
 * AgentBrainService 的对外契约（从 `brainService.ts` 拆出）。
 * 只放接口/类型，不依赖运行时实现，供 IPC 与测试引用。
 */

import type {
  BrainApprover,
  BrainEvent,
  BrainInteractionResponder,
  BrainLlmTransport,
  BrainToolRunner,
  PreExecReviewFn,
  SandboxPolicy,
  SubAgentProvider,
  SubagentLedgerPort
} from '@mobai/shared/agent/brain'
import type { SkillExecutionContext } from '@mobai/shared/agent/config'
import type { DigitalAttachment } from '@mobai/shared/util/io'
import type { StoredLlmConfig } from '@mobai/shared/config/llm'
import type { AgentMemoryStore } from '../store/memoryStore'
import type { PreferenceStore } from '../store/preferenceStore'
import type { SkillDispatcher } from '../execution/dispatcher'
import type { AgentSessionStore } from '../session/sessionStore'

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
  /**
   * 智能体预设 id（借 dsh agent-preset 设计）。主进程据此注入角色定位 system prompt，
   * 让本轮对话以选定视角进行。未知 id 静默忽略（不阻断对话）。
   */
  preset?: string
  /**
   * 本轮目标（对齐 dsh GoalBar）：用户在输入框上方目标条填的一句话。
   * 非空时注入为系统提示词的一段「本轮目标」，作为意图锚点（不强制模型遵守）。
   * 空串/未传视为未填。每次 `chat` 都重新注入，故目标可跨轮持续生效。
   */
  goal?: string
  /**
   * 随消息附带的文件（对齐 dsh ui-attachment 的诚实子集）。
   * 非空时注入为系统提示词的一段「【附件】…」，让智能体知道有这些文件、
   * 并能用文件工具按绝对路径读取。文件已由 `attachments:add` 复制进库。
   */
  attachments?: DigitalAttachment[]
  /** 事件流实时回调（面板流式渲染） */
  onEvent?: (event: BrainEvent) => void
  /** 本次调用的危险操作审批（优先于构造时的缺省审批） */
  requestApproval?: BrainApprover
  /**
   * 本次调用的**执行预审**（#27，缺省走 `deps.preExecReview`）。
   * 渲染层无法跨 IPC 传函数，故通常由主进程经 `deps.preExecReview` 注入；
   * 预留此覆盖位以便测试与未来前端直传。
   */
  preExecReview?: PreExecReviewFn
  /** 技能交互（确认/提问）答复通道 */
  requestInteraction?: BrainInteractionResponder
  /** 审批请求 id 生成器（与 broker 配对） */
  newRequestId?: () => string
  /**
   * 外部取消信号（IPC 侧由 `task:cancel` 触发，见 `main/task/taskRegistry.ts`）。
   * 循环据此优雅中止并返回部分产出（`stopReason: 'cancelled'`），不是 reject。
   */
  signal?: AbortSignal
  /**
   * 从**轮次日志**恢复历史（Slice 34）：为 true 时，用 `context.sessionId` 之前的
   * 消息增量（`deriveMessagesFromTurns`）作为本次运行的初始历史。
   * 需要调用方传入**稳定**的 `context.sessionId`，否则每次都是新会话、无可恢复内容。
   */
  resumeHistory?: boolean
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
  /**
   * **执行预审**（#27）：工具执行前的模型/规则预审钩子，缺省不挂。
   * 只收紧不放开——`approve:false` 直接 [STOP]（见 `PreExecReviewFn`）。
   * 渲染层插件的开关经 IPC `agent:setPreReviewEnabled` 在主进程侧装配为 provider。
   */
  preExecReview?: PreExecReviewFn
  /** 会话持久化（A1-3）；缺省不落盘 */
  sessionStore?: AgentSessionStore
  /**
   * 附件叶子名 → 库内绝对路径。附件只存叶子名（对齐 dsh：持久化事件不含路径），
   * 提示词里给智能体可读的绝对路径时用它解析；未注入（测试/内嵌）时只给叶子名。
   */
  resolveAttachmentPath?: (name: string) => string
  /** 语义记忆（A1-3）；缺省不检索也不回写 */
  memoryStore?: AgentMemoryStore
  /** 用户偏好（来自历史反馈，确定性键值）；缺省不注入个性化片段 */
  preferences?: PreferenceStore
  /** 工具执行器覆盖（E3-2）：接线层可传入包了记录器的 runner，Brain 本身不感知记录逻辑 */
  runner?: BrainToolRunner
  /**
   * 子智能体 provider（Slice 31）：缺省 = 进程内 spawn；
   * 注入 CLI/远程 provider 即可把子任务交给外部后端（见 `subagentCli.ts`）。
   */
  subAgentProvider?: SubAgentProvider
  /**
   * 子智能体账本（跨轮冷恢复）：loop 在启动/完成时埋账，这里负责落盘 + 启动时对账。
   * 未注入则子任务记录只活在内存里（与本轮改动前一致）。
   */
  subagentLedger?: SubagentLedgerPort
  /** 沙箱策略（缺省 `workspace-write`）；`read-only` 会拒绝外部 CLI 子智能体 */
  sandboxPolicy?: SandboxPolicy
  /**
   * 项目约定文件读取（对齐 dsh `agent-instructions`）：返回库级 `AGENTS.md` 内容，
   * 非空则作为常驻系统提示词注入。缺省不注入。
   */
  projectInstructions?: () => Promise<string | null>
  /**
   * 超长工具输出落盘（对齐 dsh `spill`）：写文件并返回「预览 + 引用」。
   * 缺省回落截断。
   */
  spill?: (toolName: string, text: string) => string
}
