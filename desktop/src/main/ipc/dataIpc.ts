import type { IpcHandlerDeps, IpcRegistrar } from '../ipc'
import {
  listItemsInputSchema,
  createItemInputSchema,
  updateItemInputSchema,
  deleteItemInputSchema,
  batchUpdateInputSchema,
  deleteManyInputSchema,
  clearAllInputSchema,
  referencesInputSchema,
  importLegacyInputSchema,
  exportLegacyInputSchema,
  exportDirInputSchema,
  importDataFileInputSchema
} from '../../shared/schemas'
import { buildReferenceReport } from '../../shared/util/references'
import { importLegacyDataFile } from '../data/legacyImport'
import { exportLegacyDataFile } from '../data/legacyExport'
import { exportCsvFiles, importCsvFile } from '../data/csvIO'
import { exportExcelFile, importExcelFile } from '../data/excelIO'

export function registerDataIpc(deps: IpcHandlerDeps, handle: IpcRegistrar): void {
  const { dataService, undoRecorder, dataSync, typeSchemaStore } = deps
  handle('data:listItems', listItemsInputSchema, (req) => dataService.listItems(req.type))
  // 全量条目（跨类型）：统计面板需要全局视角，逐类型拉会 N 次往返
  handle('data:listAll', undefined, () => dataService.listAllItems())
  handle('data:createItem', createItemInputSchema, async (req) => {
    const item = await dataService.createItem(req)
    await dataSync.onDataChanged()
    return item
  })
  handle('data:updateItem', updateItemInputSchema, async (req) => {
    const item = await dataService.updateItem(req.id, req.data)
    await dataSync.onDataChanged()
    return item
  })
  handle('data:deleteItem', deleteItemInputSchema, async (req) => {
    const result = { deleted: await dataService.deleteItem(req.id) }
    await dataSync.onDataChanged()
    return result
  })
  handle('data:batchUpdate', batchUpdateInputSchema, async (req) => {
    const summary = await dataService.batchUpdate(req)
    await dataSync.onDataChanged()
    return summary
  })
  handle('data:deleteMany', deleteManyInputSchema, async (req) => {
    const summary = await dataService.deleteMany(req.ids)
    await dataSync.onDataChanged()
    return summary
  })
  // 清空所有数据：破坏性操作，confirm 位在主进程再校验一次（渲染层确认可被绕过）。
  // 内部走 deleteMany 的统一路径 ⇒ 整批落一条可撤销记录，用户可 Ctrl+Z 找回。
  handle('data:clearAll', clearAllInputSchema, async (req) => {
    if (req.confirm !== true) throw new Error('清空所有数据需要确认')
    const summary = await dataService.clearAll()
    await dataSync.onDataChanged()
    return summary
  })
  // 通用撤销/重做（用户手动操作的安全子集）：栈在主进程随库隔离
  handle('data:undo', undefined, () => undoRecorder.undo())
  handle('data:redo', undefined, () => undoRecorder.redo())
  handle('data:undoState', undefined, () => undoRecorder.getState())
  handle('data:references', referencesInputSchema, (req) => {
    const items = dataService.listAllItems()
    const target = items.find((item) => item.id === req.id)
    if (!target) {
      throw new Error('数据不存在，可能已被删除')
    }
    return buildReferenceReport(typeSchemaStore.getTypes(), items, { id: target.id, type: target.type })
  })
  handle('data:importLegacy', importLegacyInputSchema, async (req) => {
    const summary = importLegacyDataFile(req.path, dataService, typeSchemaStore.getTypes())
    await dataSync.onDataChanged()
    return summary
  })
  handle('data:exportLegacy', exportLegacyInputSchema, (req) =>
    exportLegacyDataFile(req.path, dataService, typeSchemaStore.getTypes())
  )
  // 游戏数据 CSV / Excel 导入导出（迁移 features/export.py）
  handle('data:exportCsv', exportDirInputSchema, (req) =>
    exportCsvFiles(req.dir, dataService, typeSchemaStore.getTypes())
  )
  handle('data:importCsv', importDataFileInputSchema, async (req) => {
    const summary = await importCsvFile(req.path, dataService, typeSchemaStore.getTypes())
    await dataSync.onDataChanged()
    return summary
  })
  handle('data:exportExcel', exportDirInputSchema, (req) =>
    exportExcelFile(req.dir, dataService, typeSchemaStore.getTypes())
  )
  handle('data:importExcel', importDataFileInputSchema, async (req) => {
    const summary = await importExcelFile(req.path, dataService, typeSchemaStore.getTypes())
    await dataSync.onDataChanged()
    return summary
  })
}
