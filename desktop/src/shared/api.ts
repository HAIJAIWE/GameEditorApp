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
    deleteItem(req: IpcContract['data:deleteItem']['req']): Promise<IpcContract['data:deleteItem']['res']>
    importLegacy(req: IpcContract['data:importLegacy']['req']): Promise<IpcContract['data:importLegacy']['res']>
  }
  dialog: {
    chooseJsonFile(): Promise<IpcContract['dialog:chooseJsonFile']['res']>
  }
}