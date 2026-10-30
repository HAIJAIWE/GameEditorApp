import { describe, expect, it } from 'vitest'

import {
  migrateLegacyApiKey,
  readLegacyImageGenApiKey,
  stripLegacyImageGenApiKey
} from '../../src/shared/config/secrets/secretMigration'
import { IMAGE_GEN_CONFIG_KEY } from '../../src/shared/config/llm/imageGenConfig'
import { SECRET_NAMES } from '../../src/shared/config/secrets/secretNames'
import type { StorageLike } from '../../src/shared/config/settings/settingsStore'

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

/** 假 setSecret：记录调用，返回可控结果 */
function fakeSetSecret(result: { ok: boolean; error?: string } = { ok: true }): {
  fn: (name: string, plaintext: string) => Promise<{ ok: boolean; error?: string }>
  calls: Array<{ name: string; plaintext: string }>
} {
  const calls: Array<{ name: string; plaintext: string }> = []
  return {
    calls,
    fn: async (name, plaintext) => {
      calls.push({ name, plaintext })
      return result
    }
  }
}

/** 造一份 E22 时期的 localStorage 现场（mb.imageGenConfig 里带明文 apiKey） */
function legacyStorage(apiKey: string, extra: Record<string, unknown> = {}): ReturnType<typeof fakeStorage> {
  return fakeStorage({
    [IMAGE_GEN_CONFIG_KEY]: JSON.stringify({ provider: 'qwen', apiKey, model: 'qwen-vl-max', ...extra })
  })
}

describe('readLegacyImageGenApiKey：读旧明文', () => {
  it('读到旧明文并去空白', () => {
    expect(readLegacyImageGenApiKey(legacyStorage('  sk-legacy  '))).toBe('sk-legacy')
  })

  it('键缺失 / 空串 / JSON 损坏 / 非对象 / 字段非字符串 → null', () => {
    expect(readLegacyImageGenApiKey(fakeStorage())).toBeNull()
    expect(readLegacyImageGenApiKey(fakeStorage({ [IMAGE_GEN_CONFIG_KEY]: '' }))).toBeNull()
    expect(readLegacyImageGenApiKey(fakeStorage({ [IMAGE_GEN_CONFIG_KEY]: '{not json' }))).toBeNull()
    expect(readLegacyImageGenApiKey(fakeStorage({ [IMAGE_GEN_CONFIG_KEY]: 'null' }))).toBeNull()
    expect(readLegacyImageGenApiKey(fakeStorage({ [IMAGE_GEN_CONFIG_KEY]: '[1,2]' }))).toBeNull()
    expect(
      readLegacyImageGenApiKey(fakeStorage({ [IMAGE_GEN_CONFIG_KEY]: JSON.stringify({ apiKey: 123 }) }))
    ).toBeNull()
  })

  it('只有空白字符 → null', () => {
    expect(readLegacyImageGenApiKey(legacyStorage('   '))).toBeNull()
  })

  it('storage 为 null → null（不抛）', () => {
    expect(readLegacyImageGenApiKey(null)).toBeNull()
  })
})

describe('stripLegacyImageGenApiKey：抹掉明文字段', () => {
  it('只删 apiKey，保留 provider/model/baseUrl', () => {
    const storage = legacyStorage('sk-legacy', { baseUrl: 'https://x/v1' })
    expect(stripLegacyImageGenApiKey(storage)).toBe(true)
    expect(JSON.parse(storage.getItem(IMAGE_GEN_CONFIG_KEY) ?? '{}')).toEqual({
      provider: 'qwen',
      model: 'qwen-vl-max',
      baseUrl: 'https://x/v1'
    })
  })

  it('删后无 apiKey 残留', () => {
    const storage = legacyStorage('sk-legacy')
    stripLegacyImageGenApiKey(storage)
    expect(storage.getItem(IMAGE_GEN_CONFIG_KEY) ?? '').not.toContain('apiKey')
    expect(storage.getItem(IMAGE_GEN_CONFIG_KEY) ?? '').not.toContain('sk-legacy')
  })

  it('键缺失或本就没有 apiKey → true 且不动存储', () => {
    const empty = fakeStorage()
    expect(stripLegacyImageGenApiKey(empty)).toBe(true)
    expect(empty.data.size).toBe(0)

    const noKey = fakeStorage({ [IMAGE_GEN_CONFIG_KEY]: JSON.stringify({ provider: 'openai' }) })
    expect(stripLegacyImageGenApiKey(noKey)).toBe(true)
    expect(JSON.parse(noKey.getItem(IMAGE_GEN_CONFIG_KEY) ?? '{}')).toEqual({ provider: 'openai' })
  })

  it('JSON 损坏 → 整个键删掉', () => {
    const storage = fakeStorage({ [IMAGE_GEN_CONFIG_KEY]: '{not json' })
    expect(stripLegacyImageGenApiKey(storage)).toBe(true)
    expect(storage.data.has(IMAGE_GEN_CONFIG_KEY)).toBe(false)
  })

  it('storage 为 null / setItem 抛错 → false（不抛）', () => {
    expect(stripLegacyImageGenApiKey(null)).toBe(false)
    const quotaFull: StorageLike = {
      getItem: () => JSON.stringify({ apiKey: 'sk' }),
      setItem: () => {
        throw new Error('quota exceeded')
      },
      removeItem: () => undefined
    }
    expect(stripLegacyImageGenApiKey(quotaFull)).toBe(false)
  })
})

describe('migrateLegacyApiKey：一次性迁移', () => {
  it('旧 key 被写入系统钥匙串（用 SECRET_NAMES.imageGenApiKey）', async () => {
    const storage = legacyStorage('sk-legacy')
    const setter = fakeSetSecret()
    const result = await migrateLegacyApiKey(readLegacyImageGenApiKey(storage), setter.fn, storage)

    expect(result).toEqual({ migrated: true, reason: 'migrated' })
    expect(setter.calls).toEqual([{ name: SECRET_NAMES.imageGenApiKey, plaintext: 'sk-legacy' }])
  })

  it('旧 key 被从 localStorage 清除，且无 apiKey 残留', async () => {
    const storage = legacyStorage('sk-legacy')
    const setter = fakeSetSecret()
    await migrateLegacyApiKey(readLegacyImageGenApiKey(storage), setter.fn, storage)

    const raw = storage.getItem(IMAGE_GEN_CONFIG_KEY) ?? ''
    expect(raw).not.toContain('sk-legacy')
    expect(raw).not.toContain('apiKey')
    // 表单其余字段保留
    expect(JSON.parse(raw)).toEqual({ provider: 'qwen', model: 'qwen-vl-max' })
  })

  it('无旧 key → 不调用 setSecret', async () => {
    const storage = fakeStorage()
    const setter = fakeSetSecret()
    const result = await migrateLegacyApiKey(readLegacyImageGenApiKey(storage), setter.fn, storage)

    expect(setter.calls).toHaveLength(0)
    expect(result).toEqual({ migrated: false, reason: 'no-legacy-key' })
  })

  it('旧 key 为纯空白 → 不调用 setSecret，且清掉空白残留字段', async () => {
    const storage = legacyStorage('   ')
    const setter = fakeSetSecret()
    const result = await migrateLegacyApiKey(readLegacyImageGenApiKey(storage), setter.fn, storage)

    expect(setter.calls).toHaveLength(0)
    expect(result.reason).toBe('no-legacy-key')
    expect(storage.getItem(IMAGE_GEN_CONFIG_KEY) ?? '').not.toContain('apiKey')
  })

  it('写入失败 → 仍抹掉 localStorage 明文（安全优先），并带回原因', async () => {
    const storage = legacyStorage('sk-legacy')
    const setter = fakeSetSecret({ ok: false, error: 'safeStorage 不可用' })
    const result = await migrateLegacyApiKey(readLegacyImageGenApiKey(storage), setter.fn, storage)

    expect(result.migrated).toBe(false)
    expect(result.reason).toBe('secret-write-failed')
    expect(result.error).toContain('safeStorage 不可用')
    expect(storage.getItem(IMAGE_GEN_CONFIG_KEY) ?? '').not.toContain('sk-legacy')
  })

  it('setSecret 抛异常 → 视为写入失败，不把异常抛给调用方，且明文仍被抹掉', async () => {
    const storage = legacyStorage('sk-legacy')
    const result = await migrateLegacyApiKey(
      'sk-legacy',
      async () => {
        throw new Error('IPC 断了')
      },
      storage
    )

    expect(result.reason).toBe('secret-write-failed')
    expect(result.error).toContain('IPC 断了')
    expect(storage.getItem(IMAGE_GEN_CONFIG_KEY) ?? '').not.toContain('sk-legacy')
  })

  it('旧 key 过长（非法）→ 不写入，直接清除并提示重配', async () => {
    const storage = legacyStorage('x'.repeat(5000))
    const setter = fakeSetSecret()
    const result = await migrateLegacyApiKey(readLegacyImageGenApiKey(storage), setter.fn, storage)

    expect(setter.calls).toHaveLength(0)
    expect(result.reason).toBe('invalid-legacy-key')
    expect(storage.getItem(IMAGE_GEN_CONFIG_KEY) ?? '').not.toContain('apiKey')
  })

  it('旧 key 含 NUL → 判非法，不写入且清除', async () => {
    // 含 NUL 字符的旧明文（真 NUL，不是字面量 '\0'）
    const storage = legacyStorage('sk-\u0000bad')
    const setter = fakeSetSecret()
    const result = await migrateLegacyApiKey(readLegacyImageGenApiKey(storage), setter.fn, storage)

    expect(result.reason).toBe('invalid-legacy-key')
    expect(setter.calls).toHaveLength(0)
    expect(storage.getItem(IMAGE_GEN_CONFIG_KEY) ?? '').not.toContain('apiKey')
  })

  it('storage 不可用 → 不动任何东西', async () => {
    const setter = fakeSetSecret()
    const result = await migrateLegacyApiKey('sk-legacy', setter.fn, null)

    expect(result.reason).toBe('storage-unavailable')
    expect(setter.calls).toHaveLength(0)
  })

  it('可指定目标 secret 名（未来扩展到别的 key）', async () => {
    const storage = legacyStorage('sk-legacy')
    const setter = fakeSetSecret()
    await migrateLegacyApiKey('sk-legacy', setter.fn, storage, 'llm.apiKey')
    expect(setter.calls[0]?.name).toBe('llm.apiKey')
  })
})
