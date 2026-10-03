import { BrowserWindow, dialog, ipcMain, type OpenDialogOptions, type SaveDialogOptions } from 'electron'
import { ZodError, type ZodType } from 'zod'

import type { IpcChannel, IpcContract, IpcResult } from '../shared/ipc'
import {
  attrGameConfigExportInputSchema,
  attrJsonDialogInputSchema,
  attrSystemJsonExportInputSchema,
  attrSystemJsonImportInputSchema,
  attrSystemSaveInputSchema,
  batchUpdateInputSchema,
  ceshuAiGenerateInputSchema,
  ceshuApplyPresetInputSchema,
  ceshuChecklistExportInputSchema,
  ceshuChooseExportFileInputSchema,
  ceshuCreateInputSchema,
  ceshuDeriveInputSchema,
  ceshuDiffExportInputSchema,
  ceshuDiffInputSchema,
  ceshuDataGenInputSchema,
  ceshuExportInputSchema,
  ceshuGetInputSchema,
  ceshuSaveChapterInputSchema,
  ceshuReviewExportInputSchema,
  createItemInputSchema,
  deleteItemInputSchema,
  deleteManyInputSchema,
  exportLegacyInputSchema,
  importLegacyInputSchema,
  listItemsInputSchema,
  notesAddInputSchema,
  notesDeleteInputSchema,
  notesListInputSchema,
  notesUpdateInputSchema,
  referencesInputSchema,
  templateJsonDialogInputSchema,
  templatesDeleteInputSchema,
  templatesExportInputSchema,
  templatesImportInputSchema,
  templatesListInputSchema,
  templatesSaveInputSchema,
  templatesUpdateInputSchema,
  schemaSaveInputSchema,
  updateItemInputSchema
} from '../shared/schemas'
import {
  CESHU_FORMAT_EXTENSIONS,
  CESHU_FORMAT_LABELS,
  isChapterKey
} from '../shared/ceshuConstants'
import { buildChapterPrompt, buildReviewPrompts, filterGeneratedFields, mergeChapterDraft, parseLlmJson, parseReviewResponse } from '../shared/ceshuAi'
import {
  DATA_GEN_ERROR_EMPTY,
  DATA_GEN_ERROR_NO_TYPE,
  DATA_GEN_ERROR_UNPARSABLE,
  buildDataGenPrompt,
  buildDataGenSummaryMessage,
  clampDataGenCount,
  normalizeDataGenCandidates,
  resolveSelectedDataTypes
} from '../shared/ceshuDataGen'
import { runChecklist } from '../shared/ceshuChecklist'
import { buildVersionDiff } from '../shared/ceshuDiff'
import { buildFieldDepsReport } from '../shared/ceshuFieldDeps'
import { computeChapterProgress } from '../shared/ceshuModel'
import { buildReferenceReport } from '../shared/references'
import { scoreCeshu } from '../shared/ceshuScorer'
import { validateCeshu } from '../shared/ceshuValidation'
import { buildWordStatsReport } from '../shared/ceshuWordStats'
import type { AppInfo } from '../shared/types'
import type { AttrSystemStore } from './attr/attrSystemStore'
import { exportAttrGameConfigFile } from './attr/attrGameConfigExport'
import { exportAttrSystemJsonFile, importAttrSystemJsonFile } from './attr/attrSystemJsonFile'
import type { CeshuManager } from './ceshu/manager'
import type { CeshuNotesStore } from './ceshu/notesStore'
import type { CeshuTemplateStore } from './ceshu/templateStore'
import { exportCeshuDocument } from './ceshu/export/exporter'
import { exportTextReportFile } from './ceshu/reportExport'
import { exportLegacyDataFile } from './data/legacyExport'
import { importLegacyDataFile } from './data/legacyImport'
import type { DataService } from './data/service'
import type { LlmClient } from './llm/client'
import type { TypeSchemaStore } from './schema/store'

interface IpcHandlerDeps {
  dataService: DataService
  ceshuManager: CeshuManager
  ceshuNotesStore: CeshuNotesStore
  ceshuTemplateStore: CeshuTemplateStore
  typeSchemaStore: TypeSchemaStore
  attrSystemStore: AttrSystemStore
  llmClient: LlmClient
  getAppInfo: () => AppInfo
}

/** 注册全部 IPC 处理器：入口统一做 zod 校验，结果统一包裹为 IpcResult */
export function registerIpcHandlers({
  dataService,
  ceshuManager,
  ceshuNotesStore,
  ceshuTemplateStore,
  typeSchemaStore,
  attrSystemStore,
  llmClient,
  getAppInfo
}: IpcHandlerDeps): void {
  handle('app:info', undefined, () => getAppInfo())
  handle('schema:list', undefined, () => typeSchemaStore.getTypes())
  handle('schema:save', schemaSaveInputSchema, (req) => typeSchemaStore.saveTypes(req.types))
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
  handle('ceshu:applyPreset', ceshuApplyPresetInputSchema, (req) =>
    ceshuManager.applyPreset(req.id, req.presetKey)
  )
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
  handle('ceshu:aiGenerateData', ceshuDataGenInputSchema, async (req) => {
    const doc = ceshuManager.get(req.id)
    const types = typeSchemaStore.getTypes()
    const selected = resolveSelectedDataTypes(types, req.dataTypes)
    if (selected.length === 0) {
      throw new Error(DATA_GEN_ERROR_NO_TYPE)
    }
    const built = buildDataGenPrompt(doc, types, selected, clampDataGenCount(req.count), req.instruction.trim())
    const { model, content } = await llmClient.generate(built.system, built.prompt)
    const parsed = parseLlmJson(content)
    if (Object.keys(parsed).length === 0) {
      throw new Error(DATA_GEN_ERROR_UNPARSABLE)
    }
    const normalized = normalizeDataGenCandidates(parsed, selected, new Set(types.map((type) => type.pluralKey)))
    if (normalized.total === 0) {
      throw new Error(DATA_GEN_ERROR_EMPTY)
    }
    return {
      model,
      candidates: normalized.candidates,
      generatedCounts: normalized.generatedCounts,
      total: normalized.total,
      summary: buildDataGenSummaryMessage(normalized.generatedCounts)
    }
  })
  handle('ceshu:aiReview', ceshuGetInputSchema, async (req) => {
    const doc = ceshuManager.get(req.id)
    const progress = computeChapterProgress(doc)
    const validationErrors = validateCeshu(doc)
    const built = buildReviewPrompts(doc, {
      progressTotal: progress.total ?? 0,
      validationCount: validationErrors.length
    })
    const { model, content } = await llmClient.generate(built.system, built.prompt)
    return {
      model,
      ...parseReviewResponse(content),
      progressTotal: progress.total ?? 0,
      validationCount: validationErrors.length
    }
  })
  handle('ceshu:exportReviewReport', ceshuReviewExportInputSchema, (req) =>
    exportTextReportFile(req.path, req.content, '审阅报告')
  )
  handle('ceshu:checklist', ceshuGetInputSchema, (req) => runChecklist(ceshuManager.get(req.id)))
  handle('ceshu:autoFill', ceshuGetInputSchema, (req) => ceshuManager.autoFill(req.id))
  handle('ceshu:exportChecklistReport', ceshuChecklistExportInputSchema, (req) =>
    exportTextReportFile(req.path, req.content, '检查报告')
  )
  handle('ceshu:diff', ceshuDiffInputSchema, (req) => {
    if (req.id === req.otherId) {
      throw new Error('请选择两个不同的版本')
    }
    return buildVersionDiff(ceshuManager.get(req.id), ceshuManager.get(req.otherId))
  })
  handle('ceshu:exportDiffReport', ceshuDiffExportInputSchema, (req) =>
    exportTextReportFile(req.path, req.content, '对比报告')
  )
  handle('ceshu:notes:list', notesListInputSchema, (req) => ceshuNotesStore.list(req.id, req.chapterKey))
  handle('ceshu:notes:add', notesAddInputSchema, (req) => {
    if (!isChapterKey(req.chapterKey)) {
      throw new Error(`未知章节：${req.chapterKey}`)
    }
    return ceshuNotesStore.add(req.id, req.chapterKey, req.content, req.author)
  })
  handle('ceshu:notes:update', notesUpdateInputSchema, (req) =>
    ceshuNotesStore.update(req.id, req.noteId, req.content, req.author)
  )
  handle('ceshu:notes:delete', notesDeleteInputSchema, (req) => ceshuNotesStore.remove(req.id, req.noteId))
  handle('ceshu:templates:list', templatesListInputSchema, (req) => ceshuTemplateStore.list(req.chapterKey))
  handle('ceshu:templates:save', templatesSaveInputSchema, (req) => {
    if (req.chapterKey && !isChapterKey(req.chapterKey)) {
      throw new Error(`未知章节：${req.chapterKey}`)
    }
    return ceshuTemplateStore.save(req)
  })
  handle('ceshu:templates:delete', templatesDeleteInputSchema, (req) => ceshuTemplateStore.remove(req.id))
  handle('ceshu:templates:update', templatesUpdateInputSchema, (req) => {
    if (req.chapterKey && !isChapterKey(req.chapterKey)) {
      throw new Error(`未知章节：${req.chapterKey}`)
    }
    return ceshuTemplateStore.update(req.id, {
      name: req.name,
      description: req.description,
      tags: req.tags,
      chapterKey: req.chapterKey,
      data: req.data,
      sourceGame: req.sourceGame
    })
  })
  handle('ceshu:templates:export', templatesExportInputSchema, (req) => ceshuTemplateStore.exportAll(req.path))
  handle('ceshu:templates:import', templatesImportInputSchema, (req) =>
    ceshuTemplateStore.importFrom(req.path, req.overwrite)
  )
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
  handle('ceshu:wordStats', ceshuGetInputSchema, (req) => buildWordStatsReport(ceshuManager.get(req.id)))
  handle('ceshu:fieldDeps', ceshuGetInputSchema, (req) => buildFieldDepsReport(ceshuManager.get(req.id)))
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