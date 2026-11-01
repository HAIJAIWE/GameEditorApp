/**
 * 代码工作区根目录（对齐 dsh `fs-sandbox` 的 `cwd` 配置）。
 *
 * 语义：agent 的 `system.file_ops` / `system.shell` 都被围栏在这个根目录内。
 * 默认 = `<库>/code`；用户可在面板里改选任意文件夹（持久化到 `<库>/workspace.json`）。
 *
 * 为什么用模块单例而不是 store 注入：工作区是**进程级、随活跃库切换**的配置，
 * 与 `goalStore` 同路；`buildStores(libDir)` 每次切库时调用 `initWorkspace` 重置。
 * 技能用 `() => getWorkspaceRoot()` 动态读——运行时改选工作区无需重建 dispatcher。
 */

import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

/** 工作区覆盖文件名（库根目录下） */
export const WORKSPACE_FILE = 'workspace.json'

/** 默认代码子目录名 */
export const DEFAULT_CODE_SUBDIR = 'code'

let currentLibDir = ''
let currentRoot = ''

/** 默认工作区：`<库>/code` */
export function defaultWorkspaceRoot(): string {
  return currentLibDir === '' ? DEFAULT_CODE_SUBDIR : join(currentLibDir, DEFAULT_CODE_SUBDIR)
}

/** 读取持久化的覆盖（`{ root }`）；无效/缺失返回 null */
function loadOverride(libDir: string): string | null {
  try {
    const raw = readFileSync(join(libDir, WORKSPACE_FILE), 'utf8')
    const parsed: unknown = JSON.parse(raw)
    if (parsed !== null && typeof parsed === 'object') {
      const root = (parsed as { root?: unknown }).root
      if (typeof root === 'string' && root.trim() !== '') return root.trim()
    }
    return null
  } catch {
    return null
  }
}

function persist(): void {
  if (currentLibDir === '') return
  try {
    writeFileSync(join(currentLibDir, WORKSPACE_FILE), `${JSON.stringify({ root: currentRoot }, null, 2)}\n`, 'utf8')
  } catch {
    // 落盘失败不阻塞（下次 init 会回落默认）
  }
}

/** 切库时调用：重置 libDir 与根目录（读覆盖，缺省 `<库>/code`） */
export function initWorkspace(libDir: string): void {
  currentLibDir = libDir
  currentRoot = loadOverride(libDir) ?? defaultWorkspaceRoot()
}

/** 当前工作区根目录 */
export function getWorkspaceRoot(): string {
  return currentRoot === '' ? defaultWorkspaceRoot() : currentRoot
}

/** 设置工作区根（null/空 ⇒ 重置为默认 `<库>/code`），持久化并返回生效值 */
export function setWorkspaceRoot(next: string | null): string {
  currentRoot = next !== null && next.trim() !== '' ? next.trim() : defaultWorkspaceRoot()
  persist()
  return currentRoot
}
