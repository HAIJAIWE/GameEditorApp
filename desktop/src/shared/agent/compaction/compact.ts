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
  const budget = resolvePressureBudget(options.tier, options.model)
  if (estimateTokensOf(messages) <= budget.thresholdTokens) {
    return { messages, compacted: false, dropped: 0 }
  }

  const systemMessages = messages.filter((message) => message.role === 'system')
  const rest = messages.filter((message) => message.role !== 'system')
  if (rest.length <= 2) return { messages, compacted: false, dropped: 0 }

  // 至少保留 2 条（与改造前一致），不够就为配对安全往上加
  const keep = safeTailCount(rest, 2)
  // 需要保留全部 ⇒ 压缩会拆散工具配对，宁可不压
  if (keep >= rest.length) return { messages, compacted: false, dropped: 0 }

  const recent = rest.slice(-keep)
  const compact = rest
    .slice(0, -keep)
    .map((message) => {
      const content = typeof message.content === 'string' ? message.content : ''
      return `[${message.role}] ${content.slice(0, SUMMARY_SNIPPET_CHARS)}`
    })
    .join('\n')

  const summary: BrainMessage = {
    role: 'system',
    content: `## 上下文交接摘要（前 ${rest.length - keep} 条已压缩，防目标漂移）\n${compact}`
  }
  return { messages: [...systemMessages, summary, ...recent], compacted: true, dropped: rest.length - keep }
}
