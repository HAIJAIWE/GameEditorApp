import type { IpcContract } from '../ipc'

/** 暴露给渲染层的 window.mbApi 接口（preload 实现、渲染层声明共用） */
export interface MbApi {
  /**
   * 通用「取消长任务」。对话循环与单发 AI 生成共用一条通道：
   * 面板只需在看得到「进行中」时提供停止按钮，不必自己管理 taskId。
   */
  task: {
    cancel(req: IpcContract['task:cancel']['req']): Promise<IpcContract['task:cancel']['res']>
  }
  app: {
    info(): Promise<IpcContract['app:info']['res']>
    log(req: IpcContract['app:log']['req']): Promise<IpcContract['app:log']['res']>
    setWindowMode(req: IpcContract['app:setWindowMode']['req']): Promise<IpcContract['app:setWindowMode']['res']>
    /** 视图菜单动作：放大/缩小/重置缩放、重新加载、开发者工具 */
    viewAction(req: IpcContract['app:viewAction']['req']): Promise<IpcContract['app:viewAction']['res']>
  }
  agent: {
    listTools(): Promise<IpcContract['agent:listTools']['res']>
    executeTool(req: IpcContract['agent:executeTool']['req']): Promise<IpcContract['agent:executeTool']['res']>
    chat(req: IpcContract['agent:chat']['req']): Promise<IpcContract['agent:chat']['res']>
    respondApproval(
      req: IpcContract['agent:approvalResponse']['req']
    ): Promise<IpcContract['agent:approvalResponse']['res']>
    respondInteraction(
      req: IpcContract['agent:interactionResponse']['req']
    ): Promise<IpcContract['agent:interactionResponse']['res']>
    /** 子智能体「继续对话」：对运行中的子智能体插话（push 消息进它的收件箱） */
    subagentSend(req: IpcContract['agent:subagentSend']['req']): Promise<IpcContract['agent:subagentSend']['res']>
    /** 单独停止某个运行中的子智能体（不牵连父循环） */
    subagentStop(req: IpcContract['agent:subagentStop']['req']): Promise<IpcContract['agent:subagentStop']['res']>
    sessionInfo(): Promise<IpcContract['agent:sessionInfo']['res']>
    sessionRestore(): Promise<IpcContract['agent:sessionRestore']['res']>
    sessionClear(): Promise<IpcContract['agent:sessionClear']['res']>
    /** 草稿：保存当前会话为草稿（名字空则主进程回落默认名） */
    draftSave(req: IpcContract['agent:draftSave']['req']): Promise<IpcContract['agent:draftSave']['res']>
    /** 草稿：列出最近草稿（上限 5 条，按时间倒序） */
    draftList(): Promise<IpcContract['agent:draftList']['res']>
    /** 草稿：读取指定草稿 */
    draftLoad(req: IpcContract['agent:draftLoad']['req']): Promise<IpcContract['agent:draftLoad']['res']>
    /** 提交用户反馈（评分 + 可选评论）；评分高且带评论时提炼偏好 */
    feedback(req: IpcContract['agent:feedback']['req']): Promise<IpcContract['agent:feedback']['res']>
    /** 会话历史检索（#25）：聚合 turns.jsonl 为会话摘要，可选按内容搜索 */
    sessionTurns(req: IpcContract['agent:sessionTurns']['req']): Promise<IpcContract['agent:sessionTurns']['res']>
    /** 执行预审开关（#27）：开/关主进程侧预审 provider */
    setPreReviewEnabled(req: IpcContract['agent:setPreReviewEnabled']['req']): Promise<IpcContract['agent:setPreReviewEnabled']['res']>
    /** 读取执行预审当前开关状态（#27，UI 回显） */
    getPreReviewEnabled(): Promise<IpcContract['agent:getPreReviewEnabled']['res']>
    /** 最近改动（操作日志）：最近的数据变更记录（新→旧） */
    recentChanges(req: IpcContract['agent:recentChanges']['req']): Promise<IpcContract['agent:recentChanges']['res']>
    /** 最近交付（交付日志）：Agent 显式交付的文件（新→旧） */
    deliveries(req: IpcContract['agent:deliveries']['req']): Promise<IpcContract['agent:deliveries']['res']>
    /** 订阅主进程推送的事件流；返回取消订阅函数 */
    onEvent(handler: (event: unknown) => void): () => void
  }

  mcp: {
    /** 读取 MCP 配置（原始 JSON 文本，供配置面板编辑） */
    getConfig(): Promise<IpcContract['mcp:getConfig']['res']>
    /** 保存 MCP 配置（JSON 文本）并重连 */
    setConfig(req: IpcContract['mcp:setConfig']['req']): Promise<IpcContract['mcp:setConfig']['res']>
  }

  library: {
    list(): Promise<IpcContract['library:list']['res']>
    create(req: IpcContract['library:create']['req']): Promise<IpcContract['library:create']['res']>
    rename(req: IpcContract['library:rename']['req']): Promise<IpcContract['library:rename']['res']>
    remove(req: IpcContract['library:remove']['req']): Promise<IpcContract['library:remove']['res']>
    switch(req: IpcContract['library:switch']['req']): Promise<IpcContract['library:switch']['res']>
    /** 订阅活跃库变化；返回取消订阅函数 */
    onChanged(handler: (payload: unknown) => void): () => void
  }
  schema: {
    list(): Promise<IpcContract['schema:list']['res']>
    save(req: IpcContract['schema:save']['req']): Promise<IpcContract['schema:save']['res']>
    /** 字段 ID 的 AI 候选（术语表未收录时使用；需本地 Ollama） */
    suggestFieldIds(
      req: IpcContract['schema:suggestFieldIds']['req']
    ): Promise<IpcContract['schema:suggestFieldIds']['res']>
    /** 字段模板名清单（内置 + 用户自定义） */
    listFieldTemplates(): Promise<IpcContract['schema:listFieldTemplates']['res']>
    /** 读取自定义模板的完整字段定义 */
    getFieldTemplate(
      req: IpcContract['schema:getFieldTemplate']['req']
    ): Promise<IpcContract['schema:getFieldTemplate']['res']>
    /** 保存（新建/覆盖）自定义字段模板 */
    saveFieldTemplate(
      req: IpcContract['schema:saveFieldTemplate']['req']
    ): Promise<IpcContract['schema:saveFieldTemplate']['res']>
    /** 删除自定义字段模板 */
    deleteFieldTemplate(
      req: IpcContract['schema:deleteFieldTemplate']['req']
    ): Promise<IpcContract['schema:deleteFieldTemplate']['res']>
  }
  attrSystem: {
    get(): Promise<IpcContract['attrSystem:get']['res']>
    save(req: IpcContract['attrSystem:save']['req']): Promise<IpcContract['attrSystem:save']['res']>
    exportGameConfig(
      req: IpcContract['attrSystem:exportGameConfig']['req']
    ): Promise<IpcContract['attrSystem:exportGameConfig']['res']>
    exportJson(req: IpcContract['attrSystem:exportJson']['req']): Promise<IpcContract['attrSystem:exportJson']['res']>
    importJson(req: IpcContract['attrSystem:importJson']['req']): Promise<IpcContract['attrSystem:importJson']['res']>
  }
  data: {
    listItems(req: IpcContract['data:listItems']['req']): Promise<IpcContract['data:listItems']['res']>
    /** 全量条目（跨类型） */
    listAll(): Promise<IpcContract['data:listAll']['res']>
    createItem(req: IpcContract['data:createItem']['req']): Promise<IpcContract['data:createItem']['res']>
    updateItem(req: IpcContract['data:updateItem']['req']): Promise<IpcContract['data:updateItem']['res']>
    deleteItem(req: IpcContract['data:deleteItem']['req']): Promise<IpcContract['data:deleteItem']['res']>
    batchUpdate(req: IpcContract['data:batchUpdate']['req']): Promise<IpcContract['data:batchUpdate']['res']>
    deleteMany(req: IpcContract['data:deleteMany']['req']): Promise<IpcContract['data:deleteMany']['res']>
    /**
     * 清空整个活跃库的数据（破坏性）：req.confirm 必须为 true。
     * 走 deleteMany 的统一路径 ⇒ 可用「撤销 (Ctrl+Z)」整批找回。
     */
    clearAll(req: IpcContract['data:clearAll']['req']): Promise<IpcContract['data:clearAll']['res']>
    /** 撤销栈顶操作（用户手动操作的安全子集） */
    undo(): Promise<IpcContract['data:undo']['res']>
    /** 重做栈顶操作 */
    redo(): Promise<IpcContract['data:redo']['res']>
    /** 当前可撤销/重做状态 */
    undoState(): Promise<IpcContract['data:undoState']['res']>
    references(req: IpcContract['data:references']['req']): Promise<IpcContract['data:references']['res']>
    importLegacy(req: IpcContract['data:importLegacy']['req']): Promise<IpcContract['data:importLegacy']['res']>
    exportLegacy(req: IpcContract['data:exportLegacy']['req']): Promise<IpcContract['data:exportLegacy']['res']>
    exportCsv(req: IpcContract['data:exportCsv']['req']): Promise<IpcContract['data:exportCsv']['res']>
    importCsv(req: IpcContract['data:importCsv']['req']): Promise<IpcContract['data:importCsv']['res']>
    exportExcel(req: IpcContract['data:exportExcel']['req']): Promise<IpcContract['data:exportExcel']['res']>
    importExcel(req: IpcContract['data:importExcel']['req']): Promise<IpcContract['data:importExcel']['res']>
    /** 导入预览：解析文件并与库内比对，不落库 */
    previewImport(req: IpcContract['data:previewImport']['req']): Promise<IpcContract['data:previewImport']['res']>
    /** 确认导入：用预览时的解析结果落库 */
    applyImport(req: IpcContract['data:applyImport']['req']): Promise<IpcContract['data:applyImport']['res']>
    /** 数据快照导出（确定性 JSON / 单表 CSV，供 git/PR 审核；与引擎运行态导出定位不同） */
    exportSnapshot(
      req: IpcContract['data:exportSnapshot']['req']
    ): Promise<IpcContract['data:exportSnapshot']['res']>
  }
  image: {
    generate(req: IpcContract['image:generate']['req']): Promise<IpcContract['image:generate']['res']>
  }
  /**
   * 系统钥匙串（主进程用 Electron `safeStorage` 加密落盘到 `userData/secrets.enc`）。
   *
   * 注意：**没有「读取明文」接口**——渲染层永远拿不到 API Key 明文，只知道有没有配过。
   * 需要用 Key 的操作（如生图）由主进程在本地解密自用，不经 IPC 回传。
   */
  settings: {
    /** 某密钥是否已配置（不解密，渲染层就靠它显示「已配置」） */
    hasSecret(req: IpcContract['settings:hasSecret']['req']): Promise<IpcContract['settings:hasSecret']['res']>
    /** 写入密钥（主进程加密落盘；成功后调用方应立即清空自己持有的明文） */
    setSecret(req: IpcContract['settings:setSecret']['req']): Promise<IpcContract['settings:setSecret']['res']>
    /** 删除密钥 */
    deleteSecret(
      req: IpcContract['settings:deleteSecret']['req']
    ): Promise<IpcContract['settings:deleteSecret']['res']>
  }
  engine: {
    exportData(req: IpcContract['engine:exportData']['req']): Promise<IpcContract['engine:exportData']['res']>
  }
  /** 数据备份（整库快照）。restore/remove 为破坏性操作，需传 confirm=true */
  backup: {
    list(): Promise<IpcContract['backup:list']['res']>
    create(req: IpcContract['backup:create']['req']): Promise<IpcContract['backup:create']['res']>
    restore(req: IpcContract['backup:restore']['req']): Promise<IpcContract['backup:restore']['res']>
    remove(req: IpcContract['backup:delete']['req']): Promise<IpcContract['backup:delete']['res']>
  }
  /** 代码面板（只读）：列目录 + 读文本文件 + 默认根目录 */
  fs: {
    listDir(req: IpcContract['fs:listDir']['req']): Promise<IpcContract['fs:listDir']['res']>
    readFile(req: IpcContract['fs:readFile']['req']): Promise<IpcContract['fs:readFile']['res']>
    appRoot(): Promise<IpcContract['fs:appRoot']['res']>
  }
  llm: {
    /** 单次文本生成（数据编辑器字段级 AI 按钮） */
    generate(req: IpcContract['llm:generate']['req']): Promise<IpcContract['llm:generate']['res']>
    /** 推 LLM 非敏感配置镜像 */
    configure(req: IpcContract['llm:configure']['req']): Promise<IpcContract['llm:configure']['res']>
    /** 探测当前配置下的服务可用性（设置面板状态提示用） */
    status(): Promise<IpcContract['llm:status']['res']>
    /** 测试当前配置下的服务连通性（设置面板「测试连接」按钮） */
    testConnection(): Promise<IpcContract['llm:testConnection']['res']>
  },
  /** 会话附件：复制进 `<库>/attachments/` + 用系统程序打开（诚实子集，无上传进度/lightbox） */
  attachments: {
    add(req: IpcContract['attachments:add']['req']): Promise<IpcContract['attachments:add']['res']>
    open(req: IpcContract['attachments:open']['req']): Promise<IpcContract['attachments:open']['res']>
    /** 图片附件读成 data URL（缩略图/lightbox）；仅限库内附件目录 */
    readImage(req: IpcContract['attachments:readImage']['req']): Promise<IpcContract['attachments:readImage']['res']>
    /**
     * 拖拽文件取本地路径（同步）。渲染层是沙箱，`File.path` 在 Electron 32+ 已移除，
     * 只能经 preload 暴露的 `webUtils.getPathForFile` 取；拿不到返回空串。
     */
    pathForFile(file: unknown): string
  }
  /** 图片库扫描 / 清理（`deleteImages` 是破坏性操作，`confirm` 必填true） */
  images: {
    listLibraryImages(): Promise<IpcContract['images:listLibraryImages']['res']>
    /** 按已保存路径回显预览 */
    readByPath(req: IpcContract['images:readByPath']['req']): Promise<IpcContract['images:readByPath']['res']>
    deleteImages(req: IpcContract['images:deleteImages']['req']): Promise<IpcContract['images:deleteImages']['res']>
  },
  dialog: {
    chooseJsonFile(): Promise<IpcContract['dialog:chooseJsonFile']['res']>
    chooseEngineExportFile(
      req: IpcContract['dialog:chooseEngineExportFile']['req']
    ): Promise<IpcContract['dialog:chooseEngineExportFile']['res']>
    chooseDataSnapshotFile(
      req: IpcContract['dialog:chooseDataSnapshotFile']['req']
    ): Promise<IpcContract['dialog:chooseDataSnapshotFile']['res']>
    chooseSaveJsonFile(): Promise<IpcContract['dialog:chooseSaveJsonFile']['res']>
    chooseExportDir(): Promise<IpcContract['dialog:chooseExportDir']['res']>
    /** 选一个项目文件夹目录（策划书：打开已有项目） */
    chooseProjectDir(): Promise<IpcContract['dialog:chooseProjectDir']['res']>
    chooseCsvFile(): Promise<IpcContract['dialog:chooseCsvFile']['res']>
    chooseExcelFile(): Promise<IpcContract['dialog:chooseExcelFile']['res']>
    chooseImageSaveDir(): Promise<IpcContract['dialog:chooseImageSaveDir']['res']>
    /** 选一张本地图片（数据编辑器「图片」字段）；主进程代读文件并回传 data URL */
    chooseImageFile(): Promise<IpcContract['dialog:chooseImageFile']['res']>
    /** 选一个会话附件文件（复制进库由 `attachments:add` 负责） */
    chooseAttachmentFile(): Promise<IpcContract['dialog:chooseAttachmentFile']['res']>
    chooseTemplateJsonFile(
      req: IpcContract['dialog:chooseTemplateJsonFile']['req']
    ): Promise<IpcContract['dialog:chooseTemplateJsonFile']['res']>
    chooseCeshuExportFile(
      req: IpcContract['dialog:chooseCeshuExportFile']['req']
    ): Promise<IpcContract['dialog:chooseCeshuExportFile']['res']>
    chooseReportFile(
      req: IpcContract['dialog:chooseReportFile']['req']
    ): Promise<IpcContract['dialog:chooseReportFile']['res']>
    chooseAttrSystemJsonFile(
      req: IpcContract['dialog:chooseAttrSystemJsonFile']['req']
    ): Promise<IpcContract['dialog:chooseAttrSystemJsonFile']['res']>
  }
  ceshu: {
    list(): Promise<IpcContract['ceshu:list']['res']>
    create(req: IpcContract['ceshu:create']['req']): Promise<IpcContract['ceshu:create']['res']>
    get(req: IpcContract['ceshu:get']['req']): Promise<IpcContract['ceshu:get']['res']>
    saveChapter(req: IpcContract['ceshu:saveChapter']['req']): Promise<IpcContract['ceshu:saveChapter']['res']>
    export(req: IpcContract['ceshu:export']['req']): Promise<IpcContract['ceshu:export']['res']>
    versions(req: IpcContract['ceshu:versions']['req']): Promise<IpcContract['ceshu:versions']['res']>
    derive(req: IpcContract['ceshu:derive']['req']): Promise<IpcContract['ceshu:derive']['res']>
    applyPreset(req: IpcContract['ceshu:applyPreset']['req']): Promise<IpcContract['ceshu:applyPreset']['res']>
    confirmSystems(
      req: IpcContract['ceshu:confirmSystems']['req']
    ): Promise<IpcContract['ceshu:confirmSystems']['res']>
    syncData(req: IpcContract['ceshu:syncData']['req']): Promise<IpcContract['ceshu:syncData']['res']>
    rename(req: IpcContract['ceshu:rename']['req']): Promise<IpcContract['ceshu:rename']['res']>
    remove(req: IpcContract['ceshu:delete']['req']): Promise<IpcContract['ceshu:delete']['res']>
    duplicate(req: IpcContract['ceshu:duplicate']['req']): Promise<IpcContract['ceshu:duplicate']['res']>
    setActive(req: IpcContract['ceshu:setActive']['req']): Promise<IpcContract['ceshu:setActive']['res']>
    changelog(req: IpcContract['ceshu:changelog']['req']): Promise<IpcContract['ceshu:changelog']['res']>
    validate(req: IpcContract['ceshu:validate']['req']): Promise<IpcContract['ceshu:validate']['res']>
    readiness(req: IpcContract['ceshu:readiness']['req']): Promise<IpcContract['ceshu:readiness']['res']>
    aiGenerateChapter(
      req: IpcContract['ceshu:aiGenerateChapter']['req']
    ): Promise<IpcContract['ceshu:aiGenerateChapter']['res']>
    /** 复刻拆解：参考游戏名 → 立项一页 → 新建文档（复刻单线 MVP） */
    cloneDecompose(
      req: IpcContract['ceshu:cloneDecompose']['req']
    ): Promise<IpcContract['ceshu:cloneDecompose']['res']>
    exportProjectFolder(
      req: IpcContract['ceshu:exportProjectFolder']['req']
    ): Promise<IpcContract['ceshu:exportProjectFolder']['res']>
    /** 导出开发交接包（分卷施工图 + 机读包 + 契约 + 数据表快照 + 原型） */
    exportHandoff(
      req: IpcContract['ceshu:exportHandoff']['req']
    ): Promise<IpcContract['ceshu:exportHandoff']['res']>
    /** 打开项目文件夹（一个游戏一个文件夹）：还原文档并落地到本库 */
    openProjectFolder(
      req: IpcContract['ceshu:openProjectFolder']['req']
    ): Promise<IpcContract['ceshu:openProjectFolder']['res']>
    /** 岗位任务生成：整份文档 → 各岗位可执行任务 */
    aiGenerateTasks(
      req: IpcContract['ceshu:aiGenerateTasks']['req']
    ): Promise<IpcContract['ceshu:aiGenerateTasks']['res']>
    /** 保存可玩原型（单文件 HTML） */
    saveDemo(req: IpcContract['ceshu:saveDemo']['req']): Promise<IpcContract['ceshu:saveDemo']['res']>
    /** 设计 ↔ 数据表核对 */
    checkDataTables(
      req: IpcContract['ceshu:checkDataTables']['req']
    ): Promise<IpcContract['ceshu:checkDataTables']['res']>
    /** 设计契约体检：投影机读契约并整体检查（PASS/FAIL + findings） */
    checkContract(
      req: IpcContract['ceshu:checkContract']['req']
    ): Promise<IpcContract['ceshu:checkContract']['res']>
    /** 按声明补齐数据表结构（只算不写） */
    planDataTableScaffold(
      req: IpcContract['ceshu:planDataTableScaffold']['req']
    ): Promise<IpcContract['ceshu:planDataTableScaffold']['res']>
    /** 按声明补齐数据表结构（落盘） */
    applyDataTableScaffold(
      req: IpcContract['ceshu:applyDataTableScaffold']['req']
    ): Promise<IpcContract['ceshu:applyDataTableScaffold']['res']>
    aiReview(req: IpcContract['ceshu:aiReview']['req']): Promise<IpcContract['ceshu:aiReview']['res']>
    aiGenerateData(
      req: IpcContract['ceshu:aiGenerateData']['req']
    ): Promise<IpcContract['ceshu:aiGenerateData']['res']>
    /** 按字段 AI 填充（E62）：单字段定向生成，返回清洗后的字段供表单回填 */
    aiGenerateField(
      req: IpcContract['ceshu:aiGenerateField']['req']
    ): Promise<IpcContract['ceshu:aiGenerateField']['res']>
    exportReviewReport(
      req: IpcContract['ceshu:exportReviewReport']['req']
    ): Promise<IpcContract['ceshu:exportReviewReport']['res']>
    autoFill(req: IpcContract['ceshu:autoFill']['req']): Promise<IpcContract['ceshu:autoFill']['res']>
    /** 字段拆分迁移（幂等、非破坏）：大 textarea → 要点列表 + 补充说明，原文保留 */
    migrateFieldSplits(
      req: IpcContract['ceshu:migrateFieldSplits']['req']
    ): Promise<IpcContract['ceshu:migrateFieldSplits']['res']>
    diff(req: IpcContract['ceshu:diff']['req']): Promise<IpcContract['ceshu:diff']['res']>
    exportDiffReport(
      req: IpcContract['ceshu:exportDiffReport']['req']
    ): Promise<IpcContract['ceshu:exportDiffReport']['res']>
    exportReadinessReport(
      req: IpcContract['ceshu:exportReadinessReport']['req']
    ): Promise<IpcContract['ceshu:exportReadinessReport']['res']>
    exportValidationReport(
      req: IpcContract['ceshu:exportValidationReport']['req']
    ): Promise<IpcContract['ceshu:exportValidationReport']['res']>
    exportChangelogReport(
      req: IpcContract['ceshu:exportChangelogReport']['req']
    ): Promise<IpcContract['ceshu:exportChangelogReport']['res']>
    notes: {
      list(req: IpcContract['ceshu:notes:list']['req']): Promise<IpcContract['ceshu:notes:list']['res']>
      add(req: IpcContract['ceshu:notes:add']['req']): Promise<IpcContract['ceshu:notes:add']['res']>
      update(req: IpcContract['ceshu:notes:update']['req']): Promise<IpcContract['ceshu:notes:update']['res']>
      remove(req: IpcContract['ceshu:notes:delete']['req']): Promise<IpcContract['ceshu:notes:delete']['res']>
    }
    templates: {
      list(req: IpcContract['ceshu:templates:list']['req']): Promise<IpcContract['ceshu:templates:list']['res']>
      save(req: IpcContract['ceshu:templates:save']['req']): Promise<IpcContract['ceshu:templates:save']['res']>
      remove(req: IpcContract['ceshu:templates:delete']['req']): Promise<IpcContract['ceshu:templates:delete']['res']>
      update(req: IpcContract['ceshu:templates:update']['req']): Promise<IpcContract['ceshu:templates:update']['res']>
      exportAll(
        req: IpcContract['ceshu:templates:export']['req']
      ): Promise<IpcContract['ceshu:templates:export']['res']>
      importAll(
        req: IpcContract['ceshu:templates:import']['req']
      ): Promise<IpcContract['ceshu:templates:import']['res']>
    }
  }
}