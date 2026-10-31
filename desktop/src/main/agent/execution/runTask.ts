/**
 * 共享 Agent 任务 harness（F1 / 审查「双编排栈」修复）。
 *
 * ## 解决什么
 * 此前「对话智能体」(`brainService`) 与「创作面 AI」(`ceshu:ai*` handler) 是两套并行编排栈，
 * 各自 inline 实现预算确认 / 观测装配，口径一旦漂移就难察觉。本文件把**跨两路径共用的纯逻辑**
 * 收敛到一处，让两条通路都过同一套函数，杜绝「改写了一边、另一边没跟上」。
 *
 * ## 范围（最小改动，不推倒重来）
 * 本期只抽**预算确认**这一最易漂移的关注点；审批闸（`approvalBroker`）、质量门（`qualityGate`）
 * 已是共享纯函数，创作面直接复用，无需再包。工具循环仍留在 `brainService`，不做大合并。
 */

import { llmConfirmReason } from '../../../shared/agent/config'
import type { LlmTaskType } from '../../../shared/agent/runtime'
import type { LlmUsage } from '../../../shared/config/llm'
import { taskRegistry } from '../../task/taskRegistry'
import {
  accumulateTurn,
  emptyAgentRunStats,
  turnStatFromReply,
  type AgentRunStats,
  type AgentRunTier
} from '../../../shared/agent/observability'

export interface AgentBudgetConfirmInput {
  /** 是否云端档（云端才计费、才需确认） */
  isCloud: boolean
  /** 预估 token（由调用方用 `estimateTokens` 粗估） */
  estimatedTokens: number
  /** 任务类型（决定预算档与确认文案） */
  taskType: LlmTaskType
  /** 是否整篇/批量（影响确认强度） */
  bulk?: boolean
  /** 批量数据条数（datagen 用） */
  count?: number
}

/**
 * 统一的云端成本确认（返回需向用户展示的原因；`null` = 无需确认）。
 * 对话循环与创作面 handler 都调用它，保证「预算阈值 / 文案」两处只有一份真源。
 */
export function confirmAgentBudget(input: AgentBudgetConfirmInput): string | null {
  return llmConfirmReason({
    bulk: input.bulk,
    taskType: input.taskType,
    estimatedTokens: input.estimatedTokens,
    isCloud: input.isCloud,
    ...(input.count !== undefined ? { count: input.count } : {})
  })
}

/* ------------------------------------------------------------------ */
/* 单发任务 harness（F1 完整版）：创作面 AI 与对话循环共用同一套治理关注点 */
/* ------------------------------------------------------------------ */

export interface SingleShotRunOutput<T> {
  /** 任务产出（通常是模型原始文本，由调用方解析） */
  value: T
  /** 实际模型名 */
  model?: string
  /** token 用量（供成本观测） */
  usage?: LlmUsage | null
}

export interface SingleShotTaskSpec<T> {
  isCloud: boolean
  estimatedTokens: number
  taskType: LlmTaskType
  bulk?: boolean
  count?: number
  /** 渲染层是否已带 `confirmed: true` 重发 */
  confirmed?: boolean
  /**
   * 跳过预算确认门（仅用于**最小粒度**任务）。
   *
   * 目前唯一使用者是策划书单字段生成：它复用整章提示词，体量不比整章大，
   * 但渲染层**没有**为它准备确认回路（`ceshu:aiGenerateField` 的入参里没有 `confirmed`）。
   * 若在此处照样触发确认门，超大文档下会抛出一个用户无法确认的错误 ⇒ 行为回退。
   * 故该通道只借用本 harness 的**取消 + 计时 + 观测**，不引入新的确认门。
   */
  skipBudgetConfirm?: boolean
  /**
   * 取消归属（`event.sender.id`）。给了就**由本 harness 负责登记/注销**，
   * 面板的「停止」按钮经 `task:cancel` 即可中断这次生成。
   *
   * 放在 harness 而不是每个 handler 里各写一遍 try/finally：三处创作面 AI
   * （章节 / 数据 / 审校）共用本函数，取消的生命周期也只该有一份实现
   * —— 这正是 `runSingleShotTask` 当初为「预算 / 观测」建立的存在理由。
   */
  senderId?: number
  /** 真正执行 LLM 调用的闭包（由调用方提供，harness 不关心 prompt 细节）。收到取消信号 */
  run: (signal: AbortSignal | undefined) => Promise<SingleShotRunOutput<T>>
}

export interface SingleShotTaskResult<T> extends SingleShotRunOutput<T> {
  latencyMs: number
  /** 统一形态的运行统计（与对话循环 `AgentRunStats` 同形，便于汇总/展示） */
  stats: AgentRunStats
}

/**
 * 单发任务 harness（F1 完整版）：
 * `预算确认 → 计时 → 观测累计` 三步统一，创作面三处 handler 都走它。
 *
 * 与 `runBrainLoop`（多轮工具循环）分工：单发用本函数，多轮用循环；两者共用
 * `confirmAgentBudget` 与 `AgentRunStats`，保证「成本口径 / 观测形状」只有一份真源。
 */
export async function runSingleShotTask<T>(spec: SingleShotTaskSpec<T>): Promise<SingleShotTaskResult<T>> {
  const reason = confirmAgentBudget({
    isCloud: spec.isCloud,
    estimatedTokens: spec.estimatedTokens,
    taskType: spec.taskType,
    ...(spec.bulk !== undefined ? { bulk: spec.bulk } : {}),
    ...(spec.count !== undefined ? { count: spec.count } : {})
  })
  if (reason !== null && spec.confirmed !== true && spec.skipBudgetConfirm !== true) {
    throw new Error(reason)
  }
  const startedAt = Date.now()
  // 取消归属：登记后由 panel 的「停止」经 `task:cancel` 打断；`finally` 保证注销
  const ticket = spec.senderId !== undefined ? taskRegistry().begin(spec.senderId) : undefined
  let output: SingleShotRunOutput<T>
  try {
    output = await spec.run(ticket?.signal)
  } finally {
    if (ticket !== undefined) taskRegistry().end(ticket.taskId, ticket.signal)
  }
  const latencyMs = Date.now() - startedAt
  const tier: AgentRunTier = spec.isCloud ? 'cloud' : 'local'
  const stats = accumulateTurn(
    emptyAgentRunStats(tier),
    turnStatFromReply(0, output.model ?? '', tier, output.usage ?? undefined, latencyMs, 0)
  )
  return { ...output, latencyMs, stats }
}
