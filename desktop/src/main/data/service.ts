import { randomUUID } from 'node:crypto'

import { applyBatchOp } from '../../shared/dataTableOps'
import type { BatchUpdateInput, CreateItemInput } from '../../shared/schemas'
import type { BatchUpdateSummary, DeleteManySummary, ItemRecord } from '../../shared/types'
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
   * 批量字段操作（匹平 Python BatchEditDialog._on_apply）：整批走一次写队列任务。
   * 逐条读取最新数据 → 用共享纯函数计算新值 → 写回；
   * - adjust_number 遇非数值：skipped 计数（与 Python continue 一致，不阻断整批）
   * - id 不存在或类型不符：missing 计数
   */
  batchUpdate(input: BatchUpdateInput): Promise<BatchUpdateSummary> {
    return this.enqueueWrite(() => {
      const summary: BatchUpdateSummary = { affected: 0, skipped: 0, missing: 0 }
      const now = new Date().toISOString()
      for (const id of input.ids) {
        const existing = this.repo.findItem(id)
        if (!existing || existing.type !== input.type) {
          summary.missing++
          continue
        }
        const nextData = applyBatchOp(existing.data, input.op)
        if (!nextData) {
          summary.skipped++
          continue
        }
        this.repo.upsertItem({ ...existing, data: { ...nextData, id }, updatedAt: now })
        summary.affected++
      }
      return summary
    })
  }

  /** 批量删除：整批走一次写队列任务（与 Python delete_selected 一致，无级联） */
  deleteMany(ids: string[]): Promise<DeleteManySummary> {
    return this.enqueueWrite(() => {
      const summary: DeleteManySummary = { deleted: 0, missing: 0 }
      for (const id of ids) {
        if (this.repo.deleteItem(id)) {
          summary.deleted++
        } else {
          summary.missing++
        }
      }
      return summary
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