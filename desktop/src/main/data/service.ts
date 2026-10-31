import { randomUUID } from 'node:crypto'

import { applyBatchOp } from '../../shared/util/data'
import { isMissingId, needsShortId, nextItemId } from '../../shared/util/id'
import type {
  BatchUpdateInput,
  CreateItemInput
} from '../../shared/schema/adapters'
import type { BatchUpdateSummary, DeleteManySummary, ItemRecord } from '../../shared/types'
import type { UndoEntry } from '../../shared/util/system'
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

  /**
   * 新建条目。记录 id 用 uuid（内部键：引用/撤销/IPC 定位），
   * `data.id` 分配该类型下一个短序号（对齐 旧版 `data_manager.generate_id`：
   * 现有数值 id 的 max+1，0 起步）——列表/表单外显的是这个短 id。
   * 调用方自带 id（旧数据导入/AI 生成）时原样保留，不覆盖。
   */
  createItem(input: CreateItemInput): Promise<ItemRecord> {
    return this.enqueueWrite(() => {
      const now = new Date().toISOString()
      const data: Record<string, unknown> = { ...input.data }
      if (needsShortId({ data })) {
        data.id = nextItemId(this.repo.listItems(input.type))
      }
      const record: ItemRecord = {
        id: randomUUID(),
        type: input.type,
        data,
        createdAt: now,
        updatedAt: now,
        aiGeneratedAt: input.aiGeneratedAt
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

  /**
   * 更新条目业务数据。记录 id 不可变（按 id 定位）。
   * `data.id` 是业务短 id，**不再**强制对齐记录 id（2026-10-13 去对齐：对齐会把
   * 36 位 uuid 外显成 ID，与 旧版 `ID:0` 语义相反）。入参缺 id 时沿用存量
   * （防部分更新丢 id）；存量也没有（未迁移的 legacy 条目）则现场补发下一个短序号。
   */
  updateItem(id: string, data: Record<string, unknown>): Promise<ItemRecord> {
    return this.enqueueWrite(() => {
      const existing = this.repo.findItem(id)
      if (!existing) {
        throw new Error('数据不存在，可能已被删除')
      }
      const nextData: Record<string, unknown> = { ...data }
      if (needsShortId({ data: nextData })) {
        nextData.id = needsShortId(existing)
          ? nextItemId(this.repo.listItems(existing.type))
          : existing.data['id']
      }
      const next: ItemRecord = {
        ...existing,
        data: nextData,
        updatedAt: new Date().toISOString(),
        // 保存即「核对过了」：清掉待核对标记。无标记时置 undefined 也走同一条路径，
        // 不额外判断 —— 少一个分支就少一处漏改。
        aiGeneratedAt: undefined
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
   * 批量字段操作：整批走一次写队列任务。
   * 逐条读取最新数据 → 用共享纯函数计算新值 → 写回；
   * - adjust_number 遇非数值：skipped 计数
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
        // 批量同样守短 id 不变量：存量缺失（未迁移 legacy）现场补发
        if (needsShortId({ data: nextData })) {
          nextData.id = nextItemId(this.repo.listItems(existing.type))
        }
        const next: ItemRecord = {
          ...existing,
          data: { ...nextData },
          updatedAt: now,
          // 批量改值是人对选中条目的 deliberate 操作，算「核对过了」—— 清掉待核对标记。
          // 与 `updateItem` 同口径；漏了这里会让被批量改过的条目一直挂着点。
          aiGeneratedAt: undefined
        }
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

  /** 批量删除：整批走一次写队列任务 */
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
   * 清空所有数据。
   *
   * 实现要点：**刻意走 `listAllItems()` + `deleteMany(ids)` 的统一路径**，
   * 而不是直接 `DELETE FROM items` —— 后者绕过撤销记录器，用户按下「撤销 (Ctrl+Z)」
   * 却发现数据回不来。
   *
   * 规模：`deleteMany` 逐条删（本仓数据量级下 O(N) 可接受），且整批只落**一条**
   * `deleteMany` 撤销条目（children 逐条），撤销栈不会被清空操作刷爆。
   * 空库时 ids 为空数组：`deleteMany([])` 不记条目、直接返回，故天然幂等且不报错。
   */
  clearAll(): Promise<{ deleted: number }> {
    const ids = this.repo.listAllItems().map((record) => record.id)
    return this.deleteMany(ids).then((summary) => ({ deleted: summary.deleted }))
  }

  /**
   * 批量导入：整批走一次写队列，保持「唯一写者」语义。
   *
   * 两条 id（2026-10-13 解耦后）：
   * - 记录 id（uuid）= 内部键；导入侧提供的 `record.id`（文件 id 列）只在**新建**时用作键；
   * - `data.id` = 业务短 id（列表/表单外显）。来源带了合法 id 则保留，缺失/uuid 形态
   *   则分配该类型下一个短序号（与 createItem 同一规则）——任何来源入库都外显短 id。
   *
   * **更新定位按业务 id**：同类型下 `data.id` 命中存量条目 ⇒ 原地更新该条（保留其原
   * 记录 id 与 createdAt）；未命中才按 `record.id` 新建。若按 `record.id` 定位，文件里的
   * 短 id 永远撞不上 uuid 记录键，「导出（id 列 = 业务短 id）→ 再导入」会把全库翻倍
   * （data-io e2e 锁死的往返 upsert 语义）。
   *
   * ⚠️ `createdAt: now` 只对**新插入**生效：冲突时保留原 created_at 是
   * `SqliteItemsRepository.upsertItem` 的 `ON CONFLICT ... SET type,data,updated_at`
   * **刻意不更新 created_at** 保证的（两处共同构成契约，改任一侧前请先读另一侧）。
   */
  importRecords(records: ImportRecord[]): Promise<{ imported: number; updated: number }> {
    return this.enqueueWrite(() => {
      let imported = 0
      let updated = 0
      for (const record of records) {
        const now = new Date().toISOString()
        const data: Record<string, unknown> = { ...record.data }
        if (needsShortId({ data })) {
          data.id = nextItemId(this.repo.listItems(record.type))
        }
        // 业务 id 命中存量 ⇒ 原地更新（保留原记录 id）；否则按导入侧键新建
        const businessId = String(data.id)
        const matched = this.repo
          .listItems(record.type)
          .find((item) => !isMissingId(item.data['id']) && String(item.data['id']) === businessId)
        const targetId = matched?.id ?? record.id
        const existed = this.repo.exists(targetId)
        this.repo.upsertItem({
          id: targetId,
          type: record.type,
          data,
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