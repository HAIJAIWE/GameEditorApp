import { BrowserWindow, dialog, type OpenDialogOptions, type SaveDialogOptions } from 'electron'
import type { IpcHandlerDeps, IpcRegistrar } from '../ipc'
import {
  attrSystemSaveInputSchema,
  attrSystemJsonExportInputSchema,
  attrSystemJsonImportInputSchema,
  attrJsonDialogInputSchema,
  attrGameConfigExportInputSchema
} from '../../shared/schema/schemas'
import { exportAttrGameConfigFile } from '../attr/attrGameConfigExport'
import { exportAttrSystemJsonFile, importAttrSystemJsonFile } from '../attr/attrSystemJsonFile'

export function registerAttrIpc(deps: IpcHandlerDeps, handle: IpcRegistrar): void {
  const { attrSystemStore } = deps
  handle('attrSystem:get', undefined, () => attrSystemStore.getSystem())
  handle('attrSystem:save', attrSystemSaveInputSchema, (req) => attrSystemStore.saveSystem(req.system))
  handle('attrSystem:exportGameConfig', attrGameConfigExportInputSchema, (req) =>
    exportAttrGameConfigFile(req.path, req.system)
  )
  handle('attrSystem:exportJson', attrSystemJsonExportInputSchema, (req) =>
    exportAttrSystemJsonFile(req.path, req.system)
  )
  handle('attrSystem:importJson', attrSystemJsonImportInputSchema, (req) =>
    importAttrSystemJsonFile(req.path)
  )
  handle('dialog:chooseAttrSystemJsonFile', attrJsonDialogInputSchema, async (req) => {
    const filters = [{ name: 'JSON 文件', extensions: ['json'] }]
    const focused = BrowserWindow.getFocusedWindow()
    if (req.mode === 'save') {
      const options: SaveDialogOptions = {
        title: '导出属性系统（JSON）',
        defaultPath: req.defaultName ?? 'attr_system.json',
        filters
      }
      const result = focused ? await dialog.showSaveDialog(focused, options) : await dialog.showSaveDialog(options)
      return { path: result.canceled || !result.filePath ? null : result.filePath }
    }
    const options: OpenDialogOptions = {
      title: '导入属性系统（JSON）',
      filters,
      properties: ['openFile']
    }
    const result = focused ? await dialog.showOpenDialog(focused, options) : await dialog.showOpenDialog(options)
    return { path: result.canceled || result.filePaths.length === 0 ? null : (result.filePaths[0] ?? null) }
  })
}
