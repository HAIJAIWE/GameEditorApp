import { describe, expect, it } from 'vitest'

import { runInSandbox } from '../../src/main/security/jsSandbox'

/**
 * JS 沙箱预演测试（Phase 1）：
 * 验证白名单隔离、超时中断、内存上限三条防线在 WASM QuickJS 下真实生效。
 */
describe('JS 沙箱预演', () => {
  it('可执行纯计算代码并返回结果', async () => {
    const result = await runInSandbox<number>('return 1 + 2')
    expect(result).toEqual({ ok: true, value: 3 })
  })

  it('宿主能力默认不可见（白名单为空）', async () => {
    const result = await runInSandbox<{ req: string; proc: string; globalThis: string }>(
      'return { req: typeof require, proc: typeof process, globalThis: typeof globalThis.fetch }'
    )
    expect(result.ok).toBe(true)
    expect(result.value).toEqual({ req: 'undefined', proc: 'undefined', globalThis: 'undefined' })
  })

  it('死循环被超时中断', async () => {
    const start = Date.now()
    const result = await runInSandbox('while (true) {}', { timeoutMs: 200 })
    expect(result.ok).toBe(false)
    expect(Date.now() - start).toBeLessThan(3000)
  })

  it('内存炸弹被上限终止（不会拖垮宿主）', async () => {
    const result = await runInSandbox('const a = []; while (true) { a.push(new Array(100000).fill(1)) }', {
      timeoutMs: 2000,
      memoryLimitMb: 32
    })
    expect(result.ok).toBe(false)
  })
})