/**
 * 循环卫生守卫单测（对齐 dsh `guard/repeat-tool-reminder`）。
 *
 * 覆盖三条核心设计：advisory 只提醒、链键用完整规范化参数、提醒文本有上限；
 * 以及 dsh 的 fail-loud 配置校验与 include/exclude 通配。
 */
import { describe, expect, it } from 'vitest'
import {
  DEFAULT_ARGUMENTS_PREVIEW_CHARS,
  GENTLE_REMINDER,
  RepeatCallGuard,
  canonicalizeArguments,
  previewArguments,
  validateThresholds,
  wildcardToRegExp
} from '../../src/shared/agent/guard/repeatCall'

describe('参数规范化（链键）', () => {
  it('属性顺序不同视为同一次调用（深度排序）', () => {
    const a = canonicalizeArguments({ b: 1, a: { d: 2, c: 3 } })
    const b = canonicalizeArguments({ a: { c: 3, d: 2 }, b: 1 })
    expect(a).toBe(b)
  })

  it('值不同则链键不同', () => {
    expect(canonicalizeArguments({ q: 'x' })).not.toBe(canonicalizeArguments({ q: 'y' }))
  })
})

describe('配置校验（fail-loud，不静默兜底）', () => {
  it('合法阈值升序返回', () => {
    expect(validateThresholds([5, 3])).toEqual([3, 5])
  })

  it('空阈值 / 小于 2 / 重复 都抛错', () => {
    expect(() => validateThresholds([])).toThrow()
    expect(() => validateThresholds([1])).toThrow()
    expect(() => validateThresholds([3, 3])).toThrow()
    expect(() => validateThresholds([2.5])).toThrow()
  })
})

describe('参数预览上限（提醒本身不能撑爆上下文）', () => {
  it('未超上限原样返回', () => {
    expect(previewArguments('abc', 500)).toBe('abc')
  })

  it('超上限头截断并标注省略量', () => {
    const preview = previewArguments('z'.repeat(600), 500)
    expect(preview).toContain('另有 100 字符')
    expect(preview.length).toBeLessThan(600)
  })
})

describe('通配匹配', () => {
  it('* 通配生效，其余元字符按字面', () => {
    expect(wildcardToRegExp('mcp_*').test('mcp_fetch')).toBe(true)
    expect(wildcardToRegExp('mcp_*').test('gameData/read')).toBe(false)
    expect(wildcardToRegExp('a.b').test('aXb')).toBe(false)
    expect(wildcardToRegExp('a.b').test('a.b')).toBe(true)
  })
})

describe('重复调用检测（advisory：只提醒，不改调用）', () => {
  it('前两次不提醒，第 3 次给温和提醒', () => {
    const guard = new RepeatCallGuard()
    const args = { path: 'a.md' }
    expect(guard.record('code/read', args)).toBeNull()
    expect(guard.record('code/read', args)).toBeNull()
    expect(guard.record('code/read', args)).toBe(GENTLE_REMINDER)
  })

  it('第 4 次不在阈值内（只在 3 / 5 / 8 提醒，不在每次都提醒）', () => {
    const guard = new RepeatCallGuard()
    const args = { path: 'a.md' }
    guard.record('code/read', args)
    guard.record('code/read', args)
    expect(guard.record('code/read', args)).toBe(GENTLE_REMINDER) // 第 3 次
    expect(guard.record('code/read', args)).toBeNull() // 第 4 次：不打扰
  })

  it('详细提醒内容含工具名与次数', () => {
    const guard = new RepeatCallGuard()
    const args = { path: 'a.md' }
    // 3→温和，4→无，5→详细
    guard.record('code/read', args)
    guard.record('code/read', args)
    guard.record('code/read', args)
    guard.record('code/read', args)
    const detailed = guard.record('code/read', args)
    expect(detailed).not.toBeNull()
    expect(detailed).toContain('code/read')
    expect(detailed).toContain('连续调用次数：5')
    expect(detailed).toContain('path')
  })

  it('换参数即断链（检测的是连续重复，不是累计）', () => {
    const guard = new RepeatCallGuard()
    guard.record('code/read', { path: 'a' })
    guard.record('code/read', { path: 'a' })
    expect(guard.record('code/read', { path: 'b' })).toBeNull() // 断链重置为 1
  })

  it('同参数但换工具也断链（链键含工具名）', () => {
    const guard = new RepeatCallGuard()
    guard.record('code/read', { path: 'a' })
    guard.record('code/read', { path: 'a' })
    expect(guard.record('data/read', { path: 'a' })).toBeNull()
  })

  it('exclude 的工具对链透明：既不计数也不重置', () => {
    const guard = new RepeatCallGuard({ exclude: ['mcp_*'] })
    const args = { path: 'a' }
    guard.record('code/read', args)
    guard.record('code/read', args)
    expect(guard.record('mcp_fetch', { url: 'u' })).toBeNull() // 被排除，不提醒
    // 链未被打断 ⇒ 下一次 code/read 仍算第 3 次
    expect(guard.record('code/read', args)).toBe(GENTLE_REMINDER)
  })

  it('include 只跟踪指定工具', () => {
    const guard = new RepeatCallGuard({ include: ['code/*'] })
    const args = { path: 'a' }
    for (let i = 0; i < 3; i += 1) expect(guard.record('data/read', args)).toBeNull()
    guard.record('code/read', args)
    guard.record('code/read', args)
    expect(guard.record('code/read', args)).toBe(GENTLE_REMINDER)
  })

  it('详细提醒里的参数被截断到上限', () => {
    const guard = new RepeatCallGuard({ argumentsPreviewChars: 20 })
    const args = { blob: 'x'.repeat(500) }
    // 前 4 次（其中第 3 次会温和提醒），第 5 次才是详细提醒
    for (let i = 0; i < 4; i += 1) guard.record('code/read', args)
    const detailed = guard.record('code/read', args)
    expect(detailed).not.toBeNull()
    expect(detailed).toContain('另有')
    expect(DEFAULT_ARGUMENTS_PREVIEW_CHARS).toBe(500)
  })
})
