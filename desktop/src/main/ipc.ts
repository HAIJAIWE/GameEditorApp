import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions } from 'electron'
import { ZodError, type ZodType } from 'zod'

import type { IpcChannel, IpcContract, IpcResult } from '../shared/ipc'
import {
  createItemInputSchema,
  deleteItemInputSchema,
  importLegacyInputSchema,
  listItemsInputSchema
} from '../shared/schemas'
import { listTypeSummaries } from '../shared/typeSchema'
import type { AppInfo } from '../shared/types'
import { importLegacyDataFile } from './data/legacyImport'
import type { DataService } from './data/service'

interface IpcHandlerDeps {
  dataService: DataService
  getAppInfo: () => AppInfo
}

/** 注册全部 IPC 处理器：入口统一做 zod 校验，结果统一包裹为 IpcResult */
export function registerIpcHandlers({ dataService, getAppInfo }: IpcHandlerDeps): void {
  handle('app:info', undefined, () => getAppInfo())
  handle('data:listTypes', undefined, () => listTypeSummaries())
  handle('data:listItems', listItemsInputSchema, (req) => dataService.listItems(req.type))
  handle('data:createItem', createItemInputSchema, (req) => dataService.createItem(req))
  handle('data:deleteItem', deleteItemInputSchema, async (req) => ({ deleted: await dataService.deleteItem(req.id) }))
  handle('data:importLegacy', importLegacyInputSchema, (req) => importLegacyDataFile(req.path, dataService))
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