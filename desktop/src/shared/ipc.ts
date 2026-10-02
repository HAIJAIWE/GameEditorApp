import type {
  AttrGameConfigExportInput,
  AttrJsonDialogInput,
  AttrSystemJsonExportInput,
  AttrSystemJsonImportInput,
  AttrSystemSaveInput,
  BatchUpdateInput,
  CeshuAiGenerateInput,
  CeshuChecklistExportInput,
  CeshuChooseExportFileInput,
  CeshuCreateInput,
  CeshuDeriveInput,
  CeshuDiffExportInput,
  CeshuDiffInput,
  CeshuExportInput,
  CeshuReviewExportInput,
  CeshuSaveChapterInput,
  DeleteManyInput,
  ExportLegacyInput,
  ImportLegacyInput,
  NotesAddInput,
  NotesDeleteInput,
  NotesListInput,
  NotesUpdateInput,
  ReferencesInput,
  SchemaSaveInput,
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
  BatchUpdateSummary,
  DataTypeDef,
  DeleteManySummary,
  ExportSummary,
  ImportSummary,
  ItemRecord
} from './types'
import type { CeshuDocument, CeshuExportResult, CeshuSummary } from './ceshuConstants'
import type { CeshuChangelog, CeshuVersionDiff } from './ceshuDiff'
import type { CeshuScoreReport } from './ceshuScorer'
import type { ChecklistReport } from './ceshuChecklist'
import type { CeshuNote } from './ceshuNotes'
import type { CeshuCustomTemplate } from './ceshuCustomTemplates'
import type { CeshuWordStatsReport } from './ceshuWordStats'
import type { CeshuFieldDepsReport } from './ceshuFieldDeps'
import type { CeshuAiGenerateResult, CeshuAiReviewResult } from './ceshuAi'
import type { ReferenceReport } from './references'
import type { AttrSystem } from './attrSystem'

/**
 * IPC 契约：通道 → 请求/响应类型。
 * 这是全应用跨进程通信的类型唯一事实来源（type-only 导入，无运行时依赖）。
 */
export interface IpcContract {
  'app:info': { req: undefined; res: AppInfo }
  'schema:list': { req: undefined; res: DataTypeDef[] }
  'schema:save': { req: SchemaSaveInput; res: DataTypeDef[] }
  'attrSystem:get': { req: undefined; res: AttrSystem }
  'attrSystem:save': { req: AttrSystemSaveInput; res: AttrSystem }
  'attrSystem:exportGameConfig': { req: AttrGameConfigExportInput; res: { filePath: string } }
  'attrSystem:exportJson': { req: AttrSystemJsonExportInput; res: { filePath: string } }
  'attrSystem:importJson': { req: AttrSystemJsonImportInput; res: { system: AttrSystem; warnings: string[] } }
  'dialog:chooseAttrSystemJsonFile': { req: AttrJsonDialogInput; res: { path: string | null } }
  'data:listItems': { req: { type: string }; res: ItemRecord[] }
  'data:createItem': { req: { type: string; data: Record<string, unknown> }; res: ItemRecord }
  'data:updateItem': { req: { id: string; data: Record<string, unknown> }; res: ItemRecord }
  'data:deleteItem': { req: { id: string }; res: { deleted: boolean } }
  'data:batchUpdate': { req: BatchUpdateInput; res: BatchUpdateSummary }
  'data:deleteMany': { req: DeleteManyInput; res: DeleteManySummary }
  'data:references': { req: ReferencesInput; res: ReferenceReport }
  'data:importLegacy': { req: ImportLegacyInput; res: ImportSummary }
  'data:exportLegacy': { req: ExportLegacyInput; res: ExportSummary }
  'dialog:chooseJsonFile': { req: undefined; res: { path: string | null } }
  'dialog:chooseSaveJsonFile': { req: undefined; res: { path: string | null } }
  'ceshu:list': { req: undefined; res: CeshuSummary[] }
  'ceshu:create': { req: CeshuCreateInput; res: CeshuDocument }
  'ceshu:get': { req: { id: string }; res: CeshuDocument }
  'ceshu:saveChapter': { req: CeshuSaveChapterInput; res: CeshuDocument }
  'ceshu:export': { req: CeshuExportInput; res: CeshuExportResult }
  'ceshu:versions': { req: { id: string }; res: CeshuSummary[] }
  'ceshu:derive': { req: CeshuDeriveInput; res: CeshuDocument }
  'ceshu:setActive': { req: { id: string }; res: CeshuDocument }
  'ceshu:changelog': { req: { id: string }; res: CeshuChangelog }
  'ceshu:validate': { req: { id: string }; res: string[] }
  'ceshu:score': { req: { id: string }; res: CeshuScoreReport }
  'ceshu:aiGenerateChapter': { req: CeshuAiGenerateInput; res: CeshuAiGenerateResult }
  'ceshu:aiReview': { req: { id: string }; res: CeshuAiReviewResult }
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