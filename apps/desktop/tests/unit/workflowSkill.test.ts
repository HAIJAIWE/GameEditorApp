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

describe('system.workflow（dependsOn：拓扑序 + 失败跳过无关分支）', () => {
  it('乱序声明也能按依赖顺序执行', async () => {
    const { run, calls } = make()
    const result = await run({
      action: 'run',
      steps: [
        { id: 'c', tool: 'system.ceshu', dependsOn: ['b'] },
        { id: 'a', tool: 'system.file_ops' },
        { id: 'b', tool: 'system.game_data', dependsOn: ['a'] }
      ]
    })
    expect(result.success).toBe(true)
    expect(calls.map((c) => c.tool)).toEqual(['system.file_ops', 'system.game_data', 'system.ceshu'])
  })

  it('依赖失败 ⇒ 只跳过下游，无关分支照常跑', async () => {
    const { run, calls } = make({ 'system.file_ops': false })
    const result = await run({
      action: 'run',
      steps: [
        { id: 'a', tool: 'system.file_ops' },
        { id: 'b', tool: 'system.ceshu', dependsOn: ['a'] },
        { id: 'c', tool: 'system.game_data' }
      ]
    })
    expect(result.success).toBe(false)
    // b 被跳过（没调），c 与 a 无关所以照跑
    expect(calls.map((c) => c.tool)).toEqual(['system.file_ops', 'system.game_data'])
    const results = (result.data as { results: Array<{ id: string; status: string }> }).results
    expect(results.find((r) => r.id === 'b')?.status).toBe('skipped')
    expect(result.message).toContain('跳过')
  })

  it('环 / 未知依赖 / 自依赖 / id 重复 → EBADARG', async () => {
    const { run } = make()
    expect(
      (await run({
        action: 'run',
        steps: [
          { id: 'a', tool: 'system.ceshu', dependsOn: ['b'] },
          { id: 'b', tool: 'system.ceshu', dependsOn: ['a'] }
        ]
      })).error
    ).toBe('EBADARG')
    expect(
      (await run({ action: 'run', steps: [{ id: 'a', tool: 'system.ceshu', dependsOn: ['nope'] }] })).error
    ).toBe('EBADARG')
    expect(
      (await run({ action: 'run', steps: [{ id: 'a', tool: 'system.ceshu', dependsOn: ['a'] }] })).error
    ).toBe('EBADARG')
    expect(
      (await run({
        action: 'run',
        steps: [
          { id: 'a', tool: 'system.ceshu' },
          { id: 'a', tool: 'system.file_ops' }
        ]
      })).error
    ).toBe('EBADARG')
  })
})

describe('system.workflow（步骤间传值 {{steps.<id>.data.<路径>}}）', () => {
  function makeWithData() {
    const calls: Call[] = []
    const skill = createWorkflowSkill({
      executeGated: async (tool, params) => {
        calls.push({ tool, params })
        return { success: true, message: 'ok', data: { id: 'itm_7', nested: { name: '法师' }, n: 3 } }
      }
    })
    return { calls, run: (p: Record<string, unknown>): Promise<R> => skill.execute(p, {}) as Promise<R> }
  }

  it('整串占位保留原类型（数字仍是数字）', async () => {
    const { run, calls } = makeWithData()
    const result = await run({
      action: 'run',
      steps: [
        { id: 'create', tool: 'system.game_data' },
        { id: 'update', tool: 'system.game_data', params: { item_id: '{{steps.create.data.id}}', n: '{{steps.create.data.n}}' } }
      ]
    })
    expect(result.success).toBe(true)
    expect(calls[1].params).toEqual({ item_id: 'itm_7', n: 3 })
  })

  it('嵌在文本里则转字符串（对象走 JSON）', async () => {
    const { run, calls } = makeWithData()
    await run({
      action: 'run',
      steps: [
        { id: 'create', tool: 'system.game_data' },
        {
          id: 'note',
          tool: 'system.ceshu',
          params: { text: '新建了 {{steps.create.data.id}}（{{steps.create.data.nested}}）' }
        }
      ]
    })
    expect(calls[1].params).toEqual({ text: '新建了 itm_7（{"name":"法师"}）' })
  })

  it('引用取不到 ⇒ 该步失败并说明，不静默传原样字符串', async () => {
    const { run, calls } = makeWithData()
    const result = await run({
      action: 'run',
      steps: [
        { id: 'create', tool: 'system.game_data' },
        { id: 'bad', tool: 'system.game_data', params: { x: '{{steps.create.data.nope}}' } }
      ]
    })
    expect(result.success).toBe(false)
    expect(calls).toHaveLength(1)
    expect(result.message).toContain('取不到的步骤结果')
  })
})
