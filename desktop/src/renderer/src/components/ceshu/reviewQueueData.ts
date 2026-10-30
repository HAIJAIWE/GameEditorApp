import type { CeshuDocument, ChapterKey } from '../../../../shared/ceshu/reference/ceshuConstants'
import { fieldStatusOf } from '../../../../shared/ceshu/fields/ceshuFieldStatus'
import { CESHU_CHAPTER_FIELDS } from '../../../../shared/ceshu/fields/ceshuFields'
import { visibleChaptersForDoc } from '../../../../shared/ceshu/model/ceshuModel'

/**
 * 全局待审字段（跨章）：AI 草稿、尚未接受。
 *
 * 从 CeshuView 抽到独立模块（Slice 14b）：编辑器（工具栏角标）与审阅队列浮层都要用它，
 * 放这里避免两处各算一份、也避免浮层组件反向依赖 CeshuView。
 */
export interface PendingReviewField {
  chapter: ChapterKey
  fieldKey: string
  fieldLabel: string
}

/** 按档位可见章节顺序 + 字段定义顺序排列 */
export function collectPendingReviewFields(doc: CeshuDocument): PendingReviewField[] {
  const pending: PendingReviewField[] = []
  for (const chapter of visibleChaptersForDoc(doc)) {
    const statuses = fieldStatusOf(doc.meta, chapter)
    for (const field of CESHU_CHAPTER_FIELDS[chapter] ?? []) {
      if (statuses[field.key]?.status === 'ai_draft') {
        pending.push({ chapter, fieldKey: field.key, fieldLabel: field.label })
      }
    }
  }
  return pending
}
