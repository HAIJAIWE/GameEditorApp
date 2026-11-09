import type { HandoffVolume } from './ceshuHandoffTypes'

/**
 * 路径工具：卷文件夹名、卷内目录、点路径读取。
 *
 * 路径口径只此一处——README、卷目录、`index.json` 与各文档头的相对路径都从这里来。
 */

/** 卷文件夹名：`00-架构` */
export function handoffVolumeFolderName(volume: HandoffVolume): string {
  return `${String(volume.index).padStart(2, '0')}-${volume.folder}`
}

/** 卷内目录文件名（打开文件夹先看它） */
export function handoffVolumeIndexPath(volume: HandoffVolume): string {
  return `${handoffVolumeFolderName(volume)}/README.md`
}

/** 读点路径（`user_personas.primary`）；非对象节点返回 undefined */
export function readPath(source: unknown, path: string): unknown {
  let node: unknown = source
  for (const part of path.split('.')) {
    if (node === null || typeof node !== 'object') return undefined
    node = (node as Record<string, unknown>)[part]
  }
  return node
}
/* ------------------------------------------------------------------ */
/* 进度快照标记（`进度.md` 里机判成绩单的起止，worker 与看板共用）    */
/* ------------------------------------------------------------------ */

/** 机判快照段的开始标记（只此一份，重跑覆盖） */
export const HANDOFF_PROGRESS_SNAPSHOT_BEGIN = '<!-- 机判快照：开始（自动生成，重跑覆盖本段） -->'

/** 机判快照段的结束标记 */
export const HANDOFF_PROGRESS_SNAPSHOT_END = '<!-- 机判快照：结束 -->'

/**
 * 摘掉 `进度.md` 里的机判快照段（没有就原样返回）。
 *
 * 为什么解析前必须先摘：快照里每一行也带 `<路径>` 反引号，若当施工记录读，
 * 机器贴的成绩单会被误当成「智能体说这份做完了」——那就是自己给自己盖章。
 * 所以撤除逻辑与解读逻辑必须共用这一个函数，不能各写一份。
 */
export function stripProgressSnapshot(markdown: string): string {
  const begin = markdown.indexOf(HANDOFF_PROGRESS_SNAPSHOT_BEGIN)
  if (begin < 0) return markdown
  const end = markdown.indexOf(HANDOFF_PROGRESS_SNAPSHOT_END, begin)
  if (end < 0) return markdown.slice(0, begin)
  return markdown.slice(0, begin) + markdown.slice(end + HANDOFF_PROGRESS_SNAPSHOT_END.length)
}
