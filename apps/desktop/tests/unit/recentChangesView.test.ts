import { describe, expect, it } from 'vitest'

import {
  toRecentChangeViews,
  type OperationRecord
} from '@mobai/shared/agent/observability'

/**
 * 「最近改动」展示投影（`agent:recentChanges` 的 IPC 出口）。
 *
 * 锁两条边界：
 * 1. `before/after` 回滚快照**不跨 IPC** —— 渲染层没有回滚入口，也不该能改这份数据；
 * 2. `itemName` 在主进程出口脱敏，但**存储里的原文一个字都不改** ——
 *    否则回滚时 `****` 会污染用户数据（这正是不能做「存储层脱敏」的原因）。
 */

function record(overrides: Partial<OperationRecord> = {}): OperationRecord {
  return {
    opType: 'update',
    dataType: 'role',
    itemId: 'role_1',
    itemName: '火系法师',
    before: { name: '旧名', token: 'sk-live-abcdefghijklmnopqrstuvwxyz' },
    after: { name: '新名', token: 'sk-live-abcdefghijklmnopqrstuvwxyz' },
    conversationId: 'conv_1',
    timestamp: 1_700_000_000_000,
    ...overrides
  }
}

describe('toRecentChangeViews', () => {
  it('投影只含展示字段，before/after 不下发', () => {
    const [view] = toRecentChangeViews([record()])
    expect(view).toBeDefined()
    expect(view).not.toHaveProperty('before')
    expect(view).not.toHaveProperty('after')
    expect(view).toMatchObject({
      opType: 'update',
      dataType: 'role',
      itemId: 'role_1',
      itemName: '火系法师',
      conversationId: 'conv_1',
      timestamp: 1_700_000_000_000
    })
  })

  it('itemName 含密钥时脱敏并给出 maskedCount', () => {
    const [view] = toRecentChangeViews([
      record({ itemName: '配置 api_key=sk-live-abcdefghijklmnopqrstuvwxyz 已更新' })
    ])
    expect(view?.itemName).toContain('api_key=****')
    expect(view?.itemName).not.toContain('sk-live-')
    expect(view?.maskedCount).toBeGreaterThan(0)
  })

  it('Bearer / JWT 形态也遮挡', () => {
    const [view] = toRecentChangeViews([
      record({ itemName: 'Bearer abcdef1234567890 的凭证' })
    ])
    expect(view?.itemName).toContain('Bearer ****')
    expect(view?.maskedCount).toBeGreaterThan(0)
  })

  it('普通条目名原样下发，不带 maskedCount', () => {
    const [view] = toRecentChangeViews([record()])
    expect(view?.itemName).toBe('火系法师')
    expect(view).not.toHaveProperty('maskedCount')
  })

  it('纯函数不改入参：存储里的原文与快照保持完整', () => {
    const original = record({ itemName: 'api_key=sk-live-abcdefghijklmnopqrstuvwxyz' })
    const snapshot = JSON.stringify(original)
    toRecentChangeViews([original])
    expect(JSON.stringify(original)).toBe(snapshot)
    expect(original.itemName).toContain('sk-live-')
    expect(original.before?.token).toBe('sk-live-abcdefghijklmnopqrstuvwxyz')
  })

  it('空列表返回空数组', () => {
    expect(toRecentChangeViews([])).toEqual([])
  })
})
