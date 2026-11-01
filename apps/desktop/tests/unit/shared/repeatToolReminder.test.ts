import { describe, it, expect } from 'vitest'
import { createRepeatToolReminderGuard, GENTLE_REMINDER } from '@mobai/shared/agent/guard'
import { ToolExecutionPipeline, ToolsService, type ToolDefinition, type ToolExecution, type ToolExecutionResult } from '@mobai/shared/agent/toolRuntime'

function execFor(name: string, args: unknown, sessionId = 's1'): ToolExecution {
  return {
    callId: `${name}:${Math.random().toString(36)}`,
    name,
    arguments: args,
    signal: new AbortController().signal,
    hostContext: { sessionId }
  } as unknown as ToolExecution
}

function okResult(): ToolExecutionResult {
  return { isError: false, content: [{ type: 'text', text: 'ok' }], value: { ok: true } }
}

function errorResult(): ToolExecutionResult {
  return { isError: true, content: [{ type: 'text', text: 'boom' }], error: { message: 'boom' } }
}

describe('createRepeatToolReminderGuard（dsh repeat-tool-reminder 原生版）', () => {
  it('未达阈值不提醒', () => {
    const guard = createRepeatToolReminderGuard()
    expect(guard.evaluate(execFor('t', { a: 1 }), okResult())).toEqual([])
    expect(guard.evaluate(execFor('t', { a: 1 }), okResult())).toEqual([])
  })

  it('连续 3 次给温和提醒，5 次给详细提醒', async () => {
    const guard = createRepeatToolReminderGuard()
    expect(await guard.evaluate(execFor('t', { a: 1 }), okResult())).toEqual([])
    expect(await guard.evaluate(execFor('t', { a: 1 }), okResult())).toEqual([])
    const r3 = await guard.evaluate(execFor('t', { a: 1 }), okResult())
    expect(r3).toHaveLength(1)
    expect(r3[0]).toBe(GENTLE_REMINDER)
    // 阈值之间（第 4 次）无提醒
    expect(await guard.evaluate(execFor('t', { a: 1 }), okResult())).toEqual([])
    const r5 = await guard.evaluate(execFor('t', { a: 1 }), okResult())
    expect(r5[0]).toContain('t')
    expect(r5[0]).toContain('连续调用次数：5')
  })

  it('参数不同则重置计数（只检测连续重复）', async () => {
    const guard = createRepeatToolReminderGuard()
    await guard.evaluate(execFor('t', { a: 1 }), okResult())
    await guard.evaluate(execFor('t', { a: 1 }), okResult())
    // 换成 {a:2} 后是一条新链：第 3 次（含本次）才触发温和提醒
    expect(await guard.evaluate(execFor('t', { a: 2 }), okResult())).toEqual([])
    expect(await guard.evaluate(execFor('t', { a: 2 }), okResult())).toEqual([])
    const r3 = await guard.evaluate(execFor('t', { a: 2 }), okResult())
    expect(r3[0]).toBe(GENTLE_REMINDER)
    expect(await guard.evaluate(execFor('t', { a: 2 }), okResult())).toEqual([])
    const r5 = await guard.evaluate(execFor('t', { a: 2 }), okResult())
    expect(r5[0]).toContain('连续调用次数：5')
  })

  it('不同会话互不影响（按 sessionId 隔离）', async () => {
    const guard = createRepeatToolReminderGuard()
    await guard.evaluate(execFor('t', { a: 1 }, 's1'), okResult())
    await guard.evaluate(execFor('t', { a: 1 }, 's1'), okResult())
    expect(await guard.evaluate(execFor('t', { a: 1 }, 's2'), okResult())).toEqual([])
    expect(await guard.evaluate(execFor('t', { a: 1 }, 's2'), okResult())).toEqual([])
    expect((await guard.evaluate(execFor('t', { a: 1 }, 's2'), okResult()))[0]).toBe(GENTLE_REMINDER)
  })

  it('失败结果不提醒（模型该看的是错误本身）', () => {
    const guard = createRepeatToolReminderGuard()
    expect(guard.evaluate(execFor('t', { a: 1 }), errorResult())).toEqual([])
  })
})

describe('ToolExecutionPipeline.usePostExecGuard（对齐 dsh tools/post-execute 瀑布）', () => {
  function buildPipeline(guard: { id: string; evaluate: (exec: ToolExecution, result: ToolExecutionResult) => string[] | Promise<string[]> }) {
    const tools = new ToolsService()
    const tool: ToolDefinition = {
      name: 'echo',
      description: 'echo',
      parameters: { type: 'object', properties: { a: { type: 'number' } } },
      output: {
        schema: { type: 'object' },
        render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }]
      },
      execute: async () => ({ echoed: true })
    }
    tools.register(tool)
    const pipeline = new ToolExecutionPipeline(tools)
    pipeline.usePostExecGuard(guard as never)
    return pipeline
  }

  it('重复调用会在结果上附 advisoryContexts', async () => {
    const pipeline = buildPipeline(createRepeatToolReminderGuard())
    const call = (): Promise<ToolExecutionResult> =>
      pipeline.execute({ name: 'echo', arguments: { a: 1 }, hostContext: { sessionId: 's' } })
    await call()
    await call()
    const third = await call()
    expect(third.advisoryContexts).toBeDefined()
    expect(third.advisoryContexts).toHaveLength(1)
  })

  it('守卫抛错不影响主结果（守卫是辅助提示，不是执行链路）', async () => {
    const pipeline = buildPipeline({
      id: 'bad',
      evaluate: () => {
        throw new Error('guard boom')
      }
    })
    const res = await pipeline.execute({ name: 'echo', arguments: { a: 1 } })
    expect(res.isError).toBe(false)
    expect(res.value).toEqual({ echoed: true })
  })
})
