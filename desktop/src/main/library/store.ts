/**
 * 库注册表读写（A2-1）：`libraries.json` 存活跃库指针与库列表。
 *
 * 与项目存储纪律一致：**唯一写者串行队列 + temp→rename 原子写**；
 * 读取容错（文件缺失/损坏 → 回落到「只有初始库、活跃=初始库」的默认注册表），
 * 因为注册表损坏不应让应用起不来。**严格读取**由 `readStrict()` 提供，供排障与单测。
 */

import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

/** 初始库名（对齐 旧版 `INITIAL_LIBRARY_NAME`） */
export const INITIAL_LIBRARY_NAME = '初始库'

export interface LibraryEntry {
  name: string
  createdAt: string
  description: string
  /** 初始库禁删 */
  isInitial: boolean
}

export interface LibraryRegistry {
  activeLibrary: string
  libraries: LibraryEntry[]
}

function defaultRegistry(now: Date = new Date()): LibraryRegistry {
  return {
    activeLibrary: INITIAL_LIBRARY_NAME,
    libraries: [
      {
        name: INITIAL_LIBRARY_NAME,
        createdAt: formatTimestamp(now),
        description: '默认库',
        isInitial: true
      }
    ]
  }
}

/** 本地时间戳（YYYY-MM-DD HH:mm:ss） */
export function formatTimestamp(date: Date): string {
  const pad = (value: number): string => String(value).padStart(2, '0')
  return (
    `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ` +
    `${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`
  )
}

/** 结构校验：库列表非空、每项有 name、活跃库在列表内 */
export function isLibraryRegistry(value: unknown): value is LibraryRegistry {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false
  const record = value as Record<string, unknown>
  if (typeof record.activeLibrary !== 'string' || !Array.isArray(record.libraries)) return false
  if (record.libraries.length === 0) return false
  const names = record.libraries.map((entry) =>
    entry !== null && typeof entry === 'object' ? (entry as { name?: unknown }).name : undefined
  )
  if (names.some((name) => typeof name !== 'string' || name === '')) return false
  return names.includes(record.activeLibrary)
}

export class LibraryRegistryStore {
  private writeChain: Promise<unknown> = Promise.resolve()

  constructor(private readonly filePath: string) {}

  get path(): string {
    return this.filePath
  }

  /** 严格读取：文件不存在返回默认注册表；损坏抛中文错误 */
  readStrict(): LibraryRegistry {
    if (!existsSync(this.filePath)) return defaultRegistry()
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(this.filePath, 'utf-8'))
    } catch {
      throw new Error('库注册表损坏（JSON 解析失败）')
    }
    if (!isLibraryRegistry(raw)) {
      throw new Error('库注册表格式不正确：期望 { activeLibrary, libraries[] }')
    }
    return raw
  }

  /** 容错读取：任何异常都回落到默认注册表（注册表坏了也要能启动） */
  read(): LibraryRegistry {
    try {
      return this.readStrict()
    } catch {
      return defaultRegistry()
    }
  }

  /** 原子写注册表 */
  write(registry: LibraryRegistry): Promise<void> {
    return this.enqueue(() => {
      mkdirSync(dirname(this.filePath), { recursive: true })
      const tmpPath = `${this.filePath}.tmp`
      writeFileSync(tmpPath, JSON.stringify(registry, null, 2), 'utf-8')
      renameSync(tmpPath, this.filePath)
    })
  }

  /** 写操作串行队列：前一个写完成才执行下一个；失败不阻塞后续任务 */
  private enqueue<T>(op: () => T): Promise<T> {
    const run = this.writeChain.then(op)
    this.writeChain = run.catch(() => undefined)
    return run
  }
}

export { defaultRegistry }
