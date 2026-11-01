/**
 * OS 级文件沙箱（Slice 35，Windows ACL）。
 *
 * 用 `icacls` 给目录加「拒绝写入」ACE（`/deny <user>:(W)`），在受控时段内**真正由 OS 拒绝写**，
 * 结束后用 `/remove:d` 恢复。这是比「应用层拒绝」更强的强制点，但仍**不是容器/内核隔离**：
 * 管理员可夺取所有权；进程崩溃可能留下未恢复的 ACE（因此只在显式开启且短时窗口内使用）。
 *
 * 平台：仅 Windows（icacls）；其他平台 `isAclSandboxSupported()` 返回 false。
 */

import { execFile } from 'node:child_process'
import { userInfo } from 'node:os'
import { promisify } from 'node:util'

const execFileAsync = promisify(execFile)

export function isAclSandboxSupported(): boolean {
  return process.platform === 'win32'
}

async function icacls(args: string[]): Promise<void> {
  await execFileAsync('icacls', args, { windowsHide: true })
}

/** 给目录加「拒绝写入」ACE（Windows） */
export async function denyWrite(dir: string, user: string = userInfo().username): Promise<void> {
  await icacls([dir, '/deny', `${user}:(W)`])
}

/** 移除 deny ACE，恢复原权限（Windows） */
export async function restoreWrite(dir: string, user: string = userInfo().username): Promise<void> {
  await icacls([dir, '/remove:d', user])
}

/**
 * 在「目录只读」ACL 下执行 `fn`，**无论成功失败都恢复**。
 * 非 Windows 抛错（调用方应回退到「拒绝运行」策略）。
 */
export async function withReadOnlyDir<T>(dir: string, fn: () => Promise<T>): Promise<T> {
  if (!isAclSandboxSupported()) {
    throw new Error('OS 级沙箱目前仅支持 Windows（icacls）')
  }
  await denyWrite(dir)
  try {
    return await fn()
  } finally {
    await restoreWrite(dir)
  }
}

/**
 * 在「多目录只读」ACL 下执行 `fn`（对齐 `withReadOnlyDir`，但保护多个目录），
 * **无论成功失败都恢复**；单个目录加 ACE 失败（不存在/无权限）跳过，不阻断其余。
 *
 * 用途：shell 跑命令期间保护游戏库的 data/ceshu/design，使越界的写命令无法破坏库。
 * 非 Windows 直接执行 `fn`（无 icacls，不做 ACL 硬化）。
 */
export async function withReadOnlyDirs<T>(dirs: readonly string[], fn: () => Promise<T>): Promise<T> {
  if (!isAclSandboxSupported() || dirs.length === 0) return fn()
  const applied: string[] = []
  try {
    for (const dir of dirs) {
      try {
        await denyWrite(dir)
        applied.push(dir)
      } catch {
        // 目录不存在 / 无权限：跳过该目录，不阻断
      }
    }
    return await fn()
  } finally {
    for (const dir of applied) {
      try {
        await restoreWrite(dir)
      } catch {
        // 恢复失败不抛出（尽力而为）
      }
    }
  }
}
