import { ZodError, type ZodType } from 'zod'
import { ipcMain, type IpcMainInvokeEvent } from 'electron'
import type { IpcChannel, IpcContract, IpcResult } from '../shared/ipc'
import type { StoredLlmConfig } from '../shared/config/llmConfig'
import { resolveLlmTier } from '../shared/config/llmConfig'
import type { SecretStore } from './settings/secretStore'
import { SECRET_NAMES } from '../shared/config/secretNames'

import { registerAppIpc } from './ipc/appIpc'
import { registerSettingsIpc } from './ipc/settingsIpc'
import { registerImagesIpc } from './ipc/imagesIpc'
import { registerAttachmentsIpc } from './ipc/attachmentsIpc'
import { registerLlmIpc } from './ipc/llmIpc'
import { registerAgentIpc } from './ipc/agentIpc'
import { registerTaskIpc } from './ipc/taskIpc'
import { registerLibraryIpc } from './ipc/libraryIpc'
import { registerSchemaIpc } from './ipc/schemaIpc'
import { registerAttrIpc } from './ipc/attrIpc'
import { registerDialogIpc } from './ipc/dialogIpc'
import { registerDataIpc } from './ipc/dataIpc'
import { registerImageGenIpc } from './ipc/imageGenIpc'
import { registerEngineIpc } from './ipc/engineIpc'
import { registerCeshuIpc } from './ipc/ceshuIpc'
import { registerBackupIpc } from './ipc/backupIpc'
import { registerFsIpc } from './ipc/fsIpc'

export interface IpcHandlerDeps {
  dataService: import('./data/service').DataService
  undoRecorder: import('./data/undoRecorder').UndoRecorder
  ceshuManager: import('./ceshu/manager').CeshuManager
  ceshuNotesStore: import('./ceshu/notesStore').CeshuNotesStore
  ceshuTemplateStore: import('./ceshu/templateStore').CeshuTemplateStore
  typeSchemaStore: import('./schema/store').TypeSchemaStore
  fieldTemplates: import('./schema/fieldTemplateStore').FieldTemplateStore
  attrSystemStore: import('./attr/attrSystemStore').AttrSystemStore
  llmClient: import('./llm/client').LlmClient
  dataSync: import('./ceshu/dataSync').CeshuDataSync
  agentDispatcher: import('./agent/dispatcher').SkillDispatcher
  agentBrain: import('./agent/brainService').AgentBrainService
  agentSessionStore: import('./agent/sessionStore').AgentSessionStore
  agentFeedback: import('./agent/preferenceStore').FeedbackStore
  agentOperationLog: import('./agent/operationLogStore').OperationLogStore
  approvalBroker: import('./agent/approvalBroker').AgentApprovalBroker
  libraryManager: import('./library/manager').LibraryManager
  /**
   * 系统钥匙串（`safeStorage` 加密的 API Key 存储）。
   * 由 `main/index.ts` 注入（`getSecretStore()`），**不在本模块 import electron 薄壳**——
   * 既照 `getAppInfo` / `setWindowMode` 的既有依赖注入先例走，也避免 `ipc.ts` ↔ `index.ts` 循环依赖。
   */
  secretStore: SecretStore
  /** 切换活跃库（由 `main/index.ts` 负责重建 store 与广播） */
  onSwitchLibrary: (name: string) => Promise<void>
  getAppInfo: () => import('../shared/types').AppInfo
  /** 渲染层上报最后停留的界面模式，供 window-state.json 落盘（迁移 ui/window_state 的 last_tab_index） */
  setWindowMode: (mode: string) => void
}

/** 单条 IPC 注册闭包（统一校验 + 包裹 IpcResult），由各子系统 registrar 复用 */
export type IpcRegistrar = <C extends IpcChannel>(
  channel: C,
  schema: ZodType | undefined,
  handler: (
    req: IpcContract[C]['req'],
    event: IpcMainInvokeEvent
  ) => IpcContract[C]['res'] | Promise<IpcContract[C]['res']>
) => void

/**
 * LLM 配置镜像 + 调用选项的共享状态（被 llm / ceshu / image:generate 共用）。
 *
 * 配置的**唯一真源**是渲染层 localStorage 的 `mb.llmConfig`（主进程读不到 localStorage）。
 * 渲染层启动时调 `llm:configure` 推一份**非敏感**镜像过来，主进程缓存；
 * API Key **不在镜像里**，每次调用时由 `secretStore`（safeStorage 加密盘）现取现解密。
 */
export interface LlmShared {
  setConfigMirror: (config: StoredLlmConfig) => void
  llmCallOptions: () => Promise<{ config?: StoredLlmConfig; apiKey?: string }>
  isCloudCall: (callOpts: { config?: StoredLlmConfig }) => boolean
}

function createLlmShared(secretStore: SecretStore): LlmShared {
  let llmConfigMirror: StoredLlmConfig | null = null
  const llmCallOptions = async (): Promise<{ config?: StoredLlmConfig; apiKey?: string }> => {
    const secret = await secretStore.get(SECRET_NAMES.llmApiKey)
    return { config: llmConfigMirror ?? undefined, apiKey: secret.ok ? secret.plaintext : '' }
  }
  const isCloudCall = (callOpts: { config?: StoredLlmConfig }): boolean =>
    resolveLlmTier(callOpts.config) === 'cloud'
  return {
    setConfigMirror: (config) => {
      llmConfigMirror = config
    },
    llmCallOptions,
    isCloudCall
  }
}

/** 注册全部 IPC 处理器：入口统一做 zod 校验，结果统一包裹为 IpcResult */
export function registerIpcHandlers(deps: IpcHandlerDeps): void {
  const llm = createLlmShared(deps.secretStore)
  registerAppIpc(deps, handle)
  registerSettingsIpc(deps, handle)
  registerImagesIpc(deps, handle)
  registerAttachmentsIpc(deps, handle)
  registerLlmIpc(deps, handle, llm)
  registerAgentIpc(deps, handle, llm)
  registerTaskIpc(deps, handle)
  registerLibraryIpc(deps, handle)
  registerSchemaIpc(deps, handle, llm)
  registerAttrIpc(deps, handle)
  registerDialogIpc(deps, handle)
  registerDataIpc(deps, handle)
  registerImageGenIpc(deps, handle)
  registerEngineIpc(deps, handle)
  registerCeshuIpc(deps, handle, llm)
  registerBackupIpc(deps, handle)
  registerFsIpc(deps, handle)
}

/** 已注册的 IPC 通道（A2-1 切换库重建 store 时需要先全部注销再注册） */
const registeredChannels = new Set<IpcChannel>()

/** 注销全部 IPC handler（配合 `registerIpcHandlers` 重新注册） */
export function disposeIpcHandlers(): void {
  for (const channel of registeredChannels) {
    ipcMain.removeHandler(channel)
  }
  registeredChannels.clear()
}

function handle<C extends IpcChannel>(
  channel: C,
  schema: ZodType | undefined,
  handler: (
    req: IpcContract[C]['req'],
    event: IpcMainInvokeEvent
  ) => IpcContract[C]['res'] | Promise<IpcContract[C]['res']>
): void {
  registeredChannels.add(channel)
  ipcMain.handle(channel, async (event, raw: unknown): Promise<IpcResult<IpcContract[C]['res']>> => {
    try {
      const req = (schema ? schema.parse(raw) : raw) as IpcContract[C]['req']
      const data = await handler(req, event)
      return { ok: true, data }
    } catch (error) {
      return {
        ok: false,
        error: {
          code: error instanceof ZodError ? 'VALIDATION_ERROR' : error instanceof Error ? error.name : 'UNKNOWN',
          message: error instanceof Error ? error.message : String(error)
        }
      }
    }
  })
}
