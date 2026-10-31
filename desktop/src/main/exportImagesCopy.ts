import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { planExportImages } from '../shared/util/io'
import type { ItemRecord } from '../shared/types'
import { log } from '../shared/util/system'

/** 拷贝结果：`missing` 是"引用了但文件不在盘上"，只提示、不阻断导出 */
export interface ExportImagesResult {
  copied: number
  missing: string[]
}

/**
 * 仅探测、不拷贝：返回被引用但盘上不存在的图片相对路径（形如 `images/hero.png`）。
 *
 * 用于「导出前校验」——开启「缺失图片即阻断」时，先调它拿到缺失清单，
 * 有缺失就在**写数据文件之前**抛错，避免导出一个「数据在、图缺几张」的半成品
 * （AI 覆盖游戏活文件时尤其危险：图没了，游戏侧路径悬空）。
 *
 * 与 `copyImagesForExport` 共用同一份 `planExportImages` 路径推导（纯计算、开销极小）；
 * 二者各自跑一遍是**刻意**的——一个只探测、一个只搬运，职责不混。
 *
 * ⚠️ `libraryDir` 同样是**库根目录**（`<活跃库>`），不是 `images/` 目录；
 * 传错会出现 `images/images` 双段、把「引用得到」误判成「引用不到」。
 */
export function detectMissingImages(records: readonly ItemRecord[], libraryDir: string): string[] {
  const plan = planExportImages(records, libraryDir)
  const missing: string[] = []
  for (const image of plan.images) {
    // 库外绝对路径不属于本库、不会被 plan 收录，这里只判定「库内引用的文件在不在盘上」
    if (!existsSync(image.absolutePath)) missing.push(image.relativePath)
  }
  return missing
}

/**
 * 把条目引用的图片拷到**导出文件旁边**的 `images/` 目录，让导出自包含。
 *
 * 目标路径 = `dirname(exportFilePath)/images/<原名>`，与字段里存的
 * `images/xxx.png` 严丝合缝 —— 游戏侧把导出文件整个目录搬走就能读到图。
 *
 * 失败策略：单个文件拷失败**不阻断导出**（数据文件已经写好了，为一张图
 * 把整个导出判失败是反的），记进 `missing` 由调用方提示用户。
 */
export function copyImagesForExport(
  records: readonly ItemRecord[],
  imagesDir: string,
  exportFilePath: string
): ExportImagesResult {
  const plan = planExportImages(records, imagesDir)
  if (plan.images.length === 0) return { copied: 0, missing: [] }

  const targetRoot = join(dirname(exportFilePath), 'images')
  const missing: string[] = []
  let copied = 0

  for (const image of plan.images) {
    const target = join(targetRoot, image.relativePath.slice('images/'.length))
    try {
      if (!existsSync(image.absolutePath)) {
        missing.push(image.relativePath)
        continue
      }
      mkdirSync(dirname(target), { recursive: true })
      copyFileSync(image.absolutePath, target)
      copied++
    } catch (error) {
      log.warn('导出拷图失败', { from: image.absolutePath, to: target, error: error instanceof Error ? error.message : String(error) })
      missing.push(image.relativePath)
    }
  }

  return { copied, missing }
}
