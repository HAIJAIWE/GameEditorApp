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
