import type { IpcContract } from './ipc'

/** 暴露给渲染层的 window.mbApi 接口（preload 实现、渲染层声明共用） */
export interface MbApi {
  app: {
    info(): Promise<IpcContract['app:info']['res']>
  }
  data: {
    listTypes(): Promise<IpcContract['data:listTypes']['res']>
    listItems(req: IpcContract['data:listItems']['req']): Promise<IpcContract['data:listItems']['res']>
    createItem(req: IpcContract['data:createItem']['req']): Promise<IpcContract['data:createItem']['res']>
    updateItem(req: IpcContract['data:updateItem']['req']): Promise<IpcContract['data:updateItem']['res']>
    deleteItem(req: IpcContract['data:deleteItem']['req']): Promise<IpcContract['data:deleteItem']['res']>
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
  }
}