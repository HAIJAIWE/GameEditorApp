import { readdir, unlink } from 'node:fs/promises'
import { readFileSync, existsSync, statSync, type Stats } from 'node:fs'
import { extname, isAbsolute, join } from 'node:path'
import {
  collectReferencedImagePaths,
  diffUnusedImages,
  imagePathKey,
  IMAGE_EXTENSIONS
} from '../../shared/cleanupImages'
import { isSupportedImageFile, buildImagePreviewDataUrl } from '../../shared/imagePreview'
import { log } from '../../shared/logger'
import type { IpcHandlerDeps, IpcRegistrar } from '../ipc'
import { deleteImagesInputSchema, imageReadByPathInputSchema } from '../../shared/schemas'

/** 扩展名白名单的 Set 形态（热路径查表用；真源仍是 shared 的 IMAGE_EXTENSIONS 数组） */
const IMAGE_EXTENSION_SET: ReadonlySet<string> = new Set(IMAGE_EXTENSIONS)

export function registerImagesIpc(deps: IpcHandlerDeps, handle: IpcRegistrar): void {
  const { libraryManager, dataService } = deps
  /**
   * 递归收集 `<dir>` 下的全部图片文件（对齐 PyQt `features/advanced.py:405` 的 `data_dir.rglob(f'*{ext}')`）。
   * 目录不存在时返回空列表（首次使用就是空的，不该抛错）。
   */
  async function listAllImagePaths(dir: string): Promise<string[]> {
    const out: string[] = []
    const walk = async (current: string): Promise<void> => {
      let entries: Array<{ name: string; isDirectory(): boolean }>
      try {
        entries = await readdir(current, { withFileTypes: true })
      } catch {
        return
      }
      for (const entry of entries) {
        const full = join(current, entry.name)
        if (entry.isDirectory()) {
          await walk(full)
        } else if (IMAGE_EXTENSION_SET.has(extname(entry.name).toLowerCase())) {
          out.push(full)
        }
      }
    }
    await walk(dir)
    return out.sort()
  }

  /**
   * 列出图片库（渲染层是 sandbox，没有 fs，故由主进程代扫）。
   * 目录取 `<活跃库目录>/images`，切库时闭包里的 `libraryManager` 天然跟随活跃库。
   */
  handle('images:listLibraryImages', undefined, async () => {
    const dir = join(libraryManager.activeDir(), 'images')
    return { dir, files: await listAllImagePaths(dir) }
  })

  /**
   * 按路径读取图片为 data URL（对应 PyQt `LazyImageLabel.load_image`）。
   * 由**主进程**读文件并回传 `data:` URL（渲染层是网页上下文，不能直接 `<img src="C://...">`）。
   * 必须是绝对路径、文件存在、受支持格式，否则返回 `reason`（中文），不抛不静默。
   */
  handle('images:readByPath', imageReadByPathInputSchema, async (req) => {
    if (!isAbsolute(req.path)) {
      return { path: null, dataUrl: '', bytes: 0, reason: '图片路径必须是绝对路径' }
    }
    if (!existsSync(req.path)) {
      return { path: null, dataUrl: '', bytes: 0, reason: '图片文件不存在（可能已被删除或移动）' }
    }
    let info: Stats
    try {
      info = statSync(req.path)
    } catch (error) {
      log.warn('读取图片属性失败', { path: req.path, error: error instanceof Error ? error.message : String(error) })
      return { path: null, dataUrl: '', bytes: 0, reason: '无法读取图片文件属性' }
    }
    if (!info.isFile()) {
      return { path: null, dataUrl: '', bytes: 0, reason: '路径不是文件' }
    }
    if (!isSupportedImageFile(req.path)) {
      return { path: null, dataUrl: '', bytes: 0, reason: '不支持的图片格式' }
    }
    try {
      const buffer = readFileSync(req.path)
      return {
        path: req.path,
        bytes: buffer.byteLength,
        dataUrl: buildImagePreviewDataUrl(req.path, buffer.byteLength, buffer.toString('base64')),
        reason: null
      }
    } catch (error) {
      log.warn('读取图片失败', { path: req.path, error: error instanceof Error ? error.message : String(error) })
      return { path: null, dataUrl: '', bytes: 0, reason: '读取图片失败' }
    }
  })

  /**
   * 物理删除图片（**破坏性**）。删除前**重跑一次差集复核**，只删「此刻仍未被引用」的。
   */
  handle('images:deleteImages', deleteImagesInputSchema, async (req) => {
    if (req.confirm !== true) {
      throw new Error('删除图片需要显式确认')
    }
    const dir = join(libraryManager.activeDir(), 'images')
    const wanted = new Set(req.paths)

    const records = await dataService.listAllItems()
    const referencedKeys = collectReferencedImagePaths(records, dir).map((p) => imagePathKey(p))
    const scan = diffUnusedImages(await listAllImagePaths(dir), referencedKeys)
    const deletable = new Set(scan.unused.filter((full) => wanted.has(full)))

    let deleted = 0
    const failed: Array<{ path: string; reason: string }> = []
    for (const target of req.paths) {
      if (!deletable.has(target)) {
        failed.push({ path: target, reason: '复核后认为该图片已被引用，未删除' })
        continue
      }
      try {
        await unlink(target)
        deleted += 1
      } catch (error) {
        failed.push({ path: target, reason: error instanceof Error ? error.message : String(error) })
      }
    }
    return { deleted, failed }
  })
}
