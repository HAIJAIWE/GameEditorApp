/**
 * Agent 记忆的确定性文本嵌入（自 Python `core/agent/memory_embedder.py` 的
 * n-gram 哈希思路重写，A1-3）。
 *
 * 为什么不用真嵌入模型：与 `docs/a-tier-plan.md` §2.5 的选型一致——**本地无服务端依赖**、
 * 结果**确定性可断言**（单测能锁死检索命中/未命中），够用于「同一批文本内的相似度排序」。
 * 检索与持久化由 vectra（`main/agent/memoryStore.ts`）承担。
 *
 * 实现：字符 bigram → 位置哈希 → 累加到 d 维 → L2 归一化。
 */

/** 嵌入维度（与 Phase 1 预演保持一致） */
export const MEMORY_DIMS = 32

/** 32 维确定性字符 bigram 哈希嵌入（L2 归一化，便于用余弦/点积比较） */
export function embedText(text: string, dims: number = MEMORY_DIMS): number[] {
  const vector = new Array<number>(dims).fill(0)
  const normalized = text.toLowerCase()
  for (let index = 0; index < normalized.length; index++) {
    const bigram = normalized.slice(index, index + 2)
    let hash = 0
    for (const ch of bigram) {
      hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) % 100_000
    }
    vector[hash % dims] += 1
  }
  let squared = 0
  for (const value of vector) squared += value * value
  const norm = Math.sqrt(squared) || 1
  return vector.map((value) => value / norm)
}
