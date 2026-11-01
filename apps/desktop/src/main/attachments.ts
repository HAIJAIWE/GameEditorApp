import { copyFile, mkdir, readdir, stat } from 'node:fs/promises'
import { join } from 'node:path'

import {
  LIBRARY_ATTACHMENTS_DIRNAME,
  guessMimeType,
  planAttachmentName,
  type DigitalAttachment
} from '@mobai/shared/util/io'
import { log } from '@mobai/shared/util/system'

/** 入库结果：成功带元数据，失败带中文原因（不抛） */
export type AttachmentImportResult =
  | { ok: true; attachment: DigitalAttachment }
  | { ok: false; error: string }

/**
 * 把用户选中的文件复制进 `<libraryDir>/attachments/`，返回元数据。
 *
 * 与图片入库（`imageImport.ts`）同一套取舍：复制进库、重名加后缀，
 * 工程搬家/备份时附件跟着库走；渲染层只拿元数据，不碰 fs。
 *
 * **异步**（`fs/promises`）：大文件拷贝期间主进程不阻塞，渲染层可据 promise 未决
 * 显示「导入中…」——诚实的不确定进度，而不是假百分比（拷贝没有流式回调）。
 */
export async function importAttachmentIntoLibrary(
  sourcePath: string,
  libraryDir: string
): Promise<AttachmentImportResult> {
  try {
    const info = await stat(sourcePath).catch(() => null)
    if (info === null) return { ok: false, error: `文件不存在：${sourcePath}` }
    if (!info.isFile()) return { ok: false, error: '所选路径不是文件' }

    const dir = join(libraryDir, LIBRARY_ATTACHMENTS_DIRNAME)
    await mkdir(dir, { recursive: true })
    const name = planAttachmentName(sourcePath, await readdir(dir))
    const target = join(dir, name)
    await copyFile(sourcePath, target)
    const bytes = (await stat(target)).size
    // 只回叶子名（对齐 dsh FileAttachmentRef：不含路径）；用时按活跃库目录解析
    return { ok: true, attachment: { name, mime: guessMimeType(name), bytes } }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.warn('附件入库失败', { sourcePath, error: message })
    return { ok: false, error: `附件入库失败：${message}` }
  }
}
