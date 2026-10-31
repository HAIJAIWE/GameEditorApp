import { BrowserWindow, dialog, type OpenDialogOptions, type SaveDialogOptions } from 'electron'
import { readFileSync } from 'node:fs'
import type { IpcHandlerDeps, IpcRegistrar } from '../ipc'
import { importImageIntoLibrary } from '../imageImport'
import { ceshuChooseExportFileInputSchema } from '../../shared/schema/adapters'
import { reportFileDialogInputSchema } from '../../shared/schema/adapters'
import { engineExportFileDialogInputSchema } from '../../shared/schema/adapters'
import { dataSnapshotFileDialogInputSchema } from '../../shared/schema/adapters'
import { templateJsonDialogInputSchema } from '../../shared/schema/adapters'
import { CESHU_FORMAT_EXTENSIONS, CESHU_FORMAT_LABELS } from '../../shared/ceshu/reference'
import { buildImagePreviewDataUrl } from '../../shared/util/io'
import { log } from '../../shared/util/system'
import { ENGINE_EXTENSIONS as ENGINE_KIND_EXTENSIONS, ENGINE_LABELS as ENGINE_KIND_LABELS } from '../engineExport/engines'

export function registerDialogIpc(deps: IpcHandlerDeps, handle: IpcRegistrar): void {
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
  // 打开「项目文件夹」（一个游戏一个文件夹）：只选目录，合法性由 `ceshu:openProjectFolder` 校验
  handle('dialog:chooseProjectDir', undefined, async () => {
    const focused = BrowserWindow.getFocusedWindow()
    const options: OpenDialogOptions = {
      title: '打开项目文件夹（含 config.json）',
      properties: ['openDirectory']
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
  //
  // ⚠️ 返回的是**库相对路径**（`images/xxx.png`），不是用户选中的原路径：
  // 选中后立即把文件复制进 `<活跃库>/images/`，字段跟着库走 —— 工程搬家/备份/发给
  // 别人时图不丢。改之前存的是用户机器上的绝对路径，图片文件其实还在桌面/下载目录，
  // 而 `<库>/images/` 这套设施（图片库面板、未用清理）从来没有人往里放过图。
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
      const dataUrl = buildImagePreviewDataUrl(path, buffer.byteLength, buffer.toString('base64'))
      const imported = importImageIntoLibrary(path, deps.libraryManager.activeDir())
      if (!imported.ok) {
        // 入库失败不静默退回原路径 —— 那会把"图在库外"的老问题重新引进来
        log.warn('图片入库失败，放弃本次选择', { path, error: imported.error })
        return { path: null, dataUrl: '', bytes: 0, error: imported.error }
      }
      // 预览 dataUrl 仍按原文件算（库里那份内容相同），省得再读一次盘
      return { path: imported.relativePath, bytes: imported.bytes, dataUrl }
    } catch (error) {
      log.warn('读取图片失败', { path, error: error instanceof Error ? error.message : String(error) })
      return { path, dataUrl: '', bytes: 0 }
    }
  })
  // 选一个会话附件文件（不复制；复制由 `attachments:add` 负责，保持职责单一）
  handle('dialog:chooseAttachmentFile', undefined, async () => {
    const focused = BrowserWindow.getFocusedWindow()
    const options: OpenDialogOptions = {
      title: '选择附件',
      properties: ['openFile']
    }
    const result = focused ? await dialog.showOpenDialog(focused, options) : await dialog.showOpenDialog(options)
    return { path: result.canceled || result.filePaths.length === 0 ? null : (result.filePaths[0] ?? null) }
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
      // 记得上次导出路径就回填它（直接落在游戏文件上，一键确认）；否则回落默认名。
      defaultPath: req.defaultPath ?? `${req.defaultName ?? 'GameData'}${extension}`,
      filters: [{ name: label, extensions: [extension.replace('.', '')] }]
    }
    const focused = BrowserWindow.getFocusedWindow()
    const result = focused ? await dialog.showSaveDialog(focused, options) : await dialog.showSaveDialog(options)
    return { path: result.canceled || !result.filePath ? null : result.filePath }
  })
  handle('dialog:chooseDataSnapshotFile', dataSnapshotFileDialogInputSchema, async (req) => {
    const extension = req.format === 'csv' ? '.csv' : '.json'
    const label = req.format === 'csv' ? '数据快照 (CSV)' : '数据快照 (JSON)'
    const options: SaveDialogOptions = {
      title: `导出${label}`,
      // 记得上次导出路径就回填（快照通常固定落仓库里某处，便于 git 跟踪）；否则回落默认名。
      defaultPath: req.defaultPath ?? `${req.defaultName ?? 'GameData.snapshot'}${extension}`,
      filters: [{ name: label, extensions: [extension.slice(1)] }]
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
