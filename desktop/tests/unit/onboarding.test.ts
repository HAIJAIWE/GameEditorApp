import { describe, expect, it } from 'vitest'

import {
  ONBOARDING_STEPS,
  ONBOARDING_STORAGE_KEY,
  QUICK_ACTIONS,
  defaultOnboardingState,
  isAllComplete,
  loadOnboardingState,
  progressLabel,
  resetOnboardingState,
  saveOnboardingState,
  withCollapsed,
  withDismissed,
  withStepCompleted
} from '../../src/shared/config/settings'
import type { OnboardingState } from '../../src/shared/config/settings'
import type { StorageLike } from '../../src/shared/config/settings'

/** 内存假 storage，绝不碰真实 localStorage（与 visibleTypes.test.ts 同款注入模式） */
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

const state = (over: Partial<OnboardingState>): OnboardingState => ({
  ...defaultOnboardingState(),
  ...over
})

describe('常量', () => {
  it('ONBOARDING_STEPS 为 5 步，id 精确', () => {
    expect(ONBOARDING_STEPS).toHaveLength(5)
    expect(ONBOARDING_STEPS.map((step) => step.id)).toEqual([
      'onboarding_library',
      'onboarding_types',
      'onboarding_data',
      'onboarding_ceshu',
      'onboarding_ai'
    ])
  })

  it('QUICK_ACTIONS 为 6 张，id 精确', () => {
    expect(QUICK_ACTIONS).toHaveLength(6)
    expect(QUICK_ACTIONS.map((action) => action.id)).toEqual([
      'create_role',
      'create_monster',
      'create_skill',
      'create_equip',
      'batch_create',
      'view_relations'
    ])
  })

  it('batch_create / view_relations 无关联类型（dataType=null）', () => {
    expect(QUICK_ACTIONS.find((action) => action.id === 'batch_create')?.dataType).toBeNull()
    expect(QUICK_ACTIONS.find((action) => action.id === 'view_relations')?.dataType).toBeNull()
  })
})

describe('defaultOnboardingState', () => {
  it('默认未折叠 / 未关闭 / 无完成项', () => {
    expect(defaultOnboardingState()).toEqual({ collapsed: false, dismissed: false, completed: [] })
  })
})

describe('load / save 往返', () => {
  it('键不存在 → 默认', () => {
    expect(loadOnboardingState(new FakeStorage())).toEqual(defaultOnboardingState())
  })

  it('save 后 load 一致', () => {
    const storage = new FakeStorage()
    const next = state({ collapsed: true, dismissed: false, completed: [0, 2] })
    saveOnboardingState(next, storage)
    expect(loadOnboardingState(storage)).toEqual(next)
  })
})

describe('loadOnboardingState 容错', () => {
  it('坏 JSON → 默认', () => {
    const storage = new FakeStorage()
    storage.setItem(ONBOARDING_STORAGE_KEY, '{not json')
    expect(loadOnboardingState(storage)).toEqual(defaultOnboardingState())
  })

  it('非对象（数组 / 字符串 / 数字 / 布尔） → 默认', () => {
    const storage = new FakeStorage()
    for (const raw of ['[0,1]', '"x"', '42', 'true']) {
      storage.setItem(ONBOARDING_STORAGE_KEY, raw)
      expect(loadOnboardingState(storage)).toEqual(defaultOnboardingState())
    }
  })

  it('completed 越界下标被过滤', () => {
    const storage = new FakeStorage()
    storage.setItem(ONBOARDING_STORAGE_KEY, '{"collapsed":false,"dismissed":false,"completed":[-1,0,5,99,2]}')
    expect(loadOnboardingState(storage).completed).toEqual([0, 2])
  })

  it('completed 重复项去重 + 升序', () => {
    const storage = new FakeStorage()
    storage.setItem(ONBOARDING_STORAGE_KEY, '{"completed":[2,1,2,0,1]}')
    expect(loadOnboardingState(storage).completed).toEqual([0, 1, 2])
  })

  it('completed 非数组 → []', () => {
    const storage = new FakeStorage()
    storage.setItem(ONBOARDING_STORAGE_KEY, '{"completed":"nope"}')
    expect(loadOnboardingState(storage).completed).toEqual([])
  })

  it('completed 含非整数 / 非数字 → 丢弃', () => {
    const storage = new FakeStorage()
    storage.setItem(ONBOARDING_STORAGE_KEY, '{"completed":[1.5,"2",2,null]}')
    expect(loadOnboardingState(storage).completed).toEqual([2])
  })

  it('部分字段缺失 → 逐字段回退默认', () => {
    const storage = new FakeStorage()
    storage.setItem(ONBOARDING_STORAGE_KEY, '{"collapsed":true}')
    expect(loadOnboardingState(storage)).toEqual({ collapsed: true, dismissed: false, completed: [] })
  })

  it('布尔字段类型不符 → 强制 false', () => {
    const storage = new FakeStorage()
    storage.setItem(ONBOARDING_STORAGE_KEY, '{"collapsed":"yes","dismissed":1,"completed":[]}')
    expect(loadOnboardingState(storage)).toEqual({ collapsed: false, dismissed: false, completed: [] })
  })
})

describe('progressLabel', () => {
  it('0/5', () => {
    expect(progressLabel(state({ completed: [] }))).toBe('0/5 已完成')
  })

  it('2/5', () => {
    expect(progressLabel(state({ completed: [1, 3] }))).toBe('2/5 已完成')
  })

  it('5/5', () => {
    expect(progressLabel(state({ completed: [0, 1, 2, 3, 4] }))).toBe('5/5 已完成')
  })

  it('越界 / 重复不计入', () => {
    expect(progressLabel(state({ completed: [0, 0, 9, 4] }))).toBe('2/5 已完成')
  })
})

describe('isAllComplete', () => {
  it('部分完成 → false', () => {
    expect(isAllComplete(state({ completed: [0, 1, 2, 3] }))).toBe(false)
  })

  it('全部完成 → true', () => {
    expect(isAllComplete(state({ completed: [0, 1, 2, 3, 4] }))).toBe(true)
  })

  it('空 → false', () => {
    expect(isAllComplete(defaultOnboardingState())).toBe(false)
  })
})

describe('withStepCompleted', () => {
  it('不可变：原对象与 completed 不被修改', () => {
    const original = state({ completed: [0] })
    const next = withStepCompleted(original, 3)
    expect(next).not.toBe(original)
    expect(original.completed).toEqual([0])
    expect(next.completed).toEqual([0, 3])
  })

  it('越界 / 非整数下标 → 原样副本', () => {
    const original = state({ completed: [1] })
    for (const bad of [-1, 5, 99, 1.5, Number.NaN]) {
      const next = withStepCompleted(original, bad)
      expect(next.completed).toEqual([1])
      expect(next).not.toBe(original)
    }
  })

  it('重复标记 → 去重（不新增）', () => {
    const original = state({ completed: [0, 2] })
    expect(withStepCompleted(original, 2).completed).toEqual([0, 2])
  })

  it('保持升序', () => {
    expect(withStepCompleted(state({ completed: [4] }), 1).completed).toEqual([1, 4])
  })
})

describe('withCollapsed / withDismissed', () => {
  it('不可变设置折叠态', () => {
    const original = state({})
    const next = withCollapsed(original, true)
    expect(next.collapsed).toBe(true)
    expect(original.collapsed).toBe(false)
  })

  it('不可变设置关闭态', () => {
    const original = state({})
    const next = withDismissed(original, true)
    expect(next.dismissed).toBe(true)
    expect(original.dismissed).toBe(false)
  })
})

describe('resetOnboardingState', () => {
  it('清除存储键并返回默认状态', () => {
    const storage = new FakeStorage()
    saveOnboardingState(state({ collapsed: true, dismissed: true, completed: [0, 1] }), storage)
    const reset = resetOnboardingState(storage)
    expect(reset).toEqual(defaultOnboardingState())
    expect(storage.removed).toContain(ONBOARDING_STORAGE_KEY)
    expect(storage.getItem(ONBOARDING_STORAGE_KEY)).toBeNull()
  })
})
