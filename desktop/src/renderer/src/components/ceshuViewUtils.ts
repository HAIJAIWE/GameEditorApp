import type { CeshuChangeItem } from '../../../shared/ceshu/workflow/ceshuDiff'

export { toErrorMessage } from '../../../shared/util/system/errors'

/** 变更明细按章节分组（保持出现顺序） */
export function groupByChapter(changes: CeshuChangeItem[]): Array<[string, CeshuChangeItem[]]> {
  const groups = new Map<string, CeshuChangeItem[]>()
  for (const change of changes) {
    const list = groups.get(change.chapter)
    if (list) list.push(change)
    else groups.set(change.chapter, [change])
  }
  return [...groups.entries()]
}
