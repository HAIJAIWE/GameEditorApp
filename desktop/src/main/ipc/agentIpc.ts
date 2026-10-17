import type { IpcHandlerDeps, IpcRegistrar, LlmShared } from '../ipc'
import {
  agentApprovalResponseInputSchema,
  agentCancelInputSchema,
  agentChatInputSchema,
  agentInteractionResponseInputSchema,
  agentExecuteToolInputSchema,
  agentFeedbackInputSchema,
  agentDraftLoadInputSchema,
  agentDraftSaveInputSchema
} from '../../shared/schemas'
import { DEFAULT_INTERACTION_TIMEOUT_MS } from '../../shared/agent/brain'
import type { AgentInteractionAnswer } from '../agent/approvalBroker'

export function registerAgentIpc(deps: IpcHandlerDeps, handle: IpcRegistrar, llm: LlmShared): void {
  const { agentDispatcher, agentBrain, approvalBroker, agentSessionStore, agentFeedback } = deps
  /*
   * 进行中运行的取消表。
   * - 按 `runId` 登记：渲染层每轮生成一个 id，`agent:cancel` 可精确定位（多窗口也不会串）。
   * - 同时按 `sender.id` 记「该窗口当前活跃的一轮」：渲染层没传 runId 时兜底。
   * - `finally` 一定要注销：否则取消已结束的运行会命中一个陈旧 controller（静默无效，
   *   但更难排查的是**内存里留着一条永不释放的记录**）。
   */
  const activeRuns = new Map<string, AbortController>()
  const activeBySender = new Map<number, { runId: string; controller: AbortController }>()
  // Agent 技能调度：listTools 供提示词/面板展示，executeTool 走统一调度与安全门
  handle('agent:listTools', undefined, () => ({
    description: agentDispatcher.toolsDescription(),
    tools: agentDispatcher.toolsJsonSchema()
  }))
  handle('agent:executeTool', agentExecuteToolInputSchema, (req) =>
    agentDispatcher.execute(req.tool, req.params, {})
  )
  // Agent Brain 循环（A1-2/A1-4）：事件流实时推给渲染层；危险操作经审批 broker 等渲染层决定
  handle('agent:chat', agentChatInputSchema, async (req, event) => {
    const llmCall = await llm.llmCallOptions()
    // 注意竞态：事件在 await requestApproval/requestInteraction 之前就已推给渲染层，
    // 用户可能「秒点」批准。故在**分配 id 时就登记**待答复 promise，二者只取回它，避免答复被丢弃。
    const preRegistered = new Map<string, Promise<AgentInteractionAnswer>>()
    const take = (requestId: string): Promise<AgentInteractionAnswer> =>
      preRegistered.get(requestId) ?? Promise.resolve({ approved: false })

    // 本轮运行的取消句柄（见 activeRuns 注释）
    const runId = req.runId ?? approvalBroker.nextId()
    const controller = new AbortController()
    activeRuns.set(runId, controller)
    activeBySender.set(event.sender.id, { runId, controller })
    try {
      return await agentBrain.chat(req.input, {
        ...(llmCall.config !== undefined ? { config: llmCall.config } : {}),
        ...(llmCall.apiKey !== undefined ? { apiKey: llmCall.apiKey } : {}),
        signal: controller.signal,
        onEvent: (payload) => {
          event.sender.send('agent:event', payload)
        },
        newRequestId: () => {
          const requestId = approvalBroker.nextId()
          // 与 Brain 的 `withAnswerTimeout` 用同一超时常量：到期双方都按「未答复」处理，
          // broker 侧顺带清理登记（否则该 promise 会滞留在 pending 里）
          preRegistered.set(requestId, approvalBroker.registerWith(requestId, DEFAULT_INTERACTION_TIMEOUT_MS))
          return requestId
        },
        // 危险确认：只有明确 approved 才放行
        requestApproval: async (request) => (await take(request.requestId)).approved === true,
        // 技能交互（确认/提问）：原样把答复交给 Brain 处理
        requestInteraction: (request) => take(request.requestId)
      })
    } finally {
      activeRuns.delete(runId)
      // 只有当这条记录仍指向本次的 controller 时才删——避免并发/连发时误删新一轮的登记
      const senderRun = activeBySender.get(event.sender.id)
      if (senderRun !== undefined && senderRun.runId === runId) activeBySender.delete(event.sender.id)
    }
  })
  /**
   * 取消一轮运行。
   * 语义是**优雅停止**：循环返回 `completed: true` + 部分产出（`stopReason: 'cancelled'`），
   * 不是 reject；面板收到 `terminated(cancelled)` 事件后如实显示，不是报错。
   */
  handle('agent:cancel', agentCancelInputSchema, (req, event) => {
    const target =
      req.runId !== undefined
        ? activeRuns.get(req.runId)
        : activeBySender.get(event.sender.id)?.controller
    if (target === undefined) return { cancelled: false }
    target.abort()
    return { cancelled: true }
  })
  handle('agent:approvalResponse', agentApprovalResponseInputSchema, (req) => ({
    ok: approvalBroker.resolve(req.requestId, { approved: req.approved })
  }))
  handle('agent:interactionResponse', agentInteractionResponseInputSchema, (req) => ({
    ok: approvalBroker.resolve(req.requestId, {
      ...(req.approved !== undefined ? { approved: req.approved } : {}),
      ...(req.answer !== undefined ? { answer: req.answer } : {}),
      ...(req.answers !== undefined ? { answers: req.answers } : {})
    })
  }))
  handle('agent:sessionInfo', undefined, () => agentSessionStore.info())
  handle('agent:sessionRestore', undefined, () => {
    const snapshot = agentSessionStore.tryRestore()
    return { messages: snapshot?.messages ?? [] }
  })
  handle('agent:sessionClear', undefined, async () => ({ cleared: await agentSessionStore.clear() }))
  // 草稿管理（对齐 PyQt 数字员工面板的草稿保存/恢复/列表）
  handle('agent:draftSave', agentDraftSaveInputSchema, (req) => agentSessionStore.saveDraft(req.name))
  handle('agent:draftList', undefined, () => agentSessionStore.listDrafts())
  handle('agent:draftLoad', agentDraftLoadInputSchema, (req) => {
    const draft = agentSessionStore.readDraft(req.path)
    return { name: draft.name, messages: draft.messages }
  })
  // 用户反馈（偏好/反馈 store 的生产者接缝）
  handle('agent:feedback', agentFeedbackInputSchema, (req) => {
    agentFeedback.record(req.rating, req.comment)
    return undefined
  })
}
