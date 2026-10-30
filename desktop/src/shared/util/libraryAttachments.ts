/**
 * 会话附件（对齐 dsh `ui-attachment` 的**诚实子集**）：把用户选的文件复制进
 * `<活跃库>/attachments/`，消息里只存元数据。
 *
 * ## 为什么是「复制进库」而不是「记绝对路径」
 * 和图片入库（`libraryImageImport.ts`）同一个理由：工程搬家/备份/发给别人时，
 * 记在外面的绝对路径会全部失效。复制进库后文件跟着库走。
 *
 * ## 刻意不做的
 * - 上传进度条：没有流式上传链路，做进度就是假动画；
 * - 图片 lightbox：附件 chip 点开交给系统默认程序（`shell.openPath`）打开即可。
 */

/** 库内附件目录名（与 `images` 同级，互相独立） */
export const LIBRARY_ATTACHMENTS_DIRNAME = 'attachments'

/** 一条附件的元数据：消息里存、渲染层展示、传给智能体做上下文 */
export interface DigitalAttachment {
  /** 展示用文件名（入库后的名字，重名会带 `-2` 后缀） */
  name: string
  /** 库内绝对路径（`shell.openPath` 可开、智能体文件工具可读） */
  path: string
  /** MIME 类型（按扩展名推断，未知为 `application/octet-stream`） */
  mime: string
  /** 字节数 */
  bytes: number
}

/** 取路径最后一段文件名（不引 `node:path`，`shared/` 要能被渲染层共用） */
function lastSegment(path: string): string {
  const normalized = path.replace(/\\/g, '/')
  const index = normalized.lastIndexOf('/')
  return index === -1 ? normalized : normalized.slice(index + 1)
}

/**
 * 规划入库后的文件名：保留原扩展名，重名加 `-2`、`-3` 后缀。
 * 纯函数，重名判定由调用方传「目录里已有的文件名集合」进来（不碰 fs，便于单测）。
 */
export function planAttachmentName(sourcePath: string, existingNames: readonly string[]): string {
  const raw = lastSegment(sourcePath.trim()).trim()
  const safe = raw === '' ? 'attachment' : raw
  const taken = new Set(existingNames.map((name) => name.toLowerCase()))
  if (!taken.has(safe.toLowerCase())) return safe

  const dot = safe.lastIndexOf('.')
  const stem = dot > 0 ? safe.slice(0, dot) : safe
  const ext = dot > 0 ? safe.slice(dot) : ''
  for (let index = 2; index < 1000; index++) {
    const candidate = `${stem}-${index}${ext}`
    if (!taken.has(candidate.toLowerCase())) return candidate
  }
  return `${stem}-${Date.now()}${ext}`
}

/** 扩展名 → MIME（够用即可；未知回落 `application/octet-stream`） */
const MIME_BY_EXT: Readonly<Record<string, string>> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.svg': 'image/svg+xml',
  '.pdf': 'application/pdf',
  '.json': 'application/json',
  '.txt': 'text/plain',
  '.md': 'text/markdown',
  '.csv': 'text/csv',
  '.zip': 'application/zip',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.mp3': 'audio/mpeg',
  '.mp4': 'video/mp4'
}

export function guessMimeType(name: string): string {
  const dot = name.lastIndexOf('.')
  if (dot <= 0) return 'application/octet-stream'
  return MIME_BY_EXT[name.slice(dot).toLowerCase()] ?? 'application/octet-stream'
}

/**
 * 是否文本类附件（可内联进提示词）：`text/*`、`application/json`、`application/xml`。
 * 图片/PDF/Office 等二进制不内联（只给路径，由智能体的文件工具按需读取）。
 */
export function isTextAttachment(mime: string): boolean {
  const value = mime.toLowerCase()
  return value.startsWith('text/') || value === 'application/json' || value === 'application/xml'
}

/** 人类可读的字节数（1024 进制；<1KB 显示 B） */
export function formatAttachmentSize(bytes: number): string {
  if (!Number.isFinite(bytes) || bytes < 0) return ''
  if (bytes < 1024) return `${bytes} B`
  const kb = bytes / 1024
  if (kb < 1024) return `${kb.toFixed(1)} KB`
  const mb = kb / 1024
  return `${mb.toFixed(1)} MB`
}
