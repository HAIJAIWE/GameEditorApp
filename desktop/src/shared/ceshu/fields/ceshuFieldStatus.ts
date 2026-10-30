import type { ChapterData, ChapterKey } from '../reference/ceshuConstants'
import { isPlainObject } from '../model/ceshuModel'

/**
 * 策划书**字段级**审核状态（人机协作的第二层）。
 *
 * 与 `ceshuAiMark.ts`（按章 `meta.ai_generated`）互补：
 * - 按章标记回答「这一章 AI 写过、还没扫」；
 * - 字段级状态回答「这一章里**哪几个格子**是 AI 草稿 / 人改过 / 已批准」。
 *
 * 存储：`meta.field_status = { [章节key]: { [字段key]: { status, at } } }`。
 * 与 `ai_generated` 一样是 **TS 独占格式**，且是**辅助信息**——
 * 脏数据一律当空表，坏了不影响策划书本身读写。
 *
 * 状态机（刻意简单，只保留协作必需的三态）：
 *   （空） --AI 生成--> ai_draft --人保存未改--> approved
 *                          |  --人改动------> human_edited
 *                          |  --点「接受」--> approved
 */

/** `meta` 里存字段状态的键名 */
export const FIELD_STATUS_KEY = 'field_status'

export type FieldReviewStatus = 'ai_draft' | 'human_edited' | 'approved'

export interface FieldStatusEntry {
  status: FieldReviewStatus
  /** 状态变更时间（ISO）；将来可用于「最近生成」排序 */
  at: string
}

/** 单章的字段状态表：字段 key → 状态 */
export type ChapterFieldStatus = Record<string, FieldStatusEntry>
/** 全文档的字段状态表：章节 key → 单章状态表 */
export type FieldStatusMap = Partial<Record<ChapterKey, ChapterFieldStatus>>

const VALID_STATUSES: readonly FieldReviewStatus[] = ['ai_draft', 'human_edited', 'approved']

function isStatus(value: unknown): value is FieldReviewStatus {
  return typeof value === 'string' && (VALID_STATUSES as readonly string[]).includes(value)
}

/** 读出全量状态表；结构不对的条目丢弃（不抛） */
export function readFieldStatus(meta: ChapterData): FieldStatusMap {
  const raw = meta[FIELD_STATUS_KEY]
  if (!isPlainObject(raw)) return {}
  const result: FieldStatusMap = {}
  for (const [chapter, chapterRaw] of Object.entries(raw)) {
    if (!isPlainObject(chapterRaw)) continue
    const fields: ChapterFieldStatus = {}
    for (const [field, entryRaw] of Object.entries(chapterRaw)) {
      if (!isPlainObject(entryRaw)) continue
      const status = entryRaw.status
      const at = entryRaw.at
      if (isStatus(status) && typeof at === 'string') {
        fields[field] = { status, at }
      }
    }
    if (Object.keys(fields).length > 0) {
      result[chapter as ChapterKey] = fields
    }
  }
  return result
}

/** 取单章的字段状态表（缺省空对象） */
export function fieldStatusOf(meta: ChapterData, chapter: ChapterKey): ChapterFieldStatus {
  return readFieldStatus(meta)[chapter] ?? {}
}

/** 取某字段状态；未记录返回 null */
export function getFieldStatus(meta: ChapterData, chapter: ChapterKey, fieldKey: string): FieldReviewStatus | null {
  return readFieldStatus(meta)[chapter]?.[fieldKey]?.status ?? null
}

/**
 * 批量写入字段状态（保留其它章节 / 其它字段的既有记录）。
 * 空 updates 直接返回原对象（调用方可据此跳过写盘）。
 */
export function setFieldStatuses(
  meta: ChapterData,
  chapter: ChapterKey,
  updates: Record<string, FieldReviewStatus>,
  now: string
): ChapterData {
  const entries = Object.entries(updates).filter(([, status]) => isStatus(status))
  if (entries.length === 0) return meta
  const all = readFieldStatus(meta)
  const current: ChapterFieldStatus = { ...(all[chapter] ?? {}) }
  for (const [field, status] of entries) {
    current[field] = { status, at: now }
  }
  return { ...meta, [FIELD_STATUS_KEY]: { ...all, [chapter]: current } }
}

/** 待审字段：状态为 `ai_draft` 的字段（按传入顺序，便于「跳到下一个」） */
export function pendingFieldKeys(meta: ChapterData, chapter: ChapterKey, fieldKeys: readonly string[]): string[] {
  const statuses = readFieldStatus(meta)[chapter] ?? {}
  return fieldKeys.filter((key) => statuses[key]?.status === 'ai_draft')
}
