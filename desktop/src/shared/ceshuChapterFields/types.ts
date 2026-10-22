/**
 * P2 扩展设计 7 章的**按章分文件**载体（2026-10-23）。
 *
 * ## 为什么单独一个目录
 * 新增章节要同时改字段表（`ceshuFields.ts`）与默认数据（`ceshuDefaults.ts`），
 * 而这两个都是单文件——7 个章并行编辑必然冲突。仿照 hints/splits 的成功模式：
 * 每章一个文件导出「字段 + 默认数据」，上述两个文件只在导出时按章合并。
 *
 * 分工：本目录只放**结构与默认值**；契约（aiHint/reviewHint）在
 * `ceshuFieldHints/`、拆分配置在 `ceshuFieldSplits/`，同样按章分文件。
 */

import type { ChapterData, CeshuFieldDef, ChapterKey } from '../ceshuConstants'

/**
 * 扩展设计 7 章的 key（与 `CHAPTER_PARTS` 的 expansion 分区一一对应）。
 * 用 Extract 精确联合而非 ChapterKey：合并处的 Record 缺一章会编译期报错。
 */
export type ExpansionChapterKey = Extract<
  ChapterKey,
  'uiux' | 'level_design' | 'live_ops' | 'analytics' | 'qa' | 'publishing' | 'performance'
>

/** 单章完整定义：字段表 + 默认数据 */
export interface ChapterDefinition {
  fields: CeshuFieldDef[]
  defaults: ChapterData
}
