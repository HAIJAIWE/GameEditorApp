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
    info: () => invoke('app:info', undefined),
    log: (req) => invoke('app:log', req),
    setWindowMode: (req) => invoke('app:setWindowMode', req)
  },
  schema: {
    list: () => invoke('schema:list', undefined),
    save: (req) => invoke('schema:save', req),
    suggestFieldIds: (req) => invoke('schema:suggestFieldIds', req),
    listFieldTemplates: () => invoke('schema:listFieldTemplates', undefined),
    getFieldTemplate: (req) => invoke('schema:getFieldTemplate', req),
    saveFieldTemplate: (req) => invoke('schema:saveFieldTemplate', req),
    deleteFieldTemplate: (req) => invoke('schema:deleteFieldTemplate', req)
  },
  agent: {
    listTools: () => invoke('agent:listTools', undefined),
    executeTool: (req) => invoke('agent:executeTool', req),
    chat: (req) => invoke('agent:chat', req),
    respondApproval: (req) => invoke('agent:approvalResponse', req),
    respondInteraction: (req) => invoke('agent:interactionResponse', req),
    sessionInfo: () => invoke('agent:sessionInfo', undefined),
    sessionRestore: () => invoke('agent:sessionRestore', undefined),
    sessionClear: () => invoke('agent:sessionClear', undefined),
    feedback: (req) => invoke('agent:feedback', req),
    /** 订阅主进程推送的事件流；返回取消订阅函数 */
    onEvent: (handler: (event: unknown) => void): (() => void) => {
      const listener = (_event: unknown, payload: unknown): void => handler(payload)
      ipcRenderer.on('agent:event', listener)
      return () => {
        ipcRenderer.removeListener('agent:event', listener)
      }
    }
  },
  attrSystem: {
    get: () => invoke('attrSystem:get', undefined),
    save: (req) => invoke('attrSystem:save', req),
    exportGameConfig: (req) => invoke('attrSystem:exportGameConfig', req),
    exportJson: (req) => invoke('attrSystem:exportJson', req),
    importJson: (req) => invoke('attrSystem:importJson', req)
  },
  data: {
    listItems: (req) => invoke('data:listItems', req),
    listAll: () => invoke('data:listAll', undefined),
    createItem: (req) => invoke('data:createItem', req),
    updateItem: (req) => invoke('data:updateItem', req),
    deleteItem: (req) => invoke('data:deleteItem', req),
    batchUpdate: (req) => invoke('data:batchUpdate', req),
    deleteMany: (req) => invoke('data:deleteMany', req),
    references: (req) => invoke('data:references', req),
    importLegacy: (req) => invoke('data:importLegacy', req),
    exportLegacy: (req) => invoke('data:exportLegacy', req),
    exportCsv: (req) => invoke('data:exportCsv', req),
    importCsv: (req) => invoke('data:importCsv', req),
    exportExcel: (req) => invoke('data:exportExcel', req),
    importExcel: (req) => invoke('data:importExcel', req)
  },
  engine: {
    exportData: (req) => invoke('engine:exportData', req)
  },
  image: {
    generate: (req) => invoke('image:generate', req)
  },
  // 系统钥匙串：注意这里**刻意没有** getSecret —— 明文不出主进程
  settings: {
    hasSecret: (req) => invoke('settings:hasSecret', req),
    setSecret: (req) => invoke('settings:setSecret', req),
    deleteSecret: (req) => invoke('settings:deleteSecret', req)
  },
  backup: {
    list: () => invoke('backup:list', undefined),
    create: (req) => invoke('backup:create', req),
    restore: (req) => invoke('backup:restore', req),
    remove: (req) => invoke('backup:delete', req)
  },
  dialog: {
    chooseJsonFile: () => invoke('dialog:chooseJsonFile', undefined),
    chooseEngineExportFile: (req) => invoke('dialog:chooseEngineExportFile', req),
    chooseSaveJsonFile: () => invoke('dialog:chooseSaveJsonFile', undefined),
    chooseExportDir: () => invoke('dialog:chooseExportDir', undefined),
    chooseCsvFile: () => invoke('dialog:chooseCsvFile', undefined),
    chooseExcelFile: () => invoke('dialog:chooseExcelFile', undefined),
    chooseImageSaveDir: () => invoke('dialog:chooseImageSaveDir', undefined),
    chooseCeshuExportFile: (req) => invoke('dialog:chooseCeshuExportFile', req),
    chooseAttrSystemJsonFile: (req) => invoke('dialog:chooseAttrSystemJsonFile', req),
    chooseTemplateJsonFile: (req) => invoke('dialog:chooseTemplateJsonFile', req)
  },
  ceshu: {
    list: () => invoke('ceshu:list', undefined),
    create: (req) => invoke('ceshu:create', req),
    get: (req) => invoke('ceshu:get', req),
    saveChapter: (req) => invoke('ceshu:saveChapter', req),
    export: (req) => invoke('ceshu:export', req),
    versions: (req) => invoke('ceshu:versions', req),
    derive: (req) => invoke('ceshu:derive', req),
    applyPreset: (req) => invoke('ceshu:applyPreset', req),
    confirmSystems: (req) => invoke('ceshu:confirmSystems', req),
    syncData: (req) => invoke('ceshu:syncData', req),
    rename: (req) => invoke('ceshu:rename', req),
    remove: (req) => invoke('ceshu:delete', req),
    duplicate: (req) => invoke('ceshu:duplicate', req),
    setActive: (req) => invoke('ceshu:setActive', req),
    changelog: (req) => invoke('ceshu:changelog', req),
    validate: (req) => invoke('ceshu:validate', req),
    score: (req) => invoke('ceshu:score', req),
    aiGenerateChapter: (req) => invoke('ceshu:aiGenerateChapter', req),
    aiReview: (req) => invoke('ceshu:aiReview', req),
    aiGenerateData: (req) => invoke('ceshu:aiGenerateData', req),
    exportReviewReport: (req) => invoke('ceshu:exportReviewReport', req),
    checklist: (req) => invoke('ceshu:checklist', req),
    autoFill: (req) => invoke('ceshu:autoFill', req),
    exportChecklistReport: (req) => invoke('ceshu:exportChecklistReport', req),
    diff: (req) => invoke('ceshu:diff', req),
    exportDiffReport: (req) => invoke('ceshu:exportDiffReport', req),
    notes: {
      list: (req) => invoke('ceshu:notes:list', req),
      add: (req) => invoke('ceshu:notes:add', req),
      update: (req) => invoke('ceshu:notes:update', req),
      remove: (req) => invoke('ceshu:notes:delete', req)
    },
    templates: {
      list: (req) => invoke('ceshu:templates:list', req),
      save: (req) => invoke('ceshu:templates:save', req),
      remove: (req) => invoke('ceshu:templates:delete', req),
      update: (req) => invoke('ceshu:templates:update', req),
      exportAll: (req) => invoke('ceshu:templates:export', req),
      importAll: (req) => invoke('ceshu:templates:import', req)
    },
    wordStats: (req) => invoke('ceshu:wordStats', req),
    fieldDeps: (req) => invoke('ceshu:fieldDeps', req)
  },

  library: {
    list: () => invoke('library:list', undefined),
    create: (req) => invoke('library:create', req),
    rename: (req) => invoke('library:rename', req),
    remove: (req) => invoke('library:remove', req),
    switch: (req) => invoke('library:switch', req),
    /** 订阅活跃库变化；返回取消订阅函数 */
    onChanged: (handler: (payload: unknown) => void): (() => void) => {
      const listener = (_event: unknown, payload: unknown): void => handler(payload)
      ipcRenderer.on('library:changed', listener)
      return () => {
        ipcRenderer.removeListener('library:changed', listener)
      }
    }
  }
}

contextBridge.exposeInMainWorld('mbApi', api)