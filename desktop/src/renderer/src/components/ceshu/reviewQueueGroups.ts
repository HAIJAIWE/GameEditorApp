import type { ChapterKey } from '../../../../shared/ceshu/ceshuConstants'

/**
 * 审阅队列按章节分组的纯逻辑（供 CeshuView 渲染与单测共用）。
 *
 * ## 为什么不合并同名字段
 * 队列的键盘光标（`reviewCursor`）是**扁平下标**，浮层的视觉顺序也必须是扁平顺序。
 * 若把散落各处的同章条目归并到一组，第 3 条的 flatIndex 会跳到第 1 条前面 ——
 * 光标按下标走，视觉按分组走，两者立刻对不上。故只做「连续同章合并」：
 * 同章不连续出现时各自成组，视觉顺序与扁平下标始终一一对应。
 */

export interface ReviewQueueItem {
  chapter: ChapterKey
  fieldKey: string
  fieldLabel: string
}

export interface ReviewQueueGroup {
  chapter: ChapterKey
  /** 该组第一条在**扁平列表**里的下标（键盘光标仍用扁平下标） */
  startIndex: number
  items: Array<{ item: ReviewQueueItem; flatIndex: number }>
}

/** 按原始顺序分组：连续同章合并成一组，绝不重排 */
export function groupReviewQueue(items: readonly ReviewQueueItem[]): ReviewQueueGroup[] {
  const groups: ReviewQueueGroup[] = []
  items.forEach((item, flatIndex) => {
    const last = groups[groups.length - 1]
    if (last !== undefined && last.chapter === item.chapter) {
      last.items.push({ item, flatIndex })
      return
    }
    groups.push({ chapter: item.chapter, startIndex: flatIndex, items: [{ item, flatIndex }] })
  })
  return groups
}
