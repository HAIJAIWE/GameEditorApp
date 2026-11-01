/**
 * shared/ceshuSchema —— 24 章策划书 schema 聚合：`CHAPTER_SCHEMAS` 与 `FIELD_SPLITS`，按章查字段/契约/拆分/默认/模板的唯一入口。
 *
 * 档 4 合并产物的中央聚合（2026-10-24）。
 *
 * 每个章的全部元数据（字段 / 契约 / 拆分 / 默认 / 模板）已收进 `ceshuSchema/<章>.ts`，
 * 这里把 24 章 schema 汇总成 `CHAPTER_SCHEMAS`，作为「按章查全部元数据」的唯一入口。
 *
 * 同时再导出 `FIELD_SPLITS`（由各 `schema.splits` 派生，覆盖全部 24 章），
 * 兼容旧 `ceshuFieldSplits` 目录的消费方（守卫测试 / ceshuFields 的 applySplits）。
 */
import type { ChapterKey } from '../ceshu/reference'
import type { ChapterSchema, ChapterFieldSplits } from './core'

import { META_SCHEMA } from './production'
import { VISION_SCHEMA } from './quality'
import { STORY_SCHEMA } from './design'
import { GAMEPLAY_SCHEMA } from './design'
import { SYSTEMS_SCHEMA } from './systems'
import { NUMERIC_SCHEMA } from './systems'
import { ART_SCHEMA } from './design'
import { AUDIO_SCHEMA } from './design'
import { TECH_SCHEMA } from './systems'
import { RESOURCES_SCHEMA } from './systems'
import { MARKET_ANALYSIS_SCHEMA } from './production'
import { COMBAT_SCHEMA } from './systems'
import { ECONOMY_SCHEMA } from './systems'
import { MONETIZATION_SCHEMA } from './production'
import { MVP_SCHEMA } from './production'
import { RISK_HANDLING_SCHEMA } from './quality'
import { ACCESSIBILITY_SCHEMA } from './quality'
import { UIUX_SCHEMA } from './design'
import { LEVEL_DESIGN_SCHEMA } from './design'
import { LIVE_OPS_SCHEMA } from './production'
import { ANALYTICS_SCHEMA } from './quality'
import { QA_SCHEMA } from './quality'
import { PUBLISHING_SCHEMA } from './production'
import { PERFORMANCE_SCHEMA } from './quality'

/**
 * 全部 24 章 schema 的汇总（按章查字段 / 契约 / 拆分 / 默认 / 模板的唯一入口）。
 *
 * 键序 = `CHAPTER_PARTS` 文档章序（章节顺序的唯一事实源）：所有从本表 `Object.keys`
 * 派生的产物（`createDefaultChapters` / `CHAPTER_TEMPLATES` / `FIELD_SPLITS`）因此
 * 统一为文档章序，不再复刻旧 `ceshuDefaults` / `ceshuTemplateData` 两处互不一致的手写序。
 */
export const CHAPTER_SCHEMAS: Record<ChapterKey, ChapterSchema> = {
  meta: META_SCHEMA,
  vision: VISION_SCHEMA,
  story: STORY_SCHEMA,
  gameplay: GAMEPLAY_SCHEMA,
  systems: SYSTEMS_SCHEMA,
  combat: COMBAT_SCHEMA,
  economy: ECONOMY_SCHEMA,
  numeric: NUMERIC_SCHEMA,
  art: ART_SCHEMA,
  audio: AUDIO_SCHEMA,
  tech: TECH_SCHEMA,
  resources: RESOURCES_SCHEMA,
  market_analysis: MARKET_ANALYSIS_SCHEMA,
  risk_handling: RISK_HANDLING_SCHEMA,
  mvp: MVP_SCHEMA,
  monetization: MONETIZATION_SCHEMA,
  accessibility: ACCESSIBILITY_SCHEMA,
  uiux: UIUX_SCHEMA,
  level_design: LEVEL_DESIGN_SCHEMA,
  live_ops: LIVE_OPS_SCHEMA,
  analytics: ANALYTICS_SCHEMA,
  qa: QA_SCHEMA,
  publishing: PUBLISHING_SCHEMA,
  performance: PERFORMANCE_SCHEMA
}

/**
 * 三件套拆分清单（由各 schema 的 `splits` 派生，覆盖全部 24 章；无拆分的章为 `[]`）。
 * 再导出旧 `ceshuFieldSplits` 的同名产物，供守卫测试与 `ceshuFields.applySplits` 消费。
 */
export const FIELD_SPLITS: Record<ChapterKey, ChapterFieldSplits> = (() => {
  const out = {} as Record<ChapterKey, ChapterFieldSplits>
  for (const ch of Object.keys(CHAPTER_SCHEMAS) as ChapterKey[]) {
    out[ch] = CHAPTER_SCHEMAS[ch].splits
  }
  return out
})()
