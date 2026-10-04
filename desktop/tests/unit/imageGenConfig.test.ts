import { describe, expect, it } from 'vitest'

import {
  DEFAULT_IMAGE_GEN_CONFIG,
  IMAGE_GEN_CONFIG_KEY,
  loadImageGenConfig,
  saveImageGenConfig
} from '../../src/shared/imageGenConfig'
import type { StorageLike, StoredImageGenConfig } from '../../src/shared/imageGenConfig'

/** 内存版 StorageLike（Node 下无 localStorage） */
function fakeStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>(Object.entries(initial))
  return {
    data,
    getItem: (key) => data.get(key) ?? null,
    setItem: (key, value) => {
      data.set(key, value)
    },
    removeItem: (key) => {
      data.delete(key)
    }
  }
}

describe('imageGenConfig：默认值', () => {
  it('DEFAULT_IMAGE_GEN_CONFIG 是 openai + 全空', () => {
    expect(DEFAULT_IMAGE_GEN_CONFIG).toEqual({ provider: 'openai', apiKey: '', model: '', baseUrl: '' })
  })

  it('默认值不被 load/save 改动（返回副本）', () => {
    const storage = fakeStorage()
    const loaded = loadImageGenConfig(storage)
    loaded.provider = 'qwen'
    loaded.apiKey = 'mutated'
    expect(DEFAULT_IMAGE_GEN_CONFIG.provider).toBe('openai')
    expect(DEFAULT_IMAGE_GEN_CONFIG.apiKey).toBe('')
    // 再读一次仍应是默认（未被上一步污染）
    expect(loadImageGenConfig(fakeStorage()).provider).toBe('openai')
  })
})

describe('imageGenConfig：读取', () => {
  it('storage 为 null → 返回默认值且不抛', () => {
    expect(loadImageGenConfig(null)).toEqual(DEFAULT_IMAGE_GEN_CONFIG)
  })

  it('键缺失 → 返回默认值', () => {
    expect(loadImageGenConfig(fakeStorage())).toEqual(DEFAULT_IMAGE_GEN_CONFIG)
  })

  it('空字符串 → 返回默认值', () => {
    expect(loadImageGenConfig(fakeStorage({ [IMAGE_GEN_CONFIG_KEY]: '' }))).toEqual(DEFAULT_IMAGE_GEN_CONFIG)
  })

  it('JSON 损坏 → 返回默认值（不抛）', () => {
    const storage = fakeStorage({ [IMAGE_GEN_CONFIG_KEY]: '{not json' })
    expect(loadImageGenConfig(storage)).toEqual(DEFAULT_IMAGE_GEN_CONFIG)
  })

  it('JSON 为 null/数组/数字 → 返回默认值', () => {
    expect(loadImageGenConfig(fakeStorage({ [IMAGE_GEN_CONFIG_KEY]: 'null' }))).toEqual(
      DEFAULT_IMAGE_GEN_CONFIG
    )
    expect(loadImageGenConfig(fakeStorage({ [IMAGE_GEN_CONFIG_KEY]: '[1,2]' }))).toEqual(
      DEFAULT_IMAGE_GEN_CONFIG
    )
    expect(loadImageGenConfig(fakeStorage({ [IMAGE_GEN_CONFIG_KEY]: '42' }))).toEqual(
      DEFAULT_IMAGE_GEN_CONFIG
    )
  })

  it('getItem 抛错 → 返回默认值（不抛）', () => {
    const broken: StorageLike = {
      getItem: () => {
        throw new Error('denied')
      },
      setItem: () => undefined,
      removeItem: () => undefined
    }
    expect(loadImageGenConfig(broken)).toEqual(DEFAULT_IMAGE_GEN_CONFIG)
  })
})

describe('imageGenConfig：字段级容错', () => {
  it('provider 非法 → 回落 openai，其余字段正常读', () => {
    const storage = fakeStorage({
      [IMAGE_GEN_CONFIG_KEY]: JSON.stringify({ provider: 'not-a-provider', apiKey: 'k', model: 'm' })
    })
    expect(loadImageGenConfig(storage)).toEqual({ provider: 'openai', apiKey: 'k', model: 'm', baseUrl: '' })
  })

  it('缺字段 → 该字段回落默认（不补 undefined 键）', () => {
    const storage = fakeStorage({ [IMAGE_GEN_CONFIG_KEY]: JSON.stringify({ provider: 'doubao' }) })
    expect(loadImageGenConfig(storage)).toEqual({ provider: 'doubao', apiKey: '', model: '', baseUrl: '' })
  })

  it('字段类型不对（数字/对象）→ 回落空串', () => {
    const storage = fakeStorage({
      [IMAGE_GEN_CONFIG_KEY]: JSON.stringify({ provider: 'qwen', apiKey: 123, model: { a: 1 }, baseUrl: null })
    })
    expect(loadImageGenConfig(storage)).toEqual({ provider: 'qwen', apiKey: '', model: '', baseUrl: '' })
  })

  it('四个合法 provider 都能读回', () => {
    for (const provider of ['openai', 'qwen', 'doubao', 'generic'] as const) {
      const storage = fakeStorage({ [IMAGE_GEN_CONFIG_KEY]: JSON.stringify({ provider }) })
      expect(loadImageGenConfig(storage).provider).toBe(provider)
    }
  })
})

describe('imageGenConfig：写入', () => {
  it('save → load 往返一致', () => {
    const storage = fakeStorage()
    const config: StoredImageGenConfig = {
      provider: 'generic',
      apiKey: 'sk-test',
      model: 'my-model',
      baseUrl: 'https://example.com/v1'
    }
    saveImageGenConfig(config, storage)
    expect(loadImageGenConfig(storage)).toEqual(config)
  })

  it('写入使用固定键名', () => {
    const storage = fakeStorage()
    saveImageGenConfig({ ...DEFAULT_IMAGE_GEN_CONFIG }, storage)
    expect(storage.data.has(IMAGE_GEN_CONFIG_KEY)).toBe(true)
  })

  it('storage 为 null → 静默 no-op（不抛）', () => {
    expect(() => saveImageGenConfig(DEFAULT_IMAGE_GEN_CONFIG, null)).not.toThrow()
  })

  it('setItem 抛错 → 静默 no-op（不抛）', () => {
    const broken: StorageLike = {
      getItem: () => null,
      setItem: () => {
        throw new Error('quota exceeded')
      },
      removeItem: () => undefined
    }
    expect(() => saveImageGenConfig(DEFAULT_IMAGE_GEN_CONFIG, broken)).not.toThrow()
  })

  it('后写覆盖前写', () => {
    const storage = fakeStorage()
    saveImageGenConfig({ ...DEFAULT_IMAGE_GEN_CONFIG, apiKey: 'first' }, storage)
    saveImageGenConfig({ ...DEFAULT_IMAGE_GEN_CONFIG, apiKey: 'second' }, storage)
    expect(loadImageGenConfig(storage).apiKey).toBe('second')
  })
})
