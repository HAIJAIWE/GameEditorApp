import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

import type { CeshuDocument } from '../../../shared/ceshu/ceshuConstants'
import { buildProjectFolder, projectFolderName } from '../../../shared/ceshu/ceshuProjectFolder'

/**
 * 把策划书写成一个「项目文件夹」：`config.json` + `design/<章>.md` + `data/<章>.json` + `tasks/<岗位>.md`。
 * 内容由 `shared/ceshuProjectFolder.buildProjectFolder`（纯函数）产出，这里只负责落盘。
 *
 * 落点是 `<targetDir>/<游戏名>/`（自动建子目录）：一个游戏一个文件夹，
 * 直接摊在用户选的目录里会和已有文件混在一起，也不再是「一个游戏一个文件夹」。
 */
export function exportProjectFolder(doc: CeshuDocument, targetDir: string): { dir: string; files: string[] } {
  const { files } = buildProjectFolder(doc)
  const dir = join(targetDir, projectFolderName(doc))
  const written: string[] = []
  for (const [relative, content] of Object.entries(files)) {
    const full = join(dir, relative)
    mkdirSync(dirname(full), { recursive: true })
    writeFileSync(full, content, 'utf-8')
    written.push(relative)
  }
  return { dir, files: written }
}
