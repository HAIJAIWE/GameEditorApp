/**
 * Brain 循环的**上下文工具层**（从 `brain.ts` 拆出）。
 *
 * - `clipToolResult`：工具结果尺寸闸（F6）
 * - `maybeResetContext`：上下文重置（F5 / DD-8）
 * - `safeRunEvaluator`：评估器安全调用（F4，异常降级为 null）
 *
 * 三者都是纯函数（或只依赖纯函数），可独立单测。
 */

import type { BrainMessage } from '../runtime'
import type { AgentRunTier } from '../observability'
import { compactHistory } from '../compaction'
import { pruneText } from '../compaction'
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
 * 直接撑爆上下文 ⇒ 剪枝并附提示。云端档预算宽，阈值更高。
 *
 * **改为「保留首尾」**（对齐 dsh `compaction-tool-result-pruner`）：
 * 以前是 `slice(0, maxChars)` 直接砍掉尾部，而错误与结论常常就在结尾；
 * 现在保留 head + 中段标记 + tail，并按 **Unicode 码点**切分（不劈开代理对）。
 */
export function clipToolResult(text: string, maxChars: number): string {
  return pruneText(text, {
    thresholdChars: maxChars,
    headChars: Math.floor(maxChars * 0.5),
    tailChars: Math.floor(maxChars * 0.3),
  })
}

/**
 * 上下文重置（F5 / DD-8 落地）：当历史估算 token 超阈值，把除 system 与尾部若干条外的消息
 * 压成一段「交接摘要」开新 messages 续跑，避免本地 4B 的 context rot / 目标漂移。
 *
 * 实现已下沉到 `../compaction`（`compactHistory`），本函数只保留调用点。
 * 相对改造前的两处升级：
 *  1. 阈值由**模型上下文窗口**推导（小模型提前压；常规档位数值不变）；
 *  2. 保留条数**尊重工具配对**，不会把 assistant 的 `tool_calls` 与其 `tool` 应答切散。
 * 仍用模板摘要（不额外调 LLM），显式重述「前 N 条已压缩」以约束 goal drift。
 */
export function maybeResetContext(
  messages: BrainMessage[],
  tier: AgentRunTier,
  model?: string,
): BrainMessage[] {
  return compactHistory(messages, { tier, model }).messages
}
