import { describe, expect, it } from 'vitest'

import {
  SETTINGS_KEYS,
  SETTINGS_KEY_PREFIX,
  defaultSettingsStorage,
  exportSettings,
  importSettings,
  listSettingKeys,
  readJsonSetting,
  readSetting,
  removeSetting,
  resetAllSettings,
  writeJsonSetting,
  writeSetting
} from '../../src/shared/settingsStore'
import type { StorageLike } from '../../src/shared/settingsStore'

/** 可枚举的 storage（带 length/key，模拟真实 localStorage） */
type EnumerableStorage = StorageLike & {
  data: Map<string, string>
  length: number
  key: (index: number) => string | null
}

/** 可枚举的内存 StorageLike（模拟真实 localStorage，带 length/key） */
function memStorage(initial: Record<string, string> = {}): EnumerableStorage {
  const data = new Map<string, string>(Object.entries(initial))
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    },
    get length() {
      return data.size
    },
    key: (index: number) => {
      const entries = [...data.keys()]
      return index < entries.length ? (entries[index] ?? null) : null
    }
  }
}

/** 不可枚举的最小 StorageLike（无 length/key） */
function bareStorage(initial: Record<string, string> = {}): StorageLike {
  const data = new Map<string, string>(Object.entries(initial))
  return {
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    }
  }
}

const throwing: StorageLike = {
  getItem: () => {
    throw new Error('denied')
  },
  setItem: () => {
    throw new Error('quota')
  },
  removeItem: () => {
    throw new Error('denied')
  }
}

describe('settingsStore：默认 storage', () => {
  it('Node 下无 localStorage → null（不抛）', () => {
    expect(defaultSettingsStorage()).toBeNull()
  })
})

describe('settingsStore：读 / 写 / 删', () => {
  it('写入后可读回', () => {
    const s = memStorage()
    expect(writeSetting('mb.a', 'v1', s)).toBe(true)
    expect(readSetting('mb.a', s)).toBe('v1')
  })

  it('键不存在 → null', () => {
    expect(readSetting('mb.missing', memStorage())).toBeNull()
  })

  it('写空串视为清除（不留无意义键）', () => {
    const s = memStorage()
    writeSetting('mb.a', 'v1', s)
    writeSetting('mb.a', '', s)
    expect(s.data.has('mb.a')).toBe(false)
  })

  it('removeSetting 删除并返回 true', () => {
    const s = memStorage({ 'mb.a': 'v' })
    expect(removeSetting('mb.a', s)).toBe(true)
    expect(s.data.has('mb.a')).toBe(false)
  })

  it('storage 为 null：读写删均安全返回（不抛）', () => {
    expect(readSetting('mb.a', null)).toBeNull()
    expect(writeSetting('mb.a', 'v', null)).toBe(false)
    expect(removeSetting('mb.a', null)).toBe(false)
  })

  it('storage 抛错：读返回 null / 写返回 false（不抛）', () => {
    expect(readSetting('mb.a', throwing)).toBeNull()
    expect(writeSetting('mb.a', 'v', throwing)).toBe(false)
    expect(removeSetting('mb.a', throwing)).toBe(false)
  })
})

describe('settingsStore：JSON 读写', () => {
  it('往返一致（对象/数组/数字/布尔）', () => {
    const s = memStorage()
    for (const value of [{ a: 1 }, [1, 2, 3], 42, true] as unknown[]) {
      expect(writeJsonSetting('mb.j', value, s)).toBe(true)
      expect(readJsonSetting('mb.j', null, s)).toEqual(value)
    }
  })

  it('键缺失 → 回落 fallback', () => {
    expect(readJsonSetting('mb.none', 'fb', memStorage())).toBe('fb')
  })

  it('JSON 损坏 → 回落 fallback（不抛）', () => {
    const s = memStorage({ 'mb.bad': '{not json' })
    expect(readJsonSetting('mb.bad', 'fb', s)).toBe('fb')
  })

  it('循环引用 → 写返回 false（不抛）', () => {
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(writeJsonSetting('mb.c', cyclic, memStorage())).toBe(false)
  })
})

describe('settingsStore：键枚举', () => {
  it('只列 mb. 前缀的键，且已排序', () => {
    const s = memStorage({ 'mb.b': '1', 'mb.a': '2', other: '3', 'xx.y': '4' })
    expect(listSettingKeys(s)).toEqual(['mb.a', 'mb.b'])
  })

  it('无 mb. 键 → 空数组', () => {
    expect(listSettingKeys(memStorage({ other: '1' }))).toEqual([])
  })

  it('storage 不支持枚举（无 length/key）→ 空数组', () => {
    expect(listSettingKeys(bareStorage({ 'mb.a': '1' }))).toEqual([])
  })

  it('storage 为 null → 空数组', () => {
    expect(listSettingKeys(null)).toEqual([])
  })

  it('前缀常量正确', () => {
    expect(SETTINGS_KEY_PREFIX).toBe('mb.')
  })
})

describe('settingsStore：导出 / 导入 / 重置', () => {
  it('导出只含 mb. 键，值为原始字符串', () => {
    const s = memStorage({ 'mb.a': 'plain', 'mb.b': JSON.stringify({ x: 1 }), other: 'skip' })
    expect(exportSettings(s)).toEqual({ version: 1, entries: { 'mb.a': 'plain', 'mb.b': '{"x":1}' } })
  })

  it('导出→导入 往返（到另一个 storage）', () => {
    const source = memStorage({ 'mb.a': '1', 'mb.b': '2', other: 'x' })
    const target = memStorage()
    expect(importSettings(exportSettings(source), target)).toBe(2)
    expect(readSetting('mb.a', target)).toBe('1')
    expect(readSetting('mb.b', target)).toBe('2')
  })

  it('导入拒绝非法快照（返回 0，不抛）', () => {
    const s = memStorage()
    expect(importSettings(null, s)).toBe(0)
    expect(importSettings('nope', s)).toBe(0)
    expect(importSettings({ version: 2, entries: { 'mb.a': '1' } }, s)).toBe(0)
    expect(importSettings({ version: 1, entries: null }, s)).toBe(0)
  })

  it('导入跳过无前缀键与非字符串值（防塞入任意 localStorage 键）', () => {
    const s = memStorage()
    const count = importSettings(
      { version: 1, entries: { 'mb.ok': '1', evilKey: '2', 'mb.badNum': 3 as unknown as string } },
      s
    )
    expect(count).toBe(1)
    expect(s.data.has('evilKey')).toBe(false)
    expect(s.data.has('mb.badNum')).toBe(false)
  })

  it('重置只删 mb. 键，返回删除数，保留其他键', () => {
    const s = memStorage({ 'mb.a': '1', 'mb.b': '2', keepMe: '3' })
    expect(resetAllSettings(s)).toBe(2)
    expect(s.data.has('mb.a')).toBe(false)
    expect(s.data.get('keepMe')).toBe('3')
  })

  it('重置空 storage → 0', () => {
    expect(resetAllSettings(memStorage())).toBe(0)
  })

  it('导入到 storage=null → 0（不抛）', () => {
    expect(importSettings({ version: 1, entries: { 'mb.a': '1' } }, null)).toBe(0)
  })
})

describe('settingsStore：已登记键清单', () => {
  it('四个键都与既有实现一致（防漂移）', () => {
    expect(SETTINGS_KEYS).toEqual({
      visibleTypes: 'mb.visibleTypes',
      gameStyle: 'mb.gameStyle',
      imageGenConfig: 'mb.imageGenConfig',
      dataDiffBaseline: 'mb.dataDiffBaseline',
      theme: 'mb.theme'
    })
  })

  it('所有登记键都带 mb. 前缀', () => {
    for (const key of Object.values(SETTINGS_KEYS)) {
      expect(key.startsWith(SETTINGS_KEY_PREFIX)).toBe(true)
    }
  })
})
