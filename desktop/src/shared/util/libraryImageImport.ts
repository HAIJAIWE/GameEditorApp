/**
 * 图片入库：把用户选的本地图片复制进 `<活跃库>/images/`，字段值改存**库相对路径**。
 *
 * ## 为什么必须做
 * 改之前选图只是把用户机器上的绝对路径记进字段：图片文件还在桌面/下载目录里，
 * 工程一搬家（或备份、发给别人）图就全丢。而项目里早有 `<库>/images/` 这套设施
 * （图片库面板、未用清理），却没有任何入口往里放图 —— 三条路互相矛盾。
 *
 * ## 路径口径（与既有设施对齐）
 * `shared/util/cleanupImages.ts::resolveImagePath` **本来就能解析相对路径**
 * （相对基准目录拼起来），未用清理用的就是它。所以字段存 `images/xxx.png` 后：
 * - 清理：`resolveImagePath('images/xxx.png', libDir)` → 命中库内文件
 * - 预览：`images:readByPath` 同样先 resolve（本轮补上）
 * - 存量：绝对路径原样可用，两条路径并存，**不需要迁移**
 */

/** 库内图片目录名（与 `imagesIpc` 硬编码的那处保持一致；真源在这里） */
export const LIBRARY_IMAGES_DIRNAME = 'images'

/**
 * 取路径最后一段文件名（自己切，不引 `node:path`）。
 * `shared/` 是被渲染层共用的，那边没有 node 内置模块的类型。
 */
function lastSegment(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')
  return index === -1 ? normalized : normalized.slice(index + 1)
}

/**
 * 规划入库后的文件名：保留原扩展名，重名加 `-2`、`-3` 后缀。
 *
 * 纯函数 —— 重名判定由调用方把「目录里已有的文件名集合」传进来，
 * 不碰 fs，便于单测（也避免为了知道有没有重名而去遍历目录）。
 */
export function planLibraryImageName(sourcePath: string, existingNames: readonly string[]): string {
  const raw = lastSegment(sourcePath.trim()).trim()
  const safe = raw === '' ? 'image' : raw
  const taken = new Set(existingNames.map((name) => name.toLowerCase()))
  if (!taken.has(safe.toLowerCase())) return safe

  const dot = safe.lastIndexOf('.')
  const stem = dot > 0 ? safe.slice(0, dot) : safe
  const ext = dot > 0 ? safe.slice(dot) : ''
  for (let index = 2; index < 1000; index++) {
    const candidate = `${stem}-${index}${ext}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
  // 理论上到不了：同名前缀塞满 999 个变体
  return `${stem}-${Date.now()}${ext}`
}

/**
 * 绝对路径 → 库相对路径（统一用正斜杠，和 schema/数据里的写法一致）。
 * 不在图片目录下时返回空串（调用方据此跳过）。
 */
export function toLibraryRelativePath(imagesDir: string, absolutePath: string): string {
  const normalizedDir = imagesDir.replace(/\\/g, '/').replace(/\/+$/, '')
  const normalizedFile = absolutePath.replace(/\\/g, '/')
  if (!normalizedFile.toLowerCase().startsWith(`${normalizedDir.toLowerCase()}/`)) return ''
  return `${LIBRARY_IMAGES_DIRNAME}/${normalizedFile.slice(normalizedDir.length + 1)}`
}
