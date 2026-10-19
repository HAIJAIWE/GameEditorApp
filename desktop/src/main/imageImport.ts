import { copyFileSync, existsSync, mkdirSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

import { LIBRARY_IMAGES_DIRNAME, planLibraryImageName } from '../shared/util/libraryImageImport'
import { log } from '../shared/util/logger'

/** 入库结果：`relativePath` 是写进字段值的形态（`images/xxx.png`） */
export type ImageImportResult =
  | { ok: true; relativePath: string; absolutePath: string; bytes: number; copied: boolean }
  | { ok: false; error: string }

/**
 * 把一张本地图片复制进 `<libraryDir>/images/`，返回**库相对路径**。
 *
 * 已在库内（用户在图片库里挑的）时**不复制**，直接算相对路径返回 ——
 * 否则每选一次同一条目就把自己库里的文件复制出一份副本。
 */
export function importImageIntoLibrary(sourcePath: string, libraryDir: string): ImageImportResult {
  try {
    if (!existsSync(sourcePath)) return { ok: false, error: `图片文件不存在：${sourcePath}` }
    if (!statSync(sourcePath).isFile()) return { ok: false, error: '所选路径不是文件' }

    const imagesDir = join(libraryDir, LIBRARY_IMAGES_DIRNAME)
    const normalizedSource = sourcePath.replace(/\\/g, '/').toLowerCase()
    const normalizedDir = imagesDir.replace(/\\/g, '/').toLowerCase()
    const alreadyInside = normalizedSource.startsWith(`${normalizedDir}/`)
    if (alreadyInside) {
      const relative = `${LIBRARY_IMAGES_DIRNAME}/${sourcePath.replace(/\\/g, '/').slice(imagesDir.replace(/\\/g, '/').length + 1)}`
      return { ok: true, relativePath: relative, absolutePath: sourcePath, bytes: statSync(sourcePath).size, copied: false }
    }

    mkdirSync(imagesDir, { recursive: true })
    const existing = readdirSync(imagesDir)
    const name = planLibraryImageName(sourcePath, existing)
    const target = join(imagesDir, name)
    copyFileSync(sourcePath, target)
    return {
      ok: true,
      relativePath: `${LIBRARY_IMAGES_DIRNAME}/${name}`,
      absolutePath: target,
      bytes: statSync(target).size,
      copied: true
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error)
    log.warn('图片入库失败', { sourcePath, error: message })
    return { ok: false, error: `图片入库失败：${message}` }
  }
}

/** 库图片目录的绝对路径（不存在则创建）—— 供 AI 生图等"要往库里写"的流程使用 */
export function ensureLibraryImagesDir(libraryDir: string): string {
  const dir = join(libraryDir, LIBRARY_IMAGES_DIRNAME)
  mkdirSync(dir, { recursive: true })
  return dir
}
