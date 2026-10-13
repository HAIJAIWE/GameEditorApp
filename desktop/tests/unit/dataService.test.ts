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
    // 新建即种子化业务短 id（PyQt generate_id：首个为 0）
    expect(list[0]?.data).toEqual({ name: '火球术', id: '0' })
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

  it('批量导入：新增/更新分别计数，重复导入幂等且保留原 createdAt', async () => {
    const service = createService()
    const records = [
      { type: 'skill', id: 'S1', data: { id: 'S1', name: '火球术' } },
      { type: 'skill', id: 'S2', data: { id: 'S2', name: '冰霜箭' } }
    ]

    const first = await service.importRecords(records)
    expect(first).toEqual({ imported: 2, updated: 0 })
    const createdAt = service.listItems('skill').find((item) => item.id === 'S1')?.createdAt

    const second = await service.importRecords(records)
    expect(second).toEqual({ imported: 0, updated: 2 })
    expect(service.listItems('skill')).toHaveLength(2)
    expect(service.listItems('skill').find((item) => item.id === 'S1')?.createdAt).toBe(createdAt)
  })

  it('新建条目：data.id 分配该类型短序号（0 起步、max+1），调用方自带 id 时保留', async () => {
    const service = createService()
    const first = await service.createItem({ type: 'skill', data: { name: '火球术' } })
    const second = await service.createItem({ type: 'skill', data: { name: '冰霜箭' } })
    const otherType = await service.createItem({ type: 'monster', data: { name: '史莱姆' } })

    expect(first.data['id']).toBe('0')
    expect(second.data['id']).toBe('1')
    // 每类型独立计数
    expect(otherType.data['id']).toBe('0')
    // 记录 id 仍是 uuid（内部键，不外显）
    expect(first.id).not.toBe('0')

    // 旧数据导入/AI 生成自带 id 时原样保留，不重新分配
    const imported = await service.createItem({ type: 'skill', data: { id: 'SKILL000', name: '烈焰风暴' } })
    expect(imported.data['id']).toBe('SKILL000')
    // 此后新建接 max+1（数值 id 才参与 max）
    const after = await service.createItem({ type: 'skill', data: { name: '后续' } })
    expect(after.data['id']).toBe('2')
  })

  it('更新条目：data.id 为业务短 id 原样写回（不再强制对齐记录 id），原 createdAt 保留', async () => {
    const service = createService()
    const created = await service.createItem({ type: 'skill', data: { name: '旧名' } })
    expect(created.data['id']).toBe('0')

    const updated = await service.updateItem(created.id, { name: '新名' })
    expect(updated.data['name']).toBe('新名')
    expect(updated.data['id']).toBe('0')
    expect(updated.id).toBe(created.id)
    expect(updated.createdAt).toBe(created.createdAt)
    expect(service.listItems('skill')[0]?.data['name']).toBe('新名')
  })

  it('更新不存在的条目时报错可读', async () => {
    const service = createService()
    await expect(service.updateItem('NOT_EXIST', {})).rejects.toThrow('数据不存在')
  })

  it('更新条目：存量缺 id（未迁移 legacy 条目）时现场补发短序号', async () => {
    const repo = new InMemoryItemsRepository()
    const service = new DataService(repo)
    const now = '2026-10-13T00:00:00.000Z'
    repo.insertItem({ id: 'legacy-key', type: 'skill', data: { name: '旧数据' }, createdAt: now, updatedAt: now })

    const updated = await service.updateItem('legacy-key', { name: '新名' })
    expect(updated.data['id']).toBe('0')
    expect(updated.data['name']).toBe('新名')
  })

  it('导入往返：按业务 id 命中存量条目原地更新（保留原记录 id 与 createdAt），不翻倍', async () => {
    const service = createService()
    const a = await service.createItem({ type: 'skill', data: { name: '火球术' } })
    const b = await service.createItem({ type: 'skill', data: { name: '冰霜箭' } })
    expect(a.data['id']).toBe('0')
    expect(b.data['id']).toBe('1')
    const createdAtA = a.createdAt

    // 模拟「导出（id 列 = 业务短 id）→ 改内容 → 再导入」：文件里的 id 是短号，不是记录 uuid
    const summary = await service.importRecords([
      { type: 'skill', id: '0', data: { id: '0', name: '火球术改' } },
      { type: 'skill', id: '1', data: { id: '1', name: '冰霜箭' } }
    ])
    expect(summary).toEqual({ imported: 0, updated: 2 })

    const list = service.listItems('skill')
    expect(list).toHaveLength(2)
    // 原记录 id 保留（引用/撤销不错位），内容更新，createdAt 不刷新
    expect(list.find((item) => item.id === a.id)?.data['name']).toBe('火球术改')
    expect(list.find((item) => item.id === a.id)?.createdAt).toBe(createdAtA)
    expect(list.find((item) => item.id === b.id)?.data['name']).toBe('冰霜箭')
  })

  it('批量字段操作：全部写入、createdAt 保留、data.id 短序号不变', async () => {
    const service = createService()
    const a = await service.createItem({ type: 'skill', data: { name: 'A' } })
    const b = await service.createItem({ type: 'skill', data: { name: 'B' } })

    const summary = await service.batchUpdate({
      type: 'skill',
      ids: [a.id, b.id],
      op: { kind: 'set_value', field: 'category', value: '攻击', separator: ',', mode: 'add', adjust: 0 }
    })
    expect(summary).toEqual({ affected: 2, skipped: 0, missing: 0 })

    const list = service.listItems('skill')
    expect(list.map((item) => item.data['category'])).toEqual(['攻击', '攻击'])
    expect(list.find((item) => item.id === a.id)?.createdAt).toBe(a.createdAt)
    expect(list.find((item) => item.id === a.id)?.data['id']).toBe('0')
  })

  it('批量数值增减：非数值跳过、缺字段按 0 处理、类型不符计入 missing', async () => {
    const service = createService()
    const numeric = await service.createItem({ type: 'skill', data: { name: '火球术', value: 100 } })
    const percent = await service.createItem({ type: 'skill', data: { name: '冰霜箭', value: '50%' } })
    const text = await service.createItem({ type: 'skill', data: { name: '文字条目' } })
    const invalid = await service.createItem({ type: 'skill', data: { name: '异常值', value: 'abc' } })
    const other = await service.createItem({ type: 'item', data: { value: 1 } })

    const summary = await service.batchUpdate({
      type: 'skill',
      ids: [numeric.id, percent.id, text.id, invalid.id, other.id, 'NOT_EXIST'],
      op: { kind: 'adjust_number', field: 'value', value: '', separator: ',', mode: 'add', adjust: 5 }
    })
    // 文字条目缺 value 字段 → 按 0 处理 → 写入 5；'abc' 非数值跳过；item 类型与不存在 id 计入 missing
    expect(summary).toEqual({ affected: 3, skipped: 1, missing: 2 })
    expect(service.listItems('skill').map((item) => item.data['value'])).toEqual(['105', '55', '5', 'abc'])
  })

  it('批量删除：已删除与不存在分别计数', async () => {
    const service = createService()
    const a = await service.createItem({ type: 'skill', data: {} })
    const b = await service.createItem({ type: 'skill', data: {} })

    const summary = await service.deleteMany([a.id, b.id, 'NOT_EXIST'])
    expect(summary).toEqual({ deleted: 2, missing: 1 })
    expect(service.listItems('skill')).toHaveLength(0)
  })
})