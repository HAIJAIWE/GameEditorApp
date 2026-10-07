import { contextBridge, ipcRenderer } from 'electron'

import type { MbApi } from '../shared/service/api'
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
    draftSave: (req: { name: string }) => invoke('agent:draftSave', req),
    draftList: () => invoke('agent:draftList', undefined),
    draftLoad: (req: { path: string }) => invoke('agent:draftLoad', req),
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
    clearAll: (req) => invoke('data:clearAll', req),
    undo: () => invoke('data:undo', undefined),
    redo: () => invoke('data:redo', undefined),
    undoState: () => invoke('data:undoState', undefined),
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
  llm: {
    /** 单次文本生成（字段级 AI 按钮）；失败由主进程抛中文错误 */
    generate: (req: { system: string; prompt: string }) => invoke('llm:generate', req),
    /**
     * 推 LLM 非敏感配置镜像（对齐 Python `api_config.py`）。
     * 渲染层启动时 + 改设置时各调一次；**不要把 apiKey 放进来** ——
     * 它走 `settings:setSecret` 进 safeStorage，由主进程每次调用时自行解密注入。
     */
    configure: (req: {
      config: {
        enabled: boolean
        provider: 'ollama' | 'openai' | 'doubao' | 'qwen' | 'claude' | 'deepseek'
        model: string
        baseUrl: string
        temperature: number
        maxTokens: number
      }
    }) => invoke('llm:configure', req),
    /** 探测当前配置下的服务可用性（供设置面板显示状态） */
    status: () => invoke('llm:status', {})
  },
  /**
   * 图片库扫描 / 清理（破坏性）。
   * `deleteImages` 传 `confirm: true` 才会真删 —— 契约里是 `z.literal(true)`，
   * 渲染层漏传会直接被主进程 schema 拒掉。
   */
  images: {
    listLibraryImages: () => invoke('images:listLibraryImages', undefined),
    // 按已保存路径回显预览（对齐 PyQt LazyImageLabel.load_image）
    // ⚠️ 主进程只允许读当前库 images 目录内的文件，越界返回 reason 说明，不静默失败
    readByPath: (req: { path: string }) => invoke('images:readByPath', req),
    deleteImages: (req: { paths: string[]; confirm: true }) => invoke('images:deleteImages', req)
  },
  dialog: {
    chooseJsonFile: () => invoke('dialog:chooseJsonFile', undefined),
    chooseEngineExportFile: (req) => invoke('dialog:chooseEngineExportFile', req),
    chooseSaveJsonFile: () => invoke('dialog:chooseSaveJsonFile', undefined),
    chooseExportDir: () => invoke('dialog:chooseExportDir', undefined),
    chooseCsvFile: () => invoke('dialog:chooseCsvFile', undefined),
    chooseExcelFile: () => invoke('dialog:chooseExcelFile', undefined),
    chooseImageSaveDir: () => invoke('dialog:chooseImageSaveDir', undefined),
    chooseImageFile: () => invoke('dialog:chooseImageFile', undefined),
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