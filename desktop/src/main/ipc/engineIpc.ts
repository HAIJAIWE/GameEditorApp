import { join } from 'node:path'

import type { IpcHandlerDeps, IpcRegistrar } from '../ipc'
import { engineExportInputSchema } from '../../shared/schemas'
import { exportEngineData, type EngineExportResult } from '../engineExport/exporter'
import { copyImagesForExport } from '../exportImagesCopy'
import { LIBRARY_IMAGES_DIRNAME } from '../../shared/util/libraryImageImport'
import { log } from '../../shared/util/logger'

export function registerEngineIpc(deps: IpcHandlerDeps, handle: IpcRegistrar): void {
  const { dataService, typeSchemaStore, libraryManager } = deps
  // 引擎代码导出（P0：Lua）：取全量数据快照 + 当前 schema，渲染并原子落盘
  handle('engine:exportData', engineExportInputSchema, async (req): Promise<EngineExportResult & { copiedImages: number; missingImages: string[] }> => {
    const result = await exportEngineData(dataService.listAllItems(), typeSchemaStore.getTypes(), {
      engine: req.engine,
      targetPath: req.path
    })
    /*
     * 图片跟数据一起走：字段值现在是库相对路径（`images/xxx.png`），
     * 光写数据文件的话游戏侧只有路径没有图。这里把引用到的库内图片
     * 拷到导出文件旁边的 `images/`，搬走整个目录即可用。
     *
     * 拷图失败**不阻断导出** —— 数据已经落盘，为一张图判失败是本末倒置。
     */
    const imagesDir = join(libraryManager.activeDir(), LIBRARY_IMAGES_DIRNAME)
    const copy = copyImagesForExport(dataService.listAllItems(), imagesDir, result.filePath)
    if (copy.missing.length > 0) {
      log.warn('导出时有引用图片未找到', { missing: copy.missing })
    }
    return { ...result, copiedImages: copy.copied, missingImages: copy.missing }
  })
}
