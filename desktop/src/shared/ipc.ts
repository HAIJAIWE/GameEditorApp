import type {
  AttrGameConfigExportInput,
  AttrJsonDialogInput,
  AttrSystemJsonExportInput,
  AttrSystemJsonImportInput,
  AttrSystemSaveInput,
  BatchUpdateInput,
  CeshuAiGenerateInput,
  CeshuApplyPresetInput,
  CeshuConfirmSystemsInput,
  CeshuSyncDataInput,
  CeshuChecklistExportInput,
  CeshuChooseExportFileInput,
  CeshuCreateInput,
  CeshuDeriveInput,
  CeshuDiffExportInput,
  CeshuDiffInput,
  CeshuExportInput,
  FieldTemplateNameInput,
  FieldTemplateSaveInput,
  CeshuReviewExportInput,
  CeshuSaveChapterInput,
  DeleteManyInput,
  EngineExportInput,
  ExportLegacyInput,
  ImportLegacyInput,
  NotesAddInput,
  NotesDeleteInput,
  NotesListInput,
  NotesUpdateInput,
  ReferencesInput,
  CeshuRenameInput,
  AgentChatInput,
  AgentExecuteToolInput,
  AgentFeedbackInput,
  AgentInteractionResponseInput,
  EngineExportFileDialogInput,
  FieldIdSuggestInput,
  LibraryCreateInput,
  LibraryNameInput,
  LibraryRenameInput,
  SchemaSaveInput,
  CeshuDataGenInput,
  TemplateJsonDialogInput,
  TemplatesDeleteInput,
  TemplatesExportInput,
  TemplatesImportInput,
  TemplatesListInput,
  TemplatesSaveInput,
  TemplatesUpdateInput
} from './schemas'
import type {
  AppInfo,
  AppLogInput,
  BatchUpdateSummary,
  DataTypeDef,
  DeleteManySummary,
  ExportSummary,
  ImportSummary,
  ItemRecord,
  TypeFieldDef
} from './types'
import type { CeshuDocument, CeshuExportResult, CeshuSummary } from './ceshuConstants'
import type { BrainEvent } from './agent/brain'
import type { SessionInfo } from './agent/session'
import type { JsonObjectSchema, SkillResult } from './agent/protocol'
import type { CeshuChangelog, CeshuVersionDiff } from './ceshuDiff'
import type { CeshuScoreReport } from './ceshuScorer'
import type { ChecklistReport } from './ceshuChecklist'
import type { CeshuNote } from './ceshuNotes'
import type { CeshuCustomTemplate } from './ceshuCustomTemplates'
import type { CeshuWordStatsReport } from './ceshuWordStats'
import type { CeshuFieldDepsReport } from './ceshuFieldDeps'
import type { CeshuAiGenerateResult, CeshuAiReviewResult } from './ceshuAi'
import type { CeshuDataGenResult } from './ceshuDataGen'
import type { ReferenceReport } from './references'
import type { FieldIdSuggestResult } from './fieldIdAi'
import type { AttrSystem } from './attrSystem'

/**
 * IPC 契约：通道 → 请求/响应类型。
 * 这是全应用跨进程通信的类型唯一事实来源（type-only 导入，无运行时依赖）。
 */
export interface IpcContract {
  'app:info': { req: undefined; res: AppInfo }
  /** 渲染层转发日志到主进程（主进程写文件 + 回显控制台）。req 为单条日志条目 */
  'app:log': { req: AppLogInput; res: undefined }
  'schema:list': { req: undefined; res: DataTypeDef[] }
  'schema:save': { req: SchemaSaveInput; res: DataTypeDef[] }
  /** 字段 ID 的 AI 候选（术语表未收录时由用户显式点击触发） */
  'schema:suggestFieldIds': { req: FieldIdSuggestInput; res: FieldIdSuggestResult }
  /** 字段模板名清单（内置在 shared 常量里，自定义需读盘，故经 IPC） */
  'schema:listFieldTemplates': { req: undefined; res: { builtin: string[]; custom: string[] } }
  /** 读取一个自定义模板的完整字段定义；不存在返回 null */
  'schema:getFieldTemplate': { req: FieldTemplateNameInput; res: { fields: TypeFieldDef[] | null } }
  /** 保存（新建/覆盖）自定义模板 */
  'schema:saveFieldTemplate': { req: FieldTemplateSaveInput; res: { name: string } }
  /** 删除自定义模板（内置模板不允许删除，由主进程拒绝） */
  'schema:deleteFieldTemplate': { req: FieldTemplateNameInput; res: { deleted: boolean } }
  'attrSystem:get': { req: undefined; res: AttrSystem }
  'attrSystem:save': { req: AttrSystemSaveInput; res: AttrSystem }
  'attrSystem:exportGameConfig': { req: AttrGameConfigExportInput; res: { filePath: string } }
  'attrSystem:exportJson': { req: AttrSystemJsonExportInput; res: { filePath: string } }
  'attrSystem:importJson': { req: AttrSystemJsonImportInput; res: { system: AttrSystem; warnings: string[] } }
  'dialog:chooseAttrSystemJsonFile': { req: AttrJsonDialogInput; res: { path: string | null } }
  'data:listItems': { req: { type: string }; res: ItemRecord[] }
  /** 全量条目（跨类型；统计面板等需要全局视角的消费者用） */
  'data:listAll': { req: undefined; res: ItemRecord[] }
  'data:createItem': { req: { type: string; data: Record<string, unknown> }; res: ItemRecord }
  'data:updateItem': { req: { id: string; data: Record<string, unknown> }; res: ItemRecord }
  'data:deleteItem': { req: { id: string }; res: { deleted: boolean } }
  'data:batchUpdate': { req: BatchUpdateInput; res: BatchUpdateSummary }
  'data:deleteMany': { req: DeleteManyInput; res: DeleteManySummary }
  'data:references': { req: ReferencesInput; res: ReferenceReport }
  'data:importLegacy': { req: ImportLegacyInput; res: ImportSummary }
  'data:exportLegacy': { req: ExportLegacyInput; res: ExportSummary }
  // 引擎代码导出（P0：Lua）。渲染/落盘在 main/engineExport，取数由 handler 注入。
  'engine:exportData': { req: EngineExportInput; res: { filePath: string; engine: string; bytes: number } }
  'dialog:chooseJsonFile': { req: undefined; res: { path: string | null } }
  'dialog:chooseSaveJsonFile': { req: undefined; res: { path: string | null } }
  'ceshu:list': { req: undefined; res: CeshuSummary[] }
  'ceshu:create': { req: CeshuCreateInput; res: CeshuDocument }
  'ceshu:get': { req: { id: string }; res: CeshuDocument }
  'ceshu:saveChapter': { req: CeshuSaveChapterInput; res: CeshuDocument }
  'ceshu:export': { req: CeshuExportInput; res: CeshuExportResult }
  'ceshu:versions': { req: { id: string }; res: CeshuSummary[] }
  'ceshu:derive': { req: CeshuDeriveInput; res: CeshuDocument }
  'ceshu:applyPreset': {
    req: CeshuApplyPresetInput
    res: { doc: CeshuDocument; enabledCount: number; presetLabel: string; gameTypeFilled: boolean }
  }
  'ceshu:confirmSystems': {
    req: CeshuConfirmSystemsInput
    res: { doc: CeshuDocument; enabledCount: number; addedCustom: number; addedTypes: string[] }
  }
  'ceshu:syncData': {
    req: CeshuSyncDataInput
    res: { toData: { addedTypes: string[]; ensuredKeys: string[]; errors: string[] }; toCeshu: Record<string, number> }
  }
  'agent:listTools': {
    req: undefined
    res: {
      description: string
      tools: Array<{ name: string; description: string; parameters: JsonObjectSchema }>
    }
  }
  'agent:executeTool': { req: AgentExecuteToolInput; res: SkillResult }
  'agent:chat': { req: AgentChatInput; res: { text: string; events: BrainEvent[]; completed: boolean } }
  'agent:approvalResponse': { req: { requestId: string; approved: boolean }; res: { ok: boolean } }
  'agent:interactionResponse': { req: AgentInteractionResponseInput; res: { ok: boolean } }
  'agent:sessionInfo': { req: undefined; res: SessionInfo }
  'agent:sessionRestore': { req: undefined; res: { messages: Array<Record<string, unknown>> } }
  'agent:sessionClear': { req: undefined; res: { cleared: boolean } }
  /** 用户反馈：评分 + 可选评论；评分 ≥4 且评论非空时提炼偏好写入偏好库 */
  'agent:feedback': { req: AgentFeedbackInput; res: undefined }

  'dialog:chooseEngineExportFile': { req: EngineExportFileDialogInput; res: { path: string | null } }

  // 库管理（A2-1）。库条目结构以 `main/library/store.ts` 的 `LibraryEntry` 为准，
  // 这里按线格式内联声明，避免 shared 反向依赖 main。
  'library:list': {
    req: undefined
    res: Array<{ name: string; createdAt: string; description: string; isInitial: boolean }>
  }
  'library:create': {
    req: LibraryCreateInput
    res: { name: string; createdAt: string; description: string; isInitial: boolean }
  }
  'library:rename': { req: LibraryRenameInput; res: { ok: boolean } }
  'library:remove': { req: LibraryNameInput; res: { switchedTo: string | null } }
  'library:switch': { req: LibraryNameInput; res: { ok: boolean } }
  'ceshu:rename': { req: CeshuRenameInput; res: CeshuDocument }
  'ceshu:delete': { req: { id: string }; res: { deleted: boolean } }
  'ceshu:duplicate': { req: { id: string }; res: CeshuDocument }
  'ceshu:setActive': { req: { id: string }; res: CeshuDocument }
  'ceshu:changelog': { req: { id: string }; res: CeshuChangelog }
  'ceshu:validate': { req: { id: string }; res: string[] }
  'ceshu:score': { req: { id: string }; res: CeshuScoreReport }
  'ceshu:aiGenerateChapter': { req: CeshuAiGenerateInput; res: CeshuAiGenerateResult }
  'ceshu:aiReview': { req: { id: string }; res: CeshuAiReviewResult }
  'ceshu:aiGenerateData': { req: CeshuDataGenInput; res: CeshuDataGenResult }
  'ceshu:exportReviewReport': { req: CeshuReviewExportInput; res: { filePath: string } }
  'ceshu:checklist': { req: { id: string }; res: ChecklistReport }
  'ceshu:autoFill': { req: { id: string }; res: { doc: CeshuDocument; filled: number } }
  'ceshu:exportChecklistReport': { req: CeshuChecklistExportInput; res: { filePath: string } }
  'ceshu:diff': { req: CeshuDiffInput; res: CeshuVersionDiff }
  'ceshu:exportDiffReport': { req: CeshuDiffExportInput; res: { filePath: string } }
  'ceshu:notes:list': { req: NotesListInput; res: CeshuNote[] }
  'ceshu:notes:add': { req: NotesAddInput; res: CeshuNote }
  'ceshu:notes:update': { req: NotesUpdateInput; res: CeshuNote }
  'ceshu:notes:delete': { req: NotesDeleteInput; res: { deleted: boolean } }
  'ceshu:templates:list': { req: TemplatesListInput; res: CeshuCustomTemplate[] }
  'ceshu:templates:save': { req: TemplatesSaveInput; res: CeshuCustomTemplate }
  'ceshu:templates:delete': { req: TemplatesDeleteInput; res: { deleted: boolean } }
  'ceshu:templates:update': { req: TemplatesUpdateInput; res: { updated: boolean } }
  'ceshu:templates:export': { req: TemplatesExportInput; res: { filePath: string; count: number } }
  'ceshu:templates:import': { req: TemplatesImportInput; res: { imported: number; skipped: number } }
  'dialog:chooseTemplateJsonFile': { req: TemplateJsonDialogInput; res: { path: string | null } }
  'ceshu:wordStats': { req: { id: string }; res: CeshuWordStatsReport }
  'ceshu:fieldDeps': { req: { id: string }; res: CeshuFieldDepsReport }
  'dialog:chooseCeshuExportFile': { req: CeshuChooseExportFileInput; res: { path: string | null } }
}

export type IpcChannel = keyof IpcContract

/** 统一响应包裹：错误结构化返回，避免 Electron 序列化丢失错误信息 */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }

/** IPC 调用错误：渲染层可直接按 code 处理 */
export class IpcInvokeError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'IpcInvokeError'
    this.code = code
  }
}