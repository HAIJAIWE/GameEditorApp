/**
 * Brain 循环的**上下文工具层**（从 `brain.ts` 拆出）。
 *
 * - `clipToolResult`：工具结果尺寸闸（F6）
 * - `maybeResetContext`：上下文重置（F5 / DD-8）
 * - `safeRunEvaluator`：评估器安全调用（F4，异常降级为 null）
 *
 * 三者都是纯函数（或只依赖纯函数），可独立单测。
 */

import type { BrainMessage } from '../runtime/brainMessages'
import type { AgentRunTier } from '../observability/observability'
import { estimateTokens } from '../runtime/budget'
import type { AgentEvalVerdict } from './types'

/** 安全调用评估器：任何异常都降级为 null（不阻断循环） */
export function safeRunEvaluator(
  evaluator: (text: string) => AgentEvalVerdict | null,
  text: string
): AgentEvalVerdict | null {
  try {
    return evaluator(text)
  } catch {
    return null
  }
}

/**
 * 工具结果尺寸闸（F6）：本地档上下文窄（4B/4K~16K），超长工具输出（如 200 条数据列表）
 * 直接撑爆上下文 ⇒ 截断并附提示。云端档预算宽，阈值更高。
 */
export function clipToolResult(text: string, maxChars: number): string {
  if (text.length <= maxChars) return text
  return `${text.slice(0, maxChars)}\n…（工具结果已截断至 ${maxChars} 字，可进一步查询细化）`
}

/**
 * 上下文重置（F5 / DD-8 落地）：当历史估算 token 超阈值，把除 system 与最近 2 条外的消息
 * 压成一段「交接摘要」开新 messages 续跑，避免本地 4B 的 context rot / 目标漂移。
 * 用模板摘要（不额外调 LLM），显式重述「前 N 条已压缩」以约束 goal drift。
 */
export function maybeResetContext(messages: BrainMessage[], tier: AgentRunTier): BrainMessage[] {
  const threshold = tier === 'local' ? 6000 : 30000
  const estimated = messages.reduce((sum, message) => {
    const content = typeof message.content === 'string' ? message.content : ''
    return sum + estimateTokens(content)
  }, 0)
  if (estimated <= threshold) return messages
  const systemMessages = messages.filter((message) => message.role === 'system')
  const rest = messages.filter((message) => message.role !== 'system')
  if (rest.length <= 2) return messages
  const recent = rest.slice(-2)
  const compact = rest
    .slice(0, -2)
    .map((message) => {
      const content = typeof message.content === 'string' ? message.content : ''
      return `[${message.role}] ${content.slice(0, 200)}`
    })
    .join('\n')
  const summary: BrainMessage = {
    role: 'system',
    content: `## 上下文交接摘要（前 ${rest.length - 2} 条已压缩，防目标漂移）\n${compact}`
  }
  return [...systemMessages, summary, ...recent]
}
