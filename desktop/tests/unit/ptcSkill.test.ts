import { describe, expect, it } from 'vitest'

import { createPtcSkill } from '../../src/main/agent/skills/ptcSkill'

interface Call {
  tool: string
  params: Record<string, unknown>
}

type R = { success: boolean; message: string; error?: string; data?: unknown }

function make() {
  const calls: Call[] = []
  const skill = createPtcSkill({
    executeGated: async (tool, params) => {
      calls.push({ tool, params })
      if (tool === 'boom') return { success: false, message: 'boom', error: 'EBOOM' }
      return { success: true, message: `ran:${tool}`, data: { tool } }
    }
  })
  return {
    calls,
    run: (params: Record<string, unknown>): Promise<R> => skill.execute(params, {}) as Promise<R>
  }
}

describe('system.ptc（程序化工具调用）', () => {
  it('脚本内 callTool 调工具并返回结果', async () => {
    const { run, calls } = make()
    const result = await run({
      action: 'run',
      code: 'const r = callTool("system.ceshu", { action: "list" }); return r.message;'
    })
    expect(result.success).toBe(true)
    expect(result.message).toContain('ran:system.ceshu')
    expect(calls).toEqual([{ tool: 'system.ceshu', params: { action: 'list' } }])
  })

  it('纯计算无需工具', async () => {
    const { run, calls } = make()
    const result = await run({ action: 'run', code: 'return 1 + 2;' })
    expect(result.success).toBe(true)
    expect(result.message).toBe('3')
    expect(calls).toHaveLength(0)
  })

  it('循环调用多次工具', async () => {
    const { run, calls } = make()
    const result = await run({
      action: 'run',
      code: 'let n = 0; for (let i = 0; i < 3; i++) { const r = callTool("t" + i, { i }); n += r.success ? 1 : 0; } return n;'
    })
    expect(result.success).toBe(true)
    expect(result.message).toBe('3')
    expect(calls).toHaveLength(3)
  })

  it('工具失败原样回灌给脚本', async () => {
    const { run } = make()
    const result = await run({
      action: 'run',
      code: 'const r = callTool("boom", {}); return r.error;'
    })
    expect(result.success).toBe(true)
    expect(result.message).toContain('EBOOM')
  })

  it('超过 max_calls 后不再调用', async () => {
    const { run, calls } = make()
    const result = await run({
      action: 'run',
      max_calls: 1,
      code: 'const a = callTool("x", {}); const b = callTool("y", {}); return [a.success, b.error];'
    })
    expect(result.success).toBe(true)
    expect(result.message).toContain('E_TOO_MANY_CALLS')
    expect(calls).toHaveLength(1)
  })

  it('禁止嵌套 ptc', async () => {
    const { run, calls } = make()
    const result = await run({
      action: 'run',
      code: 'const r = callTool("system.ptc", {}); return r.error;'
    })
    expect(result.success).toBe(true)
    expect(result.message).toContain('E_NESTED')
    expect(calls).toHaveLength(0)
  })

  it('空 code / 未知 action', async () => {
    const { run } = make()
    expect((await run({ action: 'run', code: '   ' })).error).toBe('EBADARG')
    expect((await run({ action: 'frob', code: 'return 1' })).error).toBe('EBADACTION')
  })
})
