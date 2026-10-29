import { describe, expect, it } from 'vitest'

import { OperationLogStore } from '../../src/main/agent/operationLogStore'
import type { OperationRecord } from '../../src/shared/agent/operationLog'

function record(n: number): OperationRecord {
  return {
    opType: 'update',
    dataType: 'role',
    itemId: `i${n}`,
    itemName: `名${n}`,
    before: {},
    after: {},
    conversationId: 'c',
    timestamp: n
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
