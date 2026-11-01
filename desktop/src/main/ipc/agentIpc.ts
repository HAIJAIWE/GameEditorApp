import { readFile, writeFile } from 'node:fs/promises'
import { BrowserWindow, dialog, type OpenDialogOptions } from 'electron'

import type { IpcHandlerDeps, IpcRegistrar, LlmShared } from '../ipc'
import { getWorkspaceRoot, setWorkspaceRoot } from '../agent/workspace/workspaceStore'
import {
  agentApprovalResponseInputSchema,
  agentChatInputSchema,
  agentInteractionResponseInputSchema,
  agentExecuteToolInputSchema,
  agentFeedbackInputSchema,
  agentDraftLoadInputSchema,
  agentDraftSaveInputSchema,
  agentRecentChangesInputSchema,
  agentDeliveriesInputSchema,
  agentSubagentSendInputSchema,
  agentSubagentStopInputSchema,
  agentJobCancelInputSchema,
  mcpSetConfigInputSchema
} from '../../shared/schema/adapters'
import { parseMcpConfig } from '../../shared/agent/mcp'
import { mcpManager } from '../agent/mcp/manager'
import { DEFAULT_INTERACTION_TIMEOUT_MS } from '../../shared/agent/brain'
import { isPreReviewEnabled, setPreReviewEnabled } from '../agent/agentService/preReview'
import type { AgentInteractionAnswer } from '../agent/execution/approvalBroker'
import { withTask } from '../task/taskRegistry'

export function registerAgentIpc(deps: IpcHandlerDeps, handle: IpcRegistrar, llm: LlmShared): void {
  const { agentDispatcher, agentBrain, approvalBroker, agentSessionStore, agentFeedback, agentOperationLog, agentDeliveryLog } = deps
  // Agent 技能调度：listTools 供提示词/面板展示，executeTool 走统一调度与安全门
  handle('agent:listTools', undefined, () => ({
    description: agentDispatcher.toolsDescription(),
    tools: agentDispatcher.toolsJsonSchema()
  }))
  handle('agent:executeTool', agentExecuteToolInputSchema, (req) =>
    agentDispatcher.execute(req.tool, req.params, {})
  )
  // MCP 配置（Slice 20）：读写 userData/mcp.json + 保存后重连
  const DEFAULT_MCP_CONFIG = '{\n  "mcpServers": {}\n}\n'
  handle('mcp:getConfig', undefined, async () => {
    const path = mcpManager.configPathOrNull()
    if (path === null) return { content: DEFAULT_MCP_CONFIG }
    try {
      return { content: await readFile(path, 'utf8') }
    } catch {
      return { content: DEFAULT_MCP_CONFIG }
    }
  })
  handle('mcp:setConfig', mcpSetConfigInputSchema, async (req) => {
    const path = mcpManager.configPathOrNull()
    if (path === null) return { ok: false, error: 'MCP 未初始化' }
    let parsed: unknown
    try {
      parsed = JSON.parse(req.content)
    } catch {
      return { ok: false, error: 'JSON 格式错误，未保存' }
    }
    const config = parseMcpConfig(parsed)
    await writeFile(path, JSON.stringify(config, null, 2), 'utf8')
    await mcpManager.reload(config)
    return { ok: true, count: Object.keys(config.mcpServers).length }
  })
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
              ...(req.goal !== undefined ? { goal: req.goal } : {}),
              ...(req.attachments !== undefined ? { attachments: req.attachments } : {}),
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
  // 子智能体「继续对话」（Slice 40）：对运行中的子智能体插话 / 单独停止。
  // 只认**当前本轮**注册表里的 id；已完成 / 跨轮返回 ok:false（不是错误，面板无需提示）。
  handle('agent:subagentSend', agentSubagentSendInputSchema, (req) => ({
    ok: agentBrain.sendToSubagent(req.id, req.content)
  }))
  handle('agent:subagentStop', agentSubagentStopInputSchema, (req) => ({
    ok: agentBrain.stopSubagent(req.id)
  }))
  // 后台任务（对齐 dsh jobs）：面板读取跨轮历史 / 按 jobId 取消运行中的任务
  handle('agent:jobList', undefined, () => ({ jobs: agentBrain.listJobs() }))
  handle('agent:jobCancel', agentJobCancelInputSchema, (req) => ({
    ok: agentBrain.cancelJob(req.id)
  }))
  // 代码工作区（对齐 dsh fs-sandbox 的 cwd）：读取 / 弹目录选择并设置
  handle('agent:getWorkspace', undefined, () => ({ root: getWorkspaceRoot() }))
  handle('agent:chooseWorkspace', undefined, async () => {
    const options: OpenDialogOptions = {
      title: '选择代码工作区',
      properties: ['openDirectory', 'createDirectory']
    }
    const focused = BrowserWindow.getFocusedWindow()
    const result = focused ? await dialog.showOpenDialog(focused, options) : await dialog.showOpenDialog(options)
    if (result.canceled || result.filePaths.length === 0) {
      return { root: getWorkspaceRoot(), cancelled: true }
    }
    return { root: setWorkspaceRoot(result.filePaths[0] ?? null), cancelled: false }
  })
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
  // 会话历史检索（#25）：聚合 turns.jsonl 为会话摘要，可选按内容搜索
  handle('agent:sessionTurns', undefined, (req) => ({
    sessions: agentSessionStore.listSessions(req?.query)
  }))
  // 执行预审开关（#27）：渲染层插件经此开/关主进程侧预审 provider
  handle('agent:setPreReviewEnabled', undefined, (req) => {
    setPreReviewEnabled(req.enabled === true)
    return { ok: true }
  })
  handle('agent:getPreReviewEnabled', undefined, () => ({ enabled: isPreReviewEnabled() }))
  // 最近改动（操作日志）：最近的数据变更记录（新→旧），供「最近改动」面板与对话内联改动卡
  handle('agent:recentChanges', agentRecentChangesInputSchema, (req) => ({
    changes: agentOperationLog.listRecentFiltered(req?.limit, {
      since: req?.since,
      conversationId: req?.conversationId
    })
  }))
  // 最近交付（交付日志）：Agent 显式交付的文件，供对话内联交付卡展示
  handle('agent:deliveries', agentDeliveriesInputSchema, (req) => ({
    deliveries: agentDeliveryLog.listRecentFiltered(req?.limit, {
      since: req?.since,
      conversationId: req?.conversationId
    })
  }))
}
