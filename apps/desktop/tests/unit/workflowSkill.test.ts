import { describe, expect, it } from 'vitest'

import { createWorkflowSkill } from '@mobai/agent-core/skills/workflowSkill'

interface Call {
  tool: string
  params: Record<string, unknown>
}

type R = { success: boolean; message: string; error?: string; data?: unknown }

function make(behaviors: Record<string, boolean> = {}) {
  const calls: Call[] = []
  const skill = createWorkflowSkill({
    executeGated: async (tool, params) => {
      calls.push({ tool, params })
      const ok = behaviors[tool] ?? true
      return { success: ok, message: ok ? 'ok' : 'boom' }
    }
  })
  return {
    calls,
    run: (params: Record<string, unknown>): Promise<R> => skill.execute(params, {}) as Promise<R>
  }
}

describe('system.workflow（顺序执行步骤）', () => {
  it('按顺序执行全部步骤', async () => {
    const { run, calls } = make()
    const result = await run({
      action: 'run',
      steps: [
        { tool: 'system.file_ops', params: { action: 'read', path: 'a' } },
        { tool: 'system.file_ops', params: { action: 'write', path: 'b' } }
      ]
    })
    expect(result.success).toBe(true)
    expect(calls.map((c) => c.tool)).toEqual(['system.file_ops', 'system.file_ops'])
    expect(calls[1].params).toEqual({ action: 'write', path: 'b' })
  })

  it('遇错默认停止（后续步骤不执行）', async () => {
    const { run, calls } = make({ 'system.file_ops': false })
    const result = await run({
      action: 'run',
      steps: [{ tool: 'system.file_ops' }, { tool: 'system.ceshu' }]
    })
    expect(result.success).toBe(false)
    expect(result.error).toBe('ESTEPFAILED')
    expect(calls).toHaveLength(1)
  })

  it('continue_on_error=true 继续执行', async () => {
    const { run, calls } = make({ 'system.file_ops': false })
    const result = await run({
      action: 'run',
      continue_on_error: true,
      steps: [{ tool: 'system.file_ops' }, { tool: 'system.ceshu' }]
    })
    expect(result.success).toBe(false)
    expect(calls).toHaveLength(2)
  })

  it('禁止嵌套 workflow', async () => {
    const { run } = make()
    const result = await run({ action: 'run', steps: [{ tool: 'system.workflow' }] })
    expect(result.success).toBe(false)
    expect(result.error).toBe('ENESTED')
  })

  it('steps 为空 / 超限 → EBADARG', async () => {
    const { run } = make()
    expect((await run({ action: 'run', steps: [] })).error).toBe('EBADARG')
    const tooMany = Array.from({ length: 21 }, () => ({ tool: 'system.ceshu' }))
    expect((await run({ action: 'run', steps: tooMany })).error).toBe('EBADARG')
  })

  it('未知 action → EBADACTION', async () => {
    const { run } = make()
    expect((await run({ action: 'frob' })).error).toBe('EBADACTION')
  })
})
