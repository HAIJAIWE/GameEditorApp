import { readFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  BrowserWindow,
  dialog,
  ipcMain,
  type IpcMainInvokeEvent,
  type OpenDialogOptions,
  type SaveDialogOptions
} from 'electron'
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
  ceshuConfirmSystemsInputSchema,
  ceshuSyncDataInputSchema,
  ceshuChecklistExportInputSchema,
  ceshuChooseExportFileInputSchema,
  ceshuCreateInputSchema,
  ceshuDeriveInputSchema,
  ceshuDiffExportInputSchema,
  ceshuDiffInputSchema,
  ceshuDataGenInputSchema,
  ceshuExportInputSchema,
  agentApprovalResponseInputSchema,
  agentChatInputSchema,
  agentInteractionResponseInputSchema,
  agentExecuteToolInputSchema,
  agentFeedbackInputSchema,
  ceshuGetInputSchema,
  agentDraftLoadInputSchema,
  agentDraftSaveInputSchema,
  engineExportFileDialogInputSchema,
  libraryCreateInputSchema,
  libraryNameInputSchema,
  libraryRenameInputSchema,
  ceshuRenameInputSchema,
  ceshuSaveChapterInputSchema,
  ceshuReviewExportInputSchema,
  createItemInputSchema,
  deleteItemInputSchema,
  deleteManyInputSchema,
  engineExportInputSchema,
  exportDirInputSchema,
  exportLegacyInputSchema,
  importDataFileInputSchema,
  importLegacyInputSchema,
  imageGenInputSchema,
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
  fieldIdSuggestInputSchema,
  fieldTemplateNameInputSchema,
  fieldTemplateSaveInputSchema,
  appLogInputSchema,
  windowModeInputSchema,
  updateItemInputSchema,
  backupCreateInputSchema,
  backupRestoreInputSchema,
  backupDeleteInputSchema,
  secretNameInputSchema,
  setSecretInputSchema
} from '../shared/schemas'
import { log } from '../shared/logger'
import type { LogLevel } from '../shared/types'
import {
  CESHU_FORMAT_EXTENSIONS,
  CESHU_FORMAT_LABELS,
  isChapterKey,
  type SystemEntry
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
import { buildFieldIdPrompt, parseFieldIdCandidates } from '../shared/fieldIdAi'
import { buildVersionDiff } from '../shared/ceshuDiff'
import { buildFieldDepsReport } from '../shared/ceshuFieldDeps'
import { computeChapterProgress } from '../shared/ceshuModel'
import { buildSystemConfirmResult } from '../shared/ceshuSystemConfirm'
import { buildReferenceReport } from '../shared/references'
import { scoreCeshu } from '../shared/ceshuScorer'
import { validateCeshu } from '../shared/ceshuValidation'
import { buildWordStatsReport } from '../shared/ceshuWordStats'
import { buildImagePreviewDataUrl } from '../shared/imagePreview'
import type { AppInfo } from '../shared/types'
import { ENGINE_EXTENSIONS as ENGINE_KIND_EXTENSIONS, ENGINE_LABELS as ENGINE_KIND_LABELS } from './engineExport/engines'
import type { AgentApprovalBroker, AgentInteractionAnswer } from './agent/approvalBroker'
import type { AgentBrainService } from './agent/brainService'
import type { SkillDispatcher } from './agent/dispatcher'
import type { AgentSessionStore } from './agent/sessionStore'
import type { FeedbackStore } from './agent/preferenceStore'
import type { LibraryManager } from './library/manager'
import type { AttrSystemStore } from './attr/attrSystemStore'
import { exportAttrGameConfigFile } from './attr/attrGameConfigExport'
import { exportAttrSystemJsonFile, importAttrSystemJsonFile } from './attr/attrSystemJsonFile'
import type { CeshuManager } from './ceshu/manager'
import type { CeshuNotesStore } from './ceshu/notesStore'
import { CeshuDataSync } from './ceshu/dataSync'
import type { CeshuTemplateStore } from './ceshu/templateStore'
import { exportCeshuDocument } from './ceshu/export/exporter'
import { exportTextReportFile } from './ceshu/reportExport'
import { exportLegacyDataFile } from './data/legacyExport'
import { importLegacyDataFile } from './data/legacyImport'
import { exportCsvFiles, importCsvFile } from './data/csvIO'
import { exportExcelFile, importExcelFile } from './data/excelIO'
import { deleteBackupFile, listBackups } from './backup/backupStore'
import { createLibraryBackup, restoreLibraryBackup } from './backup/restore'
import type { DataService } from './data/service'
import { UndoRecorder } from './data/undoRecorder'
import { exportEngineData } from './engineExport/exporter'
import type { ImageGenConfig } from '../shared/imageGen'
import { generateImage } from './imageGen/client'
import { saveImageFromUrl } from './imageGen/save'
import { isValidSecretName, type SecretStore } from './settings/secretStore'
import { SECRET_NAMES } from '../shared/secretNames'
import type { LlmClient } from './llm/client'
import type { TypeSchemaStore } from './schema/store'
import type { FieldTemplateStore } from './schema/fieldTemplateStore'
import { TYPE_TEMPLATE_NAMES } from '../shared/typeTemplates'

interface IpcHandlerDeps {
  dataService: DataService
  undoRecorder: UndoRecorder
  ceshuManager: CeshuManager
  ceshuNotesStore: CeshuNotesStore
  ceshuTemplateStore: CeshuTemplateStore
  typeSchemaStore: TypeSchemaStore
  fieldTemplates: FieldTemplateStore
  attrSystemStore: AttrSystemStore
  llmClient: LlmClient
  dataSync: CeshuDataSync
  agentDispatcher: SkillDispatcher
  agentBrain: AgentBrainService
  agentSessionStore: AgentSessionStore
  agentFeedback: FeedbackStore
  approvalBroker: AgentApprovalBroker
  libraryManager: LibraryManager
  /**
   * 系统钥匙串（`safeStorage` 加密的 API Key 存储）。
   * 由 `main/index.ts` 注入（`getSecretStore()`），**不在本模块 import electron 薄壳**——
   * 既照 `getAppInfo` / `setWindowMode` 的既有依赖注入先例走，也避免 `ipc.ts` ↔ `index.ts` 循环依赖。
   */
  secretStore: SecretStore
  /** 切换活跃库（由 `main/index.ts` 负责重建 store 与广播） */
  onSwitchLibrary: (name: string) => Promise<void>
  getAppInfo: () => AppInfo
  /** 渲染层上报最后停留的界面模式，供 window-state.json 落盘（迁移 ui/window_state.py 的 last_tab_index） */
  setWindowMode: (mode: string) => void
}

/** 注册全部 IPC 处理器：入口统一做 zod 校验，结果统一包裹为 IpcResult */
export function registerIpcHandlers({
  dataService,
  undoRecorder,
  ceshuManager,
  ceshuNotesStore,
  ceshuTemplateStore,
  typeSchemaStore,
  fieldTemplates,
  attrSystemStore,
  llmClient,
  dataSync,
  agentDispatcher,
  agentBrain,
  agentSessionStore,
  agentFeedback,
  approvalBroker,
  libraryManager,
  secretStore,
  onSwitchLibrary,
  getAppInfo,
  setWindowMode
}: IpcHandlerDeps): void {
  handle('app:info', undefined, () => getAppInfo())
  // 窗口状态：渲染层切模式时上报，落进 window-state.json（下次启动恢复）
  handle('app:setWindowMode', windowModeInputSchema, (req) => {
    setWindowMode(req.mode)
    return undefined
  })
  // 渲染层转发日志：req 为单条日志条目，主进程按自身配置写入文件
  handle('app:log', appLogInputSchema, (req) => {
    const sink: Record<LogLevel, (message: string, meta?: unknown) => void> = {
      debug: log.debug,
      info: log.info,
      warn: log.warn,
      error: log.error
    }
    sink[req.level](req.message, req.meta)
    return undefined
  })
  // ---- 系统钥匙串（API Key 等敏感配置）----
  // 设计前提：渲染层永远拿不到明文，所以只有 has / set / delete 三条通道，**没有 get**。
  // 三条 handler 都**不抛**：失败转成 `{ ok: false, error }`（照本仓既有风格），
  // 免得渲染层只能靠 catch 拿一个结构化 IpcInvokeError 才能显示原因。
  handle('settings:hasSecret', secretNameInputSchema, async (req) => {
    if (!isValidSecretName(req.name)) {
      return { has: false }
    }
    try {
      return { has: await secretStore.has(req.name) }
    } catch {
      // 读盘异常时保守回答「未配置」：宁可让用户重新配一次，也不要误报已配置
      return { has: false }
    }
  })
  handle('settings:setSecret', setSecretInputSchema, async (req) => {
    // 名字合法性用 secretStore 自己的校验函数复核（zod 只挡了长度/类型）
    if (!isValidSecretName(req.name)) {
      return { ok: false, error: '非法的密钥名' }
    }
    return secretStore.set(req.name, req.plaintext)
  })
  handle('settings:deleteSecret', secretNameInputSchema, async (req) => {
    if (!isValidSecretName(req.name)) {
      return { ok: false, error: '非法的密钥名' }
    }
    return secretStore.remove(req.name)
  })
  // Agent 技能调度：listTools 供提示词/面板展示，executeTool 走统一调度与安全门
  handle('agent:listTools', undefined, () => ({
    description: agentDispatcher.toolsDescription(),
    tools: agentDispatcher.toolsJsonSchema()
  }))
  handle('agent:executeTool', agentExecuteToolInputSchema, (req) =>
    agentDispatcher.execute(req.tool, req.params, {})
  )
  // Agent Brain 循环（A1-2/A1-4）：事件流实时推给渲染层；危险操作经审批 broker 等渲染层决定
  handle('agent:chat', agentChatInputSchema, async (req, event) => {
    // 注意竞态：事件在 await requestApproval/requestInteraction 之前就已推给渲染层，
    // 用户可能「秒点」批准。故在**分配 id 时就登记**待答复 promise，二者只取回它，避免答复被丢弃。
    const preRegistered = new Map<string, Promise<AgentInteractionAnswer>>()
    const take = (requestId: string): Promise<AgentInteractionAnswer> =>
      preRegistered.get(requestId) ?? Promise.resolve({ approved: false })
    return agentBrain.chat(req.input, {
      onEvent: (payload) => {
        event.sender.send('agent:event', payload)
      },
      newRequestId: () => {
        const requestId = approvalBroker.nextId()
        preRegistered.set(requestId, approvalBroker.registerWith(requestId))
        return requestId
      },
      // 危险确认：只有明确 approved 才放行
      requestApproval: async (request) => (await take(request.requestId)).approved === true,
      // 技能交互（确认/提问）：原样把答复交给 Brain 处理
      requestInteraction: (request) => take(request.requestId)
    })
  })
  handle('agent:approvalResponse', agentApprovalResponseInputSchema, (req) => ({
    ok: approvalBroker.resolve(req.requestId, { approved: req.approved })
  }))
  handle('agent:interactionResponse', agentInteractionResponseInputSchema, (req) => ({
    ok: approvalBroker.resolve(req.requestId, {
      ...(req.approved !== undefined ? { approved: req.approved } : {}),
      ...(req.answer !== undefined ? { answer: req.answer } : {}),
      ...(req.answers !== undefined ? { answers: req.answers } : {})
    })
  }))
  handle('agent:sessionInfo', undefined, () => agentSessionStore.info())
  handle('agent:sessionRestore', undefined, () => {
    const snapshot = agentSessionStore.tryRestore()
    return { messages: snapshot?.messages ?? [] }
  })
  handle('agent:sessionClear', undefined, async () => ({ cleared: await agentSessionStore.clear() }))
  // 草稿管理（对齐 PyQt 数字员工面板的草稿保存/恢复/列表）
  handle('agent:draftSave', agentDraftSaveInputSchema, (req) => agentSessionStore.saveDraft(req.name))
  handle('agent:draftList', undefined, () => agentSessionStore.listDrafts())
  handle('agent:draftLoad', agentDraftLoadInputSchema, (req) => {
    const draft = agentSessionStore.readDraft(req.path)
    return { name: draft.name, messages: draft.messages }
  })
  // 用户反馈（偏好/反馈 store 的生产者接缝）：评分 ≥4 且评论非空时提炼偏好写入偏好库，
  // 供后续 chat() 注入系统提示词。UI 评分入口是后续步骤，此处只接好主进程写路径。
  handle('agent:feedback', agentFeedbackInputSchema, (req) => {
    agentFeedback.record(req.rating, req.comment)
    return undefined
  })

  // 库管理（A2-1）：切换由 onSwitchLibrary 负责重建 store 并广播 library:changed
  handle('library:list', undefined, () => libraryManager.list())
  handle('library:create', libraryCreateInputSchema, (req) =>
    libraryManager.create(req.name, req.description ?? '')
  )
  handle('library:rename', libraryRenameInputSchema, async (req) => {
    await libraryManager.rename(req.from, req.to)
    return { ok: true }
  })
  handle('library:remove', libraryNameInputSchema, (req) => libraryManager.remove(req.name))
  handle('library:switch', libraryNameInputSchema, async (req) => {
    await onSwitchLibrary(req.name)
    return { ok: true }
  })
  handle('schema:list', undefined, () => typeSchemaStore.getTypes())
  handle('schema:save', schemaSaveInputSchema, (req) => typeSchemaStore.saveTypes(req.types))
  // 用户自定义字段模板（存完整 TypeFieldDef[]，非 Python 那样只存标签 —— 见 fieldTemplateStore 注释）
  handle('schema:listFieldTemplates', undefined, () => ({
    builtin: [...TYPE_TEMPLATE_NAMES],
    custom: fieldTemplates.listNames()
  }))
  handle('schema:getFieldTemplate', fieldTemplateNameInputSchema, (req) => ({
    fields: fieldTemplates.get(req.name)
  }))
  handle('schema:saveFieldTemplate', fieldTemplateSaveInputSchema, (req) => {
    fieldTemplates.save(req.name, req.fields)
    return { name: req.name }
  })
  handle('schema:deleteFieldTemplate', fieldTemplateNameInputSchema, (req) => ({
    deleted: fieldTemplates.remove(req.name)
  }))
  /**
   * 字段 ID 的 AI 候选：术语表未收录时由用户显式点击触发（同 W30「AI 生成数据表」的形态）。
   * 模型给出但清洗后不合法的候选会被丢弃（见 `shared/fieldIdAi.ts`），绝不产出垃圾。
   */
  handle('schema:suggestFieldIds', fieldIdSuggestInputSchema, async (req) => {
    const built = buildFieldIdPrompt(req.label, req.existingNames, {
      typeName: req.typeName,
      fieldType: req.fieldType
    })
    const { model, content } = await llmClient.generate(built.system, built.prompt)
    return { model, candidates: parseFieldIdCandidates(content, req.existingNames) }
  })
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
  // 游戏数据 CSV / Excel 的文件/目录选择（导出与导入共用；取消返回 null）
  handle('dialog:chooseExportDir', undefined, async () => {
    const focused = BrowserWindow.getFocusedWindow()
    const options: OpenDialogOptions = {
      title: '选择导出目录',
      properties: ['openDirectory', 'createDirectory']
    }
    const result = focused ? await dialog.showOpenDialog(focused, options) : await dialog.showOpenDialog(options)
    return { path: result.canceled || result.filePaths.length === 0 ? null : (result.filePaths[0] ?? null) }
  })
  handle('dialog:chooseCsvFile', undefined, async () => {
    const focused = BrowserWindow.getFocusedWindow()
    const options: OpenDialogOptions = {
      title: '导入 CSV',
      filters: [{ name: 'CSV 文件', extensions: ['csv'] }],
      properties: ['openFile']
    }
    const result = focused ? await dialog.showOpenDialog(focused, options) : await dialog.showOpenDialog(options)
    return { path: result.canceled || result.filePaths.length === 0 ? null : (result.filePaths[0] ?? null) }
  })
  handle('dialog:chooseExcelFile', undefined, async () => {
    const focused = BrowserWindow.getFocusedWindow()
    const options: OpenDialogOptions = {
      title: '导入 Excel',
      filters: [{ name: 'Excel 文件', extensions: ['xlsx'] }],
      properties: ['openFile']
    }
    const result = focused ? await dialog.showOpenDialog(focused, options) : await dialog.showOpenDialog(options)
    return { path: result.canceled || result.filePaths.length === 0 ? null : (result.filePaths[0] ?? null) }
  })
  // AI 生图：选择保存目录（取消返回 null）
  /**
   * 选一张本地图片（数据编辑器「图片」字段，对齐 PyQt `_create_image_widget` 的「选择图片」）。
   * 主进程代读文件并回传 `data:` URL —— 渲染层直接引用 `C://...` 会被 `webSecurity` 拦。
   * 格式不支持或超过体积上限时 `dataUrl` 返回空串，UI 显示中文原因而不是留白。
   */
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
    return { path: result.canceled || result.filePaths.length === 0 ? null : (result.filePaths[0] ?? null) }
  })
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
  // 通用撤销/重做（用户手动操作的安全子集）：栈在主进程随库隔离，
  // handler 经 registerIpcHandlers({...next}) 闭包拿到 undoRecorder（与 dataService 同来源）
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
  // AI 生图（features/_ai_image.py 能力缺口补齐）：生成 + 落盘到指定目录
  //
  // API Key 的取值纪律：渲染层**不持有**明文（`req.config.apiKey` 传空串即可），
  // 真实 Key 由主进程从系统钥匙串解密后**在本地覆盖进 config**。
  // 这样即便渲染层被 XSS，也拿不到长期密钥；同时也兼容了「E22 时期把 Key 存在
  // localStorage」的老配置（已由 shared/secretMigration.ts 一次性搬到钥匙串）。
  handle('image:generate', imageGenInputSchema, async (req) => {
    const stored = await secretStore.get(SECRET_NAMES.imageGenApiKey)
    if (!stored.ok) {
      return { ok: false, error: `${stored.error}；请先在生图面板把 API Key 保存到系统钥匙串` }
    }
    const config: ImageGenConfig = { ...req.config, apiKey: stored.plaintext }
    const gen = await generateImage(config, req.prompt)
    if (!gen.ok) return { ok: false, error: gen.error }
    const saved = await saveImageFromUrl(gen.url, req.saveDir, req.filename)
    if (!saved.ok) return { ok: false, error: saved.error }
    return { ok: true, url: gen.url, path: saved.path }
  })
  // 引擎代码导出（P0：Lua）：取全量数据快照 + 当前 schema，渲染并原子落盘
  handle('engine:exportData', engineExportInputSchema, (req) =>
    exportEngineData(dataService.listAllItems(), typeSchemaStore.getTypes(), {
      engine: req.engine,
      targetPath: req.path
    })
  )
  handle('ceshu:list', undefined, () => ceshuManager.list())
  handle('ceshu:create', ceshuCreateInputSchema, (req) => ceshuManager.create(req))
  handle('ceshu:get', ceshuGetInputSchema, (req) => {
    const doc = ceshuManager.get(req.id)
    dataSync.setCurrentCeshu(req.id)
    return doc
  })
  handle('ceshu:saveChapter', ceshuSaveChapterInputSchema, async (req) => {
    if (!isChapterKey(req.chapter)) {
      throw new Error(`未知章节：${req.chapter}`)
    }
    const updated = await ceshuManager.saveChapter(req.id, req.chapter, req.data, {
      style: req.style,
      moduleType: req.moduleType
    })
    // 系统章/元信息章保存后，确保启用系统的数据结构已注册（对齐 Python ceshu_changed → sync_systems_to_data）
    if (req.chapter === 'systems' || req.chapter === 'meta') {
      dataSync.syncSystemsToData(updated, '')
    }
    return updated
  })
  handle('ceshu:export', ceshuExportInputSchema, (req) => {
    const doc = ceshuManager.get(req.id)
    return exportCeshuDocument(doc, req.format, req.path)
  })
  handle('ceshu:versions', ceshuGetInputSchema, (req) => ceshuManager.versions(req.id))
  handle('ceshu:derive', ceshuDeriveInputSchema, (req) => ceshuManager.derive(req.id, req.note))
  handle('ceshu:applyPreset', ceshuApplyPresetInputSchema, async (req) => {
    const result = await ceshuManager.applyPreset(req.id, req.presetKey)
    dataSync.syncSystemsToData(result.doc, '')
    return result
  })
  handle('ceshu:confirmSystems', ceshuConfirmSystemsInputSchema, async (req) => {
    const doc = ceshuManager.get(req.id)
    const baseSystems = (doc.systems ?? {}) as Record<string, SystemEntry>
    const { systems } = buildSystemConfirmResult(baseSystems, req.enabledKeys, req.customSystems)
    const updated = await ceshuManager.saveChapter(req.id, 'systems', systems)
    // 对齐 PyQt `editor_view_mixins.py:833`：确认后置 `meta.system_confirmed`，
    // 之后再次打开该策划书就不再自动弹确认对话框（PyQt 的弹窗条件是「未确认 且 已启用系统」）
    const confirmed = await ceshuManager.saveChapter(req.id, 'meta', {
      ...(updated.meta ?? {}),
      system_confirmed: true
    })
    const syncResult = dataSync.syncSystemsToData(confirmed, '')
    const systemsMap = confirmed.systems as Record<string, { enabled: boolean }>
    const enabledCount = Object.values(systemsMap).filter((entry) => entry.enabled === true).length
    const addedCustom = req.customSystems.filter((custom) => !(custom.key in baseSystems)).length
    return { doc: confirmed, enabledCount, addedCustom, addedTypes: syncResult.addedTypes }
  })
  handle('ceshu:syncData', ceshuSyncDataInputSchema, async (req) => {
    const doc = ceshuManager.get(req.id)
    return dataSync.syncBoth(doc, req.id, '')
  })
  handle('ceshu:rename', ceshuRenameInputSchema, (req) => ceshuManager.rename(req.id, req.name))
  handle('ceshu:delete', ceshuGetInputSchema, async (req) => {
    const deleted = await ceshuManager.remove(req.id)
    // 被删除的文档若正是数据同步的当前上下文，清空以免后续同步指向已不存在的文档
    if (deleted) dataSync.clearCurrentCeshu()
    return { deleted }
  })
  handle('ceshu:duplicate', ceshuGetInputSchema, (req) => ceshuManager.duplicate(req.id))
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
  handle('dialog:chooseEngineExportFile', engineExportFileDialogInputSchema, async (req) => {
    // 扩展名/过滤器随目标引擎变（PyQt `ui/dialogs/engine_export.py::export_file`
    // 同样是按 engine_type 追加 .cs / .h / .gd / .json）
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

  // ---- 数据备份（整库快照，存 <活跃库>/backups）----
  // 说明：backupRoot 在**每次注册时**由活跃库目录派生；切换库会 dispose + 重注册 handler，
  // 因此闭包里的路径始终指向当前活跃库，天然做到「备份随库隔离」。
  const backupRoot = join(libraryManager.activeDir(), 'backups')
  const backupDeps = (): Parameters<typeof createLibraryBackup>[0] => ({
    backupRoot,
    dataService,
    types: typeSchemaStore.getTypes()
  })
  handle('backup:list', undefined, () => listBackups(backupRoot))
  handle('backup:create', backupCreateInputSchema, (req) => createLibraryBackup(backupDeps(), req.label))
  // 破坏性：渲染层确认可被绕过，主进程必须再挡一次 confirm
  handle('backup:restore', backupRestoreInputSchema, async (req) => {
    if (req.confirm !== true) throw new Error('恢复备份需要确认')
    return restoreLibraryBackup(backupDeps(), req.name)
  })
  handle('backup:delete', backupDeleteInputSchema, async (req) => {
    if (req.confirm !== true) throw new Error('删除备份需要确认')
    await deleteBackupFile(backupRoot, req.name)
    return { deleted: true }
  })
}

/** 已注册的 IPC 通道（A2-1 切换库重建 store 时需要先全部注销再注册） */
const registeredChannels = new Set<IpcChannel>()

/** 注销全部 IPC handler（配合 `registerIpcHandlers` 重新注册） */
export function disposeIpcHandlers(): void {
  for (const channel of registeredChannels) {
    ipcMain.removeHandler(channel)
  }
  registeredChannels.clear()
}

function handle<C extends IpcChannel>(
  channel: C,
  schema: ZodType | undefined,
  handler: (
    req: IpcContract[C]['req'],
    event: IpcMainInvokeEvent
  ) => IpcContract[C]['res'] | Promise<IpcContract[C]['res']>
): void {
  registeredChannels.add(channel)
  ipcMain.handle(channel, async (event, raw: unknown): Promise<IpcResult<IpcContract[C]['res']>> => {
    try {
      const req = (schema ? schema.parse(raw) : raw) as IpcContract[C]['req']
      const data = await handler(req, event)
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