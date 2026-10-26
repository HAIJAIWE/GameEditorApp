/**
 * 清理未使用图片的**扫描逻辑**（迁移 旧版 `src/features/advanced:373-431`
 * 的 `cleanup_unused_images` 扫描段），**纯逻辑层，零 React / 零 fs / 零 IPC**。
 *
 * ## 与 旧版 的对应关系
 *
 * | 旧版 | 本模块 |
 * |---|---|
 * | `advanced:398` 字段白名单 `('image','icon','avatar','img')` | `IMAGE_REFERENCE_FIELDS` |
 * | `advanced:397` `for field, val in item.items()` | `collectReferencedImagePaths()` |
 * | `advanced:399` `referenced.add(Path(val).resolve())` | `resolveImagePath()` + 规范化键 |
 * | `advanced:402` `img_exts = {...}` | `IMAGE_EXTENSIONS` |
 * | `advanced:405-406` `data_dir.rglob(f'*{ext}')` | ⬅ **主进程职责**（本模块拿不到 fs） |
 * | `advanced:408` `unused = all_images - referenced` | `diffUnusedImages()` |
 * | `advanced:425-430` `img.unlink()` | ⬅ **主进程职责**（本模块不删任何东西） |
 *
 * ## 本模块**只算不删**
 * 删文件是不可逆的物理操作，必须留在主进程（Node 有 fs，渲染层没有）。
 * 本模块负责把「哪些文件没被引用」这个判断做成**可单测的纯函数**，
 * 面板拿它把清单摆给用户看，主进程拿它做删除前的最后一道校验。
 *
 * ## 一处**有意偏离**旧版：路径比较大小写不敏感
 *
 * 旧版 用 `Path(val).resolve()` 得到 `WindowsPath`，而 `WindowsPath.__eq__`
 * 是**大小写不敏感**的（`PureWindowsPath("C:/A.PNG") == PureWindowsPath("c:/a.png")` 为真），
 * 所以 旧版 在 Windows 上本来就是大小写不敏感比较。渲染层拿不到 `path.resolve()`，
 * 本模块用「规范化 + 转小写做比较键」复现同一语义（`imagePathKey`）。
 *
 * 方向性说明：判为「已引用」→ 不删；判为「未引用」→ 进删除清单。
 * 大小写/分隔符的歧义一律落在**不删**那一侧（把 `A.png` 与 `a.png` 视作同一文件），
 * 对破坏性操作而言这是安全的方向。Linux 上路径本就不该有大小写重名，
 * 此处统一按不敏感处理也不影响正确性。
 */

import type { ItemRecord } from '../types'

/** 视为「图片引用」的字段名（严格照抄 `advanced:398` 的四项，顺序一致） */
export const IMAGE_REFERENCE_FIELDS = ['image', 'icon', 'avatar', 'img'] as const

/** 扫描图片时的扩展名白名单（小写含点，照抄 `advanced:402` 的 7 项，顺序一致） */
export const IMAGE_EXTENSIONS = ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp', '.svg'] as const

/** 是否是白名单内的图片扩展名（用于校验主进程交回的目录清单） */
export function isImagePath(candidate: string): boolean {
  const lower = candidate.toLowerCase()
  return IMAGE_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

/**
 * 词法规范化一个路径（**不碰文件系统**）：统一分隔符为 `/`、压掉重复斜杠、
 * 消解 `.` 与 `..`、去掉结尾的 `/`。
 *
 * 之所以只能词法处理：渲染层没有 fs 权限，`..` 越过根目录这类边界交由主进程
 * 用真实 `path.resolve` 复核；本模块只保证**同一路径的多种写法落到同一个键**。
 */
function normalizeSeparators(value: string): string {
  const unified = value.replace(/\\/g, '/')
  const isAbsolute = unified.startsWith('/')
  // Windows 的盘符前缀（`C:`）不能被当成相对路径段丢前导斜杠，这里单独保留
  const driveMatch = /^([A-Za-z]:)(\/)?/.exec(unified)
  const prefix = driveMatch !== null ? driveMatch[1] : ''
  const body = driveMatch !== null ? unified.slice(driveMatch[0].length) : unified
  const segments: string[] = []
  for (const segment of body.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      const last = segments[segments.length - 1]
      if (segments.length > 0 && last !== '..') {
        segments.pop()
      } else if (!isAbsolute && prefix === '') {
        // 相对路径里开头的 `..` 无从消解，原样保留
        segments.push('..')
      }
      // 绝对路径下越过根的 `..` 直接丢弃（等价于文件系统行为）
      continue
    }
    segments.push(segment)
  }
  const joined = segments.join('/')
  if (prefix !== '') return `${prefix}/${joined}`
  return isAbsolute ? `/${joined}` : joined
}

/**
 * 把数据字段里的路径写法解析成规范化绝对（或相对基准目录的）路径。
 *
 * @param value 数据里的原始字段值（可能是绝对路径、`images/a.png`、正斜杠或反斜杠）
 * @param baseDir 相对路径的基准目录（一般是活跃库目录 / 图片根目录）；传空串则不拼基准
 * @returns 规范化后的路径；空串或纯空白输入返回空串（调用方据此跳过）
 */
export function resolveImagePath(value: string, baseDir: string): string {
  const trimmed = value.trim()
  if (trimmed === '') return ''
  const normalized = normalizeSeparators(trimmed)
  if (normalized === '') return ''
  // 已经是绝对路径（`/` 开头或 `C:` 开头）→ 直接用，不拼基准目录
  const isAbsolute = normalized.startsWith('/') || /^[A-Za-z]:\//.test(normalized)
  if (isAbsolute) return normalized
  const base = normalizeSeparators(baseDir.trim())
  if (base === '') return normalized
  return `${base}/${normalized}`
}

/**
 * 路径的比较键：规范化后转小写。
 * 复现 旧版 在 Windows 上 `WindowsPath` 大小写不敏感比较的语义（见文件头说明）。
 */
export function imagePathKey(path: string): string {
  return path.toLowerCase()
}

/**
 * 扫描条目数据，收集**被引用**的图片路径（规范化、去重）。
 *
 * 口径严格对齐 `advanced:391-399`：
 * - 遍历**全部类型**的全部条目（旧版 遍历 `raw` 的每个复数键）；
 * - 只看 `image`/`icon`/`avatar`/`img` 四个字段；
 * - 值必须是**非空字符串**（`isinstance(val, str) and val.strip()`）——
 * 数字、null、数组、嵌套对象里的图片路径一概不算引用。
 *
 * @param records 全库条目（渲染层用 `data.listAll()` 取）
 * @param baseDir 相对路径的基准目录
 */
export function collectReferencedImagePaths(records: readonly ItemRecord[], baseDir: string): string[] {
  const seen = new Set<string>()
  for (const record of records) {
    const data = record.data
    if (typeof data !== 'object' || data === null) continue
    for (const field of IMAGE_REFERENCE_FIELDS) {
      const raw = (data as Record<string, unknown>)[field]
      if (typeof raw !== 'string') continue
      const resolved = resolveImagePath(raw, baseDir)
      if (resolved === '') continue
      seen.add(imagePathKey(resolved))
    }
  }
  return [...seen].sort()
}

/** 扫描结果（面板展示 + 主进程删除前复核都用它） */
export interface UnusedImageScan {
  /** 被判定为「未使用」的图片路径（规范化、去重、按字典序，便于逐条比对） */
  unused: string[]
  /** 目录里的图片总数（去重后） */
  totalCount: number
  /** 数据里被引用、且**确实存在于目录清单中**的图片数 */
  usedCount: number
  /** 数据里引用了、但目录清单里没有的路径数（**悬空引用**，不代表有未使用图片） */
  danglingRefCount: number
}

/**
 * 做差集：`目录里的图片 − 数据里引用的图片`。
 *
 * @param candidates 目录扫描出的图片路径（主进程给的清单）
 * @param referencedKeys `collectReferencedImagePaths()` 的返回值（已是比较键）
 */
export function diffUnusedImages(candidates: readonly string[], referencedKeys: readonly string[]): UnusedImageScan {
  const referenced = new Set(referencedKeys.map(imagePathKey))
  const seenFiles = new Set<string>()
  const unused: string[] = []
  let usedCount = 0

  for (const candidate of candidates) {
    const normalized = resolveImagePath(candidate, '')
    if (normalized === '') continue
    const key = imagePathKey(normalized)
    if (seenFiles.has(key)) continue
    seenFiles.add(key)
    if (referenced.has(key)) {
      usedCount += 1
    } else {
      unused.push(normalized)
    }
  }

  const danglingRefCount = [...referenced].filter((key) => !seenFiles.has(key)).length

  return {
    unused: unused.sort(),
    totalCount: seenFiles.size,
    usedCount,
    danglingRefCount
  }
}

/**
 * 一行式摘要，给面板顶部显示（对齐 `advanced:415-417` 的三行数字，
 * 但压成一句，避免面板头部被数字撑开）。
 */
export function summarizeScan(scan: UnusedImageScan): string {
  if (scan.unused.length === 0) {
    return `共 ${scan.totalCount} 张图片，已被数据引用 ${scan.usedCount} 张，未发现未使用的图片。`
  }
  const tail = scan.danglingRefCount > 0 ? `（另有 ${scan.danglingRefCount} 条引用指向不存在的文件）` : ''
  return `共 ${scan.totalCount} 张图片，已被引用 ${scan.usedCount} 张，未使用 ${scan.unused.length} 张${tail}。`
}

/** 清单预览的最大条数（超出只显示前N 条 + 一句「还有 X 条」，避免刷屏） */
export const UNUSED_PREVIEW_LIMIT = 50

/** 取清单预览：前 `UNUSED_PREVIEW_LIMIT` 条 + 剩余条数（面板渲染用，纯切片） */
export function previewUnused(unused: readonly string[]): { shown: string[]; hiddenCount: number } {
  return {
    shown: unused.slice(0, UNUSED_PREVIEW_LIMIT),
    hiddenCount: Math.max(0, unused.length - UNUSED_PREVIEW_LIMIT)
  }
}