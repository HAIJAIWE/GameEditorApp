import type { IpcHandlerDeps, IpcRegistrar, LlmShared } from '../ipc'
import {
  agentApprovalResponseInputSchema,
  agentChatInputSchema,
  agentInteractionResponseInputSchema,
  agentExecuteToolInputSchema,
  agentFeedbackInputSchema,
  agentDraftLoadInputSchema,
  agentDraftSaveInputSchema
} from '../../shared/schemas'
import { DEFAULT_INTERACTION_TIMEOUT_MS } from '../../shared/agent/brain'
import type { AgentInteractionAnswer } from '../agent/approvalBroker'
import { withTask } from '../task/taskRegistry'

export function registerAgentIpc(deps: IpcHandlerDeps, handle: IpcRegistrar, llm: LlmShared): void {
  const { agentDispatcher, agentBrain, approvalBroker, agentSessionStore, agentFeedback } = deps
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

    /*
     * 本轮运行的取消句柄来自**通用**任务表（`task:cancel`）——
     * 对话循环与单发 AI 生成共用一套登记/注销，渲染层只面对一个取消通道。
     * `withTask` 负责 begin/end 配对（含 `end` 的 signal 身份比对），此处不再手写 try/finally。
     */
    return withTask(
      event.sender.id,
      (signal) =>
        agentBrain.chat(req.input, {
          ...(llmCall.config !== undefined ? { config: llmCall.config } : {}),
          ...(llmCall.apiKey !== undefined ? { apiKey: llmCall.apiKey } : {}),
          ...(req.preset !== undefined ? { preset: req.preset } : {}),
          signal,
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
        }),
      req.runId
    )
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
  // 草稿管理
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
