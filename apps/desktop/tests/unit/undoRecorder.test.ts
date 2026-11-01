import { describe, expect, it } from 'vitest'

import { UndoRecorder, type UndoRecorderPort } from '../../src/main/data/undoRecorder'
import type { UndoEntry } from '@mobai/shared/util/system'
import type { ItemRecord } from '@mobai/shared/types'

function makeRecord(id: string, type: string, data: Record<string, unknown>): ItemRecord {
  const now = '2024-01-01T00:00:00.000Z'
  return { id, type, data, createdAt: now, updatedAt: now }
}

/** 内存版 DataService 替身：实现 UndoRecorderPort + 会记录的公开 mutator */
class FakeDataService implements UndoRecorderPort {
  private rows = new Map<string, ItemRecord>()
  private writeChain: Promise<unknown> = Promise.resolve()
  private recorder?: UndoRecorder
  /** 记录次数（用于重入校验：撤销/重做不应触发新记录） */
  recordCount = 0
  /** 测试用故障注入：restoreItem 抛错，验证 peek-then-commit（E8） */
  failRestore = false

  attachUndoRecorder(r: UndoRecorder): void {
    this.recorder = r
  }

  private enqueueWrite<T>(op: () => T): Promise<T> {
    const run = this.writeChain.then(op)
    this.writeChain = run.catch(() => undefined)
    return run
  }

  private record(entry: UndoEntry): void {
    this.recordCount += 1
    this.recorder?.record(entry)
  }

  // ---- 公开 mutator（会记录）----
  async createItem(input: { type: string; data: Record<string, unknown> }): Promise<ItemRecord> {
    return this.enqueueWrite(() => {
      const record = makeRecord(`id-${Math.random().toString(36).slice(2)}`, input.type, input.data)
      this.rows.set(record.id, record)
      this.record({
        opType: 'create',
        dataType: record.type,
        itemId: record.id,
        itemName: String(record.data['name'] ?? record.id),
        before: null,
        after: record,
        timestamp: Date.now()
      })
      return record
    })
  }

  async updateItem(id: string, data: Record<string, unknown>): Promise<ItemRecord> {
    return this.enqueueWrite(() => {
      const existing = this.rows.get(id)
      if (!existing) throw new Error('数据不存在')
      const next: ItemRecord = { ...existing, data: { ...data, id }, updatedAt: '2024-01-02T00:00:00.000Z' }
      this.rows.set(id, next)
      this.record({
        opType: 'update',
        dataType: next.type,
        itemId: next.id,
        itemName: String(next.data['name'] ?? next.id),
        before: existing,
        after: next,
        timestamp: Date.now()
      })
      return next
    })
  }

  async deleteItem(id: string): Promise<boolean> {
    return this.enqueueWrite(() => {
      const existing = this.rows.get(id)
      const removed = this.rows.delete(id)
      if (existing) {
        this.record({
          opType: 'delete',
          dataType: existing.type,
          itemId: existing.id,
          itemName: String(existing.data['name'] ?? existing.id),
          before: existing,
          after: null,
          timestamp: Date.now()
        })
      }
      return removed
    })
  }

  async batchUpdate(input: { type: string; ids: string[] }): Promise<{ affected: number }> {
    return this.enqueueWrite(() => {
      const children: UndoEntry[] = []
      let affected = 0
      for (const id of input.ids) {
        const existing = this.rows.get(id)
        if (!existing || existing.type !== input.type) continue
        const next: ItemRecord = { ...existing, data: { ...existing.data, _batch: true }, updatedAt: '2024-01-02T00:00:00.000Z' }
        this.rows.set(id, next)
        affected++
        children.push({
          opType: 'update',
          dataType: next.type,
          itemId: next.id,
          itemName: String(next.data['name'] ?? next.id),
          before: existing,
          after: next,
          timestamp: Date.now()
        })
      }
      if (children.length > 0) {
        this.record({
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
      return { affected }
    })
  }

  async deleteMany(ids: string[]): Promise<{ deleted: number; missing: number }> {
    return this.enqueueWrite(() => {
      const children: UndoEntry[] = []
      let deleted = 0
      let missing = 0
      for (const id of ids) {
        const existing = this.rows.get(id)
        if (existing && this.rows.delete(id)) {
          deleted++
          children.push({
            opType: 'delete',
            dataType: existing.type,
            itemId: existing.id,
            itemName: String(existing.data['name'] ?? existing.id),
            before: existing,
            after: null,
            timestamp: Date.now()
          })
        } else {
          missing++
        }
      }
      if (children.length > 0) {
        this.record({
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
      return { deleted, missing }
    })
  }

  // ---- 外部修改（不记录，模拟用户手动改动/冲突）----
  forceUpdate(id: string, data: Record<string, unknown>): void {
    const existing = this.rows.get(id)
    if (existing) this.rows.set(id, { ...existing, data, updatedAt: '2024-01-03T00:00:00.000Z' })
  }

  forceInsert(record: ItemRecord): void {
    this.rows.set(record.id, record)
  }

  get(id: string): ItemRecord | undefined {
    return this.rows.get(id)
  }

  // ---- UndoRecorderPort 实现（非记录原语）----
  restoreItem(record: ItemRecord): Promise<void> {
    if (this.failRestore) return Promise.reject(new Error('模拟存储故障'))
    return this.enqueueWrite(() => {
      this.rows.set(record.id, record)
    })
  }

  deleteById(id: string): Promise<boolean> {
    return this.enqueueWrite(() => this.rows.delete(id))
  }

  getItem(id: string): ItemRecord | undefined {
    return this.rows.get(id)
  }

  exists(id: string): boolean {
    return this.rows.has(id)
  }

  runAtomicTask<T>(op: () => Promise<T>): Promise<T> {
    const prev = this.writeChain
    const run = prev.then(() => op())
    void run.finally(() => {
      this.writeChain = run.catch(() => undefined)
    })
    return run
  }
}

function setup(): { data: FakeDataService; recorder: UndoRecorder } {
  const data = new FakeDataService()
  const recorder = new UndoRecorder(data)
  data.attachUndoRecorder(recorder)
  return { data, recorder }
}

describe('UndoRecorder 记录→撤销→重做 往返', () => {
  it('create 往返：撤销删除、重做还原、且撤销/重做不新增记录（重入防护）', async () => {
    const { data, recorder } = setup()
    const a = await data.createItem({ type: 'role', data: { name: 'A' } })
    expect(data.get(a.id)).toBeDefined()

    const r1 = await recorder.undo()
    expect(r1.applied).toBe(1)
    expect(data.get(a.id)).toBeUndefined()
    expect(recorder.getState().canRedo).toBe(true)
    expect(recorder.getState().canUndo).toBe(false)

    const r2 = await recorder.redo()
    expect(r2.applied).toBe(1)
    expect(data.get(a.id)).toBeDefined()
    expect(recorder.getState().canUndo).toBe(true)

    // 重入校验：撤销和重做都没触发新的 record
    expect(data.recordCount).toBe(1)
  })

  it('update 往返：撤销回 before、重做回 after', async () => {
    const { data, recorder } = setup()
    const a = await data.createItem({ type: 'role', data: { name: 'A' } })
    await data.updateItem(a.id, { name: 'Y' })
    expect(data.get(a.id)?.data['name']).toBe('Y')

    const r1 = await recorder.undo()
    expect(r1.applied).toBe(1)
    expect(data.get(a.id)?.data['name']).toBe('A')

    const r2 = await recorder.redo()
    expect(r2.applied).toBe(1)
    expect(data.get(a.id)?.data['name']).toBe('Y')
  })

  it('delete 往返：撤销恢复被删项、重做再删除', async () => {
    const { data, recorder } = setup()
    const a = await data.createItem({ type: 'role', data: { name: 'A' } })
    await data.deleteItem(a.id)
    expect(data.get(a.id)).toBeUndefined()

    const r1 = await recorder.undo()
    expect(r1.applied).toBe(1)
    expect(data.get(a.id)?.data['name']).toBe('A')

    const r2 = await recorder.redo()
    expect(r2.applied).toBe(1)
    expect(data.get(a.id)).toBeUndefined()
  })

  it('batchUpdate 往返：撤销回退全部子项、重做重新应用', async () => {
    const { data, recorder } = setup()
    const a = await data.createItem({ type: 'role', data: { name: 'A' } })
    const b = await data.createItem({ type: 'role', data: { name: 'B' } })
    await data.batchUpdate({ type: 'role', ids: [a.id, b.id] })
    expect(data.get(a.id)?.data['_batch']).toBe(true)
    expect(data.get(b.id)?.data['_batch']).toBe(true)

    const r1 = await recorder.undo()
    expect(r1.applied).toBe(2)
    expect(data.get(a.id)?.data['_batch']).toBeUndefined()
    expect(data.get(b.id)?.data['_batch']).toBeUndefined()

    const r2 = await recorder.redo()
    expect(r2.applied).toBe(2)
    expect(data.get(a.id)?.data['_batch']).toBe(true)
  })

  it('deleteMany 往返：撤销恢复全部、重做再删除', async () => {
    const { data, recorder } = setup()
    const a = await data.createItem({ type: 'role', data: { name: 'A' } })
    const b = await data.createItem({ type: 'role', data: { name: 'B' } })
    await data.deleteMany([a.id, b.id])
    expect(data.get(a.id)).toBeUndefined()
    expect(data.get(b.id)).toBeUndefined()

    const r1 = await recorder.undo()
    expect(r1.applied).toBe(2)
    expect(data.get(a.id)).toBeDefined()
    expect(data.get(b.id)).toBeDefined()

    const r2 = await recorder.redo()
    expect(r2.applied).toBe(2)
    expect(data.get(a.id)).toBeUndefined()
  })

  it('无记录时 undo/redo 返回空结果且状态安全', async () => {
    const { recorder } = setup()
    const r = await recorder.undo()
    expect(r).toEqual({ applied: 0, failed: [], skipped: [], canUndo: false, canRedo: false })
    const r2 = await recorder.redo()
    expect(r2.applied).toBe(0)
  })
})

describe('UndoRecorder 边界（fail-soft）', () => {
  it('E2：撤销 create 时条目已被改过 → 跳过，不覆盖后续编辑', async () => {
    const { data, recorder } = setup()
    const a = await data.createItem({ type: 'role', data: { name: 'A' } })
    data.forceUpdate(a.id, { name: 'B' }) // 外部改过

    const r = await recorder.undo()
    expect(r.applied).toBe(0)
    expect(r.skipped).toHaveLength(1)
    expect(r.skipped[0]?.reason).toContain('创建后已修改')
    expect(data.get(a.id)?.data['name']).toBe('B') // 保留后续编辑
  })

  it('E3：撤销 update 时条目已被改过 → 跳过且不弹栈（最值钱路径）', async () => {
    const { data, recorder } = setup()
    const a = await data.createItem({ type: 'role', data: { name: 'A' } })
    await data.updateItem(a.id, { name: 'Y' }) // 记录 update(A)
    data.forceUpdate(a.id, { name: 'Z' }) // 外部再改

    const r = await recorder.undo() // 栈顶 = update(A)
    expect(r.applied).toBe(0)
    expect(r.skipped).toHaveLength(1)
    // 此处是「撤销 update」路径，文案应为「更新后已修改」
    // （曾误抄 create 分支的「创建后已修改」，对用户是事实错误）
    expect(r.skipped[0]?.reason).toContain('更新后已修改')
    expect(data.get(a.id)?.data['name']).toBe('Z') // 未回写
    // update(A) 入口保留在栈上（未弹栈）：仍可继续撤销 create(A)
    expect(recorder.getState().canUndo).toBe(true)
  })

  it('E3 边界：显式 undefined 与「键不存在」视为同一数据 → 不误判为「已修改」', async () => {
    const { data, recorder } = setup()
    const a = await data.createItem({ type: 'role', data: { name: 'A' } })
    await data.updateItem(a.id, { name: 'B' }) // 记录 update：after.data = { name:'B', id }
    // 外部形态差异：多一个显式 undefined 键（structured clone 可携带；经 JSON 落盘会消失）
    data.forceUpdate(a.id, { name: 'B', id: a.id, note: undefined })

    const r = await recorder.undo()
    // 修复前：canonicalJson 把 `note: undefined` 当独立值 ⇒ 误判「更新后已修改」而跳过
    expect(r.skipped).toHaveLength(0)
    expect(r.applied).toBe(1)
    expect(data.get(a.id)?.data['name']).toBe('A') // 已回写 before
  })

  it('E4：撤销 delete 时 id 冲突（已存在）→ 跳过，绝不盲覆盖', async () => {
    const { data, recorder } = setup()
    const a = await data.createItem({ type: 'role', data: { name: 'A' } })
    await data.deleteItem(a.id) // 记录 delete(A)，repo 已无 A
    data.forceInsert(makeRecord(a.id, 'role', { name: 'OTHER' })) // 同 id 重新出现（冲突）

    const r = await recorder.undo() // 栈顶 = delete(A) → restore before → E4
    expect(r.applied).toBe(0)
    expect(r.skipped).toHaveLength(1)
    expect(r.skipped[0]?.reason).toContain('已存在，未恢复')
    expect(data.get(a.id)?.data['name']).toBe('OTHER') // 未覆盖
  })

  it('E8：写入失败（restore 抛错）→ undo 解析返回 failed、入口保留，历史不丢', async () => {
    const { data, recorder } = setup()
    const a = await data.createItem({ type: 'role', data: { name: 'A' } })
    await data.updateItem(a.id, { name: 'Y' }) // 栈顶 = update(A)
    data.failRestore = true

    // fail-soft：返回 failed 而非抛错；entry 保留在 undo 栈（未弹栈）
    const r = await recorder.undo()
    expect(r.applied).toBe(0)
    expect(r.failed).toHaveLength(1)
    expect(r.failed[0]?.reason).toContain('模拟存储故障')
    expect(recorder.getState().canUndo).toBe(true) // 入口保留（未弹栈）
    expect(data.get(a.id)?.data['name']).toBe('Y') // 未改动
  })
})
