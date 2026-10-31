import { shell } from 'electron'

import type { IpcHandlerDeps, IpcRegistrar } from '../ipc'
import { shellOpenPathInputSchema } from '../../shared/schema/adapters'

/**
 * 系统 shell 通道：用默认程序打开**任意路径**。
 *
 * 与 `attachments:open` 的分工：附件只存叶子名、由主进程按库解析；
 * 交付文件（导出产物）是任意路径、不在 attachments 目录，故单独走这里。
 */
export function registerShellIpc(_deps: IpcHandlerDeps, handle: IpcRegistrar): void {
  handle('shell:openPath', shellOpenPathInputSchema, async (req) => {
    const error = await shell.openPath(req.path)
    return error === '' ? { ok: true } : { ok: false, error }
  })
}
