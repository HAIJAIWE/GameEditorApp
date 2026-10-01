import { contextBridge, ipcRenderer } from 'electron'

import type { MbApi } from '../shared/api'
import { IpcInvokeError, type IpcChannel, type IpcContract, type IpcResult } from '../shared/ipc'

/** 类型安全的 invoke：统一解包 IpcResult，失败抛出 IpcInvokeError */
async function invoke<C extends IpcChannel>(channel: C, req: IpcContract[C]['req']): Promise<IpcContract[C]['res']> {
  const result = (await ipcRenderer.invoke(channel, req)) as IpcResult<IpcContract[C]['res']>
  if (!result.ok) {
    throw new IpcInvokeError(result.error.code, result.error.message)
  }
  return result.data
}

const api: MbApi = {
  app: {
    info: () => invoke('app:info', undefined)
  },
  schema: {
    list: () => invoke('schema:list', undefined),
    save: (req) => invoke('schema:save', req)
  },
  data: {
    listItems: (req) => invoke('data:listItems', req),
    createItem: (req) => invoke('data:createItem', req),
    updateItem: (req) => invoke('data:updateItem', req),
    deleteItem: (req) => invoke('data:deleteItem', req),
    batchUpdate: (req) => invoke('data:batchUpdate', req),
    deleteMany: (req) => invoke('data:deleteMany', req),
    importLegacy: (req) => invoke('data:importLegacy', req),
    exportLegacy: (req) => invoke('data:exportLegacy', req)
  },
  dialog: {
    chooseJsonFile: () => invoke('dialog:chooseJsonFile', undefined),
    chooseSaveJsonFile: () => invoke('dialog:chooseSaveJsonFile', undefined),
    chooseCeshuExportFile: (req) => invoke('dialog:chooseCeshuExportFile', req)
  },
  ceshu: {
    list: () => invoke('ceshu:list', undefined),
    create: (req) => invoke('ceshu:create', req),
    get: (req) => invoke('ceshu:get', req),
    saveChapter: (req) => invoke('ceshu:saveChapter', req),
    export: (req) => invoke('ceshu:export', req),
    versions: (req) => invoke('ceshu:versions', req),
    derive: (req) => invoke('ceshu:derive', req),
    setActive: (req) => invoke('ceshu:setActive', req),
    changelog: (req) => invoke('ceshu:changelog', req),
    validate: (req) => invoke('ceshu:validate', req),
    score: (req) => invoke('ceshu:score', req),
    aiGenerateChapter: (req) => invoke('ceshu:aiGenerateChapter', req)
  }
}

contextBridge.exposeInMainWorld('mbApi', api)