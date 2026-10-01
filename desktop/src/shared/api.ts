import type { IpcContract } from './ipc'

/** 暴露给渲染层的 window.mbApi 接口（preload 实现、渲染层声明共用） */
export interface MbApi {
  app: {
    info(): Promise<IpcContract['app:info']['res']>
  }
  schema: {
    list(): Promise<IpcContract['schema:list']['res']>
    save(req: IpcContract['schema:save']['req']): Promise<IpcContract['schema:save']['res']>
  }
  data: {
    listItems(req: IpcContract['data:listItems']['req']): Promise<IpcContract['data:listItems']['res']>
    createItem(req: IpcContract['data:createItem']['req']): Promise<IpcContract['data:createItem']['res']>
    updateItem(req: IpcContract['data:updateItem']['req']): Promise<IpcContract['data:updateItem']['res']>
    deleteItem(req: IpcContract['data:deleteItem']['req']): Promise<IpcContract['data:deleteItem']['res']>
    batchUpdate(req: IpcContract['data:batchUpdate']['req']): Promise<IpcContract['data:batchUpdate']['res']>
    deleteMany(req: IpcContract['data:deleteMany']['req']): Promise<IpcContract['data:deleteMany']['res']>
    importLegacy(req: IpcContract['data:importLegacy']['req']): Promise<IpcContract['data:importLegacy']['res']>
    exportLegacy(req: IpcContract['data:exportLegacy']['req']): Promise<IpcContract['data:exportLegacy']['res']>
  }
  dialog: {
    chooseJsonFile(): Promise<IpcContract['dialog:chooseJsonFile']['res']>
    chooseSaveJsonFile(): Promise<IpcContract['dialog:chooseSaveJsonFile']['res']>
    chooseCeshuExportFile(
      req: IpcContract['dialog:chooseCeshuExportFile']['req']
    ): Promise<IpcContract['dialog:chooseCeshuExportFile']['res']>
  }
  ceshu: {
    list(): Promise<IpcContract['ceshu:list']['res']>
    create(req: IpcContract['ceshu:create']['req']): Promise<IpcContract['ceshu:create']['res']>
    get(req: IpcContract['ceshu:get']['req']): Promise<IpcContract['ceshu:get']['res']>
    saveChapter(req: IpcContract['ceshu:saveChapter']['req']): Promise<IpcContract['ceshu:saveChapter']['res']>
    export(req: IpcContract['ceshu:export']['req']): Promise<IpcContract['ceshu:export']['res']>
    versions(req: IpcContract['ceshu:versions']['req']): Promise<IpcContract['ceshu:versions']['res']>
    derive(req: IpcContract['ceshu:derive']['req']): Promise<IpcContract['ceshu:derive']['res']>
    setActive(req: IpcContract['ceshu:setActive']['req']): Promise<IpcContract['ceshu:setActive']['res']>
    changelog(req: IpcContract['ceshu:changelog']['req']): Promise<IpcContract['ceshu:changelog']['res']>
    validate(req: IpcContract['ceshu:validate']['req']): Promise<IpcContract['ceshu:validate']['res']>
    score(req: IpcContract['ceshu:score']['req']): Promise<IpcContract['ceshu:score']['res']>
    aiGenerateChapter(
      req: IpcContract['ceshu:aiGenerateChapter']['req']
    ): Promise<IpcContract['ceshu:aiGenerateChapter']['res']>
  }
}