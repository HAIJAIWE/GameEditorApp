import { copyFileSync, existsSync, mkdirSync } from 'node:fs'
import { dirname, join } from 'node:path'

import { planExportImages } from '../shared/util/exportImages'
import type { ItemRecord } from '../shared/types'
import { log } from '../shared/util/logger'

/** 拷贝结果：`missing` 是"引用了但文件不在盘上"，只提示、不阻断导出 */
export interface ExportImagesResult {
  copied: number
  missing: string[]
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
