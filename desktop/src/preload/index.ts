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
  data: {
    listTypes: () => invoke('data:listTypes', undefined),
    listItems: (req) => invoke('data:listItems', req),
    createItem: (req) => invoke('data:createItem', req),
    deleteItem: (req) => invoke('data:deleteItem', req),
    importLegacy: (req) => invoke('data:importLegacy', req)
  },
  dialog: {
    chooseJsonFile: () => invoke('dialog:chooseJsonFile', undefined)
  }
}

contextBridge.exposeInMainWorld('mbApi', api)