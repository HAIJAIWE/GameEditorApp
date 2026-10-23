import { describe, expect, it } from 'vitest'

import {
  loadMiddleTab,
  MIDDLE_TABS,
  MIDDLE_TAB_KEY,
  saveMiddleTab,
  type MiddleTab
} from '../../src/shared/config/middleTab'
import type { StorageLike } from '../../src/shared/config/settingsStore'

/** 内存版 StorageLike（与主题/游戏风格测试同款注入方式） */
function memoryStorage(seed: Record<string, string> = {}): StorageLike {
  const map = new Map(Object.entries(seed))
  return {
    getItem: (key) => map.get(key) ?? null,
    setItem: (key, value) => void map.set(key, value),
    removeItem: (key) => void map.delete(key)
  }
}

describe('中间窗口页签：持久化', () => {
  it('三个页签的定义与顺序（编辑器/代码编辑/浏览器）', () => {
    expect(MIDDLE_TABS.map((t) => t.id)).toEqual(['editor', 'code', 'browser'])
    expect(MIDDLE_TABS.every((t) => t.label !== '' && t.title !== '')).toBe(true)
  })

  it('存取往返', () => {
    const storage = memoryStorage()
    saveMiddleTab('browser', storage)
    expect(loadMiddleTab(storage)).toBe('browser')
    expect(storage.getItem(MIDDLE_TAB_KEY)).toBe('browser')
  })

  it('未配置/损坏/未知值都回落 editor', () => {
    expect(loadMiddleTab(memoryStorage())).toBe('editor')
    expect(loadMiddleTab(memoryStorage({ [MIDDLE_TAB_KEY]: '乱码' }))).toBe('editor')
    expect(loadMiddleTab(memoryStorage({ [MIDDLE_TAB_KEY]: '"quoted"' }))).toBe('editor')
    expect(loadMiddleTab(memoryStorage({ [MIDDLE_TAB_KEY]: 'unknown-tab' }))).toBe('editor')
  })

  it('storage 不可用（null）时返回 editor 不抛', () => {
    expect(loadMiddleTab(null)).toBe('editor')
    expect(() => saveMiddleTab('code', null)).not.toThrow()
  })

  it('全部合法值都可往返', () => {
    const tabs: MiddleTab[] = ['editor', 'code', 'browser']
    for (const tab of tabs) {
      const storage = memoryStorage()
      saveMiddleTab(tab, storage)
      expect(loadMiddleTab(storage)).toBe(tab)
    }
  })
})
