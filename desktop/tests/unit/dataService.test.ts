import { describe, expect, it } from 'vitest'

import { DataService } from '../../src/main/data/service'
import type { ItemsRepository } from '../../src/main/data/repository'
import type { ItemRecord } from '../../src/shared/types'

/** 内存版仓储：单元测试不依赖 SQLite 原生模块（原生实现由 E2E 覆盖） */
class InMemoryItemsRepository implements ItemsRepository {
  private readonly rows = new Map<string, ItemRecord>()

  listItems(type: string): ItemRecord[] {
    return [...this.rows.values()].filter((row) => row.type === type)
  }

  insertItem(record: ItemRecord): void {
    this.rows.set(record.id, record)
  }

  deleteItem(id: string): boolean {
    return this.rows.delete(id)
  }

  close(): void {
    this.rows.clear()
  }
}

function createService(): DataService {
  return new DataService(new InMemoryItemsRepository())
}

describe('DataService', () => {
  it('创建后可按类型查询，字段完整', async () => {
    const service = createService()
    const created = await service.createItem({ type: 'skill', data: { name: '火球术' } })

    expect(created.id).toBeTruthy()
    expect(created.createdAt).toBe(created.updatedAt)

    const list = service.listItems('skill')
    expect(list).toHaveLength(1)
    expect(list[0]?.data).toEqual({ name: '火球术' })
  })

  it('并发写入经串行队列后全部落库、无丢失', async () => {
    const service = createService()
    await Promise.all(
      Array.from({ length: 20 }, (_, i) => service.createItem({ type: 'monster', data: { name: `史莱姆 ${i}` } }))
    )
    expect(service.listItems('monster')).toHaveLength(20)
  })

  it('删除返回删除结果，其他类型不受影响', async () => {
    const service = createService()
    const a = await service.createItem({ type: 'skill', data: {} })
    await service.createItem({ type: 'item', data: {} })

    expect(await service.deleteItem(a.id)).toBe(true)
    expect(await service.deleteItem(a.id)).toBe(false)
    expect(service.listItems('skill')).toHaveLength(0)
    expect(service.listItems('item')).toHaveLength(1)
  })
})