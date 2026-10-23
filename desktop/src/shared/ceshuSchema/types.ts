import type { CeshuFieldDef, ChapterData } from '../ceshuConstants'
import type { ChapterTemplate } from '../ceshuTemplates'
import type { FieldHint, ChapterFieldHints } from '../ceshuFieldHints/types'

/**
 * 档 4 合并产物：按章聚合的策划书 schema。
 *
 * 旧架构里「同一章」的元数据散在 4 处——
 * `ceshuFields`（字段）/ `ceshuFieldHints`（人机协作契约）/ `ceshuFieldSplits`（三件套拆分）/
 * `ceshuDefaults` + `ceshuTemplateData`（默认与模板）。
 * 这里把同章全部元数据收进一个文件，改一个字段只碰这一处。
 *
 * - 字段契约（aiHint / reviewHint / aiDraftable）直接内联到 field def 上；
 * - 三件套拆分产物（`${key}_points` / `${key}_notes`）的契约放进 `splitHints`，
 *   由 `toFieldHints` 派生（只有真正写了自定义契约的字段才填）。
 * - `defaults` / `templates` 在后续批次从 `ceshuDefaults` / `ceshuTemplateData` 迁入。
 */
export interface SplitFieldHints {
  points?: FieldHint
  notes?: FieldHint
}

export interface ChapterSchema {
  /** 字段定义（契约已内联） */
  fields: CeshuFieldDef[]
  /** 三件套拆分清单：要拆成「本体 + 要点 + 补充」的 textarea 字段 key */
  splits: string[]
  /** 拆分产物的契约（仅对写了自定义 `_points` / `_notes` 契约的字段填写） */
  splitHints?: Record<string, SplitFieldHints>
  /** 默认数据（供 `ceshuDefaults` 合并） */
  defaults?: ChapterData
  /** 内置模板（供 `ceshuTemplateData` 合并） */
  templates?: ChapterTemplate[]
}

/** 字段定义构造助手（与 `ceshuFields.f` 同形，放在此处供各章 schema 复用，避免反向依赖 ceshuFields） */
export function f(key: string, label: string, kind: CeshuFieldDef['kind'], extra: Partial<CeshuFieldDef> = {}): CeshuFieldDef {
  return { key, label, kind, ...extra }
}

function pickHint(hint: FieldHint): FieldHint {
  const out: FieldHint = {}
  if (hint.aiHint !== undefined) out.aiHint = hint.aiHint
  if (hint.reviewHint !== undefined) out.reviewHint = hint.reviewHint
  if (hint.aiDraftable !== undefined) out.aiDraftable = hint.aiDraftable
  return out
}

/**
 * 由 schema 派生该章的字段契约表（与旧 `ceshuFieldHints/<章>` 产物同形态）：
 * - 基础字段：取其内联的 aiHint / reviewHint / aiDraftable（有才写，空串不写）；
 * - 拆分字段：追加 `${key}_points` / `${key}_notes` 的契约（来自 splitHints）。
 *
 * 注：旧架构里 ledger / metrics_tracking 这类「契约写在 def 上、不入 hint map」的字段，
 * 派生后会自然进入 hint map（合并时幂等，最终字段零变化）。
 */
export function toFieldHints(schema: ChapterSchema): ChapterFieldHints {
  const result: ChapterFieldHints = {}
  for (const field of schema.fields) {
    const hint = pickHint(field)
    if (Object.keys(hint).length > 0) result[field.key] = hint
  }
  for (const baseKey of schema.splits) {
    const sh = schema.splitHints?.[baseKey]
    if (sh?.points) result[`${baseKey}_points`] = pickHint(sh.points)
    if (sh?.notes) result[`${baseKey}_notes`] = pickHint(sh.notes)
  }
  return result
}
