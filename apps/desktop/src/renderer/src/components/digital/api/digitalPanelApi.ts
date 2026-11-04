import type { DraftSummary } from '@mobai/shared/agent/conversation'
import type { OperationRecord } from '@mobai/shared/agent/observability'
import type { DeliveryRecord } from '@mobai/shared/agent/observability'
import type { DigitalAttachment } from '@mobai/shared/util/io'
import type { JobRecord } from '@mobai/shared/agent/jobs/jobRegistry'

/**
 * 智能体面板用到的 IPC 面（`window.mbApi.agent`）。
 *
 * 单独成文件而不是留在 `DigitalPanel.tsx` 里：面板拆出的各个状态 hook 都只吃这份契约的
 * 一角，类型放这里才不会让 hook 反向 import 组件（否则形成循环依赖）。
 */
export interface ChatApi {
  /**
   * 运行中插话（对齐 dsh Steer）：把补充指令投进当前轮次的收件箱，
   * 循环在下一轮 LLM 调用前注入为 user 消息 —— 不用「取消再重发」，
   * 已完成的工具结果也不丢。没有活跃轮次时 `accepted: false`。
   */
  steer: (req: { text: string }) => Promise<{ accepted: boolean }>
  /**
   * 发送一段对话。
   * `preset` 为智能体预设 id（借 dsh agent-preset 设计）；主进程 `agent.chat` 当前
   * 读取 `input`/`runId`，`preset` 为 **[PLACEHOLDER]** —— 后端消费预设做角色路由的接线待补，
   * 渲染层先把选择带上，避免后续再改契约形状。
   */
  chat: (req: {
    input: string
    runId?: string
    preset?: string
    goal?: string
    attachments?: DigitalAttachment[]
  }) => Promise<{ text: string }>
  respondApproval: (req: { requestId: string; approved: boolean }) => Promise<{ ok: boolean }>
  respondInteraction: (req: {
    requestId: string
    approved?: boolean
    answer?: string
    answers?: string[]
  }) => Promise<{ ok: boolean }>
  /** 消息反馈（对齐 dsh ui-message-feedback）：评分 + 可选说明，主进程落盘并在 ≥4 分时提炼偏好 */
  feedback: (req: { rating: number; comment?: string }) => Promise<void>
  /** 子智能体「继续对话」：对运行中的子智能体插话（Slice 40） */
  subagentSend: (req: { id: string; content: string }) => Promise<{ ok: boolean }>
  /** 单独停止某个运行中的子智能体（不牵连父循环） */
  subagentStop: (req: { id: string }) => Promise<{ ok: boolean }>
  /** 后台任务列表（跨轮历史；运行中优先） */
  jobList: () => Promise<{ jobs: JobRecord[] }>
  /** 按跨轮唯一 jobId 取消后台任务 */
  jobCancel: (req: { id: string }) => Promise<{ ok: boolean }>
  /** 代码工作区：读取当前根目录 */
  getWorkspace: () => Promise<{ root: string }>
  /** 代码工作区：弹目录选择并设置 */
  chooseWorkspace: () => Promise<{ root: string; cancelled: boolean }>
  sessionInfo: () => Promise<{ hasSession: boolean; messageCount: number; savedAt: string }>
  sessionRestore: () => Promise<{ messages: Array<{ role?: unknown; content?: unknown }> }>
  sessionClear: () => Promise<{ cleared: boolean }>
  draftSave: (req: { name: string }) => Promise<DraftSummary>
  draftList: () => Promise<DraftSummary[]>
  draftLoad: (req: { path: string }) => Promise<{ name: string; messages: Array<{ role?: unknown; content?: unknown }> }>
  /** 本轮改动：按 `since`（本轮开始时间）从操作日志取变更记录（新→旧） */
  recentChanges: (req: {
    limit?: number
    since?: number
    conversationId?: string
  }) => Promise<{ changes: OperationRecord[] }>
  /** 本轮交付的文件（交付日志）：供对话内联交付卡展示 */
  deliveries: (req: {
    limit?: number
    since?: number
    conversationId?: string
  }) => Promise<{ deliveries: DeliveryRecord[] }>
  onEvent: (handler: (event: unknown) => void) => () => void
}
