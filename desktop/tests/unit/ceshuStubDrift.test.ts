import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

import { CHAPTER_KEYS } from '../../src/shared/ceshu/reference/ceshuConstants'

/**
 * preview-stub.js 章节列表漂移守卫。
 *
 * `preview/preview-stub.js` 是「纯浏览器预览桩」，它**手写了一份** `CHAPTER_KEYS`
 * 来给 DOC 每个章建空对象骨架。这份副本与 `src/shared/ceshu/reference/ceshuConstants.ts` 的
 * `CHAPTER_KEYS` 没有任何编译期联动——历史上 P2 扩展设计补了 7 章后，stub 没同步，
 * 缺失的章 `doc[chapter] === undefined`，渲染层 `Object.keys(undefined)` 直接白屏，
 * 而这份断裂只有「打开预览」时才暴露，typecheck / 业务测试都抓不到。
 *
 * 这里把「stub 的章节集合 ≡ 真实 CHAPTER_KEYS」锁死：缺章 / 多章 / 写错 key 都立刻红灯。
 * 真值用源码导出的 `CHAPTER_KEYS`，避免又造一份字符串清单（双维护必漂移）。
 */

const STUB_PATH = join(__dirname, '..', '..', 'preview', 'preview-stub.js')

function extractStubChapterKeys(): string[] {
  const text = readFileSync(STUB_PATH, 'utf-8')
  const match = text.match(/const CHAPTER_KEYS = \[([\s\S]*?)\]/)
  if (!match) return []
  return [...match[1].matchAll(/'([^']+)'/g)].map((m) => m[1])
}

const stubKeys = extractStubChapterKeys()
// 显式标 string[]：stub 侧解析出来的是裸字符串，Set<string> 才能直接 `.has(string)`
const realKeys: string[] = [...CHAPTER_KEYS]

describe('preview-stub.js 章节列表漂移守卫', () => {
  it('preview-stub.js 含 CHAPTER_KEYS 字面量', () => {
    expect(stubKeys.length, 'preview-stub.js 找不到 `const CHAPTER_KEYS = [...]`').toBeGreaterThan(0)
  })

  it('stub 章节集合 ≡ 真实 CHAPTER_KEYS（不缺、不多、数量一致）', () => {
    const stubSet = new Set(stubKeys)
    const realSet = new Set(realKeys)
    const missing = realKeys.filter((k) => !stubSet.has(k))
    const extra = stubKeys.filter((k) => !realSet.has(k))
    expect(missing, `stub 缺章（会导致这些章白屏）：${missing.join(', ')}`).toEqual([])
    expect(extra, `stub 含不存在的章：${extra.join(', ')}`).toEqual([])
    expect(stubKeys, 'stub 与真实章节数量不一致').toHaveLength(realKeys.length)
  })

  it('stub 每个 key 都是合法 ChapterKey', () => {
    const realSet = new Set(realKeys)
    for (const k of stubKeys) {
      expect(realSet.has(k), `stub 的 "${k}" 不是合法 ChapterKey`).toBe(true)
    }
  })
})
