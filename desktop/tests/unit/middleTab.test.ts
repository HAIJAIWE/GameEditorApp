import { describe, expect, it } from 'vitest'

import {
  loadMiddleTab,
  MIDDLE_TABS,
  MIDDLE_TAB_KEY,
  saveMiddleTab,
  type MiddleTab
} from '../../src/shared/config/settings/middleTab'
import type { StorageLike } from '../../src/shared/config/settings/settingsStore'
import { buildTypeLabelMap } from '../../src/renderer/src/utils/typeLabels'

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
  it('四个页签的定义与顺序（策划书/数据编辑/代码编辑/浏览器）', () => {
    expect(MIDDLE_TABS.map((t) => t.id)).toEqual(['editor', 'data', 'code', 'browser'])
    expect(MIDDLE_TABS.every((t) => t.label !== '' && t.title !== '')).toBe(true)
    // 第一个页签是策划书（用户反馈：不能叫「编辑器」——它是策划书，纯数据编辑另有页签）
    expect(MIDDLE_TABS[0].label).toBe('策划书')
    expect(MIDDLE_TABS[1].label).toBe('数据编辑')
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
    const tabs: MiddleTab[] = ['editor', 'data', 'code', 'browser']
    for (const tab of tabs) {
      const storage = memoryStorage()
      saveMiddleTab(tab, storage)
      expect(loadMiddleTab(storage)).toBe(tab)
    }
  })
})

describe('类型展示名消歧义（buildTypeLabelMap）', () => {
  it('同名类型追加 id，单名保持干净', () => {
    const labels = buildTypeLabelMap([
      { id: 'role', name: '角色' },
      { id: 'character', name: '角色' },
      { id: 'monster', name: '怪物' }
    ])
    expect(labels.get('role')).toBe('角色（role）')
    expect(labels.get('character')).toBe('角色（character）')
    expect(labels.get('monster')).toBe('怪物')
  })

  it('空清单与单元素', () => {
    expect(buildTypeLabelMap([]).size).toBe(0)
    expect(buildTypeLabelMap([{ id: 'a', name: '甲' }]).get('a')).toBe('甲')
  })
})
