import { randomUUID } from 'node:crypto'

import type { CreateItemInput } from '../../shared/schemas'
import type { ItemRecord } from '../../shared/types'
import type { ItemsRepository } from './repository'

/** 导入记录：id 与业务数据来自旧版 JSON，type 已映射为单数类型键 */
export interface ImportRecord {
  type: string
  id: string
  data: Record<string, unknown>
}

/**
 * 数据服务：全应用唯一的数据写入者。
 * - 写操作经内部串行队列执行，从结构上消除并发写竞态；
 * - 其余模块（UI、Agent 等）只能经此服务访问数据，不得直接触达存储。
 */
export class DataService {
  private writeChain: Promise<unknown> = Promise.resolve()

  constructor(private readonly repo: ItemsRepository) {}

  listItems(type: string): ItemRecord[] {
    return this.repo.listItems(type)
  }

  /** 导出快照：全量条目（按类型分组由导出模块完成） */
  listAllItems(): ItemRecord[] {
    return this.repo.listAllItems()
  }

  createItem(input: CreateItemInput): Promise<ItemRecord> {
    return this.enqueueWrite(() => {
      const now = new Date().toISOString()
      const record: ItemRecord = {
        id: randomUUID(),
        type: input.type,
        data: input.data,
        createdAt: now,
        updatedAt: now
      }
      this.repo.insertItem(record)
      return record
    })
  }

  deleteItem(id: string): Promise<boolean> {
    return this.enqueueWrite(() => this.repo.deleteItem(id))
  }

  /** 更新条目业务数据：id 不可变（data.id 强制与记录 id 一致），updatedAt 刷新 */
  updateItem(id: string, data: Record<string, unknown>): Promise<ItemRecord> {
    return this.enqueueWrite(() => {
      const existing = this.repo.findItem(id)
      if (!existing) {
        throw new Error('数据不存在，可能已被删除')
      }
      const next: ItemRecord = {
        ...existing,
        data: { ...data, id },
        updatedAt: new Date().toISOString()
      }
      this.repo.upsertItem(next)
      return next
    })
  }

  /**
   * 批量导入（旧数据迁移用）：整批走一次写队列，保持"唯一写者"语义。
   * 已存在的 id 更新其数据并保留原 createdAt。
   */
  importRecords(records: ImportRecord[]): Promise<{ imported: number; updated: number }> {
    return this.enqueueWrite(() => {
      let imported = 0
      let updated = 0
      for (const record of records) {
        const now = new Date().toISOString()
        const existed = this.repo.exists(record.id)
        this.repo.upsertItem({
          id: record.id,
          type: record.type,
          data: record.data,
          createdAt: now,
          updatedAt: now
        })
        if (existed) {
          updated++
        } else {
          imported++
        }
      }
      return { imported, updated }
    })
  }

  dispose(): void {
    this.repo.close()
  }

  /** 写操作串行队列：前一个写完成才执行下一个；失败不阻塞后续任务 */
  private enqueueWrite<T>(op: () => T): Promise<T> {
    const run = this.writeChain.then(op)
    this.writeChain = run.catch(() => undefined)
    return run
  }
}