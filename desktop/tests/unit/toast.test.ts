import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import {
  clearToasts,
  DEFAULT_TOAST_DURATION,
  dismissToast,
  getToasts,
  MAX_DURATION,
  MAX_VISIBLE,
  MIN_DURATION,
  normalizeDuration,
  showToast,
  subscribeToasts
} from '../../src/shared/toast'

describe('normalizeDuration：时长夹紧', () => {
  it('默认 3000（对齐 PyQt duration=3000）', () => {
    expect(DEFAULT_TOAST_DURATION).toBe(3000)
  })

  it('过小/过大被夹到边界', () => {
    expect(normalizeDuration(0)).toBe(MIN_DURATION)
    expect(normalizeDuration(-100)).toBe(MIN_DURATION)
    expect(normalizeDuration(999_999)).toBe(MAX_DURATION)
  })

  it('NaN / Infinity 回落默认（不产生永不消失的 Toast）', () => {
    expect(normalizeDuration(Number.NaN)).toBe(DEFAULT_TOAST_DURATION)
    expect(normalizeDuration(Number.POSITIVE_INFINITY)).toBe(DEFAULT_TOAST_DURATION)
  })

  it('合法值原样保留', () => {
    expect(normalizeDuration(4000)).toBe(4000)
  })
})

describe('showToast：弹出与队列', () => {
  beforeEach(() => {
    clearToasts()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    clearToasts()
  })

  it('弹出后立即可读到', () => {
    const id = showToast('保存成功')
    expect(id).toBeGreaterThan(0)
    expect(getToasts()).toHaveLength(1)
    expect(getToasts()[0]).toMatchObject({ text: '保存成功', kind: 'default', duration: 3000 })
  })

  it('kind 支持 success / error（对齐 PyQt 三套样式）', () => {
    showToast('删除成功', { kind: 'success' })
    showToast('删除失败', { kind: 'error' })
    expect(getToasts().map((t) => t.kind)).toEqual(['success', 'error'])
  })

  it('空文本/纯空格不弹（不制造视觉噪音）', () => {
    expect(showToast('')).toBe(-1)
    expect(showToast('   ')).toBe(-1)
    expect(getToasts()).toHaveLength(0)
  })

  it('文本两端空白被 trim', () => {
    showToast('  已保存  ')
    expect(getToasts()[0]?.text).toBe('已保存')
  })

  it('到时自动消失（核心行为）', () => {
    showToast('保存成功', { duration: 1000 })
    expect(getToasts()).toHaveLength(1)
    vi.advanceTimersByTime(999)
    expect(getToasts()).toHaveLength(1)
    vi.advanceTimersByTime(2)
    expect(getToasts()).toHaveLength(0)
  })

  it('多条并存（PyQt 是单实例覆盖，TS 刻意支持并存）', () => {
    showToast('一')
    showToast('二')
    expect(getToasts().map((t) => t.text)).toEqual(['一', '二'])
  })

  it('超过 MAX_VISIBLE 时丢弃**最旧的**，保证最新反馈可见', () => {
    for (const t of ['一', '二', '三', '四'] as const) showToast(t)
    expect(getToasts()).toHaveLength(MAX_VISIBLE)
    expect(getToasts().map((t) => t.text)).toEqual(['二', '三', '四'])
  })

  it('被挤掉的 Toast 其定时器也被清理（不留悬挂定时器）', () => {
    vi.useRealTimers()
    clearToasts()
    const spy = vi.spyOn(globalThis, 'clearTimeout')
    for (const t of ['一', '二', '三', '四'] as const) showToast(t, { duration: 5000 })
    // 「一」被丢弃 ⇒ 必然调用过一次 clearTimeout
    expect(spy).toHaveBeenCalled()
    spy.mockRestore()
  })

  it('id 单调递增且唯一（即便同文本）', () => {
    const a = showToast('同文本')
    const b = showToast('同文本')
    expect(b).toBeGreaterThan(a)
  })

  it('dismissToast 主动移除指定条', () => {
    const a = showToast('一')
    showToast('二')
    dismissToast(a)
    expect(getToasts().map((t) => t.text)).toEqual(['二'])
  })

  it('dismissToast 传不存在的 id 不报错、不广播（避免无谓重渲染）', () => {
    showToast('一')
    const before = getToasts()
    dismissToast(999999)
    expect(getToasts()).toBe(before) // 引用未变 ⇒ 说明没广播
  })

  it('clearToasts 清空全部', () => {
    showToast('一')
    showToast('二')
    clearToasts()
    expect(getToasts()).toHaveLength(0)
  })

  it('⚠️ getToasts 返回稳定引用（useSyncExternalStore 要求，否则无限重渲染）', () => {
    showToast('一')
    const a = getToasts()
    const b = getToasts()
    expect(a).toBe(b)
  })
})

describe('subscribeToasts：订阅与退订', () => {
  beforeEach(() => {
    clearToasts()
    vi.useFakeTimers()
  })
  afterEach(() => {
    vi.useRealTimers()
    clearToasts()
  })

  it('showToast 会通知订阅者', () => {
    let calls = 0
    const unsub = subscribeToasts(() => {
      calls += 1
    })
    showToast('一')
    expect(calls).toBe(1)
    unsub()
  })

  it('退订后不再收到通知', () => {
    let calls = 0
    const unsub = subscribeToasts(() => {
      calls += 1
    })
    unsub()
    showToast('一')
    expect(calls).toBe(0)
  })

  it('dismiss 也通知；无变化时静默（不重渲染）', () => {
    let calls = 0
    const unsub = subscribeToasts(() => {
      calls += 1
    })
    showToast('一')
    expect(calls).toBe(1)
    dismissToast(123456) // 不存在 ⇒ 不应广播
    expect(calls).toBe(1)
    unsub()
  })

  it('⚠️ 同一 listener 重复订阅不会重复触发（Set 去重）', () => {
    let calls = 0
    const fn = (): void => {
      calls += 1
    }
    const un1 = subscribeToasts(fn)
    const un2 = subscribeToasts(fn)
    showToast('一')
    expect(calls).toBe(1)
    un1()
    un2()
  })
})
