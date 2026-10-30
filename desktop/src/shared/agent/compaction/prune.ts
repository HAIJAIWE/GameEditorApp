/**
 * 工具结果剪枝（对齐 dsh `compaction-tool-result-pruner`）。
 *
 * dsh 的要点（源码 `src/index.ts`）：
 *  - **model-free**：不调 LLM，纯确定性替换，可重放安全。
 *  - 超阈值时保留 **head + tail**，中段换成标记 —— 因为错误/摘要常常在结尾，
 *    只截头（`slice(0, max)`）会把最关键的一行丢掉。
 *  - 按 **Unicode 码点**切（`Array.from`），不是 UTF-16 码元，
 *    所以不会把一个代理对劈成两半（emoji / 生僻字安全）。
 *
 * 我们只处理纯文本（工具结果是 string），因此比 dsh 的 ContentBlock 版本简单得多。
 */

import type { AgentRunTier } from '../observability/observability'

/** 中段被剪掉时插入的标记 */
export const PRUNE_MARKER = '\n…（中段已剪枝，保留首尾；如需中段请细化查询）\n'

export interface PruneOptions {
  /** 超过这个字符数才剪 */
  thresholdChars: number
  /** 保留的头部字符数 */
  headChars: number
  /** 保留的尾部字符数 */
  tailChars: number
}

/**
 * 各档位的剪枝预算：总量沿用改造前的 1500 / 4000，但改为「首尾各留一段」。
 * `unconfigured`（未配置 LLM）按最保守的本地档处理。
 */
export const PRUNE_PRESETS: Readonly<Record<AgentRunTier, PruneOptions>> = {
  local: { thresholdChars: 1500, headChars: 700, tailChars: 500 },
  cloud: { thresholdChars: 4000, headChars: 2000, tailChars: 1200 },
  unconfigured: { thresholdChars: 1500, headChars: 700, tailChars: 500 },
}

/** 按 Unicode 码点取长度（不是 UTF-16 码元） */
export function codePointLength(text: string): number {
  return Array.from(text).length
}

/**
 * 剪枝一段文本：保留 head + 标记 + tail。未超阈值时原样返回。
 *
 * 用码点切分，保证不会劈开代理对；若预算大于原文长度则自动退化（不抛错）。
 */
export function pruneText(text: string, options: PruneOptions): string {
  const points = Array.from(text)
  if (points.length <= options.thresholdChars) return text

  const headChars = Math.max(0, options.headChars)
  const tailChars = Math.max(0, options.tailChars)
  // 预算装不下首尾时优先保尾（错误和结论通常在结尾）
  const head = points.slice(0, Math.min(headChars, Math.max(0, points.length - tailChars)))
  const tail = tailChars > 0 ? points.slice(Math.max(head.length, points.length - tailChars)) : []
  return head.join('') + PRUNE_MARKER + tail.join('')
}

/** 按档位剪枝工具结果 */
export function pruneToolResult(text: string, tier: AgentRunTier): string {
  return pruneText(text, PRUNE_PRESETS[tier])
}
