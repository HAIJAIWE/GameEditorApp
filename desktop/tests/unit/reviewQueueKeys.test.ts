import { describe, expect, it } from 'vitest'

import { REVIEW_QUEUE_KEY_HINT, resolveReviewQueueKey } from '../../src/renderer/src/reviewQueueKeys'

function resolve(key: string, extra: Partial<Parameters<typeof resolveReviewQueueKey>[0]> = {}) {
  return resolveReviewQueueKey({ key, queueLength: 3, ...extra })
}

describe('resolveReviewQueueKey：审阅队列快捷键解析', () => {
  it('j/k 与方向键映射上下条', () => {
    expect(resolve('j')).toBe('next')
    expect(resolve('ArrowDown')).toBe('next')
    expect(resolve('k')).toBe('prev')
    expect(resolve('ArrowUp')).toBe('prev')
  })

  it('a 接受 / v 查看 / Esc 关闭', () => {
    expect(resolve('a')).toBe('accept')
    expect(resolve('v')).toBe('goto')
    expect(resolve('Escape')).toBe('close')
  })

  it('大小写不敏感（Shift+j 也是 next）', () => {
    expect(resolve('J')).toBe('next')
    expect(resolve('A')).toBe('accept')
  })

  it('可编辑元素内不拦截（打字优先）', () => {
    expect(resolve('a', { editable: true })).toBeNull()
    expect(resolve('j', { editable: true })).toBeNull()
    // Esc 也放行：输入框内的 Esc 可能是「取消编辑」，不该被我们吞掉
    expect(resolve('Escape', { editable: true })).toBeNull()
  })

  it('组合键放行（Ctrl+R / Cmd+A 等系统快捷键不是我们的）', () => {
    expect(resolve('a', { ctrlKey: true })).toBeNull()
    expect(resolve('r', { metaKey: true })).toBeNull()
    expect(resolve('j', { altKey: true })).toBeNull()
  })

  it('空队列只认 Esc（其余动作没有作用对象）', () => {
    expect(resolveReviewQueueKey({ key: 'Escape', queueLength: 0 })).toBe('close')
    expect(resolveReviewQueueKey({ key: 'a', queueLength: 0 })).toBeNull()
    expect(resolveReviewQueueKey({ key: 'j', queueLength: 0 })).toBeNull()
  })

  it('无关键返回 null', () => {
    expect(resolve('x')).toBeNull()
    expect(resolve('Enter')).toBeNull()
    expect(resolve(' ')).toBeNull()
  })

  it('提示文案与键位一致（含全部五个动作）', () => {
    expect(REVIEW_QUEUE_KEY_HINT).toContain('j')
    expect(REVIEW_QUEUE_KEY_HINT).toContain('k')
    expect(REVIEW_QUEUE_KEY_HINT).toContain('a')
    expect(REVIEW_QUEUE_KEY_HINT).toContain('v')
    expect(REVIEW_QUEUE_KEY_HINT).toContain('Esc')
  })
})
