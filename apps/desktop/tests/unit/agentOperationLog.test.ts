import { describe, expect, it } from 'vitest'

import {
  buildRollbackPlan,
  type OperationRecord
} from '@mobai/shared/agent/observability'
import {
  MAX_OPERATIONS,
  OperationLogStore,
  PURGE_BATCH,
  executeRollbackPlan,
  type RollbackPort
} from '../../src/main/agent/store/operationLogStore'

function makeRecord(over: Partial<OperationRecord> = {}): OperationRecord {
  return {
    opType: 'create',
    dataType: 'role',
    itemId: 'role_1',
    itemName: '法师',
    before: null,
    after: { id: 'role_1', name: '法师' },
    conversationId: 'conv_1',
    timestamp: 1000,
    ...over
  }
}

/** 记录操作调用的替身端口 */
function makePort(over: Partial<RollbackPort> = {}): RollbackPort & { calls: string[] } {
  const calls: string[] = []
  return {
    calls,
    removeItem: async (id: string) => {
      calls.push(`remove:${id}`)
      return true
    },
    updateItem: async (id: string) => {
      calls.push(`update:${id}`)
      return undefined
    },
    insertItem: async (record) => {
      calls.push(`insert:${record.id}`)
      return undefined
    },
    ...over
  }
}

describe('buildRollbackPlan：由操作记录生成逆向计划（纯函数）', () => {
  it('按记录逆序生成（后进先出），create→remove、update/delete→restore', () => {
    const plan = buildRollbackPlan([
      makeRecord({ opType: 'create', itemId: 'a', itemName: 'A' }),
      makeRecord({ opType: 'update', itemId: 'b', itemName: 'B', before: { id: 'b', name: '旧' } }),
      makeRecord({ opType: 'delete', itemId: 'c', itemName: 'C', before: { id: 'c', name: '被删的' } })
    ])

    expect(plan.skipped).toEqual([])
    expect(plan.steps).toEqual([
      { kind: 'restore', dataType: 'role', itemId: 'c', itemName: 'C', snapshot: { id: 'c', name: '被删的' } },
      { kind: 'restore', dataType: 'role', itemId: 'b', itemName: 'B', snapshot: { id: 'b', name: '旧' } },
      { kind: 'remove', dataType: 'role', itemId: 'a', itemName: 'A' }
    ])
  })

  it('缺变更前快照的 update/delete → 进 skipped 并给中文原因（不静默丢弃）', () => {
    const plan = buildRollbackPlan([
      makeRecord({ opType: 'update', itemName: '无快照的', before: null }),
      makeRecord({ opType: 'delete', itemName: '也无快照', before: null })
    ])

    expect(plan.steps).toEqual([])
    expect(plan.skipped).toHaveLength(2)
    expect(plan.skipped[0]?.reason).toBe('delete 记录缺少变更前快照，无法恢复')
    expect(plan.skipped[1]?.reason).toBe('update 记录缺少变更前快照，无法恢复')
  })

  it('空记录 → 空计划', () => {
    expect(buildRollbackPlan([])).toEqual({ steps: [], skipped: [] })
  })
})

describe('OperationLogStore：会话分组与内存上限', () => {
  it('按会话分组查询与计数', () => {
    const store = new OperationLogStore()
    store.record(makeRecord({ conversationId: 'conv_1' }))
    store.record(makeRecord({ conversationId: 'conv_2' }))
    store.record(makeRecord({ conversationId: 'conv_1' }))

    expect(store.count()).toBe(3)
    expect(store.countByConversation('conv_1')).toBe(2)
    expect(store.countByConversation('conv_其它')).toBe(0)
    expect(store.listByConversation('conv_1').map((item) => item.conversationId)).toEqual(['conv_1', 'conv_1'])
  })

  it('planRollback 只看该会话（不串到别的会话）', () => {
    const store = new OperationLogStore()
    store.record(makeRecord({ conversationId: 'conv_1', itemName: '甲' }))
    store.record(makeRecord({ conversationId: 'conv_2', itemName: '乙' }))

    const plan = store.planRollback('conv_1')
    expect(plan.steps).toHaveLength(1)
    expect(plan.steps[0]).toMatchObject({ itemName: '甲' })
  })

  it('clearConversation 只清该会话并回报清除条数', () => {
    const store = new OperationLogStore()
    store.record(makeRecord({ conversationId: 'conv_1' }))
    store.record(makeRecord({ conversationId: 'conv_2' }))
    store.record(makeRecord({ conversationId: 'conv_1' }))

    expect(store.clearConversation('conv_1')).toBe(2)
    expect(store.count()).toBe(1)
    expect(store.countByConversation('conv_1')).toBe(0)
  })

  it('超过上限淘汰最旧一批（5000 / 批 500），条数被夹住', () => {
    const store = new OperationLogStore()
    for (let index = 0; index < MAX_OPERATIONS; index++) {
      store.record(makeRecord({ itemId: `id_${index}` }))
    }
    expect(store.count()).toBe(MAX_OPERATIONS)

    store.record(makeRecord({ itemId: 'overflow' }))
    expect(store.count()).toBe(MAX_OPERATIONS - PURGE_BATCH + 1)
    // 最旧的一批被淘汰：现存最早的是第 PURGE_BATCH 条
    expect(store.listByConversation('conv_1')[0]?.itemId).toBe(`id_${PURGE_BATCH}`)
  })
})

describe('executeRollbackPlan：执行回滚（单步失败不中断）', () => {
  it('create→删、update/delete→按快照写回；回报成功数', async () => {
    const store = new OperationLogStore()
    store.record(makeRecord({ opType: 'create', itemId: 'new_1', itemName: 'AI 新建的' }))
    store.record(
      makeRecord({ opType: 'update', itemId: 'upd_1', itemName: '被改的', before: { id: 'upd_1', name: '旧值' } })
    )
    const plan = store.planRollback('conv_1')

    const port = makePort()
    const outcome = await executeRollbackPlan(plan, port)

    expect(outcome.count).toBe(2)
    expect(outcome.errors).toEqual([])
    // 逆序：先恢复被改的，再删掉新建的
    expect(port.calls).toEqual(['insert:upd_1', 'remove:new_1'])
  })

  it('某步失败 → 收集中文原因后继续执行其余步骤（不中断、不谎报成功）', async () => {
    const store = new OperationLogStore()
    store.record(makeRecord({ opType: 'create', itemId: 'a', itemName: 'A' }))
    store.record(makeRecord({ opType: 'create', itemId: 'b', itemName: 'B' }))
    const plan = store.planRollback('conv_1')

    const port = makePort({
      removeItem: async (id: string) => {
        if (id === 'b') throw new Error('数据库锁住了')
        return true
      }
    })
    const outcome = await executeRollbackPlan(plan, port)

    expect(outcome.count).toBe(1)
    expect(outcome.errors).toEqual(['删除「B」：数据库锁住了'])
  })

  it('remove 返回 false（条目已不存在）→ 记为失败而非成功', async () => {
    const store = new OperationLogStore()
    store.record(makeRecord({ opType: 'create', itemId: 'gone', itemName: '早没了' }))
    const port = makePort({ removeItem: async () => false })

    const outcome = await executeRollbackPlan(store.planRollback('conv_1'), port)
    expect(outcome.count).toBe(0)
    expect(outcome.errors).toEqual(['删除「早没了」失败：条目不存在'])
  })

  it('skipped 原样透传（缺快照的条目不会被当成已回滚）', async () => {
    const store = new OperationLogStore()
    store.record(makeRecord({ opType: 'update', itemName: '无快照', before: null }))
    const outcome = await executeRollbackPlan(store.planRollback('conv_1'), makePort())

    expect(outcome.count).toBe(0)
    expect(outcome.skipped).toHaveLength(1)
    expect(outcome.skipped[0]?.itemName).toBe('无快照')
  })
})
