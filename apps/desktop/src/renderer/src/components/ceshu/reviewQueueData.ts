import type { CeshuDocument } from '@mobai/shared/ceshu/reference'
import { fieldStatusOf } from '@mobai/shared/ceshu/fields'
import { chapterFieldsForDoc, visibleChaptersForDoc } from '@mobai/shared/ceshu/model'

/**
 * 全局待审字段（跨章）：AI 草稿、尚未接受。
 *
 * 从 CeshuView 抽到独立模块（Slice 14b）：编辑器（工具栏角标）与审阅队列浮层都要用它，
 * 放这里避免两处各算一份、也避免浮层组件反向依赖 CeshuView。
 *
 * 章 key 用 `string`：应用档的章不属于游戏 ChapterKey 联合类型。
 */
export interface PendingReviewField {
  chapter: string
  fieldKey: string
  fieldLabel: string
}

/** 按档位可见章节顺序 + 字段定义顺序排列 */
export function collectPendingReviewFields(doc: CeshuDocument): PendingReviewField[] {
  const pending: PendingReviewField[] = []
  for (const chapter of visibleChaptersForDoc(doc)) {
    const statuses = fieldStatusOf(doc.meta, chapter)
    for (const field of chapterFieldsForDoc(doc, chapter)) {
      if (statuses[field.key]?.status === 'ai_draft') {
        pending.push({ chapter, fieldKey: field.key, fieldLabel: field.label })
      }
    }
  }
  return pending
}
