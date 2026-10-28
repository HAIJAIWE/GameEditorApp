/**
 * 记忆块装配（从 `brainService.ts` 拆出）。
 *
 * 职责单一：把「相关记忆 + 长期记忆 MEMORY.md + 沉淀 learnings」折成一段系统提示词块。
 * 记忆是辅助功能——任何异常都返回 null，绝不阻塞主流程。
 */

import type { AgentMemoryStore } from '../memoryStore'

/** 检索注入进提示词的记忆条数上限 */
export const MEMORY_INJECT_TOP_K = 3

export async function buildMemoryBlock(
  memoryStore: AgentMemoryStore | undefined,
  input: string
): Promise<string | null> {
  if (!memoryStore) return null
  try {
    const blocks: string[] = []
    const hits = await memoryStore.search(input, MEMORY_INJECT_TOP_K)
    const lines = hits.filter((hit) => hit.text.trim() !== '').map((hit) => `- ${hit.text}`)
    if (lines.length > 0) blocks.push(`## 相关记忆\n${lines.join('\n')}`)
    // F2：项目级长期记忆（MEMORY.md）+ 已萃取 learnings，作为常驻 grounding（循环此前完全没读它）
    const longTerm = await memoryStore.loadLongTerm()
    if (longTerm !== null) blocks.push(`## 长期记忆\n${longTerm}`)
    const learnings = await memoryStore.loadLearnings()
    if (learnings.length > 0) {
      blocks.push(`## 沉淀知识\n${learnings.map((learning) => `- ${learning}`).join('\n')}`)
    }
    return blocks.length > 0 ? blocks.join('\n\n') : null
  } catch {
    // 记忆检索失败不阻塞主流程
    return null
  }
}
