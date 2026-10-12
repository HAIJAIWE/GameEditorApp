import { BrowserWindow, dialog, type OpenDialogOptions, type SaveDialogOptions } from 'electron'
import { readFileSync } from 'node:fs'
import type { IpcHandlerDeps, IpcRegistrar } from '../ipc'
import {
  ceshuChooseExportFileInputSchema,
  reportFileDialogInputSchema,
  engineExportFileDialogInputSchema,
  templateJsonDialogInputSchema
} from '../../shared/schemas'
import { CESHU_FORMAT_EXTENSIONS, CESHU_FORMAT_LABELS } from '../../shared/ceshuConstants'
import { buildImagePreviewDataUrl } from '../../shared/imagePreview'
import { log } from '../../shared/logger'
import { ENGINE_EXTENSIONS as ENGINE_KIND_EXTENSIONS, ENGINE_LABELS as ENGINE_KIND_LABELS } from '../engineExport/engines'

export function registerDialogIpc(_deps: IpcHandlerDeps, handle: IpcRegistrar): void {
  // 游戏数据 CSV / Excel 的文件/目录选择（导出与导入共用；取消返回 null）
  handle('dialog:chooseExportDir', undefined, async () => {
    const focused = BrowserWindow.getFocusedWindow()
    const options: OpenDialogOptions = {
      title: '选择导出目录',
      properties: ['openDirectory', 'createDirectory']
    }
    const result = focused ? await dialog.showOpenDialog(focused, options) : await dialog.showOpenDialog(options)
    return { path: result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0] ?? null }
  })
  handle('dialog:chooseCsvFile', undefined, async () => {
    const focused = BrowserWindow.getFocusedWindow()
    const options: OpenDialogOptions = {
      title: '导入 CSV',
      filters: [{ name: 'CSV 文件', extensions: ['csv'] }],
      properties: ['openFile']
    }
    const result = focused ? await dialog.showOpenDialog(focused, options) : await dialog.showOpenDialog(options)
    return { path: result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0] ?? null }
  })
  handle('dialog:chooseExcelFile', undefined, async () => {
    const focused = BrowserWindow.getFocusedWindow()
    const options: OpenDialogOptions = {
      title: '导入 Excel',
      filters: [{ name: 'Excel 文件', extensions: ['xlsx'] }],
      properties: ['openFile']
    }
    const result = focused ? await dialog.showOpenDialog(focused, options) : await dialog.showOpenDialog(options)
    return { path: result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0] ?? null }
  })
  // 选一张本地图片（数据编辑器「图片」字段）
  handle('dialog:chooseImageFile', undefined, async () => {
    const focused = BrowserWindow.getFocusedWindow()
    const options: OpenDialogOptions = {
      title: '选择图片',
      properties: ['openFile'],
      filters: [{ name: '图片文件', extensions: ['png', 'jpg', 'jpeg', 'bmp', 'gif'] }]
    }
    const result = focused ? await dialog.showOpenDialog(focused, options) : await dialog.showOpenDialog(options)
    const path = result.canceled || result.filePaths.length === 0 ? null : (result.filePaths[0] ?? null)
    if (path === null) return { path: null, dataUrl: '', bytes: 0 }
    try {
      const buffer = readFileSync(path)
      return { path, bytes: buffer.byteLength, dataUrl: buildImagePreviewDataUrl(path, buffer.byteLength, buffer.toString('base64')) }
    } catch (error) {
      log.warn('读取图片失败', { path, error: error instanceof Error ? error.message : String(error) })
      return { path, dataUrl: '', bytes: 0 }
    }
  })
  handle('dialog:chooseImageSaveDir', undefined, async () => {
    const focused = BrowserWindow.getFocusedWindow()
    const options: OpenDialogOptions = {
      title: '选择生图保存目录',
      properties: ['openDirectory', 'createDirectory']
    }
    const result = focused ? await dialog.showOpenDialog(focused, options) : await dialog.showOpenDialog(options)
    return { path: result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0] ?? null }
  })
  handle('dialog:chooseTemplateJsonFile', templateJsonDialogInputSchema, async (req) => {
    const focused = BrowserWindow.getFocusedWindow()
    if (req.mode === 'open') {
      const options: OpenDialogOptions = {
        title: '选择模板 JSON 文件',
        filters: [{ name: 'JSON 文件', extensions: ['json'] }],
        properties: ['openFile']
      }
      const result = focused ? await dialog.showOpenDialog(focused, options) : await dialog.showOpenDialog(options)
      return { path: result.canceled || result.filePaths.length === 0 ? null : result.filePaths[0] }
    }
    const options: SaveDialogOptions = {
      title: '导出模板 JSON 文件',
      defaultPath: `${req.defaultName || 'custom_templates'}.json`,
      filters: [{ name: 'JSON 文件', extensions: ['json'] }]
    }
    const result = focused ? await dialog.showSaveDialog(focused, options) : await dialog.showSaveDialog(options)
    return { path: result.canceled || !result.filePath ? null : result.filePath }
  })
  handle('dialog:chooseCeshuExportFile', ceshuChooseExportFileInputSchema, async (req) => {
    const extension = CESHU_FORMAT_EXTENSIONS[req.format]
    const options: SaveDialogOptions = {
      title: `导出策划书（${CESHU_FORMAT_LABELS[req.format]}）`,
      defaultPath: `${req.defaultName}${extension}`,
      filters: [{ name: CESHU_FORMAT_LABELS[req.format], extensions: [extension.slice(1)] }]
    }
    const focused = BrowserWindow.getFocusedWindow()
    const result = focused ? await dialog.showSaveDialog(focused, options) : await dialog.showSaveDialog(options)
    return { path: result.canceled || !result.filePath ? null : result.filePath }
  })
  handle('dialog:chooseReportFile', reportFileDialogInputSchema, async (req) => {
    const ext = req.extension.startsWith('.') ? req.extension : `.${req.extension}`
    const options: SaveDialogOptions = {
      title: `导出${req.label}`,
      defaultPath: `${req.defaultName}${ext}`,
      filters: [{ name: req.label, extensions: [ext.slice(1)] }]
    }
    const focused = BrowserWindow.getFocusedWindow()
    const result = focused ? await dialog.showSaveDialog(focused, options) : await dialog.showSaveDialog(options)
    return { path: result.canceled || !result.filePath ? null : result.filePath }
  })
  handle('dialog:chooseEngineExportFile', engineExportFileDialogInputSchema, async (req) => {
    const extension = req.engine === 'lua' ? '.lua' : ENGINE_KIND_EXTENSIONS[req.engine]
    const label = req.engine === 'lua' ? 'Lua 数据模块' : `${ENGINE_KIND_LABELS[req.engine]} 数据`
    const options: SaveDialogOptions = {
      title: `导出为 ${label} 格式`,
      defaultPath: `${req.defaultName}${extension}`,
      filters: [{ name: label, extensions: [extension.replace('.', '')] }]
    }
    const focused = BrowserWindow.getFocusedWindow()
    const result = focused ? await dialog.showSaveDialog(focused, options) : await dialog.showSaveDialog(options)
    return { path: result.canceled || !result.filePath ? null : result.filePath }
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
