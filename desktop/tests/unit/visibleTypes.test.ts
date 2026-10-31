import { describe, expect, it } from 'vitest'

import {
  VISIBLE_TYPES_STORAGE_KEY,
  isTypeVisible,
  loadVisibleTypes,
  normalizeVisibleTypes,
  resolveVisibilityResult,
  saveVisibleTypes
} from '../../src/shared/config/game'
import type { StorageLike } from '../../src/shared/config/game'

/** 内存假 storage，绝不碰真实 localStorage */
class FakeStorage implements StorageLike {
  private readonly map = new Map<string, string>()
  readonly removed: string[] = []

  getItem(key: string): string | null {
    return this.map.has(key) ? (this.map.get(key) as string) : null
  }

  setItem(key: string, value: string): void {
    this.map.set(key, value)
  }

  removeItem(key: string): void {
    this.map.delete(key)
    this.removed.push(key)
  }
}

describe('isTypeVisible', () => {
  it('偏好为 null（=全部显示）时任何类型都可见', () => {
    expect(isTypeVisible('skill', null)).toBe(true)
    expect(isTypeVisible('任意未知 id', null)).toBe(true)
  })

  it('在集合内 → 可见', () => {
    expect(isTypeVisible('skill', ['role', 'skill'])).toBe(true)
  })

  it('不在集合内 → 不可见', () => {
    expect(isTypeVisible('skill', ['role', 'monster'])).toBe(false)
  })

  it('空集合（=全隐藏）下任何类型都不可见', () => {
    expect(isTypeVisible('role', [])).toBe(false)
  })
})

describe('normalizeVisibleTypes', () => {
  const allIds = ['role', 'skill', 'monster']

  it('非数组一律回退为 null', () => {
    expect(normalizeVisibleTypes(undefined, allIds)).toBeNull()
    expect(normalizeVisibleTypes(null, allIds)).toBeNull()
    expect(normalizeVisibleTypes('role', allIds)).toBeNull()
    expect(normalizeVisibleTypes(42, allIds)).toBeNull()
    expect(normalizeVisibleTypes({ role: true }, allIds)).toBeNull()
  })

  it('过滤掉未知 id', () => {
    expect(normalizeVisibleTypes(['role', 'zzz', 'skill'], allIds)).toEqual(['role', 'skill'])
  })

  it('全选 → null（含乱序/重复输入）', () => {
    expect(normalizeVisibleTypes(['monster', 'role', 'skill'], allIds)).toBeNull()
    expect(normalizeVisibleTypes(['role', 'role', 'skill', 'monster'], allIds)).toBeNull()
  })

  it('空数组 → []（保留「全不选」，与「键不存在」区分）', () => {
    expect(normalizeVisibleTypes([], allIds)).toEqual([])
  })

  it('子集按 allIds 顺序输出', () => {
    expect(normalizeVisibleTypes(['monster', 'role'], allIds)).toEqual(['role', 'monster'])
  })

  it('过滤后一个不剩 → []', () => {
    expect(normalizeVisibleTypes(['zzz', 'yyy'], allIds)).toEqual([])
  })
})

describe('resolveVisibilityResult', () => {
  const allIds = ['role', 'skill', 'monster']

  it('全选 → null', () => {
    expect(resolveVisibilityResult(['monster', 'role', 'skill'], allIds)).toBeNull()
  })

  it('0 个 → []', () => {
    expect(resolveVisibilityResult([], allIds)).toEqual([])
  })

  it('子集按 allIds 顺序且去重、过滤未知 id', () => {
    expect(resolveVisibilityResult(['monster', 'role', 'role', 'zzz'], allIds)).toEqual([
      'role',
      'monster'
    ])
  })

  it('全是未知 id → []', () => {
    expect(resolveVisibilityResult(['zzz'], allIds)).toEqual([])
  })
})

describe('loadVisibleTypes（注入假 storage）', () => {
  it('键不存在 → null（默认全部显示）', () => {
    const storage = new FakeStorage()
    expect(loadVisibleTypes(storage)).toBeNull()
  })

  it('坏 JSON → null（不抛）', () => {
    const storage = new FakeStorage()
    storage.setItem(VISIBLE_TYPES_STORAGE_KEY, '{not json')
    expect(loadVisibleTypes(storage)).toBeNull()
  })

  it('非字符串数组 → null', () => {
    const storage = new FakeStorage()
    storage.setItem(VISIBLE_TYPES_STORAGE_KEY, '{"a":1}')
    expect(loadVisibleTypes(storage)).toBeNull()
    storage.setItem(VISIBLE_TYPES_STORAGE_KEY, '["role", 5]')
    expect(loadVisibleTypes(storage)).toBeNull()
  })

  it("'[]' → []", () => {
    const storage = new FakeStorage()
    storage.setItem(VISIBLE_TYPES_STORAGE_KEY, '[]')
    expect(loadVisibleTypes(storage)).toEqual([])
  })

  it('正常数组 → 原样返回', () => {
    const storage = new FakeStorage()
    storage.setItem(VISIBLE_TYPES_STORAGE_KEY, JSON.stringify(['role', 'skill']))
    expect(loadVisibleTypes(storage)).toEqual(['role', 'skill'])
  })
})

describe('saveVisibleTypes', () => {
  it('null → removeItem 被调用（恢复默认全部显示）', () => {
    const storage = new FakeStorage()
    storage.setItem(VISIBLE_TYPES_STORAGE_KEY, '[]')
    saveVisibleTypes(null, storage)
    expect(storage.removed).toContain(VISIBLE_TYPES_STORAGE_KEY)
    expect(storage.getItem(VISIBLE_TYPES_STORAGE_KEY)).toBeNull()
  })

  it("[] → setItem 收到 '[]'", () => {
    const storage = new FakeStorage()
    saveVisibleTypes([], storage)
    expect(storage.getItem(VISIBLE_TYPES_STORAGE_KEY)).toBe('[]')
  })

  it('数组 → setItem 收到 JSON 字符串', () => {
    const storage = new FakeStorage()
    saveVisibleTypes(['role', 'skill'], storage)
    expect(storage.getItem(VISIBLE_TYPES_STORAGE_KEY)).toBe('["role","skill"]')
  })
})
