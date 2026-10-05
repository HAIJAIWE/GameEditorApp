import { randomUUID } from 'node:crypto'

import { applyBatchOp } from '../../shared/dataTableOps'
import type { BatchUpdateInput, CreateItemInput } from '../../shared/schemas'
import type { BatchUpdateSummary, DeleteManySummary, ItemRecord } from '../../shared/types'
import type { UndoEntry } from '../../shared/util/undoStack'
import type { UndoRecorder, UndoRecorderPort } from './undoRecorder'
import type { ItemsRepository } from './repository'

/** 导入记录：id 与业务数据来自旧版 JSON，type 已映射为单数类型键 */
export interface ImportRecord {
  type: string
  id: string
  data: Record<string, unknown>
}

/** 条目展示名：优先 name，缺省用 id（撤销栈与提示文案统一） */
function entryDisplayName(record: ItemRecord): string {
  const name = record.data['name']
  return typeof name === 'string' && name !== '' ? name : record.id
}

/**
 * 数据服务：全应用唯一的数据写入者。
 * - 写操作经内部串行队列执行，从结构上消除并发写竞态；
 * - 其余模块（UI、Agent 等）只能经此服务访问数据，不得直接触达存储。
 */
export class DataService implements UndoRecorderPort {
  private writeChain: Promise<unknown> = Promise.resolve()
  /** 撤销记录器（切换库时由 stores 注入；未注入则不记录，fail-soft） */
  private undoRecorder?: UndoRecorder

  constructor(private readonly repo: ItemsRepository) {}

  /** 注入撤销记录器（stores.buildStores 内调用，保证随库重建） */
  attachUndoRecorder(recorder: UndoRecorder): void {
    this.undoRecorder = recorder
  }

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
      this.undoRecorder?.record({
        opType: 'create',
        dataType: record.type,
        itemId: record.id,
        itemName: entryDisplayName(record),
        before: null,
        after: record,
        timestamp: Date.now()
      })
      return record
    })
  }

  deleteItem(id: string): Promise<boolean> {
    return this.enqueueWrite(() => {
      const existing = this.repo.findItem(id)
      const removed = this.repo.deleteItem(id)
      if (existing) {
        this.undoRecorder?.record({
          opType: 'delete',
          dataType: existing.type,
          itemId: existing.id,
          itemName: entryDisplayName(existing),
          before: existing,
          after: null,
          timestamp: Date.now()
        })
      }
      return removed
    })
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
      this.undoRecorder?.record({
        opType: 'update',
        dataType: next.type,
        itemId: next.id,
        itemName: entryDisplayName(next),
        before: existing,
        after: next,
        timestamp: Date.now()
      })
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
    const children: UndoEntry[] = []
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
        const next: ItemRecord = { ...existing, data: { ...nextData, id }, updatedAt: now }
        this.repo.upsertItem(next)
        summary.affected++
        children.push({
          opType: 'update',
          dataType: next.type,
          itemId: next.id,
          itemName: entryDisplayName(next),
          before: existing,
          after: next,
          timestamp: Date.now()
        })
      }
      if (children.length > 0) {
        this.undoRecorder?.record({
          opType: 'batchUpdate',
          dataType: input.type,
          itemId: input.type,
          itemName: `批量操作（${children.length} 项）`,
          before: null,
          after: null,
          timestamp: Date.now(),
          children
        })
      }
      return summary
    })
  }

  /** 批量删除：整批走一次写队列任务（与 Python delete_selected 一致，无级联） */
  deleteMany(ids: string[]): Promise<DeleteManySummary> {
    return this.enqueueWrite(() => {
      const summary: DeleteManySummary = { deleted: 0, missing: 0 }
      const children: UndoEntry[] = []
      for (const id of ids) {
        const existing = this.repo.findItem(id)
        if (existing && this.repo.deleteItem(id)) {
          summary.deleted++
          children.push({
            opType: 'delete',
            dataType: existing.type,
            itemId: existing.id,
            itemName: entryDisplayName(existing),
            before: existing,
            after: null,
            timestamp: Date.now()
          })
        } else {
          summary.missing++
        }
      }
      if (children.length > 0) {
        this.undoRecorder?.record({
          opType: 'deleteMany',
          dataType: 'mixed',
          itemId: 'mixed',
          itemName: `批量删除（${children.length} 项）`,
          before: null,
          after: null,
          timestamp: Date.now(),
          children
        })
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

  // ---- 非记录原语（撤销/重做专用，绝不触发 record，避免自记录成环 / 重入）----

  /** 按完整记录写回（含显式 createdAt/updatedAt），精确还原被删/被改项（E10） */
  restoreItem(record: ItemRecord): Promise<void> {
    return this.enqueueWrite(() => {
      this.repo.upsertItem(record)
    })
  }

  /** 按 id 删除（不记录） */
  deleteById(id: string): Promise<boolean> {
    return this.enqueueWrite(() => this.repo.deleteItem(id))
  }

  /** 整段原子执行（撤销/重做整段包一层写队列），不记录 */
  runAtomicTask<T>(op: () => Promise<T>): Promise<T> {
    const prev = this.writeChain
    const run = prev.then(() => op())
    // op 内部的 restoreItem/deleteById 仍走 enqueueWrite，挂在 prev 之后执行；
    // 仅在 op 整体结束后才把写队列尾推进到 run，避免「op 等待自身链式子写」的自依赖死锁（E8 路径）。
    void run.finally(() => {
      this.writeChain = run.then(
        () => undefined,
        () => undefined
      )
    })
    return run
  }

  /** 公开读取单条记录（撤销前置检查 E1-E4 用） */
  getItem(id: string): ItemRecord | undefined {
    return this.repo.findItem(id)
  }

  /** 存在性检查（E4 冲突检查用） */
  exists(id: string): boolean {
    return this.repo.exists(id)
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