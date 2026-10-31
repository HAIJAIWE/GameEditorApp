import type { DraftSummary } from '../../../../shared/agent/conversation/session'
import type { OperationRecord } from '../../../../shared/agent/observability/operationLog'
import type { DeliveryRecord } from '../../../../shared/agent/observability/deliveryLog'
import type { DigitalAttachment } from '../../../../shared/util/io/libraryAttachments'

/**
 * 智能体面板用到的 IPC 面（`window.mbApi.agent`）。
 *
 * 单独成文件而不是留在 `DigitalPanel.tsx` 里：面板拆出的各个状态 hook 都只吃这份契约的
 * 一角，类型放这里才不会让 hook 反向 import 组件（否则形成循环依赖）。
 */
export interface ChatApi {
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
