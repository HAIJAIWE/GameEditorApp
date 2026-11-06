import { CHAPTER_LABELS, type CeshuDocument, type ChapterKey } from '../reference'
import { fieldLabelOf } from '../fields'
import { isPlainObject } from '../model'
import { detectTextDuplication, OVERLAP_PAIRS } from '../workflow'

/**
 * 策划书字段迁移**预览**（只读，不写盘）。
 *
 * 背景：配置层最大的问题是「大段 textarea 不适合 AI 按格生成 + 人按格审」。
 * 但直接改字段结构会动到**存量文档的值形状**，必须先生成一份「会怎么拆」的预览，
 * 让人确认后再落盘。本模块只做纯计算：
 * - `splits`：哪些大 textarea 会被拆成「要点列表 + 补充说明」，以及启发式拆分结果；
 * - `overlaps`：哪些字段语义重叠，只提示、**不自动合并**（合并是产品决策，不该机器拍板）。
 */

export interface MigrationSplit {
  chapter: ChapterKey
  fieldKey: string
  fieldLabel: string
  currentLength: number
  /** 启发式拆出的要点（展示用） */
  points: string[]
  /** 剩余内容作为「补充说明」 */
  notes: string
}

export interface MigrationOverlap {
  chapter: ChapterKey
  fieldKeys: string[]
  fieldLabels: string[]
  note: string
  /** 该组当前是否已构成内容重复（与校验链同源判定，供预览显示「已重复 N%」） */
  duplicated: boolean
  /** 重复度 0~1（未检出时也有值，仅 duplicated=true 时展示） */
  similarity: number
}

export interface MigrationPlan {
  splits: MigrationSplit[]
  overlaps: MigrationOverlap[]
}

/** 需要拆分的字段（大 textarea → 要点列表 + 补充说明） */
export const SPLIT_SPECS: ReadonlyArray<{ chapter: ChapterKey; fieldKey: string }> = [
  { chapter: 'story', fieldKey: 'architecture' },
  { chapter: 'story', fieldKey: 'main_plot' },
  { chapter: 'gameplay', fieldKey: 'core_loop' },
  { chapter: 'combat', fieldKey: 'damage_formula' },
  { chapter: 'numeric', fieldKey: 'core_formulas' }
]

/** 语义重叠的字段组（只提示，不自动合并） */
export const OVERLAP_SPECS: ReadonlyArray<{ chapter: ChapterKey; fieldKeys: string[]; note: string }> = [
  {
    chapter: 'vision',
    fieldKeys: ['design_vision', 'differentiation'],
    note: '设计愿景与差异化优势常写成同一件事。建议分工：愿景=要做成什么样，差异化=玩家凭什么选你。'
  },
  {
    chapter: 'numeric',
    fieldKeys: ['core_formulas'],
    note: '数值核心公式与战斗章的伤害公式可能重复。建议伤害公式只放战斗章，数值章引用即可。'
  }
]

const BULLET_PREFIX = /^\s*(?:[-*•·]|\d+[.、)]|[一二三四五六七八九十]+[、.])\s*/

/**
 * 启发式拆分一段叙述文本：
 * 1. 有多行 → 按行拆（去掉 `-` / `1.` / `一、` 等前缀），前 `maxPoints` 行作要点；
 * 2. 单行 → 按句号/分号/问号/感叹号断句，前 `maxPoints` 句作要点；
 * 3. 都不行 → 整段作为一个要点。
 * 剩余内容进 `notes`（补充说明）。这是**展示用**的近似，不追求语义完美。
 */
export function splitNarrative(text: string, maxPoints = 5): { points: string[]; notes: string } {
  const trimmed = text.trim()
  if (trimmed === '') return { points: [], notes: '' }

  const lines = trimmed
    .split(/\r?\n/)
    .map((line) => line.replace(BULLET_PREFIX, '').trim())
    .filter((line) => line !== '')

  if (lines.length >= 2) {
    return { points: lines.slice(0, maxPoints), notes: lines.slice(maxPoints).join('\n') }
  }

  const sentences = trimmed
    .split(/(?<=[。；;！!？?])\s*/)
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence !== '')

  if (sentences.length >= 2) {
    return { points: sentences.slice(0, maxPoints), notes: sentences.slice(maxPoints).join('') }
  }

  return { points: [trimmed], notes: '' }
}

/**
 * 字段中文标签（单源在 `ceshuFields.fieldLabelOf`，此处保留短名以少改调用点）。
 * 与 ceshuImportPatch 同理：本文件经 `data` 桶被 `model` 加载、自身又 import `model`，
 * 顶层直接取绑定会在循环里拿到 undefined，必须包成函数延迟解析 live binding。
 */
function fieldLabel(chapter: ChapterKey, key: string): string {
  return fieldLabelOf(chapter, key)
}

function readText(value: unknown): string {
  return typeof value === 'string' ? value : ''
}

/** 生成迁移预览（纯函数，不修改入参） */
export function planCeshuMigration(doc: CeshuDocument): MigrationPlan {
  const splits: MigrationSplit[] = []
  for (const spec of SPLIT_SPECS) {
    const chapterData: unknown = doc[spec.chapter]
    if (!isPlainObject(chapterData)) continue
    const text = readText(chapterData[spec.fieldKey])
    if (text.trim() === '') continue
    const { points, notes } = splitNarrative(text)
    splits.push({
      chapter: spec.chapter,
      fieldKey: spec.fieldKey,
      fieldLabel: fieldLabel(spec.chapter, spec.fieldKey),
      currentLength: text.length,
      points,
      notes
    })
  }

  const overlaps: MigrationOverlap[] = []
  for (const spec of OVERLAP_SPECS) {
    const chapterData: unknown = doc[spec.chapter]
    if (!isPlainObject(chapterData)) continue
    const present = spec.fieldKeys.filter((key) => readText(chapterData[key]).trim() !== '')
    if (present.length === 0) continue
    // 真实重复度：找与 spec 对应的跨章字段组（可能含其他章的对应字段），按组判定
    const pair = OVERLAP_PAIRS.find((candidate) =>
      spec.fieldKeys.every((key) => candidate.fields.some((field) => field.key === key))
    )
    let duplicated = false
    let similarity = 0
    if (pair !== undefined) {
      const texts = pair.fields.map((field) => {
        const data: unknown = doc[field.chapter]
        return isPlainObject(data) ? readText(data[field.key]) : ''
      })
      if (texts.every((text) => text.trim() !== '')) {
        const verdict = detectTextDuplication(texts[0] ?? '', texts[1] ?? '')
        duplicated = verdict.duplicated
        similarity = verdict.similarity
      }
    }
    overlaps.push({
      chapter: spec.chapter,
      fieldKeys: present,
      fieldLabels: present.map((key) => fieldLabel(spec.chapter, key)),
      note: spec.note,
      duplicated,
      similarity
    })
  }

  return { splits, overlaps }
}

/** 预览标题（UI 用；避免在组件里重复拼中文） */
export function migrationSplitTitle(item: MigrationSplit): string {
  return `${CHAPTER_LABELS[item.chapter]} · ${item.fieldLabel}（${item.currentLength} 字）`
}

export interface MigrationRunResult {
  doc: CeshuDocument
  migrated: Array<{ chapter: ChapterKey; fieldKey: string; points: number }>
}

/** 还有几个字段可迁移（未迁过且原文非空） */
export function pendingSplitCount(doc: CeshuDocument): number {
  return SPLIT_SPECS.filter((spec) => {
    const chapterData: unknown = doc[spec.chapter]
    if (!isPlainObject(chapterData)) return false
    const text = readText(chapterData[spec.fieldKey])
    return text.trim() !== '' && chapterData[`${spec.fieldKey}_points`] === undefined
  }).length
}

/**
 * 执行拆分迁移（**幂等、非破坏**）：
 * - 对每个 SPLIT_SPEC，把 `xxx` 的文本拆成 `xxx_points`（要点列表）+ `xxx_notes`（补充）；
 * - 已存在 `xxx_points`（迁过）→ 跳过 ⇒ 重复执行不会覆盖人的编辑；
 * - **不删除 `xxx`**：原文保留，确认新字段无误后可手动清空，也留了回滚余地。
 */
export function migrateCeshuFieldSplits(doc: CeshuDocument): MigrationRunResult {
  const next: CeshuDocument = structuredClone(doc)
  const migrated: Array<{ chapter: ChapterKey; fieldKey: string; points: number }> = []
  for (const spec of SPLIT_SPECS) {
    const chapterData = next[spec.chapter] as Record<string, unknown>
    if (!isPlainObject(chapterData)) continue
    const pointsKey = `${spec.fieldKey}_points`
    const text = readText(chapterData[spec.fieldKey])
    if (text.trim() === '' || chapterData[pointsKey] !== undefined) continue
    const { points, notes } = splitNarrative(text)
    chapterData[pointsKey] = points
    chapterData[`${spec.fieldKey}_notes`] = notes
    migrated.push({ chapter: spec.chapter, fieldKey: spec.fieldKey, points: points.length })
  }
  return { doc: next, migrated }
}
