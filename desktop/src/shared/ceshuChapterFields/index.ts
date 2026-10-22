import type { ChapterData, CeshuFieldDef } from '../ceshuConstants'

import { ANALYTICS_CHAPTER } from './analytics'
import { LEVEL_DESIGN_CHAPTER } from './levelDesign'
import { LIVE_OPS_CHAPTER } from './liveOps'
import { PERFORMANCE_CHAPTER } from './performance'
import { PUBLISHING_CHAPTER } from './publishing'
import { QA_CHAPTER } from './qa'
import { UIUX_CHAPTER } from './uiux'
import type { ExpansionChapterKey } from './types'

/**
 * P2 扩展设计 7 章的汇总（按章分文件存放，本文件只做汇总）。
 * 缺一章会编译期报错（Record 的键是 ExpansionChapterKey 精确联合）。
 */
export const NEW_CHAPTER_DEFINITIONS: Record<ExpansionChapterKey, typeof UIUX_CHAPTER> = {
  uiux: UIUX_CHAPTER,
  level_design: LEVEL_DESIGN_CHAPTER,
  live_ops: LIVE_OPS_CHAPTER,
  analytics: ANALYTICS_CHAPTER,
  qa: QA_CHAPTER,
  publishing: PUBLISHING_CHAPTER,
  performance: PERFORMANCE_CHAPTER
}

/** 新章字段表（键为章 key，供 ceshuFields.ts 合并进 RAW_CHAPTER_FIELDS） */
export const NEW_CHAPTER_FIELDS: Record<ExpansionChapterKey, CeshuFieldDef[]> = Object.fromEntries(
  (Object.keys(NEW_CHAPTER_DEFINITIONS) as ExpansionChapterKey[]).map((key) => [key, NEW_CHAPTER_DEFINITIONS[key].fields])
) as Record<ExpansionChapterKey, CeshuFieldDef[]>

/** 新章默认数据（键为章 key，供 ceshuDefaults.ts 合并进 createDefaultChapters） */
export const NEW_CHAPTER_DEFAULTS: Record<ExpansionChapterKey, ChapterData> = Object.fromEntries(
  (Object.keys(NEW_CHAPTER_DEFINITIONS) as ExpansionChapterKey[]).map((key) => [key, NEW_CHAPTER_DEFINITIONS[key].defaults])
) as Record<ExpansionChapterKey, ChapterData>
