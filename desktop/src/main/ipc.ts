import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions, type SaveDialogOptions } from 'electron'
import { ZodError, type ZodType } from 'zod'

import type { IpcChannel, IpcContract, IpcResult } from '../shared/ipc'
import {
  batchUpdateInputSchema,
  ceshuAiGenerateInputSchema,
  ceshuChooseExportFileInputSchema,
  ceshuCreateInputSchema,
  ceshuDeriveInputSchema,
  ceshuExportInputSchema,
  ceshuGetInputSchema,
  ceshuSaveChapterInputSchema,
  createItemInputSchema,
  deleteItemInputSchema,
  deleteManyInputSchema,
  exportLegacyInputSchema,
  importLegacyInputSchema,
  listItemsInputSchema,
  referencesInputSchema,
  schemaSaveInputSchema,
  updateItemInputSchema
} from '../shared/schemas'
import {
  CESHU_FORMAT_EXTENSIONS,
  CESHU_FORMAT_LABELS,
  isChapterKey
} from '../shared/ceshuConstants'
import { buildChapterPrompt, filterGeneratedFields, mergeChapterDraft, parseLlmJson } from '../shared/ceshuAi'
import { buildReferenceReport } from '../shared/references'
import { scoreCeshu } from '../shared/ceshuScorer'
import { validateCeshu } from '../shared/ceshuValidation'
import type { AppInfo } from '../shared/types'
import type { CeshuManager } from './ceshu/manager'
import { exportCeshuDocument } from './ceshu/export/exporter'
import { exportLegacyDataFile } from './data/legacyExport'
import { importLegacyDataFile } from './data/legacyImport'
import type { DataService } from './data/service'
import type { LlmClient } from './llm/client'
import type { TypeSchemaStore } from './schema/store'

interface IpcHandlerDeps {
  dataService: DataService
  ceshuManager: CeshuManager
  typeSchemaStore: TypeSchemaStore
  llmClient: LlmClient
  getAppInfo: () => AppInfo
}

/** 注册全部 IPC 处理器：入口统一做 zod 校验，结果统一包裹为 IpcResult */
export function registerIpcHandlers({
  dataService,
  ceshuManager,
  typeSchemaStore,
  llmClient,
  getAppInfo
}: IpcHandlerDeps): void {
  handle('app:info', undefined, () => getAppInfo())
  handle('schema:list', undefined, () => typeSchemaStore.getTypes())
  handle('schema:save', schemaSaveInputSchema, (req) => typeSchemaStore.saveTypes(req.types))
  handle('data:listItems', listItemsInputSchema, (req) => dataService.listItems(req.type))
  handle('data:createItem', createItemInputSchema, (req) => dataService.createItem(req))
  handle('data:updateItem', updateItemInputSchema, (req) => dataService.updateItem(req.id, req.data))
  handle('data:deleteItem', deleteItemInputSchema, async (req) => ({ deleted: await dataService.deleteItem(req.id) }))
  handle('data:batchUpdate', batchUpdateInputSchema, (req) => dataService.batchUpdate(req))
  handle('data:deleteMany', deleteManyInputSchema, (req) => dataService.deleteMany(req.ids))
  handle('data:references', referencesInputSchema, (req) => {
    const items = dataService.listAllItems()
    const target = items.find((item) => item.id === req.id)
    if (!target) {
      throw new Error('数据不存在，可能已被删除')
    }
    return buildReferenceReport(typeSchemaStore.getTypes(), items, { id: target.id, type: target.type })
  })
  handle('data:importLegacy', importLegacyInputSchema, (req) =>
    importLegacyDataFile(req.path, dataService, typeSchemaStore.getTypes())
  )
  handle('data:exportLegacy', exportLegacyInputSchema, (req) =>
    exportLegacyDataFile(req.path, dataService, typeSchemaStore.getTypes())
  )
  handle('ceshu:list', undefined, () => ceshuManager.list())
  handle('ceshu:create', ceshuCreateInputSchema, (req) => ceshuManager.create(req))
  handle('ceshu:get', ceshuGetInputSchema, (req) => ceshuManager.get(req.id))
  handle('ceshu:saveChapter', ceshuSaveChapterInputSchema, (req) => {
    if (!isChapterKey(req.chapter)) {
      throw new Error(`未知章节：${req.chapter}`)
    }
    return ceshuManager.saveChapter(req.id, req.chapter, req.data, {
      style: req.style,
      moduleType: req.moduleType
    })
  })
  handle('ceshu:export', ceshuExportInputSchema, (req) => {
    const doc = ceshuManager.get(req.id)
    return exportCeshuDocument(doc, req.format, req.path)
  })
  handle('ceshu:versions', ceshuGetInputSchema, (req) => ceshuManager.versions(req.id))
  handle('ceshu:derive', ceshuDeriveInputSchema, (req) => ceshuManager.derive(req.id, req.note))
  handle('ceshu:setActive', ceshuGetInputSchema, (req) => ceshuManager.setActive(req.id))
  handle('ceshu:changelog', ceshuGetInputSchema, (req) => ceshuManager.changelog(req.id))
  handle('ceshu:validate', ceshuGetInputSchema, (req) => validateCeshu(ceshuManager.get(req.id)))
  handle('ceshu:score', ceshuGetInputSchema, (req) => scoreCeshu(ceshuManager.get(req.id)))
  handle('ceshu:aiGenerateChapter', ceshuAiGenerateInputSchema, async (req) => {
    if (!isChapterKey(req.chapter)) {
      throw new Error(`未知章节：${req.chapter}`)
    }
    const base = ceshuManager.get(req.id)
    const draft = req.fullGenerate?.draft ?? {}
    // 一键生成：draft（已生成章节 + meta 种子）仅作为提示词上下文合并，不写盘
    const doc = Object.keys(draft).length > 0 ? mergeChapterDraft(base, draft) : base
    const built = buildChapterPrompt(doc, req.chapter, {
      onlyEmpty: req.onlyEmpty,
      styleOverride: req.fullGenerate?.styleKey,
      extraPrompt: req.fullGenerate?.extraPrompt
    })
    if (req.onlyEmpty && built.fields.length === 0) {
      // 无空字段：不调用 LLM，直接返回空结果（UI 提示「无需补全」）
      return { model: '', fields: {}, rawText: '' }
    }
    const { model, content } = await llmClient.generate(built.system, built.prompt)
    const parsed = parseLlmJson(content)
    return { model, fields: filterGeneratedFields(doc, req.chapter, parsed), rawText: content }
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