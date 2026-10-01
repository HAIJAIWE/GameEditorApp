import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions, type SaveDialogOptions } from 'electron'
import { ZodError, type ZodType } from 'zod'

import type { IpcChannel, IpcContract, IpcResult } from '../shared/ipc'
import {
  ceshuCreateInputSchema,
  ceshuGetInputSchema,
  ceshuSaveChapterInputSchema,
  createItemInputSchema,
  deleteItemInputSchema,
  exportLegacyInputSchema,
  importLegacyInputSchema,
  listItemsInputSchema,
  updateItemInputSchema
} from '../shared/schemas'
import { isChapterKey } from '../shared/ceshuConstants'
import { listTypeSummaries } from '../shared/typeSchema'
import type { AppInfo } from '../shared/types'
import type { CeshuManager } from './ceshu/manager'
import { exportLegacyDataFile } from './data/legacyExport'
import { importLegacyDataFile } from './data/legacyImport'
import type { DataService } from './data/service'

interface IpcHandlerDeps {
  dataService: DataService
  ceshuManager: CeshuManager
  getAppInfo: () => AppInfo
}

/** 注册全部 IPC 处理器：入口统一做 zod 校验，结果统一包裹为 IpcResult */
export function registerIpcHandlers({ dataService, ceshuManager, getAppInfo }: IpcHandlerDeps): void {
  handle('app:info', undefined, () => getAppInfo())
  handle('data:listTypes', undefined, () => listTypeSummaries())
  handle('data:listItems', listItemsInputSchema, (req) => dataService.listItems(req.type))
  handle('data:createItem', createItemInputSchema, (req) => dataService.createItem(req))
  handle('data:updateItem', updateItemInputSchema, (req) => dataService.updateItem(req.id, req.data))
  handle('data:deleteItem', deleteItemInputSchema, async (req) => ({ deleted: await dataService.deleteItem(req.id) }))
  handle('data:importLegacy', importLegacyInputSchema, (req) => importLegacyDataFile(req.path, dataService))
  handle('data:exportLegacy', exportLegacyInputSchema, (req) => exportLegacyDataFile(req.path, dataService))
  handle('ceshu:list', undefined, () => ceshuManager.list())
  handle('ceshu:create', ceshuCreateInputSchema, (req) => ceshuManager.create(req))
  handle('ceshu:get', ceshuGetInputSchema, (req) => ceshuManager.get(req.id))
  handle('ceshu:saveChapter', ceshuSaveChapterInputSchema, (req) => {
    if (!isChapterKey(req.chapter)) {
      throw new Error(`未知章节：${req.chapter}`)
    }
    return ceshuManager.saveChapter(req.id, req.chapter, req.data)
  })
  handle('dialog:chooseSaveJsonFile', undefined, async () => {
    const options: SaveDialogOptions = {
      title: '导出为旧版数据文件（JSON）',
      defaultPath: 'default.json',
      filters: [{ name: 'JSON 数据文件', extensions: ['json'] }]
    }
    const focused = BrowserWindow.getFocusedWindow()
    const result = focused ? await dialog.showSaveDialog(focused, options) : await dialog.showSaveDialog(options)
    return { path: result.canceled || !result.filePath ? null : result.filePath }
  })
  handle('dialog:chooseJsonFile', undefined, async () => {
    const options: OpenDialogOptions = {
      title: '选择旧版数据文件（default.json）',
      filters: [{ name: 'JSON 数据文件', extensions: ['json'] }],
      properties: ['openFile']
    }
    const focused = BrowserWindow.getFocusedWindow()
    const result = focused ? await dialog.showOpenDialog(focused, options) : await dialog.showOpenDialog(options)
    const path = result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0]
    return { path }
  })
}

function handle<C extends IpcChannel>(
  channel: C,
  schema: ZodType | undefined,
  handler: (req: IpcContract[C]['req']) => IpcContract[C]['res'] | Promise<IpcContract[C]['res']>
): void {
  ipcMain.handle(channel, async (_event, raw: unknown): Promise<IpcResult<IpcContract[C]['res']>> => {
    try {
      const req = (schema ? schema.parse(raw) : raw) as IpcContract[C]['req']
      const data = await handler(req)
      return { ok: true, data }
    } catch (error) {
      return {
        ok: false,
        error: {
          code: error instanceof ZodError ? 'VALIDATION_ERROR' : error instanceof Error ? error.name : 'UNKNOWN',
          message: error instanceof Error ? error.message : String(error)
        }
      }
    }
  })
}