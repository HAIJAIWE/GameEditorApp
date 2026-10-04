import { createWriteStream } from 'node:fs'
import { mkdir, rename, rm, stat } from 'node:fs/promises'
import { basename, extname, isAbsolute, join, resolve, sep } from 'node:path'
import { Readable } from 'node:stream'
import { pipeline } from 'node:stream/promises'

/**
 * 图像落盘（下载 + 原子写）。
 *
 * 移植自 Python `features/_ai_image.py` 的 `_download_and_save_image_sync` /
 * `download_and_save_image`（用 requests 下载图片 URL 并保存到 assets 目录）。
 *
 * 与 Python 的差异：
 * - Python 用 `requests.get` 同步下载；TS 用 `fetch` + stream → pipeline 落盘（避免整图进内存）；
 * - Python 直接写目标文件；这里用 **tmp + rename 原子写**，与本仓 `data/csvIO.ts` 一致，
 *   避免下载中断留下半截文件；
 * - Python 无扩展名白名单；这里只接受常见图片扩展名（由 URL 推断），其余回落 `.png`。
 */

export type SaveImageOutcome = { ok: true; path: string } | { ok: false; error: string }

/** 允许从 URL 推断的图片扩展名（其余一律回落 .png） */
const IMAGE_EXTENSIONS = new Set(['.png', '.jpg', '.jpeg', '.webp', '.gif'])

/** 默认文件名扩展名 */
const DEFAULT_EXT = '.png'

/**
 * 校验并解析保存目录。
 * 目录不存在时创建；路径非法（非绝对/含 NUL）时返回错误。
 */
async function ensureDir(dir: string): Promise<{ ok: true; dir: string } | { ok: false; error: string }> {
  if (dir.trim() === '') {
    return { ok: false, error: '保存目录为空' }
  }
  if (dir.includes('\0')) {
    return { ok: false, error: '保存目录非法' }
  }
  const target = resolve(dir)
  try {
    const info = await stat(target)
    if (!info.isDirectory()) {
      return { ok: false, error: '保存目标不是目录' }
    }
  } catch {
    // 目录不存在 → 创建（含多级）
    try {
      await mkdir(target, { recursive: true })
    } catch (error) {
      return { ok: false, error: `创建保存目录失败：${error instanceof Error ? error.message : String(error)}` }
    }
  }
  return { ok: true, dir: target }
}

/**
 * 解析最终文件名。
 * - 显式 `filename` 优先（只取 basename，**丢弃任何目录成分**，防目录穿越）；
 * - 否则从 URL 路径推断扩展名；推断不出则用 `.png`；
 * - 都没有时用 `image_<时间戳>.png`。
 */
export function resolveImageFilename(url: string, filename?: string): string {
  if (filename !== undefined && filename.trim() !== '') {
    const safe = basename(filename.trim())
    // basename 后可能仍带路径分隔符（Windows 下 basename 不完全可靠）→ 再取一次
    const normalized = basename(safe.replace(/[\\/]+/g, sep))
    if (normalized !== '' && normalized !== '.' && normalized !== '..') {
      return normalized
    }
  }
  const stamp = Date.now()
  let ext = ''
  try {
    const path = new URL(url).pathname
    const candidate = extname(path).toLowerCase()
    if (IMAGE_EXTENSIONS.has(candidate)) {
      ext = candidate
    }
  } catch {
    // URL 解析失败 → 用默认扩展名
  }
  return `image_${stamp}${ext === '' ? DEFAULT_EXT : ext}`
}

/**
 * 下载图片并原子写入 `dir`。
 *
 * @param url 图片 URL（来自云端响应）
 * @param dir 保存目录（不存在会自动创建）
 * @param filename 可显式文件名（只取 basename，防目录穿越）
 * @returns 成功返回落盘绝对路径
 */
export async function saveImageFromUrl(
  url: string,
  dir: string,
  filename?: string
): Promise<SaveImageOutcome> {
  const dirResult = await ensureDir(dir)
  if (!dirResult.ok) {
    return { ok: false, error: dirResult.error }
  }

  const fileName = resolveImageFilename(url, filename)
  const finalPath = join(dirResult.dir, fileName)
  // 双重保险：拼出的路径必须仍在目标目录内（文件名已做 basename 剥离，这里是兜底）
  if (!finalPath.startsWith(dirResult.dir + sep)) {
    return { ok: false, error: '保存路径非法' }
  }

  let response: Response
  try {
    response = await fetch(url)
  } catch (error) {
    return { ok: false, error: `下载图像失败：${error instanceof Error ? error.message : String(error)}` }
  }
  if (!response.ok || response.body === null) {
    return { ok: false, error: `下载图像失败（HTTP ${response.status}）` }
  }

  const tempPath = join(dirResult.dir, `.img_${process.pid}_${Date.now()}.tmp`)
  try {
    await pipeline(Readable.fromWeb(response.body as Parameters<typeof Readable.fromWeb>[0]), createWriteStream(tempPath))
    await rename(tempPath, finalPath)
  } catch (error) {
    // 失败清理 tmp，避免残留半截文件
    await rm(tempPath, { force: true }).catch(() => undefined)
    return { ok: false, error: `保存图像失败：${error instanceof Error ? error.message : String(error)}` }
  }

  return { ok: true, path: finalPath }
}

/** 仅供测试：确认路径为绝对路径（避免误用相对路径） */
export function isAbsoluteImagePath(p: string): boolean {
  return isAbsolute(p)
}
