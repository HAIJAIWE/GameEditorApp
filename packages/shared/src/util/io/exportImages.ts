import { LIBRARY_IMAGES_DIRNAME } from './libraryImageImport'
import { IMAGE_REFERENCE_FIELDS, resolveImagePath } from './cleanupImages'
import type { ItemRecord } from '../../types'

/**
 * 导出时「把图片一起带走」的路径计算（纯函数，不碰 fs）。
 *
 * ## 为什么需要
 * 字段值现在是库相对路径（`images/hero.png`）。引擎导出只写数据文件，
 * 游戏侧拿到 Lua/JSON 里的相对路径，旁边却没有 `images/` 目录 —— 图还是读不到。
 * 这里算出「该把哪些文件拷到导出目录旁边」，让导出自包含。
 *
 * ## ⚠️ 相对基准是**库根目录**，不是 images 目录
 * 字段值 `images/xxx.png` 是相对库根的。若把 `<库>/images` 当 base 传给
 * `resolveImagePath`，会拼出 `<库>/images/images/xxx.png` —— 文件不存在，
 * 于是"引用得到"变成"引用不到"。未用图片清理那边犯过这个错（见本轮 `imagesIpc` 的修正），
 * 这里先按正确口径写并锁住。
 *
 * 只收**确实位于本库 images 目录下**的文件：库外的绝对路径（存量数据）不属于这个库，
 * 拷过去等于把用户别处的文件复制得到处都是。
 */

/** 一条待拷贝的图片：`absolutePath` 是源，`relativePath` 是导出目录下的目标相对路径 */
export interface ExportImagePlan {
  absolutePath: string
  /** 形如 `images/hero.png`（相对**导出文件所在目录**） */
  relativePath: string
}

export interface ExportImagePlanResult {
  /** 待拷贝清单（按相对路径去重、字典序） */
  images: ExportImagePlan[]
  /** 去重后的引用数（与 images.length 相同，留作语义清晰的出口） */
  referencedCount: number
}

/**
 * 计算导出时该拷哪些图片。
 *
 * @param records 全量条目（与渲染数据用的是同一份快照）
 * @param libraryDir **库根目录**的绝对路径（`<活跃库>`），不是 images 目录
 */
export function planExportImages(
  records: readonly ItemRecord[],
  libraryDir: string
): ExportImagePlanResult {
  const imagesDir = `${libraryDir.replace(/\\/g, '/').replace(/\/+$/, '')}/${LIBRARY_IMAGES_DIRNAME}`
  const normalizedDir = imagesDir.toLowerCase()
  const seen = new Map<string, ExportImagePlan>()

  for (const record of records) {
    const data = record.data
    if (typeof data !== 'object' || data === null) continue
    for (const field of IMAGE_REFERENCE_FIELDS) {
      const raw = (data as Record<string, unknown>)[field]
      if (typeof raw !== 'string' || raw.trim() === '') continue
      const resolved = resolveImagePath(raw, libraryDir)
      if (resolved === '') continue

      // 只认库内文件：大小写不敏感比较（Windows 语义）；不在库内直接跳过
      if (!resolved.toLowerCase().startsWith(`${normalizedDir}/`)) continue

      // 目录之后的那一段就是 images/ 里的相对路径
      const tail = resolved.slice(normalizedDir.length + 1)
      if (tail === '') continue
      const relative = `${LIBRARY_IMAGES_DIRNAME}/${tail}`
      const key = relative.toLowerCase()
      if (!seen.has(key)) seen.set(key, { absolutePath: resolved, relativePath: relative })
    }
  }

  const images = [...seen.values()].sort((a, b) => a.relativePath.localeCompare(b.relativePath))
  return { images, referencedCount: images.length }
}
