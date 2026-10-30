import type { CeshuDocument, ChapterData, ChapterKey } from './ceshuConstants'
import { CESHU_CHAPTER_FIELDS } from './ceshuFields'
import { chaptersUpToStage, isMachineDataField } from './ceshuStages'
import { parseLlmJson } from '../util/parseLlmJson'

/**
 * 复刻拆解（2026-10-26，见 docs/plan-clone-pipeline.md）。
 *
 * 面向「普通用户」的第一段：用户给一个参考游戏名 → AI 拆出**立项一页**（只填立项 7 章）→
 * 套进一份新文档 → 再交给 `generateDemo` 出可玩 demo。
 *
 * 这里只放**纯逻辑**（组提示词 / 解析 AI JSON / 套用到文档），不碰 IPC 与 LLM：
 * 这样既能被 main 的 AI 任务复用，也能被脚本直接跑通、单测覆盖。
 */

/** 复刻只拆「立项阶段」的章（定位/核心循环/战斗/经济/数值/MVP 等） */
export const CLONE_CONCEPT_CHAPTERS: readonly ChapterKey[] = chaptersUpToStage('concept')

export interface CloneDecomposeInput {
  /** 参考游戏名（如「吸血鬼幸存者」） */
  gameName: string
  /** 品类（可选，如 Roguelike / SLG） */
  gameType?: string
}

/** 目标 JSON 骨架：按真实字段键生成，保证 AI 输出的键一定是我们认识的 */
function buildSkeleton(): Record<string, Record<string, string>> {
  const skeleton: Record<string, Record<string, string>> = {}
  for (const chapter of CLONE_CONCEPT_CHAPTERS) {
    // 立项一页不含「机读数据」（账本/断言/主张/用例）——它们不计入完成度，也不该让 AI 在立项时填
    const fields = (CESHU_CHAPTER_FIELDS[chapter] ?? []).filter((field) => !isMachineDataField(chapter, field.key))
    skeleton[chapter] = Object.fromEntries(fields.map((field) => [field.key, '']))
  }
  return skeleton
}

/** 组复刻拆解提示词（system + prompt） */
export function buildCloneDecomposePrompt(input: CloneDecomposeInput): { system: string; prompt: string } {
  const system = [
    '你是资深游戏策划。任务：把用户给的「参考游戏」拆解成一份**立项设计**（只填立项阶段 7 章），',
    '用于「复刻但做改动」。必须遵守：',
    '1. 只复刻机制/循环，不抄原文、美术、文案或具体数值；',
    '2. 每个文本值用「复刻自 XX」或「改为 XX」标注来源/改动；',
    '3. 数值与公式要具体、可复算；',
    '4. 只输出严格 JSON，不要任何解释文字。'
  ].join('\n')

  const prompt = [
    `参考游戏：${input.gameName}${input.gameType !== undefined && input.gameType !== '' ? `（品类：${input.gameType}）` : ''}`,
    '',
    '请严格按下面的 JSON 结构输出（键名不可改，只填值；不认识的键不要加）：',
    '```json',
    JSON.stringify(buildSkeleton(), null, 2),
    '```',
    '',
    '要求：',
    '- 只填上面出现的章节与字段键；',
    '- 空字符串表示「不确定/不需要」，尽量少留空；',
    '- 文本里带上「复刻自 XX / 改为 XX」。'
  ].join('\n')

  return { system, prompt }
}

/**
 * 解析 AI 返回的复刻拆解 JSON。
 * 只保留**立项章 + 已知字段键**，其余一律丢弃（防止 AI 塞进不存在的字段，后续静默丢数据）。
 */
export function parseCloneDecompose(raw: string): Partial<Record<ChapterKey, ChapterData>> {
  const parsed = parseLlmJson(raw)
  if (parsed === null || typeof parsed !== 'object' || Array.isArray(parsed)) return {}
  const source = parsed as Record<string, unknown>

  const out: Partial<Record<ChapterKey, ChapterData>> = {}
  for (const chapter of CLONE_CONCEPT_CHAPTERS) {
    const value = source[chapter]
    if (value === null || typeof value !== 'object' || Array.isArray(value)) continue
    const known = new Set((CESHU_CHAPTER_FIELDS[chapter] ?? []).map((field) => field.key))
    const data: ChapterData = {}
    for (const [key, fieldValue] of Object.entries(value as Record<string, unknown>)) {
      // 机读字段不属于立项一页，即使 AI 返回也丢弃
      if (known.has(key) && !isMachineDataField(chapter, key)) data[key] = fieldValue
    }
    if (Object.keys(data).length > 0) out[chapter] = data
  }
  return out
}

/** 把拆解结果套进一份文档（只覆盖立项章；其余章原样不动） */
export function applyCloneDecompose(
  base: CeshuDocument,
  fields: Partial<Record<ChapterKey, ChapterData>>
): CeshuDocument {
  const next = { ...base }
  const target = next as Record<ChapterKey, ChapterData>
  for (const chapter of CLONE_CONCEPT_CHAPTERS) {
    const data = fields[chapter]
    if (data === undefined) continue
    target[chapter] = { ...(base[chapter] as ChapterData), ...data }
  }
  return next
}
