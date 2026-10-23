import { CHAPTER_REQUIRED_FIELDS, type ChapterKey, type CeshuFieldDef } from './ceshuConstants'
import { FIELD_HINTS } from './ceshuFieldHints'
import { NEW_CHAPTER_FIELDS } from './ceshuChapterFields'
import { FIELD_SPLITS } from './ceshuFieldSplits'
// 档 4：字段定义已全部迁入 ceshuSchema/<章>.ts（economy 试点 + 其余 16 章），旧 hint/split 文件仅 re-export 兜底
import { META_FIELDS } from './ceshuSchema/meta'
import { VISION_FIELDS } from './ceshuSchema/vision'
import { STORY_FIELDS } from './ceshuSchema/story'
import { GAMEPLAY_FIELDS } from './ceshuSchema/gameplay'
import { SYSTEMS_FIELDS } from './ceshuSchema/systems'
import { NUMERIC_FIELDS } from './ceshuSchema/numeric'
import { ART_FIELDS } from './ceshuSchema/art'
import { AUDIO_FIELDS } from './ceshuSchema/audio'
import { TECH_FIELDS } from './ceshuSchema/tech'
import { RESOURCES_FIELDS } from './ceshuSchema/resources'
import { MARKET_ANALYSIS_FIELDS } from './ceshuSchema/market_analysis'
import { COMBAT_FIELDS } from './ceshuSchema/combat'
import { MONETIZATION_FIELDS } from './ceshuSchema/monetization'
import { MVP_FIELDS } from './ceshuSchema/mvp'
import { RISK_HANDLING_FIELDS } from './ceshuSchema/risk_handling'
import { ACCESSIBILITY_FIELDS } from './ceshuSchema/accessibility'
import { ECONOMY_FIELDS } from './ceshuSchema/economy'

/** 字段的协作契约（解析后的结果，供 UI 标记与单字段生成提示词使用） */
export interface ResolvedFieldMeta {
  required: boolean
  aiDraftable: boolean
  aiHint: string
  reviewHint: string
}

/**
 * 解析字段契约：
 * - `required` 缺省从 `CHAPTER_REQUIRED_FIELDS` 派生（避免两处维护同一份必填信息）；
 * - `aiDraftable` 缺省 true（AI 可起草），人定字段显式设 false；
 * - `aiHint` / `reviewHint` 缺省空串。
 */
export function resolveFieldMeta(chapter: ChapterKey, field: CeshuFieldDef): ResolvedFieldMeta {
  const requiredKeys = CHAPTER_REQUIRED_FIELDS[chapter] ?? []
  return {
    required: field.required ?? requiredKeys.includes(field.key),
    aiDraftable: field.aiDraftable ?? true,
    aiHint: field.aiHint ?? '',
    reviewHint: field.reviewHint ?? ''
  }
}

/**
 * 字段定义（结构层）与协作契约（数据层）分离：
 * 各章「有哪些字段、什么类型、契约、拆分清单」已按章收进 `ceshuSchema/<章>.ts`，
 * 此处 BASE 只做引用聚合；契约/hint/split 旧文件仅 re-export 兜底，零行为变更。
 * P2 的扩展设计 7 章在 `ceshuChapterFields/` 按章分文件（字段也从 schema 取数），见该目录。
 */
const BASE_CHAPTER_FIELDS: Partial<Record<ChapterKey, CeshuFieldDef[]>> = {
  meta: META_FIELDS,
  vision: VISION_FIELDS,
  story: STORY_FIELDS,
  gameplay: GAMEPLAY_FIELDS,
  systems: SYSTEMS_FIELDS,
  numeric: NUMERIC_FIELDS,
  art: ART_FIELDS,
  audio: AUDIO_FIELDS,
  tech: TECH_FIELDS,
  resources: RESOURCES_FIELDS,
  market_analysis: MARKET_ANALYSIS_FIELDS,
  combat: COMBAT_FIELDS,
  economy: ECONOMY_FIELDS,
  monetization: MONETIZATION_FIELDS,
  mvp: MVP_FIELDS,
  risk_handling: RISK_HANDLING_FIELDS,
  accessibility: ACCESSIBILITY_FIELDS
}

/**
 * 应用结构拆分：为清单里的 textarea 字段插入配套的「要点列表 / 补充」字段（位置在本体之后）。
 *
 * 三条防线都在这里收敛，配合 `ceshuFieldSplits.test.ts` 守卫测试：
 * 1. 只拆非必填字段（必填拆分会改变校验语义）；
 * 2. 已手工拆过的不重复插（`xxx_points` 已存在即跳过，如 damage_formula）；
 * 3. 配套字段带通用契约兜底——章特定的分工契约由 hints 层覆盖。
 */
function applySplits(chapter: ChapterKey, fields: CeshuFieldDef[]): CeshuFieldDef[] {
  const splits = FIELD_SPLITS[chapter]
  if (splits === undefined || splits.length === 0) return fields
  const required = new Set(CHAPTER_REQUIRED_FIELDS[chapter])
  const result: CeshuFieldDef[] = []
  for (const field of fields) {
    result.push(field)
    if (!splits.includes(field.key)) continue
    if (field.kind !== 'textarea' || required.has(field.key)) continue
    if (fields.some((item) => item.key === `${field.key}_points`)) continue
    result.push(
      {
        key: `${field.key}_points`,
        label: `${field.label}·要点`,
        kind: 'stringList',
        placeholder: '每行一条要点',
        aiHint: '3-6 条，每行一条可核对的要点',
        reviewHint: '条目是否具体可核对；与本体的概述是否重复'
      },
      { key: `${field.key}_notes`, label: `${field.label}·补充`, kind: 'textarea', aiHint: '要点之外的补充说明，可留空' }
    )
  }
  return result
}

/** 原始字段表 = 全部 24 章：BASE 17 章（meta + 16 编号章）+ P2 扩展设计 7 章（按章分文件，见 ceshuChapterFields/） */
const RAW_CHAPTER_FIELDS = { ...BASE_CHAPTER_FIELDS, ...NEW_CHAPTER_FIELDS } as Record<ChapterKey, CeshuFieldDef[]>

/** 合并后的字段表：定义 → 结构拆分 → 按章契约（hints 缺省的章/字段原样返回） */
export const CESHU_CHAPTER_FIELDS: Record<ChapterKey, CeshuFieldDef[]> = Object.fromEntries(
  (Object.keys(RAW_CHAPTER_FIELDS) as ChapterKey[]).map((chapter) => {
    const hints = FIELD_HINTS[chapter]
    const fields = applySplits(chapter, RAW_CHAPTER_FIELDS[chapter])
    return [chapter, hints === undefined ? fields : fields.map((field) => ({ ...field, ...hints[field.key] }))]
  })
) as Record<ChapterKey, CeshuFieldDef[]>
