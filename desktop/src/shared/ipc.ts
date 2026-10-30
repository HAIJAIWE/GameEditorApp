import type {
  AttrGameConfigExportInput,
  AttrJsonDialogInput,
  AttrSystemJsonExportInput,
  AttrSystemJsonImportInput,
  AttrSystemSaveInput,
  BackupCreateInput,
  BackupDeleteInput,
  BackupRestoreInput,
  BatchUpdateInput,
  CeshuAiGenerateInput,
  CeshuCloneDecomposeInput,
  CeshuExportProjectInput,
  CeshuOpenProjectInput,
  CeshuAiTasksInput,
  CeshuSaveDemoInput,
  CeshuCheckContractInput,
  CeshuCheckDataTablesInput,
  CeshuScaffoldDataTablesInput,
  CeshuApplyPresetInput,
  CeshuConfirmSystemsInput,
  CeshuSyncDataInput,
  CeshuChooseExportFileInput,
  CreateItemInput,
  ReportFileDialogInput,
  CeshuCreateInput,
  CeshuMigrateFieldSplitsInput,
  CeshuDeleteInput,
  CeshuDeriveInput,
  CeshuDiffExportInput,
  CeshuDiffInput,
  CeshuReadinessExportInput,
  CeshuValidationExportInput,
  CeshuChangelogExportInput,
  CeshuExportInput,
  ClearAllInput,
  FieldTemplateNameInput,
  FieldTemplateSaveInput,
  CeshuReviewExportInput,
  CeshuSaveChapterInput,
  DeleteManyInput,
  EngineExportInput,
  ExportDirInput,
  ImageGenInput,
  ExportLegacyInput,
  ImportDataFileInput,
  PreviewImportInput,
  ApplyImportInput,
  ImportLegacyInput,
  NotesAddInput,
  NotesDeleteInput,
  NotesListInput,
  NotesUpdateInput,
  ReferencesInput,
  CeshuRenameInput,
  AgentChatInput,
  TaskCancelInput,
  AgentExecuteToolInput,
  AgentDraftLoadInput,
  DeleteImagesInput,
  LlmGenerateInput,
  ImageReadByPathInput,
  LlmConfigureInput,
  AgentDraftSaveInput,
  AgentFeedbackInput,
  AgentInteractionResponseInput,
  AgentSubagentSendInput,
  AgentSubagentStopInput,
  EngineExportFileDialogInput,
  DataSnapshotInput,
  DataSnapshotFileDialogInput,
  FieldIdSuggestInput,
  LibraryCreateInput,
  LibraryNameInput,
  LibraryRemoveInput,
  LibraryRenameInput,
  SchemaSaveInput,
  CeshuDataGenInput,
  SecretNameInput,
  SetSecretInput,
  TemplateJsonDialogInput,
  TemplatesDeleteInput,
  TemplatesExportInput,
  TemplatesImportInput,
  TemplatesListInput,
  TemplatesSaveInput,
  TemplatesUpdateInput,
  WindowModeInput,
  AppViewActionInput,
  FsListDirInput,
  FsReadFileInput
} from './schema/core/schemas'
import type {
  AppInfo,
  AppLogInput,
  BatchUpdateSummary,
  CsvExportSummary,
  DataTypeDef,
  DeleteManySummary,
  ExportSummary,
  ImportSummary,
  ImportPreview,
  ItemRecord,
  TypeFieldDef
} from './types'
import type { ChapterKey, CeshuDocument, CeshuExportResult, CeshuSummary } from './ceshu/reference/ceshuConstants'
import type { FieldAction } from './ceshu/fields/ceshuFieldAction'
import type { BrainEvent } from './agent/brain'
import type { AgentRunStats } from './agent/observability'
import type { DraftSummary, SessionInfo, SessionTurnSummary } from './agent/session'
import type { OperationRecord } from './agent/operationLog'
import type { JsonObjectSchema, SkillResult } from './agent/protocol'
import type { AgentDeliveriesInput, AttachmentsAddInput, AttachmentsOpenInput, AttachmentsReadImageInput } from './schema/core/schemas'
import type { DigitalAttachment } from './util/libraryAttachments'
import type { DeliveryRecord } from './agent/deliveryLog'
import type { CeshuChangelog, CeshuVersionDiff } from './ceshu/workflow/ceshuDiff'
import type { CeshuTaskPlan } from './ceshu/workflow/ceshuTasks'
import type { ContractReport } from './ceshu/validation/ceshuContract'
import type { DataTableCheckResult } from './ceshu/data/ceshuDataTableCheck'
import type { ScaffoldApplyResult, ScaffoldPlan } from './ceshu/data/ceshuDataTableScaffold'
import type { CeshuReadinessReport } from './ceshu/readiness/ceshuReadiness'
import type { CeshuNote } from './ceshu/notes/ceshuNotes'
import type { CeshuCustomTemplate } from './ceshu/reference/ceshuCustomTemplates'
import type { CeshuAiGenerateResult, CeshuAiReviewResult } from './ceshu/prompts/ceshuAi'
import type { CeshuDataGenResult } from './ceshu/data/ceshuDataGen'
import type { ReferenceReport } from './util/references'
import type { FieldIdSuggestResult } from './util/fieldIdAi'
import type { AttrSystem } from './attrSystem'
import type { BackupEntry, RestoreOutcome } from './util/backup'

/**
 * IPC 契约：通道 → 请求/响应类型。
 * 这是全应用跨进程通信的类型唯一事实来源（type-only 导入，无运行时依赖）。
 */
export interface IpcContract {
  'app:info': { req: undefined; res: AppInfo }
  /** 渲染层转发日志到主进程（主进程写文件 + 回显控制台）。req 为单条日志条目 */
  'app:log': { req: AppLogInput; res: undefined }
  /** 渲染层上报最后停留的界面模式（迁移 ui/window_state 的 last_tab_index） */
  'app:setWindowMode': { req: WindowModeInput; res: undefined }
  /** 视图菜单动作（放大/缩小/重置缩放/重新加载/开发者工具）：对聚焦窗口执行 */
  'app:viewAction': { req: AppViewActionInput; res: undefined }
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
  'data:createItem': { req: CreateItemInput; res: ItemRecord }
  'data:updateItem': { req: { id: string; data: Record<string, unknown> }; res: ItemRecord }
  'data:deleteItem': { req: { id: string }; res: { deleted: boolean } }
  'data:batchUpdate': { req: BatchUpdateInput; res: BatchUpdateSummary }
  'data:deleteMany': { req: DeleteManyInput; res: DeleteManySummary }
  /**
   * 清空整个活跃库的数据。
   * 破坏性操作：req.confirm 必须为 true，主进程再校验一次。
   * 走 `deleteMany` 的统一路径 ⇒ 整批落一条可撤销记录（用户可 Ctrl+Z 找回）。
   */
  'data:clearAll': { req: ClearAllInput; res: { deleted: number } }
  /** 通用撤销/重做（用户手动操作的安全子集）：撤销栈顶操作 */
  'data:undo': { req: undefined; res: UndoResult }
  /** 通用撤销/重做：重做栈顶操作 */
  'data:redo': { req: undefined; res: UndoResult }
  /** 通用撤销/重做：当前可撤销/重做状态（按钮 disabled + 标签用） */
  'data:undoState': { req: undefined; res: UndoState }
  'data:references': { req: ReferencesInput; res: ReferenceReport }
  'data:importLegacy': { req: ImportLegacyInput; res: ImportSummary }
  'data:exportLegacy': { req: ExportLegacyInput; res: ExportSummary }
  // 游戏数据 CSV / Excel 导入导出（迁移 features/export 的 export_csv/import_csv/export_excel/import_excel）
  'data:exportCsv': { req: ExportDirInput; res: CsvExportSummary }
  'data:importCsv': { req: ImportDataFileInput; res: ImportSummary }
  'data:exportExcel': { req: ExportDirInput; res: ExportSummary }
  'data:importExcel': { req: ImportDataFileInput; res: ImportSummary }
  /** 导入预览：解析文件、与库内比对，**不落库**（返回会话 id 供确认导入） */
  'data:previewImport': { req: PreviewImportInput; res: { previewId: string; preview: ImportPreview } }
  /** 确认导入：用预览时的解析结果落库（会话一次性消费） */
  'data:applyImport': { req: ApplyImportInput; res: ImportSummary }
  'dialog:chooseExportDir': { req: undefined; res: { path: string | null } }
  /** 选一个「项目文件夹」目录（策划书：打开已有项目） */
  'dialog:chooseProjectDir': { req: undefined; res: { path: string | null } }
  'dialog:chooseCsvFile': { req: undefined; res: { path: string | null } }
  'dialog:chooseExcelFile': { req: undefined; res: { path: string | null } }
  // AI 生图（features/_ai_image 能力缺口补齐）：生成 + 落盘
  // 注意：req.config.apiKey 由渲染层传空串即可，主进程会用系统钥匙串里的真实 Key 覆盖
  // （见 main/ipc.ts 的 image:generate handler）——明文不进 IPC 的「回程」也不进 localStorage。
  'image:generate': {
    req: ImageGenInput
    res: { ok: true; url: string; path: string } | { ok: false; error: string }
  }
  'dialog:chooseImageSaveDir': { req: undefined; res: { path: string | null } }
  /**
   * 选一张本地图片（数据编辑器「图片」字段）：主进程读文件并回传 `data:` URL。
   * 渲染层不能直接引用本地路径（`webSecurity`），故由主进程代读。
   */
  'dialog:chooseImageFile': { req: undefined; res: { path: string | null; dataUrl: string; bytes: number } }
  /**
   * 单次文本生成（数据编辑器 desc 类字段的「AI生成」/ 图片标签的「AI分析」）。
   * 复用主进程既有的 `LlmClient`（本地 ollama），**不新建模型客户端**。
   */
  /**
   * 列出图片库（`settings_dialog` → 工具页「清理未使用图片」的扫描侧）。
   *
   * `dir` 一并返回：渲染层要靠它把相对路径解析成可显示的完整路径。
   * 目录取 `<活跃库目录>/images` —— 切库时天然跟随，不需要渲染层传路径。
   */
  'images:libraryDir': { req: undefined; res: { dir: string } }
  'images:listLibraryImages': { req: undefined; res: { dir: string; libraryDir: string; files: string[] } }
  /**
   * 按已保存路径读取图片为 data URL。
   * ⚠️ 主进程只允许读**当前库 images 目录内**的文件，越界一律拒绝（安全硬约束）。
   */
  'images:readByPath': {
    req: ImageReadByPathInput
    res: { path: string | null; dataUrl: string; bytes: number; reason: string | null }
  }
  /** 物理删除图片。破坏性：主进程再校验 `confirm` 且**重跑差集复核** */
  'images:deleteImages': {
    req: DeleteImagesInput
    res: { deleted: number; failed: Array<{ path: string; reason: string }> }
  }
  'llm:generate': { req: LlmGenerateInput; res: { model: string; content: string } }
  /** 渲染层推 LLM 非敏感配置镜像（主进程读不到 localStorage）；API Key 不在其中 */
  'llm:configure': { req: LlmConfigureInput; res: { ok: boolean } }
  /** 测试连通性（E63）：返回可直接展示的中文结果，**失败也算成功返回**（不抛） */
  /** 测试连通性：探活当前已配置镜像
   *  （经 `llm:configure` 推过来），返回可直接展示的中文结果，**失败也算成功返回**（不抛）。
   *  req 为空：探活目标即当前已配置镜像，无需入参。 */
  'llm:testConnection': { req: Record<string, never>; res: { ok: boolean; message: string } }
  'llm:status': {
    req: Record<string, never>
    res: { available: boolean; models: string[]; message: string; provider?: string; model?: string }
  }

  // ---- 系统钥匙串（API Key 等敏感配置）----
  // 安全约定（不可违背）：渲染层是 sandbox + contextIsolation，**永远拿不到明文**。
  // 因此这里只有「有没有配过 / 写入 / 删除」三条通道，**刻意不存在**「读出明文」的 IPC。
  // 真正需要用 Key 时（如生图加 Authorization 头）由主进程在本地解密自用。
  'settings:hasSecret': { req: SecretNameInput; res: { has: boolean } }
  'settings:setSecret': { req: SetSecretInput; res: { ok: boolean; error?: string } }
  'settings:deleteSecret': { req: SecretNameInput; res: { ok: boolean; error?: string } }
  // 引擎数据导出：lua + unity/unreal/godot/cocos2d。
  // 渲染/落盘在 main/engineExport（lua 在 ./lua，其余四个在 ./engines），取数由 handler 注入。
  'engine:exportData': { req: EngineExportInput; res: { filePath: string; engine: string; bytes: number; backupPath?: string; manifestPath?: string; version?: number } }
  // 数据快照导出：把 SQLite 全量数据 + 类型 schema 渲染成**确定性可 git diff** 的 JSON/CSV，
  // 让策划改动能在 PR 里逐行审核（与 engine:exportData 给游戏运行态产物的定位不同，本通道是审查件）。
  'data:exportSnapshot': {
    req: DataSnapshotInput
    res: { filePath: string; format: string; bytes: number; itemCount: number; typeCount: number }
  }
  'dialog:chooseDataSnapshotFile': { req: DataSnapshotFileDialogInput; res: { path: string | null } }
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
  /**
   * 会话附件（对齐 dsh ui-attachment 的诚实子集）：
   * 选文件 → 复制进 `<活跃库>/attachments/` → 消息只存元数据。
   * `add` 失败返回 `ok:false`（不抛），`open` 用系统默认程序打开。
   */
  'dialog:chooseAttachmentFile': { req: undefined; res: { path: string | null } }
  'attachments:add': {
    req: AttachmentsAddInput
    res: { ok: true; attachment: DigitalAttachment } | { ok: false; error: string }
  }
  'attachments:open': { req: AttachmentsOpenInput; res: { ok: boolean; error?: string } }
  /** 图片附件读成 data URL（缩略图/lightbox）；仅限 `<库>/attachments/` 内，超限/非图返回 ok:false */
  'attachments:readImage': {
    req: AttachmentsReadImageInput
    res: { ok: true; dataUrl: string } | { ok: false; error: string }
  }
  /** 用系统默认程序打开任意路径（交付文件等不在 attachments 目录的产物） */
  'shell:openPath': { req: { path: string }; res: { ok: boolean; error?: string } }
  'agent:chat': {
    req: AgentChatInput
    res: { text: string; events: BrainEvent[]; completed: boolean; stats: AgentRunStats }
  }
  /** MCP 配置：读原始 JSON 文本（配置 UI 编辑用） */
  'mcp:getConfig': { req: undefined; res: { content: string } }
  /** MCP 配置：保存 JSON 文本并重连（解析失败返回 ok:false，不改文件） */
  'mcp:setConfig': {
    req: { content: string }
    res: { ok: boolean; error?: string; count?: number }
  }
  /**
   * 取消该窗口正在跑的长任务（对话循环、章节/数据/审校等单发 AI 生成）。
   * `taskId` 缺省 ⇒ 取消「该窗口当前活跃的一笔」；`cancelled: false` =
   * 没有匹配的任务（已结束 / id 不对 / 不属于该窗口）——不是错误，面板无需提示。
   *
   * 为什么是**一条**通道而不是每类任务各一条：取消是同一套语义（登记 → abort → 注销），
   * 分散成多条只会各自漂移。实现见 `main/task/taskRegistry.ts`。
   */
  'task:cancel': { req: TaskCancelInput; res: { cancelled: boolean } }
  'agent:approvalResponse': { req: { requestId: string; approved: boolean }; res: { ok: boolean } }
  'agent:interactionResponse': { req: AgentInteractionResponseInput; res: { ok: boolean } }
  /** 子智能体「继续对话」：对运行中的子智能体插话（push 消息进它的收件箱） */
  'agent:subagentSend': { req: AgentSubagentSendInput; res: { ok: boolean } }
  /** 单独停止某个运行中的子智能体（不牵连父循环） */
  'agent:subagentStop': { req: AgentSubagentStopInput; res: { ok: boolean } }
  'agent:sessionInfo': { req: undefined; res: SessionInfo }
  'agent:sessionRestore': { req: undefined; res: { messages: Array<Record<string, unknown>> } }
  'agent:sessionClear': { req: undefined; res: { cleared: boolean } }
  // 草稿管理
  'agent:draftSave': { req: AgentDraftSaveInput; res: DraftSummary }
  'agent:draftList': { req: undefined; res: DraftSummary[] }
  'agent:draftLoad': { req: AgentDraftLoadInput; res: { name: string; messages: Array<Record<string, unknown>> } }
  /** 用户反馈：评分 + 可选评论；评分 ≥4 且评论非空时提炼偏好写入偏好库 */
  'agent:feedback': { req: AgentFeedbackInput; res: undefined }
  /**
   * 会话历史检索（#25）：按 sessionId 聚合 turns.jsonl，返回每条会话的摘要
   * （首条用户消息作标题、消息数、最后活跃时间、轮次数）。`query` 可选，按标题/首消息子串过滤。
   */
  'agent:sessionTurns': { req: { query?: string }; res: { sessions: SessionTurnSummary[] } }
  /** 执行预审开关（#27）：渲染层插件经此开/关主进程侧的预审 provider */
  'agent:setPreReviewEnabled': { req: { enabled: boolean }; res: { ok: boolean } }
  /** 读取执行预审当前开关状态（#27，插件 UI 回显用） */
  'agent:getPreReviewEnabled': { req: undefined; res: { enabled: boolean } }
  /**
   * 最近改动（操作日志）：返回最近的 AI 数据变更记录（新→旧），供「最近改动」面板与对话内联改动卡。
   * `since` / `conversationId` 可选，缺省时与「全量最近 N 条」一致（向后兼容）。
   */
  'agent:recentChanges': {
    req: { limit?: number; since?: number; conversationId?: string }
    res: { changes: OperationRecord[] }
  }
  /**
   * 最近交付（交付日志）：Agent 显式交付给用户的文件（目前来自 `system.ceshu` 的 export）。
   * `since` / `conversationId` 可选，缺省 = 全量最近 N 条。
   */
  'agent:deliveries': {
    req: AgentDeliveriesInput
    res: { deliveries: DeliveryRecord[] }
  }

  'dialog:chooseEngineExportFile': { req: EngineExportFileDialogInput; res: { path: string | null } }

  // 库管理（A2-1）。库条目结构以 `main/library/store.ts` 的 `LibraryEntry` 为准，
  // 这里按线格式内联声明，避免 shared 反向依赖 main。
  //
  // `active` 必须与列表**同包**下发：切换库会让主进程广播 `library:changed`，渲染层收到后
  // 整页重载（App.tsx），组件内状态全部丢失。若只回条目数组，重载后只能猜「哪个是活跃库」
  // （早期实现退化成了 `list[0]`）⇒ 库条显示初始库、数据却来自新库，且再点初始库
  // 会被 `name === active` 判成无变化、切不回去（A2-2 回归，见 library-bar.spec）。
  'library:list': {
    req: undefined
    res: {
      libraries: Array<{ name: string; createdAt: string; description: string; isInitial: boolean }>
      active: string
    }
  }
  'library:create': {
    req: LibraryCreateInput
    res: { name: string; createdAt: string; description: string; isInitial: boolean }
  }
  'library:rename': { req: LibraryRenameInput; res: { ok: boolean } }
  // 破坏性：req.confirm 必须为 true，主进程再校验一次（整库删除不走撤销）
  'library:remove': { req: LibraryRemoveInput; res: { switchedTo: string | null } }
  'library:switch': { req: LibraryNameInput; res: { ok: boolean } }
  'ceshu:rename': { req: CeshuRenameInput; res: CeshuDocument }
  'ceshu:delete': { req: CeshuDeleteInput; res: { deleted: boolean } }
  'ceshu:duplicate': { req: { id: string }; res: CeshuDocument }
  'ceshu:setActive': { req: { id: string }; res: CeshuDocument }
  'ceshu:changelog': { req: { id: string }; res: CeshuChangelog }
  'ceshu:validate': { req: { id: string }; res: string[] }
  'ceshu:readiness': { req: { id: string }; res: CeshuReadinessReport }
  'ceshu:aiGenerateChapter': { req: CeshuAiGenerateInput; res: CeshuAiGenerateResult }
  /** 复刻拆解：参考游戏名 → AI 拆出「立项一页」→ 新建文档并返回（复刻单线 MVP） */
  'ceshu:cloneDecompose': { req: CeshuCloneDecomposeInput; res: { doc: CeshuDocument; model: string } }
  /** 导出项目文件夹：config.json + design/*.md + tasks/*.md */
  'ceshu:exportProjectFolder': { req: CeshuExportProjectInput; res: { dir: string; files: string[] } }
  /**
   * 导出**开发交接包**：分卷规格（架构→玩法→内容→系统→界面→打磨）+ 机读包 + 契约
   * + 数据表 schema/快照 + 原型。输入与「导出项目文件夹」同形（id + 目标目录）。
   */
  'ceshu:exportHandoff': { req: CeshuExportProjectInput; res: { dir: string; files: string[] } }
  /** 打开项目文件夹（一个游戏一个文件夹）：读目录 → 还原文档 → 在本库落地为项目文件夹 */
  'ceshu:openProjectFolder': { req: CeshuOpenProjectInput; res: { doc: CeshuDocument } }
  /** 岗位任务生成：整份文档 → 各岗位可执行任务（覆盖旧计划） */
  'ceshu:aiGenerateTasks': {
    req: CeshuAiTasksInput
    res: { doc: CeshuDocument; plan: CeshuTaskPlan; model: string }
  }
  /** 保存可玩原型（单文件 HTML）：落盘到项目文件夹 prototype/demo.html；空串 = 清掉 */
  'ceshu:saveDemo': { req: CeshuSaveDemoInput; res: { doc: CeshuDocument } }
  /** 设计 ↔ 数据表核对：策划书「所需数据表」vs 数据编辑器实际表（条数/字段） */
  'ceshu:checkDataTables': { req: CeshuCheckDataTablesInput; res: DataTableCheckResult }
  /** 设计契约体检：把 24 章里的可验证承诺投影成机读契约并整体检查（PASS/FAIL + findings） */
  'ceshu:checkContract': { req: CeshuCheckContractInput; res: ContractReport }
  /** 按声明补齐结构：只算不写，给用户看清楚要建什么 */
  'ceshu:planDataTableScaffold': { req: CeshuScaffoldDataTablesInput; res: ScaffoldPlan }
  /** 按声明补齐结构：落盘（建类型 / 加字段），返回改动数与重新核对结果 */
  'ceshu:applyDataTableScaffold': { req: CeshuScaffoldDataTablesInput; res: ScaffoldApplyResult }
  /** 按字段 AI 填充：
   *  单字段定向生成（非整章），提示词走 `buildChapterPrompt` 的 `onlyFields` 分支；res 复用整章生成结果形状。 */
  'ceshu:aiGenerateField': {
    req: { id: string; chapter: ChapterKey; field: string; action?: FieldAction }
    res: CeshuAiGenerateResult
  }
  'ceshu:aiReview': { req: { id: string; confirmed?: boolean }; res: CeshuAiReviewResult }
  'ceshu:aiGenerateData': { req: CeshuDataGenInput; res: CeshuDataGenResult }
  'ceshu:exportReviewReport': { req: CeshuReviewExportInput; res: { filePath: string } }
  'ceshu:autoFill': { req: { id: string }; res: { doc: CeshuDocument; filled: number } }
  /** 字段拆分迁移（幂等、非破坏）：把大 textarea 拆成 *_points + *_notes，原文保留可回滚 */
  'ceshu:migrateFieldSplits': {
    req: CeshuMigrateFieldSplitsInput
    res: { doc: CeshuDocument; migrated: Array<{ chapter: ChapterKey; fieldKey: string; points: number }> }
  }
  'ceshu:diff': { req: CeshuDiffInput; res: CeshuVersionDiff }
  'ceshu:exportDiffReport': { req: CeshuDiffExportInput; res: { filePath: string } }
  'ceshu:exportReadinessReport': { req: CeshuReadinessExportInput; res: { filePath: string } }
  'ceshu:exportValidationReport': { req: CeshuValidationExportInput; res: { filePath: string } }
  'ceshu:exportChangelogReport': { req: CeshuChangelogExportInput; res: { filePath: string } }
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
  'dialog:chooseCeshuExportFile': { req: CeshuChooseExportFileInput; res: { path: string | null } }
  'dialog:chooseReportFile': { req: ReportFileDialogInput; res: { path: string | null } }

  // 数据备份（整个活跃库的全量快照，存 <库>/backups/）。恢复/删除是**破坏性**操作：
  // req.confirm 必须为 true，主进程会再校验一次（渲染层确认可被绕过）。
  /** 列出活跃库的备份（按修改时间降序） */
  'backup:list': { req: undefined; res: BackupEntry[] }
  /** 创建备份（当前全量数据快照），返回新备份条目 */
  'backup:create': { req: BackupCreateInput; res: BackupEntry }
  /** 恢复备份：恢复前自动为当前数据生成 pre-restore 快照 */
  'backup:restore': { req: BackupRestoreInput; res: RestoreOutcome }
  /** 删除备份（软删除，改名为 .deleted 而非物理删除） */
  'backup:delete': { req: BackupDeleteInput; res: { deleted: boolean } }

  /*
   * 代码面板（中间窗口「代码编辑」页签）：列目录 + 读文本文件。
   *
   * 安全边界（与 settings:setSecret 的「明文不出主进程」同一思路的反向应用）：
   * 这是**用户本机、用户主动点开**的文件查看器，读什么由用户自己决定——但要防
   * 三类意外：① 超大文件撑爆渲染层（512KB 闸 + truncated 标记）；② 二进制文件
   * 被当文本渲染成乱码（首 8KB 探 NUL，命中返回 reason 不返回内容）；
   * ③ node_modules 噪音（列目录上限 500 条 + 渲染层扩展名白名单双保险）。
   * 刻意**不做写入**：只读查看器不碰用户文件，编辑是后续独立议题。
   */
  /** 列目录：目录在前、名称排序；entries 上限 500 条（truncated 标记） */
  'fs:listDir': { req: FsListDirInput; res: FsDirListing }
  /** 读文本文件：超限/二进制返回 reason（content 为空串），不抛异常 */
  'fs:readFile': { req: FsReadFileInput; res: FsFileContent }
  /** 代码面板默认根目录（dev 下为仓库根，生产为 app 所在目录的父目录） */
  'fs:appRoot': { req: undefined; res: { root: string } }
}

/** 目录条目（代码面板用：名称 + 是否目录 + 字节数） */
export interface FsDirEntry {
  name: string
  isDir: boolean
  /** 文件字节数；目录为 0 */
  size: number
}

/** fs:listDir 结果：绝对路径 + 条目（截断时 truncated=true，entries 为前 500 条） */
export interface FsDirListing {
  path: string
  entries: FsDirEntry[]
  truncated: boolean
}

/** fs:readFile 结果：超限/二进制时 content 为空串、reason 说明原因 */
export interface FsFileContent {
  path: string
  content: string
  bytes: number
  truncated: boolean
  reason: string | null
}

/** 撤销/重做结果（对齐 AI 回滚风格：成功数 + 失败 + 跳过，绝不假装「全部成功」） */
export interface UndoResult {
  /** 实际应用的条目数 */
  applied: number
  /** 执行失败条目（中文原因） */
  failed: { name: string; reason: string }[]
  /** 因存在性/冲突/被改过等前置检查未通过而跳过的条目 */
  skipped: { name: string; reason: string }[]
  canUndo: boolean
  canRedo: boolean
}

/** 撤销/重做状态（渲染层按钮 disabled 与标签用） */
export interface UndoState {
  canUndo: boolean
  canRedo: boolean
  /** 栈顶操作的展示名；批量操作为「批量操作（N 项）」 */
  nextUndo: string | null
  nextRedo: string | null
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