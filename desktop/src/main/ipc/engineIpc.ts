import type { IpcHandlerDeps, IpcRegistrar } from '../ipc'
import { engineExportInputSchema } from '../../shared/schema/adapters'
import { exportEngineData, type EngineExportResult } from '../engineExport/exporter'
import { copyImagesForExport, detectMissingImages } from '../exportImagesCopy'
import { log } from '../../shared/util/system'

export function registerEngineIpc(deps: IpcHandlerDeps, handle: IpcRegistrar): void {
  const { dataService, typeSchemaStore, libraryManager } = deps
  // 引擎代码导出（P0：Lua）：取全量数据快照 + 当前 schema，渲染并原子落盘
  handle('engine:exportData', engineExportInputSchema, async (req): Promise<EngineExportResult & { copiedImages: number; missingImages: string[] }> => {
    const records = dataService.listAllItems()
    /*
     * ⚠️ 图片基准是**库根目录**（`<活跃库>`），不是 `images/` 目录。
     * `planExportImages` 会在传入的 libraryDir 上再拼一层 `images/`，
     * 若传 `<库>/images` 会叠成 `<库>/images/images` 而全盘落空
     * （历史就是这么错的，导出的图永远为零、丢失清单却列满）。
     * 这里先按正确口径取根目录，并锁住。
     */
    const libraryRoot = libraryManager.activeDir()

    /*
     * 图片缺失校验（先于落盘）。
     *
     * 开启「缺失图片即阻断」时，发现缺失就**在写数据文件之前**抛错，
     * 避免导出一个「数据在、图缺几张」的半成品（AI 覆盖游戏活文件尤其危险）。
     * 未开启则走旧行为：拷得到的拷、找不到的记 missing、不阻断。
     */
    if (req.blockOnMissingImages) {
      const missing = detectMissingImages(records, libraryRoot)
      if (missing.length > 0) {
        const listed = missing.slice(0, 10).join('、')
        const more = missing.length > 10 ? '…' : ''
        throw new Error(
          `导出已阻断：有 ${missing.length} 张引用的图片在库内不存在（${listed}${more}）。` +
            '请补全图片后重试，或在「设置 → 导出时图片缺失则阻断」中关闭该选项。'
        )
      }
    }

    const result = await exportEngineData(records, typeSchemaStore.getTypes(), {
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
    const copy = copyImagesForExport(records, libraryRoot, result.filePath)
    if (copy.missing.length > 0) {
      log.warn('导出时有引用图片未找到', { missing: copy.missing })
    }
    return { ...result, copiedImages: copy.copied, missingImages: copy.missing }
  })
}
