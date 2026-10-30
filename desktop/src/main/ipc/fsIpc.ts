import { readdir, stat } from 'node:fs/promises'
import { readFile } from 'node:fs/promises'
import { dirname, isAbsolute, join } from 'node:path'

import { app } from 'electron'

import { fsListDirInputSchema, fsReadFileInputSchema } from '../../shared/schema/core/schemas'
import type { IpcHandlerDeps, IpcRegistrar } from '../ipc'
import type { FsDirEntry, FsDirListing, FsFileContent } from '../../shared/ipc'

/**
 * 代码面板的文件系统通道（中间窗口「代码编辑」页签的数据源）。
 *
 * ## 为什么只有读、没有写
 * 本面板定位是**只读查看器**：让用户在同一窗口里看代码/配置/Demo 源码，
 * 不替代 VS Code。写入会引入脏状态、冲突、撤销栈一整套问题，属独立议题——
 * 做成「能改但改丢」比不做严重得多，故刻意只读（UI 上也有明示）。
 *
 * ## 三道闸（安全与健壮性，详见 shared/ipc.ts 的契约注释）
 * 1. 目录条目上限 500 条：node_modules 一动辄数万条，全量序列化会卡死渲染层；
 * 2. 文件大小上限 512KB：代码文件远超此尺寸的极少，超限返回 truncated 标记；
 * 3. 二进制探测（首 8KB 含 NUL）：图片/字体/sqlite 不当文本渲染。
 */

/** 目录条目硬上限（防 node_modules 类巨型目录） */
const MAX_DIR_ENTRIES = 500

/** 单文件读取上限（字节） */
const MAX_FILE_BYTES = 512 * 1024

/** 二进制探测窗口：前 8KB 出现 NUL 即判二进制（UTF-8 文本不含 NUL） */
const BINARY_SNIFF_BYTES = 8 * 1024

/** 默认根目录：dev 下取 app 目录的父目录（仓库根），生产取 app 目录的父目录 */
function resolveDefaultRoot(): string {
  // app.getAppPath() dev=D:\...\desktop，prod=<resources>/app.asar
  return dirname(app.getAppPath())
}

/** 目录名噪音过滤：版本控制/依赖/缓存目录不进树（用户仍可通过绝对路径进入） */
const HIDDEN_DIRS: ReadonlySet<string> = new Set([
  'node_modules', '.git', 'dist', 'out', '.vite', '__pycache__', '.cache'
])

export function registerFsIpc(_deps: IpcHandlerDeps, handle: IpcRegistrar): void {
  handle('fs:appRoot', undefined, () => ({ root: resolveDefaultRoot() }))

  handle('fs:listDir', fsListDirInputSchema, async (req): Promise<FsDirListing> => {
    // 相对路径按默认根目录解析：正文里的 `src/main/ipc.ts` 这类相对引用也能定位
    const path =
      req.path === '' ? resolveDefaultRoot() : isAbsolute(req.path) ? req.path : join(resolveDefaultRoot(), req.path)
    let names: string[]
    try {
      names = await readdir(path)
    } catch {
      // 目录不存在/无权限：返回空清单而非抛错（UI 显示「无法读取」）
      return { path, entries: [], truncated: false }
    }
    const entries: FsDirEntry[] = []
    let truncated = false
    for (const name of names) {
      if (entries.length >= MAX_DIR_ENTRIES) {
        truncated = true
        break
      }
      if (HIDDEN_DIRS.has(name)) continue
      let isDir: boolean
      let size: number
      try {
        const info = await stat(join(path, name))
        isDir = info.isDirectory()
        size = info.isFile() ? info.size : 0
      } catch {
        // 单条目 stat 失败（断链/权限）：跳过该条，不影响整目录
        continue
      }
      entries.push({ name, isDir, size })
    }
    return { path, entries, truncated }
  })

  handle('fs:readFile', fsReadFileInputSchema, async (req): Promise<FsFileContent> => {
    // 相对路径按默认根目录解析（同 fs:listDir）：让正文内联文件引用可直接打开
    const path = isAbsolute(req.path) ? req.path : join(resolveDefaultRoot(), req.path)
    let buffer: Buffer
    try {
      buffer = await readFile(path)
    } catch {
      return { path, content: '', bytes: 0, truncated: false, reason: '无法读取文件（不存在或无权限）' }
    }
    if (buffer.length > MAX_FILE_BYTES) {
      return { path, content: '', bytes: buffer.length, truncated: true, reason: `文件超过 ${MAX_FILE_BYTES / 1024}KB 上限，未加载` }
    }
    if (buffer.subarray(0, BINARY_SNIFF_BYTES).includes(0)) {
      return { path, content: '', bytes: buffer.length, truncated: false, reason: '二进制文件，不作为文本显示' }
    }
    return { path, content: buffer.toString('utf8'), bytes: buffer.length, truncated: false, reason: null }
  })
}
