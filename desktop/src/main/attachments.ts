import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import {
  LIBRARY_ATTACHMENTS_DIRNAME,
  guessMimeType,
  planAttachmentName,
  type DigitalAttachment
} from '../shared/util/libraryAttachments'
import { log } from '../shared/util/logger'

/** 入库结果：成功带元数据，失败带中文原因（不抛） */
export type AttachmentImportResult =
  | { ok: true; attachment: DigitalAttachment }
  | { ok: false; error: string }

/**
 * 把用户选中的文件复制进 `<libraryDir>/attachments/`，返回元数据。
 *
 * 与图片入库（`imageImport.ts`）同一套取舍：复制进库、重名加后缀，
 * 工程搬家/备份时附件跟着库走；渲染层只拿元数据，不碰 fs。
 */
export function importAttachmentIntoLibrary(sourcePath: string, libraryDir: string): AttachmentImportResult {
  try {
    if (!existsSync(sourcePath)) return { ok: false, error: `文件不存在：${sourcePath}` }
    if (!statSync(sourcePath).isFile()) return { ok: false, error: '所选路径不是文件' }

    const dir = join(libraryDir, LIBRARY_ATTACHMENTS_DIRNAME)
    mkdirSync(dir, { recursive: true })
    const name = planAttachmentName(sourcePath, readdirSync(dir))
    const target = join(dir, name)
    copyFileSync(sourcePath, target)
    const bytes = statSync(target).size
    return { ok: true, attachment: { name, path: target, mime: guessMimeType(name), bytes } }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.warn('附件入库失败', { sourcePath, error: message })
    return { ok: false, error: `附件入库失败：${message}` }
  }
}
