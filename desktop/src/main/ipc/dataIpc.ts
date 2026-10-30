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
  importDataFileInputSchema,
  previewImportInputSchema,
  applyImportInputSchema,
  dataSnapshotInputSchema
} from '../../shared/schema/core/schemas'
import { buildReferenceReport } from '../../shared/util/references'
import { importLegacyDataFile } from '../data/legacyImport'
import { exportLegacyDataFile } from '../data/legacyExport'
import { applyParsedImport, exportCsvFiles, importCsvFile, parseCsvImport } from '../data/csvIO'
import { exportExcelFile, importExcelFile, parseExcelImport } from '../data/excelIO'
import { buildImportPreview, ImportSessionStore } from '../data/importSession'
import { type DataSnapshotResult, exportDataSnapshot } from '../data/snapshotExport'

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
  // 游戏数据 CSV / Excel 导入导出（迁移 features/export）
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

  /*
   * 导入 = 预览 + 确认两步。
   * 导入是不可撤销的批量写（撤销栈只记单条），先让用户看清「改了什么」再落，
   * 否则一次误导入只能靠备份回滚。解析结果暂存在主进程，apply 直接用，
   * 不再读一遍文件（两次读取之间文件可能已变，也可能读出错落）。
   */
  const importSessions = new ImportSessionStore()
  handle('data:previewImport', previewImportInputSchema, async (req) => {
    const types = typeSchemaStore.getTypes()
    const parsed =
      req.kind === 'excel' ? await parseExcelImport(req.path, types) : await parseCsvImport(req.path, types)
    const preview = buildImportPreview(parsed.records, dataService.listAllItems(), {
      kind: req.kind,
      filePath: req.path,
      skipped: parsed.skipped,
      unknownTypes: parsed.unknownTypes,
      missingIdSources: parsed.missingIdSources
    })
    const previewId = importSessions.put(req.kind, req.path, parsed)
    return { previewId, preview }
  })
  handle('data:applyImport', applyImportInputSchema, async (req) => {
    const session = importSessions.take(req.previewId)
    if (session === undefined) {
      // 会话过期（10 分钟）或已被消费过：让用户重新走一遍预览，而不是猜着写
      throw new Error('导入会话已失效，请重新选择文件')
    }
    const summary = await applyParsedImport(session.filePath, session, dataService)
    await dataSync.onDataChanged()
    return summary
  })
  // 数据快照导出（审查件，不是给游戏运行吃）：取全量数据 + 类型 schema，渲染成确定性可 diff 的 JSON/CSV
  handle('data:exportSnapshot', dataSnapshotInputSchema, (req): DataSnapshotResult => exportDataSnapshot(dataService.listAllItems(), typeSchemaStore.getTypes(), { format: req.format, targetPath: req.path }))
}
