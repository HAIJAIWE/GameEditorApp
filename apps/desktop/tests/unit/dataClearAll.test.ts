import { describe, expect, it } from 'vitest'

import { DataService } from '../../src/main/data/service'
import type { ItemsRepository } from '../../src/main/data/repository'
import { UndoRecorder } from '../../src/main/data/undoRecorder'
import type { ItemRecord } from '@mobai/shared/types'

/**
 * 「清空所有数据」（`data:clearAll` → `DataService.clearAll`）的行为守护。
 *
 * 对齐 旧版 `data_manager.clear_all`：**走 manager 的统一删除路径**，
 * 因此用户能撤销。本测试锁三件事：
 * 1. 清空后 `listAllItems()` 为空（跨全部类型，不只是某一个）；
 * 2. 走的是 `deleteMany` 路径 —— 撤销栈里有一条 `deleteMany` 整批条目，
 *    按 Ctrl+Z 能把**全部**条目原样找回（含 createdAt）；
 * 3. 空库时清空不报错、`deleted: 0`、且**不产生**撤销条目（不污染撤销栈）。
 */

/** 内存版仓储：单元测试不依赖 SQLite 原生模块（原生实现由 E2E 覆盖） */
class InMemoryItemsRepository implements ItemsRepository {
  private readonly rows = new Map<string, ItemRecord>()

  listItems(type: string): ItemRecord[] {
    return [...this.rows.values()].filter((row) => row.type === type)
  }

  findItem(id: string): ItemRecord | undefined {
    return this.rows.get(id)
  }

  listAllItems(): ItemRecord[] {
    return [...this.rows.values()]
  }

  insertItem(record: ItemRecord): void {
    this.rows.set(record.id, record)
  }

  upsertItem(record: ItemRecord): void {
    const previous = this.rows.get(record.id)
    this.rows.set(record.id, previous ? { ...record, createdAt: previous.createdAt } : record)
  }

  exists(id: string): boolean {
    return this.rows.has(id)
  }

  deleteItem(id: string): boolean {
    return this.rows.delete(id)
  }

  close(): void {
    this.rows.clear()
  }
}

/** 造一个挂了撤销记录器的服务（与主进程 stores.buildStores 的接法一致） */
function createService(): { service: DataService; recorder: UndoRecorder } {
  const service = new DataService(new InMemoryItemsRepository())
  const recorder = new UndoRecorder(service)
  service.attachUndoRecorder(recorder)
  return { service, recorder }
}

describe('DataService.clearAll', () => {
  it('清空后跨全部类型都为空，并返回删除条数', async () => {
    const { service } = createService()
    await service.createItem({ type: 'skill', data: { name: '火球术' } })
    await service.createItem({ type: 'item', data: { name: '铁剑' } })
    await service.createItem({ type: 'monster', data: { name: '史莱姆' } })
    expect(service.listAllItems()).toHaveLength(3)

    const result = await service.clearAll()

    expect(result).toEqual({ deleted: 3 })
    expect(service.listAllItems()).toHaveLength(0)
    expect(service.listItems('skill')).toHaveLength(0)
    expect(service.listItems('item')).toHaveLength(0)
    expect(service.listItems('monster')).toHaveLength(0)
  })

  it('走 deleteMany 路径：撤销栈里是一条 deleteMany 整批条目，撤销后原样全部找回', async () => {
    const { service, recorder } = createService()
    const skill = await service.createItem({ type: 'skill', data: { name: '火球术' } })
    await service.createItem({ type: 'item', data: { name: '铁剑' } })
    // 清空前先做一次别的写操作，确保断言的是「栈顶」而非「唯一一条」
    await service.updateItem(skill.id, { id: skill.id, name: '火球术 Lv2' })

    const result = await service.clearAll()
    expect(result.deleted).toBe(2)

    // 栈顶是**批量容器**条目而非逐条 delete：UndoStack 对含 children 的条目统一显示
    // 「批量操作（N 项）」（见 shared/util/undoStack.ts::getState）。
    // 反面证明：若 clearAll 走的是 deleteItem 逐条，栈顶会显示单个条目名而非批量标签。
    const state = recorder.getState()
    expect(state.canUndo).toBe(true)
    expect(state.nextUndo).toBe('批量操作（2 项）')
    expect(state.nextUndo).not.toBe('火球术 Lv2')
    expect(state.nextUndo).not.toBe('铁剑')

    // 撤销 → children 逐条反向（delete 叶子回写 before 快照），两条全部原样回来
    const undoResult = await recorder.undo()
    expect(undoResult.applied).toBe(2)
    expect(undoResult.failed).toEqual([])
    expect(undoResult.skipped).toEqual([])
    expect(service.listAllItems()).toHaveLength(2)
    expect(service.listItems('skill')[0]?.data['name']).toBe('火球术 Lv2')
    expect(service.listItems('item')[0]?.data['name']).toBe('铁剑')
    // createdAt 也一并还原（restoreItem 按完整记录写回）
    expect(service.listItems('skill')[0]?.createdAt).toBe(skill.createdAt)
  })

  it('空库时清空不报错、deleted 为 0，且不往撤销栈里塞空条目', async () => {
    const { service, recorder } = createService()
    expect(service.listAllItems()).toHaveLength(0)

    const result = await service.clearAll()

    expect(result).toEqual({ deleted: 0 })
    expect(service.listAllItems()).toHaveLength(0)
    // 空操作不应污染撤销栈：否则用户会看到「撤销」可点但按了没反应
    const state = recorder.getState()
    expect(state.canUndo).toBe(false)
    expect(state.nextUndo).toBeNull()
  })

  it('幂等：连续清空两次，第二次仍是 deleted: 0 且不报错', async () => {
    const { service } = createService()
    await service.createItem({ type: 'skill', data: {} })

    expect(await service.clearAll()).toEqual({ deleted: 1 })
    expect(await service.clearAll()).toEqual({ deleted: 0 })
    expect(service.listAllItems()).toHaveLength(0)
  })
})