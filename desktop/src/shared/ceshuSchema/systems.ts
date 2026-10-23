/**
 * 章节 `systems` 的按章 schema（档 4 合并，2026-10-24）。
 *
 * 字段定义 / 契约（aiHint/reviewHint/aiDraftable 已内联）/ 三件套拆分清单
 * 全部收进单文件；旧 ceshuFieldHints/ceshuFieldSplits 仅做 re-export 兜底。
 * 改一个字段只碰这一处。
 */
import type { ChapterSchema } from './types'
import type { CeshuFieldDef } from '../ceshuConstants'

export const SYSTEMS_FIELDS: CeshuFieldDef[] = []

export const SYSTEMS_SCHEMA: ChapterSchema = {
  fields: SYSTEMS_FIELDS,
  splits: [],
  splitHints: undefined
}
