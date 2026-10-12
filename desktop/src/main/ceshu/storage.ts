import { existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import type { CeshuDocument } from '../../shared/ceshu/ceshuConstants'
import { normalizeCeshu } from '../../shared/ceshu/ceshuModel'

/**
 * 策划书存储：每份策划书一个独立 JSON 文件（与 Python 版 data/libraries/<库>/ceshu/<id>.json 格式兼容）。
 * 写盘采用「临时文件 + rename」原子替换，避免中途崩溃留下半截文件。
 */
export class CeshuStorage {
  constructor(private readonly dir: string) {}

  /** 列出全部策划书文档；单个文件损坏时跳过，不阻塞其余文件 */
  listDocuments(): CeshuDocument[] {
    const docs: CeshuDocument[] = []
    for (const file of this.listIds()) {
      try {
        docs.push(this.load(file))
      } catch {
        // 损坏文件跳过（后续可做修复入口）
      }
    }
    return docs
  }

  load(id: string): CeshuDocument {
    const path = this.filePath(id)
    let text: string
    try {
      text = readFileSync(path, 'utf-8')
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
        throw new Error('策划书不存在，可能已被删除', { cause: error })
      }
      throw new Error(`读取策划书文件失败：${error instanceof Error ? error.message : String(error)}`, { cause: error })
    }
    let raw: unknown
    try {
      raw = JSON.parse(text)
    } catch {
      throw new Error('策划书文件内容损坏（JSON 解析失败）')
    }
    return normalizeCeshu(raw)
  }

  save(doc: CeshuDocument): void {
    this.ensureDir()
    const path = this.filePath(doc.ceshu_id)
    const tmpPath = `${path}.tmp`
    writeFileSync(tmpPath, JSON.stringify(doc, null, 2), 'utf-8')
    renameSync(tmpPath, path)
  }

  /** 删除策划书文件；文件不存在时返回 false（对齐 Python `delete_ceshu`） */
  remove(id: string): boolean {
    const path = this.filePath(id)
    if (!existsSync(path)) return false
    rmSync(path)
    return true
  }

  /** 列出目录内的策划书 id（文件名为 <id>.json） */
  listIds(): string[] {
    this.ensureDir()
    return readdirSync(this.dir)
      .filter((file) => file.endsWith('.json'))
      .map((file) => file.slice(0, -'.json'.length))
      .sort()
  }

  private filePath(id: string): string {
    if (!/^[A-Za-z0-9_-]+$/.test(id)) {
      throw new Error('非法的策划书 id')
    }
    return join(this.dir, `${id}.json`)
  }

  private ensureDir(): void {
    mkdirSync(this.dir, { recursive: true })
  }
}