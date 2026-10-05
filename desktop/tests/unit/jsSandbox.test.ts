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

  // 该用例故意执行无界内存分配，靠沙箱自身的 timeoutMs:2000 / memoryLimitMb:32 终止，
  // 因此**墙钟耗时不可控**：正常约 1.6-1.8s，但 vitest 默认 94 个 worker 并行（isolate
  // 模式下每文件一个 worker）会 CPU 过订阅，墙钟可被拉到 5s 以上，撞上 vitest 默认的
  // 5000ms 用例超时——那是**测试基建的竞速**，与本用例要断言的沙箱行为无关（实测在
  // --testTimeout=60000 下必过，且满载时失败信息恒为 "Test timed out in 5000ms"）。
  // 故显式放宽本用例的用例级超时，断言保持原样（仍要求 result.ok === false）。
  it('内存炸弹被上限终止（不会拖垮宿主）', { timeout: 30000 }, async () => {
    const result = await runInSandbox('const a = []; while (true) { a.push(new Array(100000).fill(1)) }', {
      timeoutMs: 2000,
      memoryLimitMb: 32
    })
    expect(result.ok).toBe(false)
  })
})