import { shell } from 'electron'

import type { IpcHandlerDeps, IpcRegistrar } from '../ipc'
import { attachmentsAddInputSchema, attachmentsOpenInputSchema } from '../../shared/schemas'
import { importAttachmentIntoLibrary } from '../attachments'

/**
 * 会话附件（对齐 dsh `ui-attachment` 的诚实子集）。
 *
 * - `attachments:add`：把用户选的文件复制进 `<活跃库>/attachments/`，返回元数据；
 *   失败返回 `ok:false`（不抛），渲染层据 error 提示。
 * - `attachments:open`：用系统默认程序打开库内附件（`shell.openPath` 返回错误串，
 *   空串表示成功）。渲染层是 sandbox，没有 fs / shell，只能经主进程代劳。
 */
export function registerAttachmentsIpc(deps: IpcHandlerDeps, handle: IpcRegistrar): void {
  handle('attachments:add', attachmentsAddInputSchema, (req) =>
    importAttachmentIntoLibrary(req.path, deps.libraryManager.activeDir())
  )
  handle('attachments:open', attachmentsOpenInputSchema, async (req) => {
    const error = await shell.openPath(req.path)
    return error === '' ? { ok: true } : { ok: false, error }
  })
}
