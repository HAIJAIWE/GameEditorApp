/**
 * 一次性搬迁（A2-1）：把「平铺在 userData 根下」的旧存储搬进 `libraries/<初始库>/`。
 *
 * 规则（对齐 `docs/a-tier-plan.md` §4 第 4 条「自动搬入初始库」）：
 *  - 已存在 `libraries/` 目录 → 视为已迁移，不动（幂等）；
 *  - 根下没有任何已知旧条目 → 视为全新安装，不动；
 *  - 否则逐个 **rename**（同盘原子）到 `libraries/<初始库>/`；
 *  - **任一步失败即抛中文错误并保留原文件**（搬一半比不搬更糟；调用方决定是否继续启动）。
 */

import { existsSync, mkdirSync, renameSync } from 'node:fs'
import { join } from 'node:path'

/** 需要搬迁的旧条目（相对 userData 根） */
export const FLAT_ENTRIES = [
  'mb-editor.db',
  'mb-editor.db-wal',
  'mb-editor.db-shm',
  'ceshu',
  'ceshu_notes',
  'ceshu_templates',
  'type_schema.json',
  'attr_system.json',
  'agent',
  'exports'
] as const

export interface MigrationResult {
  /** 已搬迁的条目名 */
  moved: string[]
  /** 目标目录 */
  targetDir: string
}

/**
 * 执行搬迁；无需搬迁时返回 null。
 * @param root userData 根目录
 * @param libraryName 目标库名（通常为初始库）
 */
export function migrateFlatToLibraries(root: string, libraryName: string): MigrationResult | null {
  const librariesDir = join(root, 'libraries')
  if (existsSync(librariesDir)) return null

  const present = FLAT_ENTRIES.filter((entry) => existsSync(join(root, entry)))
  if (present.length === 0) return null

  const targetDir = join(librariesDir, libraryName)
  const moved: string[] = []
  try {
    mkdirSync(targetDir, { recursive: true })
    for (const entry of present) {
      renameSync(join(root, entry), join(targetDir, entry))
      moved.push(entry)
    }
  } catch (error) {
    const detail = error instanceof Error ? error.message : String(error)
    // 不清理已搬的部分：直接把实情告诉调用方（原文件仍在，只是部分已移动）
    throw new Error(
      `旧数据搬迁失败（已搬 ${moved.length}/${present.length} 项，原文件保留）：${detail}`,
      { cause: error }
    )
  }
  return { moved, targetDir }
}
