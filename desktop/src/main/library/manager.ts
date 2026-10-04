/**
 * 库服务（A2-1）：库列表 / 创建 / 重命名 / 删除 / 切换 + 目录解析。
 *
 * 规则对齐 Python `library_manager.py`：**初始库禁删**、**至少保留一个库**、
 * 重命名同步搬目录；活跃库指针持久化在 `libraries.json`。
 *
 * 有意偏离（比 Python 更严格的地方，都在注释里写明）：
 *  - Python 把 `LibraryManager` 做成可变全局单例、各 store 自己算路径（双源）；
 *    TS 侧**路径只由本服务产出**，store 不持路径 → 无全局态。
 *  - 删除**活跃库**时先自动切到初始库再删（Python 无此分支）；不隐式删掉用户当前所在库。
 */

import { existsSync, mkdirSync, renameSync, rmSync } from 'node:fs'
import { join } from 'node:path'

import { INITIAL_LIBRARY_NAME, LibraryRegistryStore, formatTimestamp, type LibraryEntry } from './store'

/** 库名长度上限 */
export const LIBRARY_NAME_MAX = 40

/** 校验库名；通过返回 null，否则返回中文原因 */
export function validateLibraryName(raw: string): string | null {
  const name = raw.trim()
  if (name === '') return '库名不能为空'
  if (name.length > LIBRARY_NAME_MAX) return `库名过长（最多 ${LIBRARY_NAME_MAX} 字）`
  // 关键安全约束：库名会参与拼路径，必须挡住分隔符与 ..
  if (/[\\/:*?"<>|]/u.test(name)) return '库名不能包含 \\ / : * ? " < > | 等字符'
  if (name.includes('..')) return '库名不能包含 ..'
  if (name.startsWith('.')) return '库名不能以点开头'
  if (name === INITIAL_LIBRARY_NAME) return null
  return null
}

export interface EnsureReadyResult {
  registryCreated: boolean
  activeDirCreated: boolean
}

export class LibraryManager {
  private readonly registry: LibraryRegistryStore

  constructor(private readonly root: string) {
    this.registry = new LibraryRegistryStore(join(root, 'libraries.json'))
  }

  /** 注册表文件路径（排障用） */
  get registryPath(): string {
    return this.registry.path
  }

  /** 库根目录：`<userData>/libraries` */
  get librariesRoot(): string {
    return join(this.root, 'libraries')
  }

  list(): LibraryEntry[] {
    return this.registry.read().libraries
  }

  active(): string {
    return this.registry.read().activeLibrary
  }

  /** 指定库的目录 */
  dirOf(name: string): string {
    return join(this.librariesRoot, name)
  }

  /** 活跃库目录（六个 store 的统一前缀） */
  activeDir(): string {
    return this.dirOf(this.active())
  }

  /**
   * 启动准备：注册表不存在则写入默认注册表（含初始库）；
   * 所有已注册库的目录缺失时补建（避免手工删目录后崩）。
   */
  async ensureReady(): Promise<EnsureReadyResult> {
    const registryCreated = !existsSync(this.registry.path)
    const registry = this.registry.read()
    if (registryCreated) await this.registry.write(registry)

    const activeDir = this.dirOf(registry.activeLibrary)
    const activeDirCreated = !existsSync(activeDir)
    for (const entry of registry.libraries) {
      mkdirSync(this.dirOf(entry.name), { recursive: true })
    }
    return { registryCreated, activeDirCreated }
  }

  async create(rawName: string, description = ''): Promise<LibraryEntry> {
    const invalid = validateLibraryName(rawName)
    if (invalid !== null) throw new Error(invalid)
    const name = rawName.trim()

    const registry = this.registry.read()
    if (registry.libraries.some((entry) => entry.name === name)) {
      throw new Error(`库「${name}」已存在`)
    }
    const dir = this.dirOf(name)
    if (existsSync(dir)) {
      throw new Error(`目录已存在：${dir}（请换个库名，或先手工清理该目录）`)
    }

    const entry: LibraryEntry = {
      name,
      createdAt: formatTimestamp(new Date()),
      description,
      isInitial: false
    }
    mkdirSync(dir, { recursive: true })
    await this.registry.write({ ...registry, libraries: [...registry.libraries, entry] })
    return entry
  }

  /** 重命名：同步搬目录；若改的是活跃库则一并更新指针 */
  async rename(from: string, rawTo: string): Promise<void> {
    const invalid = validateLibraryName(rawTo)
    if (invalid !== null) throw new Error(invalid)
    const to = rawTo.trim()

    const registry = this.registry.read()
    if (!registry.libraries.some((entry) => entry.name === from)) {
      throw new Error(`库「${from}」不存在`)
    }
    if (from === to) return
    if (registry.libraries.some((entry) => entry.name === to)) {
      throw new Error(`库「${to}」已存在`)
    }

    const fromDir = this.dirOf(from)
    const toDir = this.dirOf(to)
    if (existsSync(toDir)) {
      throw new Error(`目标目录已存在：${toDir}`)
    }
    if (existsSync(fromDir)) renameSync(fromDir, toDir)

    await this.registry.write({
      activeLibrary: registry.activeLibrary === from ? to : registry.activeLibrary,
      libraries: registry.libraries.map((entry) => (entry.name === from ? { ...entry, name: to } : entry))
    })
  }

  /** 删除库：初始库禁删、至少留一个；删活跃库时先切到初始库 */
  async remove(name: string): Promise<{ switchedTo: string | null }> {
    const registry = this.registry.read()
    const target = registry.libraries.find((entry) => entry.name === name)
    if (target === undefined) throw new Error(`库「${name}」不存在`)
    if (target.isInitial || name === INITIAL_LIBRARY_NAME) {
      throw new Error(`初始库「${INITIAL_LIBRARY_NAME}」不可删除`)
    }
    if (registry.libraries.length <= 1) {
      throw new Error('至少需要保留一个库，无法删除')
    }

    let switchedTo: string | null = null
    if (registry.activeLibrary === name) {
      switchedTo = INITIAL_LIBRARY_NAME
      await this.registry.write({ ...registry, activeLibrary: INITIAL_LIBRARY_NAME })
    }

    // 库名已过 validateLibraryName（无分隔符、无 ..），故删除目标必定落在 librariesRoot 之内
    rmSync(this.dirOf(name), { recursive: true, force: true })
    const latest = this.registry.read()
    await this.registry.write({
      ...latest,
      libraries: latest.libraries.filter((entry) => entry.name !== name)
    })
    return { switchedTo }
  }

  /** 切换活跃库（持久化指针；目录缺失时补建） */
  async switch(rawName: string): Promise<void> {
    const name = rawName.trim()
    const registry = this.registry.read()
    if (!registry.libraries.some((entry) => entry.name === name)) {
      throw new Error(`库「${name}」不存在`)
    }
    if (registry.activeLibrary === name) return
    mkdirSync(this.dirOf(name), { recursive: true })
    await this.registry.write({ ...registry, activeLibrary: name })
  }
}
