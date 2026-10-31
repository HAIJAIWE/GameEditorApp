/**
 * 压缩编排：把三条策略（压力阈值 / 工具结果剪枝 / 工具配对）串成一次「交接摘要」压缩。
 *
 * 与改造前 `context.ts::maybeResetContext` 的差异：
 *  1. 阈值不再硬编码 6000 / 30000，而由**模型上下文窗口**推导（小模型会提前压）；
 *  2. 保留条数**不再固定 2 条**，而是「至少 2 条 + 工具配对安全才停」——
 *     避免把 assistant 的 `tool_calls` 和它的 `tool` 应答切散（悬空调用会被 provider 拒）。
 *
 * 仍然**不调 LLM**（模板摘要，与改造前一致）：模板摘要的好处是零额外成本、
 * 零失败面；dsh 的 `compaction-basic` 支持 `summarizationModel` 走模型摘要，
 * 但那需要重试预算与失败降级，我们暂无此需求。
 */

import { estimateTokens } from '../runtime'
import type { BrainMessage } from '../runtime'
import type { AgentRunTier } from '../observability'
import { safeTailCount } from './pairing'
import { resolvePressureBudget } from './pressure'

/** 被压缩进摘要时，单条消息最多保留的字符数（沿用改造前的 200） */
const SUMMARY_SNIPPET_CHARS = 200

export interface CompactOptions {
  tier: AgentRunTier
  /** 当前调用的模型（首轮可为空） */
  model?: string
}

export interface CompactResult {
  messages: BrainMessage[]
  /** 是否真的压了（false = 未达阈值，或为保证配对安全而放弃压缩） */
  compacted: boolean
  /** 压缩掉的消息条数 */
  dropped: number
}

/** 一次压缩的拆分：system 前缀 + 被压缩区 + 保留尾部（配对安全） */
export interface CompactionPlan {
  systemMessages: BrainMessage[]
  /** 将被压缩进摘要的旧消息 */
  dropped: BrainMessage[]
  /** 原样保留的近期消息（尾部，配对安全） */
  recent: BrainMessage[]
}

/**
 * LLM 摘要器（对齐 dsh `compaction-basic` 的 `summarize` 钩子）：
 * 输入被压缩区消息，返回结构化 checkpoint 文本。失败由调用方回落模板压缩。
 */
export type CompactSummarizer = (
  input: { messages: BrainMessage[]; dropped: BrainMessage[] },
  signal: AbortSignal
) => Promise<string>

/** 是否达到压缩压力阈值 */
export function shouldCompact(messages: readonly BrainMessage[], options: CompactOptions): boolean {
  const budget = resolvePressureBudget(options.tier, options.model)
  return estimateTokensOf(messages) > budget.thresholdTokens
}

/**
 * 计算压缩拆分（达到阈值且能安全压缩时返回，否则 null）。
 * 与 `compactHistory` 共享同一套「阈值 + 配对安全尾部」判定，避免两条路径漂移。
 */
export function planCompaction(messages: BrainMessage[], options: CompactOptions): CompactionPlan | null {
  if (!shouldCompact(messages, options)) return null
  const systemMessages = messages.filter((message) => message.role === 'system')
  const rest = messages.filter((message) => message.role !== 'system')
  if (rest.length <= 2) return null
  const keep = safeTailCount(rest, 2)
  if (keep >= rest.length) return null
  return { systemMessages, dropped: rest.slice(0, -keep), recent: rest.slice(-keep) }
}

/** 用给定的 system 内容构建压缩后的消息（模板与 LLM 摘要共用） */
export function buildCompactedMessages(plan: CompactionPlan, content: string): BrainMessage[] {
  return [...plan.systemMessages, { role: 'system', content }, ...plan.recent]
}

/** 估算一轮上下文的 token 量（非空 content 累加） */
export function estimateTokensOf(messages: readonly BrainMessage[]): number {
  return messages.reduce((sum, message) => {
    const content = typeof message.content === 'string' ? message.content : ''
    return sum + estimateTokens(content)
  }, 0)
}

/**
 * 按压力阈值压缩历史。纯函数：同样的输入必得同样输出，可单测。
 */
export function compactHistory(messages: BrainMessage[], options: CompactOptions): CompactResult {
  const plan = planCompaction(messages, options)
  if (plan === null) return { messages, compacted: false, dropped: 0 }

  const compact = plan.dropped
    .map((message) => {
      const content = typeof message.content === 'string' ? message.content : ''
      return `[${message.role}] ${content.slice(0, SUMMARY_SNIPPET_CHARS)}`
    })
    .join('\n')

  const content = `## 上下文交接摘要（前 ${plan.dropped.length} 条已压缩，防目标漂移）\n${compact}`
  return { messages: buildCompactedMessages(plan, content), compacted: true, dropped: plan.dropped.length }
}
