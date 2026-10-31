import type { ChapterData } from '../reference'
import type { ChapterKey } from '../reference'
import { isPlainObject } from '../model'

/**
 * 策划书章节的「AI 生成 / 待核对」标记。
 *
 * ## 为什么需要
 * 本项目实际工作流是 **AI 生成 → 人扫一遍**。AI 一键生成可能一次写 12 章，
 * 而左侧章节列表此前完全看不出「哪几章是刚生成的、哪几章人已经核对过」——
 * 用户只能逐一点开找，核对成本全凭记忆。
 *
 * 本模块只提供**纯函数**（读/写/清标记），持久化交给调用方（`meta` 的一个额外键：
 * 文档 JSON 的 `meta.ai_generated = { <章节key>: <ISO时间> }`）。
 * 与已有的 `meta.system_confirmed` 同一套路子 —— 那份 JSON 是 TS 独占的格式，
 * 不存在 旧版 兼容问题。
 */

/** `meta` 里存标记的键名 */
export const AI_GENERATED_KEY = 'ai_generated'

/** 标记表：章节 key → 生成时间（ISO）。时间用于将来做「最近生成」排序，现在只作存在性判据 */
export type AiGeneratedMap = Partial<Record<ChapterKey, string>>

/**
 * 读出标记表。非对象/脏数据一律当空表处理 —— 标记是**辅助信息**，
 * 它坏了不该影响策划书本身的读写。
 */
export function readAiGenerated(meta: ChapterData): AiGeneratedMap {
  const raw = meta[AI_GENERATED_KEY]
  if (!isPlainObject(raw)) return {}
  const result: AiGeneratedMap = {}
  for (const [key, value] of Object.entries(raw)) {
    if (typeof key === 'string' && key !== '' && typeof value === 'string') {
      result[key as ChapterKey] = value
    }
  }
  return result
}

/** 标记这些章节为「AI 生成、待核对」（保留其它章节已有的标记，不覆盖时间戳） */
export function markAiGenerated(
  meta: ChapterData,
  chapters: readonly ChapterKey[],
  now: string
): ChapterData {
  const merged: AiGeneratedMap = { ...readAiGenerated(meta) }
  for (const chapter of chapters) {
    merged[chapter] = now
  }
  return { ...meta, [AI_GENERATED_KEY]: merged }
}

/** 清除某一章的标记（人核对过、或本人在该章上保存过） */
export function clearAiGenerated(meta: ChapterData, chapter: ChapterKey): ChapterData {
  const current = readAiGenerated(meta)
  if (current[chapter] === undefined) return meta // 没有标记就不必回写，避免无意义 saveChapter
  const next: AiGeneratedMap = { ...current }
  delete next[chapter]
  return { ...meta, [AI_GENERATED_KEY]: next }
}

/** 待核对的章节列表（按传入的章节顺序，便于「跳到下一个」） */
export function pendingAiChapters(meta: ChapterData, order: readonly ChapterKey[]): ChapterKey[] {
  const marks = readAiGenerated(meta)
  return order.filter((chapter) => marks[chapter] !== undefined)
}
