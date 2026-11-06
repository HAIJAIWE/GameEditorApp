import {
  CHAPTER_REQUIRED_FIELDS,
  type CeshuColumnDef,
  type ChapterKey,
  type CeshuFieldDef
} from '../reference'
// 档 4：字段定义 / 契约 / 拆分 / 默认 / 模板已全部收进 ceshuSchema/<章>.ts。
// 此处只做「合并」：把按章 schema 聚合成最终字段表（结构拆分 + 契约叠加）。
import { CHAPTER_SCHEMAS, FIELD_SPLITS } from '../../ceshuSchema'
import { toFieldHints } from '../../ceshuSchema/core'

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
export function resolveFieldMeta(
  chapter: string,
  field: CeshuFieldDef,
  requiredKeysOverride?: readonly string[]
): ResolvedFieldMeta {
  // 应用章 key 不属于 ChapterKey：默认查表用宽松索引（未命中即空），
  // 调用方也可显式传入规格化必填表（见 ceshuBundle）。游戏档逐项零回归。
  const requiredKeys =
    requiredKeysOverride ?? (CHAPTER_REQUIRED_FIELDS as Record<string, readonly string[]>)[chapter] ?? []
  return {
    required: field.required ?? requiredKeys.includes(field.key),
    aiDraftable: field.aiDraftable ?? true,
    aiHint: field.aiHint ?? '',
    reviewHint: field.reviewHint ?? ''
  }
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
      /*
       * 「补充」字段的契约兜底（2026-10-26 补 reviewHint）：
       * 此前只给了 aiHint，人审侧没有检查点——而这类字段最容易变成
       * 「把要点又抄一遍」。章特定分工由 schema 的 splitHints 覆盖。
       */
      {
        key: `${field.key}_notes`,
        label: `${field.label}·补充`,
        kind: 'textarea',
        aiHint: '要点之外的补充说明，可留空',
        reviewHint: '是否只放补充信息、没有把要点又抄一遍；该留空时是否确实留空'
      }
    )
  }
  return result
}

/**
 * 合并后的字段表：每章按 `CHAPTER_SCHEMAS` 取字段 → 结构拆分 → 叠加该章契约
 * （`toFieldHints` 由 schema 内联契约 + splitHints 派生，覆盖本体与拆分产物）。
 * 产物与旧 `ceshuFields` 逐字段零差异（守卫测试钉死字段总数与每章字段数）。
 */
export const CESHU_CHAPTER_FIELDS: Record<ChapterKey, CeshuFieldDef[]> = Object.fromEntries(
  (Object.keys(CHAPTER_SCHEMAS) as ChapterKey[]).map((chapter) => {
    const schema = CHAPTER_SCHEMAS[chapter]
    const hints = toFieldHints(schema)
    const fields = applySplits(chapter, schema.fields)
    return [chapter, fields.map((field) => ({ ...field, ...hints[field.key] }))]
  })
) as Record<ChapterKey, CeshuFieldDef[]>

/**
 * 取字段的列定义（`pipeList` 的 `columns`；取不到返回空数组）。
 *
 * 给**校验 / 复算 / Demo 提示词**这类消费方用：它们读到的是文档数据，需要把
 * 「对象行」按列顺序还原成字符串行（见 `ceshuPipeRows.toRowStrings`）。
 * 放在此处而不是各消费方内联 `find(...)`，因为「字段定义在哪」这件事只该有一个答案。
 */
export function fieldColumns(chapter: ChapterKey, key: string): CeshuColumnDef[] {
  return (CESHU_CHAPTER_FIELDS[chapter] ?? []).find((field) => field.key === key)?.columns ?? []
}

/**
 * 取字段的中文标签（schema 里没有的扩展键回退成 key 本身，至少不丢信息）。
 *
 * 与 `fieldColumns` 同理放在单源处：此前 `ceshuImportPatch` / `ceshuMigrationPlan` /
 * `ceshuOverlap` / `export/common` 各写了一份逐字相同的 `find(...).label ?? key`，
 * 任一处口径漂移（例如将来支持 `label` 为空时回退 aiHint）都会让界面与导出不一致。
 */
export function fieldLabelOf(chapter: ChapterKey, key: string): string {
  return (CESHU_CHAPTER_FIELDS[chapter] ?? []).find((field) => field.key === key)?.label ?? key
}
