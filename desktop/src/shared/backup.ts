/**
 * 数据备份纯逻辑（跨进程共用：主进程存储层用，渲染层展示用）。
 * 对应 Python src/ui/dialogs/backup_manager.py + src/features/backup.py。
 *
 * 相对 Python 的改进：
 * - 备份名可带可选 label（[A-Za-z0-9_-]{1,40}），避免同秒创建互相覆盖；
 * - 时间戳解析与命名独立成纯函数，不再用 `text.split(' - ')[1]` 从显示文本反推文件名；
 * - 列表项直接携带文件名与 ISO 时间，无需渲染层再拼/拆字符串。
 *
 * 说明：本模块不含 zod。仓库惯例是将 IPC 输入 schema 集中在 `src/shared/schemas.ts`
 * （该文件是全仓唯一导入 zod 的 shared 模块），故此处只导出类型与纯函数。
 */

/** 备份列表项。createdAt 优先取从文件名解析出的 ISO 时间，解析失败则回退文件 mtime。 */
export interface BackupEntry {
  /** 文件名，如 backup_20261005_143012.json */
  name: string
  sizeBytes: number
  /** 从文件名解析出的 ISO 时间；解析失败为已存在文件的 mtime ISO */
  createdAt: string
  /** 文件系统修改时间（ISO） */
  mtime: string
}

/** 恢复结果（供编排层回传给渲染层；恢复写库由调用方完成，本层只定义形状）。 */
export interface RestoreOutcome {
  restored: boolean
  /** 恢复前自动生成的安全备份文件名；未生成为 null */
  preBackup: string | null
  totalItems: number
  error?: string
}

/** 合法备份名：backup_YYYYmmdd_HHMMSS.json，允许可选 {label}（[A-Za-z0-9_-]{1,40}） */
export const BACKUP_NAME_RE = /^backup_\d{8}_\d{6}(?:_[A-Za-z0-9_-]{1,40})?\.json$/

export function isValidBackupName(name: string): boolean {
  return BACKUP_NAME_RE.test(name)
}

/** 生成备份时间戳片段：'YYYYmmdd_HHMMSS'（本地时间，秒级） */
export function formatBackupStamp(d: Date): string {
  const pad = (n: number): string => String(n).padStart(2, '0')
  const ymd = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}`
  const hms = `${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`
  return `${ymd}_${hms}`
}

/**
 * 由时间（与可选 label）构造备份文件名。
 * label 非法（非 [A-Za-z0-9_-]{1,40}）时抛错，而非静默清洗——宁缺勿错。
 */
export function buildBackupName(d: Date, label?: string): string {
  const stamp = formatBackupStamp(d)
  if (label === undefined || label === '') return `backup_${stamp}.json`
  if (!/^[A-Za-z0-9_-]{1,40}$/.test(label)) {
    throw new Error('非法的备份标签')
  }
  return `backup_${stamp}_${label}.json`
}

/**
 * 从备份名解析创建时间，返回 ISO 字符串；名字不合法或日期字段越界（如 20260230）返回 null。
 * 采用本地时间构造以与 formatBackupStamp 往返一致。
 */
export function parseBackupCreatedAt(name: string): string | null {
  const m = /^backup_(\d{4})(\d{2})(\d{2})_(\d{2})(\d{2})(\d{2})/.exec(name)
  if (!m || !isValidBackupName(name)) return null
  const year = Number(m[1])
  const month = Number(m[2])
  const day = Number(m[3])
  const hour = Number(m[4])
  const minute = Number(m[5])
  const second = Number(m[6])
  const date = new Date(year, month - 1, day, hour, minute, second)
  // 回读校验：拒绝 Date 自动进位产生的非法日期（如 13 月、32 日）
  if (
    date.getFullYear() !== year ||
    date.getMonth() !== month - 1 ||
    date.getDate() !== day ||
    date.getHours() !== hour ||
    date.getMinutes() !== minute ||
    date.getSeconds() !== second
  ) {
    return null
  }
  return date.toISOString()
}
