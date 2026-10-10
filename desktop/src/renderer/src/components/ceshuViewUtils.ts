import type { CeshuChangeItem } from '../../../shared/ceschu/ceshuDiff'

export function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

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
