import { describe, expect, it } from 'vitest'

import {
  displayItemId,
  isUuidLikeId,
  needsShortId,
  nextItemId,
  planShortIdBackfill
} from '../../src/shared/util/id'
import type { ItemRecord } from '../../src/shared/types'

function record(id: string, data: Record<string, unknown>): ItemRecord {
  return { id, type: 'role', data, createdAt: '2026-10-13T00:00:00.000Z', updatedAt: '2026-10-13T00:00:00.000Z' }
}

const UUID = '195370b2-92be-484c-a06f-64ba1de68300'

describe('itemId 工具', () => {
  it('isUuidLikeId 只认标准 UUID 形态', () => {
    expect(isUuidLikeId(UUID)).toBe(true)
    expect(isUuidLikeId('0')).toBe(false)
    expect(isUuidLikeId('boss-01')).toBe(false)
    expect(isUuidLikeId(42)).toBe(false)
    expect(isUuidLikeId(undefined)).toBe(false)
  })

  it('needsShortId：缺失/空/UUID 需要回填，用户自设 id 不动', () => {
    expect(needsShortId({ data: {} })).toBe(true)
    expect(needsShortId({ data: { id: '' } })).toBe(true)
    expect(needsShortId({ data: { id: UUID } })).toBe(true)
    expect(needsShortId({ data: { id: '7' } })).toBe(false)
    expect(needsShortId({ data: { id: 7 } })).toBe(false)
    expect(needsShortId({ data: { id: 'boss-01' } })).toBe(false)
  })

  it('displayItemId：data.id 优先，缺失回退记录 id', () => {
    expect(displayItemId({ id: UUID, data: { id: '3' } })).toBe('3')
    expect(displayItemId({ id: UUID, data: { id: 0 } })).toBe('0')
    expect(displayItemId({ id: UUID, data: {} })).toBe(UUID)
  })

  it('nextItemId：无数值 id 从 0 开始；取 max+1；跳过非数值', () => {
    expect(nextItemId([])).toBe('0')
    expect(nextItemId([{ data: {} }, { data: { id: '2' } }])).toBe('3')
    expect(nextItemId([{ data: { id: 'boss-01' } }, { data: { id: '5' } }])).toBe('6')
    // 断档取 max+1：0/2 并存 → 下一个是 3
    expect(nextItemId([{ data: { id: '0' } }, { data: { id: '2' } }])).toBe('3')
    expect(nextItemId([{ data: { id: -1 } }])).toBe('0')
  })

  it('planShortIdBackfill：按序分配、不与存量短 id 撞号、幂等', () => {
    const items = [
      record('r1', {}), // 缺 id → 接 max+1 = 2（r2 已占 1）
      record('r2', { id: '1' }), // 存量短 id，不动
      record('r3', { id: UUID }), // uuid 产物 → 3
      record('r4', { id: 'boss-01' }), // 用户自设，不动
      record('r5', {}) // 缺 id → 4
    ]
    const plan = planShortIdBackfill(items)
    expect(plan.get('r1')).toBe('2')
    expect(plan.get('r3')).toBe('3')
    expect(plan.get('r5')).toBe('4')
    expect(plan.has('r2')).toBe(false)
    expect(plan.has('r4')).toBe(false)

    // 应用后再规划：空映射（幂等）
    const applied = items.map((item) => record(item.id, { ...item.data, id: plan.get(item.id) ?? item.data['id'] }))
    expect(planShortIdBackfill(applied).size).toBe(0)
  })

  it('planShortIdBackfill：全量缺 id 时从 0 起按序分配（用户真实库形态）', () => {
    const items = [record('r1', {}), record('r2', {}), record('r3', {})]
    const plan = planShortIdBackfill(items)
    expect([plan.get('r1'), plan.get('r2'), plan.get('r3')]).toEqual(['0', '1', '2'])
  })

  it('planShortIdBackfill：存量短 id 断档时从 max+1 起分配', () => {
    const items = [record('r1', { id: '5' }), record('r2', {}), record('r3', {})]
    const plan = planShortIdBackfill(items)
    expect(plan.get('r2')).toBe('6')
    expect(plan.get('r3')).toBe('7')
  })
})
