import { mkdtempSync, readFileSync, rmSync, existsSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import {
  SECRET_FILE_NAME,
  SecretStore,
  isValidSecretName,
  isValidSecretPlaintext,
  parseSecretBundle,
  readSecretBundle,
  serializeSecretBundle
} from '../../src/main/settings/secretStore'

let dir: string

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'secretstore-'))
})

afterEach(() => {
  rmSync(dir, { recursive: true, force: true })
})

/** 假加密：可逆的 base64 变换（不是真加密，但足以验证「密文而非明文落盘」） */
function fakeEncrypt(plaintext: string): Buffer {
  return Buffer.from(`enc:${plaintext}`, 'utf-8')
}
function fakeDecrypt(cipher: Buffer): string {
  const raw = cipher.toString('utf-8')
  if (!raw.startsWith('enc:')) {
    throw new Error('密文格式不对')
  }
  return raw.slice(4)
}

function makeStore(available = true): SecretStore {
  return new SecretStore(dir, () => available, fakeEncrypt, fakeDecrypt)
}

describe('校验：secret 名', () => {
  it('接受字母数字 . _ -', () => {
    for (const name of ['apiKey', 'image_gen.api-key', 'a', 'A1_-.b']) {
      expect(isValidSecretName(name)).toBe(true)
    }
  })

  it('拒绝空/超长/含路径分隔符/含 ..', () => {
    for (const name of ['', 'a'.repeat(65), 'a/b', 'a\\b', '../x', 'a..b', 'a b', 'a\n']) {
      expect(isValidSecretName(name)).toBe(false)
    }
  })
})

describe('校验：明文', () => {
  it('接受非空、限内、无 NUL', () => {
    expect(isValidSecretPlaintext('sk-abc')).toBe(true)
  })

  it('拒绝空串 / 含 NUL / 超长（>4096）', () => {
    expect(isValidSecretPlaintext('')).toBe(false)
    expect(isValidSecretPlaintext('a\0b')).toBe(false)
    expect(isValidSecretPlaintext('x'.repeat(4097))).toBe(false)
  })
})

describe('parseSecretBundle：容错解析', () => {
  it('null / 空串 → 空清单', () => {
    expect(parseSecretBundle(null)).toEqual({ version: 1, entries: {} })
    expect(parseSecretBundle('')).toEqual({ version: 1, entries: {} })
  })

  it('JSON 损坏 → 空清单（不抛）', () => {
    expect(parseSecretBundle('{broken')).toEqual({ version: 1, entries: {} })
  })

  it('结构不对（null / 数组 / 版本号错 / entries 非对象）→ 空清单', () => {
    expect(parseSecretBundle('null')).toEqual({ version: 1, entries: {} })
    expect(parseSecretBundle('[1,2]')).toEqual({ version: 1, entries: {} })
    expect(parseSecretBundle(JSON.stringify({ version: 2, entries: { a: 'c' } }))).toEqual({
      version: 1,
      entries: {}
    })
    expect(parseSecretBundle(JSON.stringify({ version: 1, entries: null }))).toEqual({
      version: 1,
      entries: {}
    })
  })

  it('逐项过滤：非法名/非字符串/空密文被丢弃，合法项保留', () => {
    const raw = JSON.stringify({
      version: 1,
      entries: {
        good: 'Y2lwaGVy',
        'bad/name': 'Y2lwaGVy',
        notString: 123 as unknown as string,
        emptyCipher: ''
      }
    })
    expect(parseSecretBundle(raw)).toEqual({ version: 1, entries: { good: 'Y2lwaGVy' } })
  })

  it('序列化 → 解析 往返一致', () => {
    const bundle = { version: 1 as const, entries: { a: 'x', b: 'y' } }
    expect(parseSecretBundle(serializeSecretBundle(bundle))).toEqual(bundle)
  })
})

describe('SecretStore：写入与读取', () => {
  it('写入后可读回明文', async () => {
    const store = makeStore()
    expect(await store.set('imageGen', 'sk-secret-123')).toEqual({ ok: true })
    const got = await store.get('imageGen')
    expect(got).toEqual({ ok: true, plaintext: 'sk-secret-123' })
  })

  it('落盘的是密文而非明文（关键安全断言）', async () => {
    const store = makeStore()
    await store.set('imageGen', 'sk-plaintext-KEY')
    const raw = readFileSync(join(dir, SECRET_FILE_NAME), 'utf-8')
    expect(raw).not.toContain('sk-plaintext-KEY')
    // 但能从中还原（说明是"可逆加密"而非丢弃）
    expect(parseSecretBundle(raw).entries.imageGen).toBeTruthy()
  })

  it('覆盖写：同名只保留最新值', async () => {
    const store = makeStore()
    await store.set('k', 'first')
    await store.set('k', 'second')
    expect(await store.get('k')).toEqual({ ok: true, plaintext: 'second' })
  })

  it('多个 secret 共存，互不覆盖', async () => {
    const store = makeStore()
    await store.set('a', 'va')
    await store.set('b', 'vb')
    expect(await store.listNames()).toEqual(['a', 'b'])
    expect(await store.get('a')).toEqual({ ok: true, plaintext: 'va' })
  })

  it('读未配置 → 报错「未配置该密钥」', async () => {
    expect(await makeStore().get('nope')).toEqual({ ok: false, error: '未配置该密钥' })
  })

  it('删除后读不到；删不存在的也返回 ok（幂等）', async () => {
    const store = makeStore()
    await store.set('k', 'v')
    expect(await store.remove('k')).toEqual({ ok: true })
    expect(await store.get('k').then((r) => r.ok)).toBe(false)
    expect(await store.remove('k')).toEqual({ ok: true })
  })
})

describe('SecretStore：入参校验', () => {
  it('非法名 → set/get/remove/has 全部拒绝', async () => {
    const store = makeStore()
    expect(await store.set('a/b', 'v')).toEqual({ ok: false, error: '非法的密钥名' })
    expect(await store.get('a/b')).toEqual({ ok: false, error: '非法的密钥名' })
    expect(await store.remove('a/b')).toEqual({ ok: false, error: '非法的密钥名' })
    expect(await store.has('a/b')).toBe(false)
  })

  it('空/超长明文 → 拒绝写入', async () => {
    const store = makeStore()
    expect(await store.set('k', '')).toEqual({ ok: false, error: '密钥内容为空或过长' })
    expect(await store.set('k', 'x'.repeat(4097))).toEqual({ ok: false, error: '密钥内容为空或过长' })
  })
})

describe('SecretStore：加密不可用时的行为（关键安全决策）', () => {
  it('available() 反映注入值', () => {
    expect(makeStore(true).available()).toBe(true)
    expect(makeStore(false).available()).toBe(false)
  })

  it('不可用 → 拒绝写入，且**不落任何文件**（绝不降级明文）', async () => {
    const store = makeStore(false)
    const result = await store.set('k', 'sk-should-never-hit-disk')
    expect(result.ok).toBe(false)
    if (!result.ok) {
      expect(result.error).toContain('拒绝保存明文密钥')
    }
    expect(existsSync(join(dir, SECRET_FILE_NAME))).toBe(false)
  })

  it('不可用 → 无法解密', async () => {
    // 先用可用 store 写入，再换不可用的 store 读
    await makeStore(true).set('k', 'v')
    const got = await makeStore(false).get('k')
    expect(got.ok).toBe(false)
    if (!got.ok) {
      expect(got.error).toContain('无法解密')
    }
  })
})

describe('SecretStore：文件层容错', () => {
  it('目录里已有损坏文件 → has 返回 false 而非抛', async () => {
    writeFileSync(join(dir, SECRET_FILE_NAME), '{corrupted', 'utf-8')
    expect(await makeStore().has('k')).toBe(false)
  })

  it('写入不留 .tmp 残留', async () => {
    await makeStore().set('k', 'v')
    expect(existsSync(`${join(dir, SECRET_FILE_NAME)}.tmp`)).toBe(false)
  })

  it('readSecretBundle：文件不存在 → 空清单', async () => {
    expect(await readSecretBundle(dir)).toEqual({ version: 1, entries: {} })
  })

  it('解密抛错（密文被篡改）→ 返回错误而非崩', async () => {
    await makeStore().set('k', 'v')
    // 直接篡改密文内容
    const file = join(dir, SECRET_FILE_NAME)
    const bundle = parseSecretBundle(readFileSync(file, 'utf-8'))
    bundle.entries.k = 'bm90LWEtdmFsaWQtaW1lbQ==' // "not-a-valid-item"
    writeFileSync(file, serializeSecretBundle(bundle), 'utf-8')
    const got = await makeStore().get('k')
    expect(got.ok).toBe(false)
    if (!got.ok) {
      expect(got.error).toContain('解密失败')
    }
  })
})
