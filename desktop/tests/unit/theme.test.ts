import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { applyTheme, DEFAULT_THEME, loadTheme, saveTheme, type ThemeMode } from '../../src/shared/theme'
import type { StorageLike } from '../../src/shared/settingsStore'

/** 内存版 StorageLike（只实现 theme 用到的三项；不实现 length/key） */
function memStorage(initial: Record<string, string> = {}): StorageLike & { data: Map<string, string> } {
  const data = new Map<string, string>(Object.entries(initial))
  return {
    data,
    getItem(key: string): string | null {
      return data.has(key) ? (data.get(key) as string) : null
    },
    setItem(key: string, value: string): void {
      data.set(key, value)
    },
    removeItem(key: string): void {
      data.delete(key)
    }
  }
}

describe('theme：读取与校验', () => {
  it('storage=null → 回落默认主题（浅色，对齐 PyQt「默认」）', () => {
    expect(loadTheme(null)).toBe(DEFAULT_THEME)
    expect(DEFAULT_THEME).toBe('light')
  })

  it('键缺失 → 回落默认主题', () => {
    expect(loadTheme(memStorage())).toBe(DEFAULT_THEME)
  })

  it('合法值 light / dark 原样返回', () => {
    expect(loadTheme(memStorage({ 'mb.theme': 'light' }))).toBe('light')
    expect(loadTheme(memStorage({ 'mb.theme': 'dark' }))).toBe('dark')
  })

  it('非法值（如 "blue" / 空串 / 数字） → 回落默认主题', () => {
    expect(loadTheme(memStorage({ 'mb.theme': 'blue' }))).toBe(DEFAULT_THEME)
    expect(loadTheme(memStorage({ 'mb.theme': '' }))).toBe(DEFAULT_THEME)
    expect(loadTheme(memStorage({ 'mb.theme': 'DARK' }))).toBe(DEFAULT_THEME)
  })
})

describe('theme：写入', () => {
  it('saveTheme 写入 mb.theme', () => {
    const s = memStorage()
    saveTheme('light', s)
    expect(s.data.get('mb.theme')).toBe('light')
  })
})

describe('theme：应用到 DOM', () => {
  let root: { attrs: Record<string, string>; setAttribute(k: string, v: string): void; removeAttribute(k: string): void }
  let original: unknown

  beforeEach(() => {
    original = (globalThis as { document?: unknown }).document
    root = {
      attrs: {},
      setAttribute(k: string, v: string) {
        this.attrs[k] = v
      },
      removeAttribute(k: string) {
        delete this.attrs[k]
      }
    }
    ;(globalThis as { document?: unknown }).document = { documentElement: root }
  })

  afterEach(() => {
    ;(globalThis as { document?: unknown }).document = original
  })

  it('light（默认档）→ 移除 data-theme（回退 :root 的浅色默认）', () => {
    root.attrs['data-theme'] = 'dark'
    applyTheme('light' as ThemeMode)
    expect(root.attrs['data-theme']).toBeUndefined()
  })

  it('dark → 设置 data-theme="dark"', () => {
    applyTheme('dark' as ThemeMode)
    expect(root.attrs['data-theme']).toBe('dark')
  })
})
