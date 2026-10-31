import { describe, expect, it } from 'vitest'

import {
  requestCodeView,
  subscribeCodeViewRequest,
  takeCodeViewRequest
} from '../../src/renderer/src/plugins/context'

/**
 * 「在代码面板打开某文件」的请求通道：单例语义（只关心最后一个请求），
 * 挂载前的请求暂存、取一次即清空，订阅者收到后续请求。
 */
describe('codeViewRequest', () => {
  it('request → 订阅者收到；take 取一次后清空；取消订阅后不再收到', () => {
    const seen: string[] = []
    const unsubscribe = subscribeCodeViewRequest((path) => seen.push(path))

    requestCodeView('a.ts')
    expect(seen).toEqual(['a.ts'])
    expect(takeCodeViewRequest()).toBe('a.ts')
    // 取过一次即清空（避免同一请求被重复消费）
    expect(takeCodeViewRequest()).toBeNull()

    // 单例语义：连发两个，挂载时取到最后一个
    requestCodeView('b.ts')
    requestCodeView('c.ts')
    expect(takeCodeViewRequest()).toBe('c.ts')

    unsubscribe()
    requestCodeView('d.ts')
    expect(seen).toEqual(['a.ts', 'b.ts', 'c.ts']) // 取消订阅后不再追加
  })
})
