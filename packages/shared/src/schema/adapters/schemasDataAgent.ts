/**
 * `schemasData` 拆分件：**智能体（Agent Brain）**——对话 / 草稿 / 审批 / 子智能体 /
 * 技能执行 / 反馈 / MCP 配置 / 任务取消。
 *
 * 会话附件见 `schemasDataAttachments.ts`。
 * 原 `schemasData.ts` 的 113 个 schema 按业务域拆开，导出名一字未改；
 * 消费者请直接指向本文件（不再经 `core/schemas` 桶）。
 */

import { z } from 'zod'

/** AI 对话草稿：保存当前会话为草稿 */
export const agentDraftSaveInputSchema = z.object({
  /** 草稿名（空串会被主进程回落成 `对话草稿_MMDD_HHMM`；限长防超长文件名） */
  name: z.string().max(80)
})

/** AI 对话草稿：读取指定草稿 */
export const agentDraftLoadInputSchema = z.object({
  /** 草稿绝对路径（由 `agent:draftList` 返回，UI 不自行拼接） */
  path: z.string().min(1)
})

/**
 * 最近改动（操作日志）的查询条件。
 *
 * `undefined` 整体合法：旧调用方 `recentChanges()` 不带参数，不能因为新增过滤字段就报校验错。
 * `limit` 只挡明显非法值（上限 1000 远大于任何 UI 用途），真正的截断仍由 store 兜底。
 */
export const agentRecentChangesInputSchema = z
  .object({
    limit: z.number().int().positive().max(1000).optional(),
    /** 只取 `timestamp >= since` 的记录（毫秒时间戳） */
    since: z.number().nonnegative().optional(),
    conversationId: z.string().min(1).max(200).optional()
  })
  .optional()

/** 交付日志：最近交付的文件（新→旧），可按 since/conversationId 收窄 */
export const agentDeliveriesInputSchema = z
  .object({
    limit: z.number().int().positive().max(1000).optional(),
    since: z.number().nonnegative().optional(),
    conversationId: z.string().min(1).max(200).optional()
  })
  .optional()

/** Agent Brain：审批回传（渲染层弹模态后按 requestId 回传决定） */
export const agentApprovalResponseInputSchema = z.object({
  requestId: z.string().min(1),
  approved: z.boolean()
})

/** Agent Brain：技能交互答复（确认破坏性动作 / 回答提问） */
export const agentInteractionResponseInputSchema = z
  .object({
    requestId: z.string().min(1),
    approved: z.boolean().optional(),
    answer: z.string().max(4000).optional(),
    /** 多问题答复：按下标对齐（与 questions 顺序一致） */
    answers: z.array(z.string().max(4000)).max(20).optional()
  })
  .refine(
    (value) => value.approved !== undefined || value.answer !== undefined || value.answers !== undefined,
    { message: '必须提供 approved、answer 或 answers' }
  )

/** MCP 配置保存：整份 JSON 文本（主进程解析 + 校验 + 写盘 + 重连） */
export const mcpSetConfigInputSchema = z.object({
  content: z.string().max(200_000)
})

/** Agent Brain：跑一轮对话循环（输入用户消息，返回事件流与最终文本） */
export const agentChatInputSchema = z.object({
  input: z.string().min(1).max(4000),
  /**
   * 本轮运行 id（可选）：渲染层生成，用于把 `task:cancel` 精确投递给**这一轮**。
   * 不传时主进程按「该窗口当前活跃任务」兜底（见 `main/task/taskRegistry.ts`）。
   */
  runId: z.string().min(1).max(64).optional(),
  /**
   * 智能体预设 id（借 dsh agent-preset 设计；来自 `shared/agent/presets.ts` 的 `AGENT_PRESETS`）。
   * 渲染层开聊前选定；主进程据此注入角色定位 system prompt。未知 id 静默忽略。
   */
  preset: z.string().min(1).max(64).optional(),
  /**
   * 本轮目标（对齐 dsh GoalBar）：用户在输入框上方的目标条里填的一句话，
   * 随每次 `chat` 一起发往主进程，注入为系统提示词的一段「本轮目标」。
   * 可选、纯展示性约束——不阻断对话，也不强制模型遵守；仅作为意图锚点。
   * 空串视为未填。
   */
  goal: z.string().max(500).optional(),
  /**
   * 随消息附带的文件元数据（对齐 dsh ui-attachment 的诚实子集）：
   * 渲染层在用户选文件时先经 `attachments:add` 复制进 `<库>/attachments/`，
   * 发送时把这些元数据带上，主进程注入系统提示词让智能体知道有这些文件。
   */
  attachments: z
    .array(
      z.object({
        // 只存叶子名（对齐 dsh FileAttachmentRef：持久化事件不含路径）
        name: z.string().min(1).max(260),
        mime: z.string().min(1).max(120),
        bytes: z.number().int().nonnegative()
      })
    )
    .max(20)
    .optional()
})

/** Agent Brain：对运行中的子智能体「插话」（push 一条消息进它的收件箱） */
/** 运行中插话（dsh Steer）：补充给当前轮次的一条指令 */
export const agentSteerInputSchema = z.object({
  text: z.string().min(1)
})
export const agentSubagentSendInputSchema = z.object({
  id: z.string().min(1).max(64),
  content: z.string().min(1).max(4000)
})

/** Agent Brain：单独停止某个运行中的子智能体（不牵连父循环） */
export const agentSubagentStopInputSchema = z.object({
  id: z.string().min(1).max(64)
})

/** Agent 后台任务：按跨轮唯一 jobId 取消（如 `t3:sub_1`） */
export const agentJobCancelInputSchema = z.object({
  id: z.string().min(1).max(80)
})

/** 技术设计文档：文档名 */
export const techDocNameInputSchema = z.object({
  name: z.string().min(1).max(120)
})

/** 技术设计文档：写入（name + markdown） */
export const techDocWriteInputSchema = z.object({
  name: z.string().min(1).max(120),
  content: z.string().max(200_000)
})

/**
 * 取消某个长任务（对话循环 / 单发 AI 生成都走这一条）。
 * 缺省 `taskId` ⇒ 取消该窗口当前活跃的那一笔（面板上只有一个停止按钮时的自然语义）。
 */
export const taskCancelInputSchema = z.object({
  taskId: z.string().min(1).max(64).optional()
})

/** 删除一条定时提醒（id 由 `system.schedule add` 生成） */
export const scheduleRemoveInputSchema = z.object({
  id: z.string().min(1).max(128)
})

/** Agent 技能调度：执行工具（tool 为技能 id 或可模糊解析的别名） */
export const agentExecuteToolInputSchema = z.object({
  tool: z.string().min(1).max(80),
  params: z.record(z.string(), z.unknown()).default({})
})

/** Agent 反馈：评分（1-5）+ 可选评论；评分 ≥4 且评论非空时提炼偏好写入偏好库 */
export const agentFeedbackInputSchema = z.object({
  rating: z.number().int().min(1).max(5),
  comment: z.string().max(4000).default('')
})

export type AgentDraftSaveInput = z.infer<typeof agentDraftSaveInputSchema>
export type AgentDraftLoadInput = z.infer<typeof agentDraftLoadInputSchema>
export type AgentDeliveriesInput = z.infer<typeof agentDeliveriesInputSchema>
export type AgentApprovalResponseInput = z.infer<typeof agentApprovalResponseInputSchema>
export type AgentInteractionResponseInput = z.infer<typeof agentInteractionResponseInputSchema>
export type AgentChatInput = z.infer<typeof agentChatInputSchema>
export type AgentSubagentSendInput = z.infer<typeof agentSubagentSendInputSchema>
export type AgentSubagentStopInput = z.infer<typeof agentSubagentStopInputSchema>
export type AgentJobCancelInput = z.infer<typeof agentJobCancelInputSchema>
export type TechDocNameInput = z.infer<typeof techDocNameInputSchema>
export type TechDocWriteInput = z.infer<typeof techDocWriteInputSchema>
export type TaskCancelInput = z.infer<typeof taskCancelInputSchema>
export type ScheduleRemoveInput = z.infer<typeof scheduleRemoveInputSchema>
export type AgentExecuteToolInput = z.infer<typeof agentExecuteToolInputSchema>
export type AgentFeedbackInput = z.infer<typeof agentFeedbackInputSchema>
