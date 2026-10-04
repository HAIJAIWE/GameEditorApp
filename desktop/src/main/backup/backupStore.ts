import { mkdir, readFile, readdir, rename, stat, unlink, writeFile } from 'node:fs/promises'
import { join, resolve, sep } from 'node:path'

import { isValidBackupName, parseBackupCreatedAt, type BackupEntry } from '../../shared/backup'

/**
 * 备份存储层：纯文件系统逻辑（不依赖 electron）。
 * 对应 Python src/ui/dialogs/backup_manager.py + src/features/backup.py 的落盘部分。
 *
 * 相对 Python 的改进（安全优先）：
 * - 原子写：先写 `${target}.tmp` 再 rename 替换，崩溃/中断不会留下半截 JSON；
 * - 软删除：rename 为 `${name}.deleted`（撞名则 `.2`/`.3`…），绝不 unlink；
 * - 路径校验：先过 `isValidBackupName`，再断言 resolve 结果未越出 root；
 * - 备份名带可选 label，避免同秒同名互相覆盖（同名重复创建走原子替换，也不报错）。
 */

const TMP_SUFFIX = '.tmp'
const DELETED_SUFFIX = '.deleted'

/** 校验 name 合法且解析后仍在 root 内，否则抛中文 Error */
export function resolveBackupPath(backupRoot: string, name: string): string {
  if (!isValidBackupName(name)) {
    throw new Error('非法的备份文件名')
  }
  const root = resolve(backupRoot)
  const target = resolve(root, name)
  if (!target.startsWith(root + sep)) {
    throw new Error('备份路径越界')
  }
  return target
}

/** root 下的 *.json（忽略 *.tmp / *.deleted），按 mtime 降序 */
export async function listBackups(backupRoot: string): Promise<BackupEntry[]> {
  let names: string[]
  try {
    names = await readdir(backupRoot)
  } catch (error) {
    if (isEnoent(error)) return []
    throw new Error(`读取备份目录失败：${messageOf(error)}`, { cause: error })
  }

  const entries: BackupEntry[] = []
  for (const name of names) {
    if (!name.endsWith('.json') || name.endsWith(TMP_SUFFIX) || name.endsWith(DELETED_SUFFIX)) {
      continue
    }
    let info
    try {
      info = await stat(join(backupRoot, name))
    } catch {
      // 列举与读取之间被并发删除：跳过而非整体失败
      continue
    }
    if (!info.isFile()) continue
    const mtime = info.mtime.toISOString()
    entries.push({
      name,
      sizeBytes: info.size,
      createdAt: parseBackupCreatedAt(name) ?? mtime,
      mtime
    })
  }

  entries.sort((a, b) => (a.mtime < b.mtime ? 1 : a.mtime > b.mtime ? -1 : 0))
  return entries
}

/** 确保 root 存在（recursive mkdir）→ 写 `${target}.tmp` → rename 原子替换；返回 BackupEntry */
export async function createBackupFile(
  backupRoot: string,
  name: string,
  payload: unknown
): Promise<BackupEntry> {
  const target = resolveBackupPath(backupRoot, name)
  await mkdir(backupRoot, { recursive: true })
  const tmpPath = `${target}${TMP_SUFFIX}`
  try {
    await writeFile(tmpPath, JSON.stringify(payload, null, 2), 'utf-8')
    // rename 覆盖已存在的目标文件：POSIX 与 Node 的 Windows 实现均为原子替换
    await rename(tmpPath, target)
  } catch (error) {
    // 失败清理临时文件（忽略清理自身的错误，不掩盖原始错误）
    await unlink(tmpPath).catch(() => undefined)
    throw new Error(`创建备份失败：${messageOf(error)}`, { cause: error })
  }

  const info = await stat(target)
  const mtime = info.mtime.toISOString()
  return {
    name,
    sizeBytes: info.size,
    createdAt: parseBackupCreatedAt(name) ?? mtime,
    mtime
  }
}

/** 硬读并 JSON.parse（shape 校验交给调用方）；name 非法→抛中文 Error */
export async function readBackupFile(backupRoot: string, name: string): Promise<unknown> {
  const target = resolveBackupPath(backupRoot, name)
  let text: string
  try {
    text = await readFile(target, 'utf-8')
  } catch (error) {
    if (isEnoent(error)) throw new Error('备份文件不存在', { cause: error })
    throw new Error(`读取备份失败：${messageOf(error)}`, { cause: error })
  }
  try {
    return JSON.parse(text) as unknown
  } catch (error) {
    throw new Error('备份文件内容损坏（JSON 解析失败）', { cause: error })
  }
}

/** **软删除**：rename 为 `${name}.deleted`（已存在则加 `.2`/`.3`…），绝不 unlink */
export async function deleteBackupFile(backupRoot: string, name: string): Promise<void> {
  const target = resolveBackupPath(backupRoot, name)
  if (!(await exists(target))) {
    throw new Error('备份文件不存在，无法删除')
  }
  const dest = await nextDeletedPath(target)
  await rename(target, dest)
}

async function exists(path: string): Promise<boolean> {
  try {
    await stat(path)
    return true
  } catch {
    return false
  }
}

async function nextDeletedPath(target: string): Promise<string> {
  let candidate = `${target}${DELETED_SUFFIX}`
  let n = 2
  while (await exists(candidate)) {
    candidate = `${target}${DELETED_SUFFIX}.${n}`
    n += 1
  }
  return candidate
}

function isEnoent(error: unknown): boolean {
  return (error as NodeJS.ErrnoException).code === 'ENOENT'
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
