import type { IpcContract } from './ipc'

/** 暴露给渲染层的 window.mbApi 接口（preload 实现、渲染层声明共用） */
export interface MbApi {
  app: {
    info(): Promise<IpcContract['app:info']['res']>
    log(req: IpcContract['app:log']['req']): Promise<IpcContract['app:log']['res']>
    setWindowMode(req: IpcContract['app:setWindowMode']['req']): Promise<IpcContract['app:setWindowMode']['res']>
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
    sessionInfo(): Promise<IpcContract['agent:sessionInfo']['res']>
    sessionRestore(): Promise<IpcContract['agent:sessionRestore']['res']>
    sessionClear(): Promise<IpcContract['agent:sessionClear']['res']>
    /** 提交用户反馈（评分 + 可选评论）；评分高且带评论时提炼偏好 */
    feedback(req: IpcContract['agent:feedback']['req']): Promise<IpcContract['agent:feedback']['res']>
    /** 订阅主进程推送的事件流；返回取消订阅函数 */
    onEvent(handler: (event: unknown) => void): () => void
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
    references(req: IpcContract['data:references']['req']): Promise<IpcContract['data:references']['res']>
    importLegacy(req: IpcContract['data:importLegacy']['req']): Promise<IpcContract['data:importLegacy']['res']>
    exportLegacy(req: IpcContract['data:exportLegacy']['req']): Promise<IpcContract['data:exportLegacy']['res']>
    exportCsv(req: IpcContract['data:exportCsv']['req']): Promise<IpcContract['data:exportCsv']['res']>
    importCsv(req: IpcContract['data:importCsv']['req']): Promise<IpcContract['data:importCsv']['res']>
    exportExcel(req: IpcContract['data:exportExcel']['req']): Promise<IpcContract['data:exportExcel']['res']>
    importExcel(req: IpcContract['data:importExcel']['req']): Promise<IpcContract['data:importExcel']['res']>
  }
  image: {
    generate(req: IpcContract['image:generate']['req']): Promise<IpcContract['image:generate']['res']>
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
  dialog: {
    chooseJsonFile(): Promise<IpcContract['dialog:chooseJsonFile']['res']>
    chooseEngineExportFile(
      req: IpcContract['dialog:chooseEngineExportFile']['req']
    ): Promise<IpcContract['dialog:chooseEngineExportFile']['res']>
    chooseSaveJsonFile(): Promise<IpcContract['dialog:chooseSaveJsonFile']['res']>
    chooseExportDir(): Promise<IpcContract['dialog:chooseExportDir']['res']>
    chooseCsvFile(): Promise<IpcContract['dialog:chooseCsvFile']['res']>
    chooseExcelFile(): Promise<IpcContract['dialog:chooseExcelFile']['res']>
    chooseImageSaveDir(): Promise<IpcContract['dialog:chooseImageSaveDir']['res']>
    chooseTemplateJsonFile(
      req: IpcContract['dialog:chooseTemplateJsonFile']['req']
    ): Promise<IpcContract['dialog:chooseTemplateJsonFile']['res']>
    chooseCeshuExportFile(
      req: IpcContract['dialog:chooseCeshuExportFile']['req']
    ): Promise<IpcContract['dialog:chooseCeshuExportFile']['res']>
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
    score(req: IpcContract['ceshu:score']['req']): Promise<IpcContract['ceshu:score']['res']>
    aiGenerateChapter(
      req: IpcContract['ceshu:aiGenerateChapter']['req']
    ): Promise<IpcContract['ceshu:aiGenerateChapter']['res']>
    aiReview(req: IpcContract['ceshu:aiReview']['req']): Promise<IpcContract['ceshu:aiReview']['res']>
    aiGenerateData(
      req: IpcContract['ceshu:aiGenerateData']['req']
    ): Promise<IpcContract['ceshu:aiGenerateData']['res']>
    exportReviewReport(
      req: IpcContract['ceshu:exportReviewReport']['req']
    ): Promise<IpcContract['ceshu:exportReviewReport']['res']>
    checklist(req: IpcContract['ceshu:checklist']['req']): Promise<IpcContract['ceshu:checklist']['res']>
    autoFill(req: IpcContract['ceshu:autoFill']['req']): Promise<IpcContract['ceshu:autoFill']['res']>
    exportChecklistReport(
      req: IpcContract['ceshu:exportChecklistReport']['req']
    ): Promise<IpcContract['ceshu:exportChecklistReport']['res']>
    diff(req: IpcContract['ceshu:diff']['req']): Promise<IpcContract['ceshu:diff']['res']>
    exportDiffReport(
      req: IpcContract['ceshu:exportDiffReport']['req']
    ): Promise<IpcContract['ceshu:exportDiffReport']['res']>
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
    wordStats(req: IpcContract['ceshu:wordStats']['req']): Promise<IpcContract['ceshu:wordStats']['res']>
    fieldDeps(req: IpcContract['ceshu:fieldDeps']['req']): Promise<IpcContract['ceshu:fieldDeps']['res']>
  }
}