/**
 * 工具配对（对齐 dsh `compaction/src/tool-pairing.ts`）。
 *
 * dsh 的核心不变式：维护一个「进行中的工具调用」计数器——
 * assistant 消息带 N 个 tool-call 就 +N，每条 tool/result 就 -1；
 * **计数器为 0 的位置才是安全切点**。它甚至会在计数为负时抛错（判为损坏的 surface）。
 *
 * 为什么必须遵守：多数 provider（OpenAI / Ollama 的函数调用协议）要求
 * assistant 的 `tool_calls` 必须被后续的 `tool` 消息逐一应答；
 * 一旦压缩把应答切走，就会留下**悬空 tool_call**，请求直接被拒。
 *
 * 我们不做 dsh 那份 WeakMap 增量缓存（消息是普通数组，每轮重算更省心），
 * 只保留同一个计数器不变式。
 */

import type { BrainMessage } from '../runtime/brainMessages'

/** 一条消息对「进行中工具调用数」的增量 */
export function pairingDelta(message: BrainMessage): number {
  if (message.role === 'assistant' && message.tool_calls !== undefined) {
    return message.tool_calls.length
  }
  if (message.role === 'tool') return -1
  return 0
}

/**
 * 每个切点的配对安全性：长度 N+1，第 i 项表示「第 i 条消息之前」的切点是否安全。
 * 末尾那项表示全部消息之后。
 */
export function cutBalanced(messages: readonly BrainMessage[]): boolean[] {
  const cuts: boolean[] = [true]
  let inProgress = 0
  for (const message of messages) {
    inProgress += pairingDelta(message)
    cuts.push(inProgress === 0)
  }
  return cuts
}

/**
 * 在不拆开工具配对的前提下，从尾部**至少**保留多少条消息。
 *
 * 语义是「够 want 条就够；不够就往上加，直到切点安全」——因为配对未闭合时
 * 多留一条（把缺失的 tool 应答包含进来）才是修复，少留只会留下悬空调用。
 *
 * 最坏情况返回 `messages.length`（= 切点在最开头，恒安全），此时调用方应判断
 * 「等于全部」就不压缩：**宁可不压，也不制造悬空 tool_call**。
 */
export function safeTailCount(messages: readonly BrainMessage[], want: number): number {
  if (messages.length === 0) return 0
  const cuts = cutBalanced(messages)
  const start = Math.max(0, Math.min(want, messages.length))
  for (let keep = start; keep <= messages.length; keep += 1) {
    if (cuts[cuts.length - 1 - keep] === true) return keep
  }
  return messages.length
}
