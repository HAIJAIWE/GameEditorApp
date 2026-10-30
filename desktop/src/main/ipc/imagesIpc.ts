import { readdir, unlink } from 'node:fs/promises'
import { readFileSync, existsSync, statSync, type Stats } from 'node:fs'
import { extname, join } from 'node:path'
import {
  collectReferencedImagePaths,
  diffUnusedImages,
  imagePathKey,
  resolveImagePath,
  IMAGE_EXTENSIONS
} from '../../shared/util/cleanupImages'
import { isSupportedImageFile, buildImagePreviewDataUrl } from '../../shared/util/imagePreview'
import { ensureLibraryImagesDir } from '../imageImport'
import { log } from '../../shared/util/logger'
import type { IpcHandlerDeps, IpcRegistrar } from '../ipc'
import { deleteImagesInputSchema, imageReadByPathInputSchema } from '../../shared/schema/schemas'

/** 扩展名白名单的 Set 形态（热路径查表用；真源仍是 shared 的 IMAGE_EXTENSIONS 数组） */
const IMAGE_EXTENSION_SET: ReadonlySet<string> = new Set(IMAGE_EXTENSIONS)

export function registerImagesIpc(deps: IpcHandlerDeps, handle: IpcRegistrar): void {
  const { libraryManager, dataService } = deps
  /**
   * 递归收集 `<dir>` 下的全部图片文件。
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
  /**
   * 库图片目录（不存在则创建）—— 给「AI 生图」这类要往库里写文件的流程用。
   *
   * 生图原来让用户自选保存目录，结果图散落在各处、和库脱钩；现在一律进库，
   * 字段存的也是 `images/xxx.png` 这种库相对路径。
   */
  handle('images:libraryDir', undefined, async () => {
    const dir = ensureLibraryImagesDir(libraryManager.activeDir())
    return { dir }
  })

  handle('images:listLibraryImages', undefined, async () => {
    const dir = join(libraryManager.activeDir(), 'images')
    /*
     * 连带回传**库根目录**：调用方（未用清理面板）解析字段里的相对图片路径
     * 要用它当基准。字段值 `images/xxx.png` 是相对库根的，拿 `dir` 当基准会拼出
     * `<库>/images/images/xxx.png`，把"已引用"误判成"未引用"（→ 误删）。
     */
    return { dir, libraryDir: libraryManager.activeDir(), files: await listAllImagePaths(dir) }
  })

  /**
   * 按路径读取图片为 data URL。
   * 由**主进程**读文件并回传 `data:` URL（渲染层是网页上下文，不能直接 `<img src="C://...">`）。
   *
   * **相对路径按活跃库目录解析**（2026-10-20 图片入库后字段值统一是 `images/xxx.png`）：
   * 绝对路径与相对路径两条路都支持 —— 存量数据里存的是绝对路径，不做迁移。
   * 文件不存在 / 格式不支持时返回 `reason`（中文），不抛不静默。
   */
  handle('images:readByPath', imageReadByPathInputSchema, async (req) => {
    // 统一走 resolveImagePath：绝对路径原样、相对路径拼活跃库目录
    const path = resolveImagePath(req.path, libraryManager.activeDir())
    if (path === '') {
      return { path: null, dataUrl: '', bytes: 0, reason: '图片路径不能为空' }
    }
    if (!existsSync(path)) {
      return { path: null, dataUrl: '', bytes: 0, reason: '图片文件不存在（可能已被删除或移动）' }
    }
    let info: Stats
    try {
      info = statSync(req.path)
    } catch (error) {
      log.warn('读取图片属性失败', { path, error: error instanceof Error ? error.message : String(error) })
      return { path: null, dataUrl: '', bytes: 0, reason: '无法读取图片文件属性' }
    }
    if (!info.isFile()) {
      return { path: null, dataUrl: '', bytes: 0, reason: '路径不是文件' }
    }
    if (!isSupportedImageFile(path)) {
      return { path: null, dataUrl: '', bytes: 0, reason: '不支持的图片格式' }
    }
    try {
      const buffer = readFileSync(path)
      return {
        // 回传解析后的绝对路径：调用方（LazyImage 的缓存键）用它与尺寸拼 key，
        // 相对/绝对两种输入都要归一到同一个键，否则同一条目会重复加载。
        path,
        bytes: buffer.byteLength,
        dataUrl: buildImagePreviewDataUrl(path, buffer.byteLength, buffer.toString('base64')),
        reason: null
      }
    } catch (error) {
      log.warn('读取图片失败', { path, error: error instanceof Error ? error.message : String(error) })
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
    /*
     * ⚠️ base 传**库根目录**，不是 images 目录。
     * 字段值 `images/xxx.png` 是相对库根的；若传 images 目录，`resolveImagePath` 会拼出
     * `<库>/images/images/xxx.png` —— 文件不存在 ⇒ 引用判定为"未被引用" ⇒
     * 未用清理会把用户正在用的图**删掉**。（2026-10-20 图片入库改存相对路径时抓到。）
     */
    const referencedKeys = collectReferencedImagePaths(records, libraryManager.activeDir()).map((p) => imagePathKey(p))
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
