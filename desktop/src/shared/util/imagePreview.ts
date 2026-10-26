/**
 * 本地图片预览（数据编辑器「图片」字段用）。
 *
 * ## 为什么需要这一层
 * 旧版 的图片字段是「只读路径框 + 选择按钮 + `LazyImageLabel` 实时预览」
 * （`src/ui/widgets/dynamic_form::_create_image_widget`）。TS 侧不能直接照抄
 * `<img src="C:\...\a.png">`：渲染层在 Electron 里是独立来源，直接引用本地文件路径
 * 会被 `webSecurity` 拦掉（打包后渲染层走自定义协议，更不可能读到任意本地路径）。
 *
 * 做法：**由主进程读文件并回传 `data:` URL**（见 `dialog:chooseImageFile`），
 * 渲染层只拿 data URL 渲染。这里放可单测的纯逻辑：扩展名 → MIME、要不要给 data URL。
 */

/** 预览体积上限：超过就不给 data URL，只显示路径（IPC 传输 + 渲染内存都要有界） */
export const IMAGE_PREVIEW_MAX_BYTES = 8 * 1024 * 1024

/** 扩展名 → MIME（对齐 旧版 的 `*.png *.jpg *.jpeg *.bmp *.gif` 白名单） */
const MIME_BY_EXTENSION: Readonly<Record<string, string>> = {
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  bmp: 'image/bmp',
  gif: 'image/gif'
}

/** 取文件名的扩展名（小写，不含点）；无扩展名返回空串 */
export function fileExtensionOf(fileName: string): string {
  const base = fileName.split(/[\\/]/).pop() ?? ''
  const dot = base.lastIndexOf('.')
  if (dot <= 0 || dot === base.length - 1) return ''
  return base.slice(dot + 1).toLowerCase()
}

/**
 * 按扩展名判定 MIME；不在白名单里返回 `''`（调用方据此拒绝，不硬猜类型）。
 * @param fileName 文件名或完整路径
 */
export function imageMimeOf(fileName: string): string {
  return MIME_BY_EXTENSION[fileExtensionOf(fileName)] ?? ''
}

/** 这个文件是不是受支持的图片类型 */
export function isSupportedImageFile(fileName: string): boolean {
  return imageMimeOf(fileName) !== ''
}

/**
 * 构造预览用的 data URL；**不受支持或超限都返回空串**（调用方应显示「仅路径」）。
 * @param fileName 用于取 MIME
 * @param bytes 文件字节数
 * @param base64 主进程读到的 base64 内容（调用方已 encode 好）
 */
export function buildImagePreviewDataUrl(fileName: string, bytes: number, base64: string): string {
  const mime = imageMimeOf(fileName)
  if (mime === '') return ''
  if (bytes > IMAGE_PREVIEW_MAX_BYTES) return ''
  return `data:${mime};base64,${base64}`
}

/** 预览不可用时的中文原因（给用户看，别静默留白） */
export function imagePreviewUnavailableReason(fileName: string, bytes: number): string | null {
  if (!isSupportedImageFile(fileName)) {
    return `不支持的图片格式（仅支持 ${[...new Set(Object.values(MIME_BY_EXTENSION))].join(' / ')}）`
  }
  if (bytes > IMAGE_PREVIEW_MAX_BYTES) {
    return `图片较大（${Math.round(bytes / 1024 / 1024)} MB），仅显示路径不预览`
  }
  return null
}
