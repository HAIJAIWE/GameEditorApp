import { describe, expect, it } from 'vitest'

import { OperationLogStore } from '@mobai/agent-core/store/operationLogStore'
import type { OperationRecord } from '@mobai/shared/agent/observability'

function record(n: number, overrides: Partial<OperationRecord> = {}): OperationRecord {
  return {
    opType: 'update',
    dataType: 'role',
    itemId: `i${n}`,
    itemName: `名${n}`,
    before: {},
    after: {},
    conversationId: 'c',
    timestamp: n,
    ...overrides
  }
}

describe('OperationLogStore.listRecent（最近改动）', () => {
  it('返回最近 N 条（新→旧）', () => {
    const store = new OperationLogStore()
    for (let i = 1; i <= 5; i += 1) store.record(record(i))
    expect(store.listRecent(3).map((r) => r.itemId)).toEqual(['i5', 'i4', 'i3'])
    expect(store.listRecent().map((r) => r.itemId)).toEqual(['i5', 'i4', 'i3', 'i2', 'i1'])
  })

  it('limit 非法（0/负数/NaN）回退默认', () => {
    const store = new OperationLogStore()
    store.record(record(1))
    expect(store.listRecent(0)).toHaveLength(1)
    expect(store.listRecent(-3)).toHaveLength(1)
    expect(store.listRecent(Number.NaN)).toHaveLength(1)
  })

  it('空日志返回空数组', () => {
    expect(new OperationLogStore().listRecent()).toEqual([])
  })
})

describe('OperationLogStore.listRecentFiltered（按会话 / 时间收窄）', () => {
  it('since：只保留 timestamp >= since 的记录', () => {
    const store = new OperationLogStore()
    for (let i = 1; i <= 5; i += 1) store.record(record(i))
    // 边界包含：since 恰等于某条记录的时间时，该条应保留
    expect(store.listRecentFiltered(50, { since: 3 }).map((r) => r.itemId)).toEqual(['i5', 'i4', 'i3'])
    expect(store.listRecentFiltered(50, { since: 99 })).toEqual([])
  })

  it('conversationId：只保留该会话的记录', () => {
    const store = new OperationLogStore()
    store.record(record(1, { conversationId: 'c' }))
    store.record(record(2, { conversationId: 'd' }))
    store.record(record(3, { conversationId: 'c' }))
    store.record(record(4, { conversationId: 'd' }))
    expect(store.listRecentFiltered(50, { conversationId: 'd' }).map((r) => r.itemId)).toEqual(['i4', 'i2'])
    expect(store.listRecentFiltered(50, { conversationId: 'nope' })).toEqual([])
  })

  it('两者组合时先筛后截断，limit 仍在筛完的结果上生效', () => {
    const store = new OperationLogStore()
    // c 会话：1、3、5；d 会话：2、4 —— 只有 3、5 同时满足 c 且 >= 3
    for (let i = 1; i <= 5; i += 1) {
      store.record(record(i, { conversationId: i % 2 === 1 ? 'c' : 'd' }))
    }
    expect(store.listRecentFiltered(50, { since: 3, conversationId: 'c' }).map((r) => r.itemId)).toEqual([
      'i5',
      'i3'
    ])
    // limit=1 取筛完后的最新一条（若先截断再筛，这里会得到 i3 或空）
    expect(store.listRecentFiltered(1, { since: 3, conversationId: 'c' }).map((r) => r.itemId)).toEqual(['i5'])
  })
})
