import { chapterOrdinalCn, type CeshuDocument, type ChapterKey } from '../reference'
import { fieldLabelOf } from '../fields'
import { isPlainObject } from '../model'

/**
 * 字段内容**重复检测**（AI 按字段生成时的质量护栏）。
 *
 * ## 解决什么问题
 * 「AI 起草 → 人审核」的循环里，语义重叠的字段组（如 设计愿景 ↔ 差异化优势、
 * 数值核心公式 ↔ 战斗伤害公式）会被 AI 各写一遍，人还得通读比对是否自相矛盾。
 * 本模块在**校验链**里给出「重复度 + 分工建议」警告，把「人找问题」变成「问题找人」。
 *
 * ## 与迁移预览的分工
 * - `ceshuMigrationPlan.ts` 的 overlaps：**静态分工建议**（字段非空就提示边界，属引导）；
 * - 本模块：**动态重复判定**（真的写重了才警告，附相似度，属校验）。
 *
 * ## 判定策略（确定性、无第三方依赖）
 * 1. 完全相同（去空白后）；
 * 2. 包含：短文本整体落在长文本里（且短文本够长，避免误伤）；
 * 3. 共享句：存在长度达标的相同句子（按 。；!？ 换行 断句）；
 * 4. 字符二元组 Dice 系数 ≥ 阈值（抓改写式重复）。
 */

/** 语义重叠的字段组（跨章也可表达；guidance 是人审时的分工建议） */
export const OVERLAP_PAIRS: ReadonlyArray<{
  fields: ReadonlyArray<{ chapter: ChapterKey; key: string }>
  guidance: string
}> = [
  {
    fields: [
      { chapter: 'vision', key: 'design_vision' },
      { chapter: 'vision', key: 'differentiation' }
    ],
    guidance: '愿景=要做成什么样的游戏；差异化=玩家凭什么选你，建议按分工重写其一'
  },
  {
    fields: [
      { chapter: 'numeric', key: 'core_formulas' },
      { chapter: 'combat', key: 'damage_formula' }
    ],
    guidance: '伤害公式只放战斗章；数值章核心公式不应重复它，建议改为引用或删除'
  }
]

/** 相似度告警阈值（Dice 系数；低于它视为正常的不同内容） */
export const OVERLAP_SIMILARITY_THRESHOLD = 0.5

/** 包含判定要求的最短短义长度（太短的包含多是巧合，如都含「游戏」） */
const CONTAINMENT_MIN_LENGTH = 8

/** 共享句判定的最短句长 */
const SHARED_SENTENCE_MIN_LENGTH = 8

export type OverlapReason = 'identical' | 'contained' | 'sentences' | 'similar'

export interface TextDuplication {
  duplicated: boolean
  /** 相似度 0~1（判定命中时为 1 或 Dice 值，供人审判断严重程度） */
  similarity: number
  reason: OverlapReason | 'none'
}

export interface FieldOverlap {
  fields: Array<{ chapter: ChapterKey; key: string; label: string }>
  similarity: number
  reason: OverlapReason
  guidance: string
}

/** 去空白（中文文本的空白不影响语义重复判定） */
function stripWhitespace(text: string): string {
  return text.replace(/\s+/gu, '')
}

/** 字符二元组多重集（中文按字、英文按连续字符，均可用） */
function bigramCounts(text: string): Map<string, number> {
  const counts = new Map<string, number>()
  for (let index = 0; index < text.length - 1; index++) {
    const gram = text.slice(index, index + 2)
    counts.set(gram, (counts.get(gram) ?? 0) + 1)
  }
  return counts
}

/** 字符二元组 Dice 系数（0~1；任一为空返回 0） */
export function textSimilarity(a: string, b: string): number {
  const left = stripWhitespace(a)
  const right = stripWhitespace(b)
  if (left === '' || right === '') return 0
  if (left === right) return 1

  const leftCounts = bigramCounts(left)
  const rightCounts = bigramCounts(right)
  let shared = 0
  for (const [gram, count] of leftCounts) {
    const other = rightCounts.get(gram)
    if (other !== undefined) shared += Math.min(count, other)
  }
  const total = left.length - 1 + (right.length - 1)
  return total <= 0 ? 0 : (2 * shared) / total
}

/** 按句读切分（去掉列表前缀后的整句，供共享句判定） */
function sentencesOf(text: string): string[] {
  return text
    .split(/[。；;！!？?\r\n]+/u)
    .map((sentence) => stripWhitespace(sentence))
    .filter((sentence) => sentence.length >= SHARED_SENTENCE_MIN_LENGTH)
}

/** 两段文本是否构成内容重复（附理由与相似度） */
export function detectTextDuplication(a: string, b: string): TextDuplication {
  const left = stripWhitespace(a)
  const right = stripWhitespace(b)
  if (left === '' || right === '') return { duplicated: false, similarity: 0, reason: 'none' }
  if (left === right) return { duplicated: true, similarity: 1, reason: 'identical' }

  // 包含：短的整体落在长的里（短文本够长才算，防巧合）
  const [shorter, longer] = left.length <= right.length ? [left, right] : [right, left]
  if (shorter.length >= CONTAINMENT_MIN_LENGTH && longer.includes(shorter)) {
    return { duplicated: true, similarity: 1, reason: 'contained' }
  }

  // 共享句：任一句子两边都出现
  const rightSentences = new Set(sentencesOf(right))
  if (sentencesOf(left).some((sentence) => rightSentences.has(sentence))) {
    return { duplicated: true, similarity: textSimilarity(left, right), reason: 'sentences' }
  }

  const similarity = textSimilarity(left, right)
  if (similarity >= OVERLAP_SIMILARITY_THRESHOLD) {
    return { duplicated: true, similarity, reason: 'similar' }
  }
  return { duplicated: false, similarity, reason: 'none' }
}

/** 字段标签（schema 内取 label，schema 外回落 key） */
/** 字段中文标签（单源在 `ceshuFields.fieldLabelOf`，此处保留短名以少改调用点） */
const fieldLabel = fieldLabelOf

/** 读章节文本字段（非字符串按空处理：列表/表格型字段不参与文本重复判定） */
function readFieldText(doc: CeshuDocument, chapter: ChapterKey, key: string): string {
  const data: unknown = doc[chapter]
  if (!isPlainObject(data)) return ''
  const value = data[key]
  return typeof value === 'string' ? value : ''
}

/** 检测全文档的重叠字段组（纯函数，不修改入参） */
export function detectFieldOverlaps(doc: CeshuDocument): FieldOverlap[] {
  const found: FieldOverlap[] = []
  for (const pair of OVERLAP_PAIRS) {
    const texts = pair.fields.map((field) => readFieldText(doc, field.chapter, field.key))
    if (texts.some((text) => text.trim() === '')) continue // 有一边空着：无从重复
    const verdict = detectTextDuplication(texts[0] ?? '', texts[1] ?? '')
    // `reason === 'none'` 与 `!duplicated` 等价，写上是为了把联合类型收窄成 OverlapReason
    if (!verdict.duplicated || verdict.reason === 'none') continue
    found.push({
      fields: pair.fields.map((field) => ({ ...field, label: fieldLabel(field.chapter, field.key) })),
      similarity: verdict.similarity,
      reason: verdict.reason,
      guidance: pair.guidance
    })
  }
  return found
}

/** 校验链的警告文案（与 validateCeshu 其余条目同风格） */
export function fieldOverlapMessage(item: FieldOverlap): string {
  const where = item.fields
    .map((field) => `第${chapterOrdinalCn(field.chapter)}章「${field.label}」`)
    .join(' 与 ')
  const percent = Math.round(item.similarity * 100)
  return `内容重复警告：${where}重复度 ${percent}% —— ${item.guidance}`
}
