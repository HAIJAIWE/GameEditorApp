/**
 * 引擎导出的用户提示（拷图信息）。
 *
 * 纯函数、可单测：把 `engine:exportData` 的返回拼成人话。
 * - 拷到了图 → 告诉用户"图片已一起导出"，否则他根本不知道旁边多了个 images 目录；
 * - 有引用但文件不在盘上 → 明确点名数量，别静默（那是数据与图对不上的信号）。
 */

export interface EngineExportNoticeInput {
  filePath: string
  bytes: number
  copiedImages?: number
  missingImages?: readonly string[]
  /** 覆盖前备份的上一版路径（首次导出为 undefined） */
  backupPath?: string
}

export function engineExportNotice(result: EngineExportNoticeInput): string {
  const base = `已导出 ${result.filePath}（${result.bytes} 字节）`
  const copied = result.copiedImages ?? 0
  const missing = result.missingImages ?? []

  let tail = ''
  if (copied > 0 && missing.length === 0) tail = `；图片已一起导出（${copied} 张）`
  else if (copied === 0 && missing.length > 0) tail = `；⚠️ ${missing.length} 张引用的图片没找到，未随导出`
  else if (copied > 0 && missing.length > 0) tail = `；已导出 ${copied} 张图片，⚠️ 另有 ${missing.length} 张没找到`

  // 覆盖前备份：导出目标是游戏活文件，留一份上一版供回滚（AI 生成可能出错）。
  if (result.backupPath !== undefined) tail += '；已备份上一版供回滚'

  return `${base}${tail}`
}
