import { shell } from 'electron'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

import type { IpcHandlerDeps, IpcRegistrar } from '../ipc'
import {
  attachmentsAddInputSchema,
  attachmentsOpenInputSchema,
  attachmentsReadImageInputSchema
} from '../../shared/schemas'
import { LIBRARY_ATTACHMENTS_DIRNAME, guessMimeType } from '../../shared/util/libraryAttachments'
import { isSupportedImageFile } from '../../shared/util/imagePreview'
import { log } from '../../shared/util/logger'
import { importAttachmentIntoLibrary } from '../attachments'

/** 图片附件读图上限：再大就拒绝，避免把巨型 data URL 塞进渲染层 */
const READ_IMAGE_MAX_BYTES = 8 * 1024 * 1024

/**
 * 解析附件叶子名 → 库内绝对路径（对齐 dsh：消息里只存叶子名，不存路径）。
 * 含分隔符 / `..` / 空名一律视为越界（防目录穿越），返回 null。
 */
function resolveAttachmentPath(deps: IpcHandlerDeps, name: string): string | null {
  const leaf = name.trim()
  if (leaf === '' || leaf.includes('/') || leaf.includes('\\') || leaf.includes('..')) return null
  return join(deps.libraryManager.activeDir(), LIBRARY_ATTACHMENTS_DIRNAME, leaf)
}

/**
 * 会话附件（对齐 dsh `ui-attachment` 的诚实子集）。
 *
 * - `attachments:add`：把用户选的文件复制进 `<活跃库>/attachments/`，返回元数据；
 *   失败返回 `ok:false`（不抛），渲染层据 error 提示。
 * - `attachments:open`：用系统默认程序打开库内附件（`shell.openPath` 返回错误串，空串=成功）。
 * - `attachments:readImage`：把库内图片附件读成 data URL（消息缩略图 / lightbox 用）。
 *   **只允许读 `<库>/attachments/` 内的文件**（越界拒绝），并有 8MB 上限。
 *   渲染层是 sandbox，没有 fs，只能经主进程代劳。
 */
export function registerAttachmentsIpc(deps: IpcHandlerDeps, handle: IpcRegistrar): void {
  handle('attachments:add', attachmentsAddInputSchema, (req) =>
    importAttachmentIntoLibrary(req.path, deps.libraryManager.activeDir())
  )
  handle('attachments:open', attachmentsOpenInputSchema, async (req) => {
    const path = resolveAttachmentPath(deps, req.name)
    if (path === null) return { ok: false, error: '无效的附件名' }
    const error = await shell.openPath(path)
    return error === '' ? { ok: true } : { ok: false, error }
  })
  handle('attachments:readImage', attachmentsReadImageInputSchema, (req) => {
    const path = resolveAttachmentPath(deps, req.name)
    if (path === null) return { ok: false, error: '无效的附件名' }
    if (!existsSync(path)) return { ok: false, error: '附件文件不存在' }
    try {
      const info = statSync(path)
      if (!info.isFile()) return { ok: false, error: '路径不是文件' }
      if (info.size > READ_IMAGE_MAX_BYTES) return { ok: false, error: '图片过大（超过 8MB）' }
      if (!isSupportedImageFile(path)) return { ok: false, error: '不是受支持的图片格式' }
      const buffer = readFileSync(path)
      return { ok: true, dataUrl: `data:${guessMimeType(path)};base64,${buffer.toString('base64')}` }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      log.warn('读取附件图片失败', { name: req.name, error: message })
      return { ok: false, error: '读取图片失败' }
    }
  })
}
