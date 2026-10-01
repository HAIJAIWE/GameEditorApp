import type { CeshuCreateInput, CeshuSaveChapterInput, ExportLegacyInput, ImportLegacyInput } from './schemas'
import type { AppInfo, ExportSummary, ImportSummary, ItemRecord, TypeSummary } from './types'
import type { CeshuDocument, CeshuSummary } from './ceshuConstants'

/**
 * IPC 契约：通道 → 请求/响应类型。
 * 这是全应用跨进程通信的类型唯一事实来源（type-only 导入，无运行时依赖）。
 */
export interface IpcContract {
  'app:info': { req: undefined; res: AppInfo }
  'data:listTypes': { req: undefined; res: TypeSummary[] }
  'data:listItems': { req: { type: string }; res: ItemRecord[] }
  'data:createItem': { req: { type: string; data: Record<string, unknown> }; res: ItemRecord }
  'data:updateItem': { req: { id: string; data: Record<string, unknown> }; res: ItemRecord }
  'data:deleteItem': { req: { id: string }; res: { deleted: boolean } }
  'data:importLegacy': { req: ImportLegacyInput; res: ImportSummary }
  'data:exportLegacy': { req: ExportLegacyInput; res: ExportSummary }
  'dialog:chooseJsonFile': { req: undefined; res: { path: string | null } }
  'dialog:chooseSaveJsonFile': { req: undefined; res: { path: string | null } }
  'ceshu:list': { req: undefined; res: CeshuSummary[] }
  'ceshu:create': { req: CeshuCreateInput; res: CeshuDocument }
  'ceshu:get': { req: { id: string }; res: CeshuDocument }
  'ceshu:saveChapter': { req: CeshuSaveChapterInput; res: CeshuDocument }
}

export type IpcChannel = keyof IpcContract

/** 统一响应包裹：错误结构化返回，避免 Electron 序列化丢失错误信息 */
export type IpcResult<T> = { ok: true; data: T } | { ok: false; error: { code: string; message: string } }

/** IPC 调用错误：渲染层可直接按 code 处理 */
export class IpcInvokeError extends Error {
  readonly code: string

  constructor(code: string, message: string) {
    super(message)
    this.name = 'IpcInvokeError'
    this.code = code
  }
}