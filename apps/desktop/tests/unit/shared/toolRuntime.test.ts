/**
 * 工具运行时（`@mobai/shared/agent/toolRuntime`）——照 dsh `core/tools` 的语义钉死。
 *
 * 覆盖的硬规则：
 * - 参数必须**无损**（不能 JSON 往返就拒绝）+ 快照后**深冻结**；
 * - canonical 输出必须过 `output.schema`，否则 `TOOL_OUTPUT_INVALID`；
 * - 并发 **fail-closed**（只有精确 `true` 才 parallel）；
 * - 超时只认**本策略**的定时器，且结束后还原调用方 signal；
 * - 沙箱升级**严格更宽** + 参数成对 + 审批先于执行；
 * - `schemas()` 只白名单 name/description/parameters（执行器元数据永不发给模型）。
 */

import { describe, expect, it, vi } from 'vitest'

import type { SkillProtocol } from '@mobai/shared/agent/config'
import {
  ToolsService,
  ToolExecutionPipeline,
  TOOL_ABORTED_BEFORE_DISPATCH,
  TOOL_TIMEOUT,
  approveEscalation,
  createTimeoutPolicy,
  deepFreeze,
  snapshotJsonValue,
  validateEscalationArgs,
  validateJsonSchemaValue,
  WIDER_MODES,
  type ToolDefinition
} from '@mobai/shared/agent/toolRuntime'
import { SkillDispatcher } from '@mobai/agent-core/execution/dispatcher'

/* ---------- 工具构造 ---------- */

function makeTool(over: {
  name: string
  execute: (args: unknown) => Promise<unknown>
  schema?: ToolDefinition['output']['schema']
  timeoutMs?: number
  isConcurrencySafe?: (args: unknown) => boolean
  finalizeContent?: ToolDefinition['finalizeContent']
}): ToolDefinition {
  return {
    name: over.name,
    description: `demo ${over.name}`,
    parameters: { type: 'object', properties: {} },
    output: {
      schema: over.schema ?? { type: 'object', properties: { ok: { type: 'boolean' } }, required: ['ok'] },
      render: (_args, value) => [{ type: 'text', text: JSON.stringify(value) }]
    },
    execute: (args) => over.execute(args),
    ...(over.timeoutMs !== undefined ? { timeoutMs: over.timeoutMs } : {}),
    ...(over.isConcurrencySafe !== undefined
      ? { isConcurrencySafe: (args: unknown) => over.isConcurrencySafe!(args) }
      : {}),
    ...(over.finalizeContent !== undefined ? { finalizeContent: over.finalizeContent } : {})
  }
}

function makeSkill(over: Partial<SkillProtocol> & { id: string }): SkillProtocol {
  return {
    description: 'demo skill',
    version: '0.1.0',
    parametersSchema: { type: 'object', properties: {} },
    execute: () => ({ success: true, message: 'ok' }),
    ...over
  }
}

/* ---------- 无损 JSON ---------- */

describe('jsonValue：无损快照与深冻结', () => {
  it('接受普通 JSON，并返回独立深拷贝', () => {
    const source = { a: 1, b: [true, null, 'x'] }
    const snapshot = snapshotJsonValue(source)
    expect(snapshot).toEqual(source)
    source.a = 9
    expect(snapshot).toEqual({ a: 1, b: [true, null, 'x'] })
  })

  it('拒绝 undefined / NaN / 循环引用 / class 实例（静默丢值比失败更糟）', () => {
    expect(snapshotJsonValue({ a: undefined })).toBeUndefined()
    expect(snapshotJsonValue({ a: Number.NaN })).toBeUndefined()
    expect(snapshotJsonValue({ a: Number.POSITIVE_INFINITY })).toBeUndefined()
    const cyclic: Record<string, unknown> = {}
    cyclic.self = cyclic
    expect(snapshotJsonValue(cyclic)).toBeUndefined()
    class Box {
      value = 1
    }
    expect(snapshotJsonValue(new Box())).toBeUndefined()
  })

  it('deepFreeze 递归冻结嵌套结构', () => {
    const value = deepFreeze({ a: { b: [1] } })
    expect(Object.isFrozen(value)).toBe(true)
    expect(Object.isFrozen(value.a)).toBe(true)
    expect(Object.isFrozen(value.a.b)).toBe(true)
  })
})

/* ---------- JSON Schema ---------- */

describe('jsonSchema：输出/入参形状校验', () => {
  it('required 缺失给出带路径的违规', () => {
    const violation = validateJsonSchemaValue(
      { type: 'object', properties: { name: { type: 'string' } }, required: ['name'] },
      {}
    )
    expect(violation).toEqual({ path: '$.name', message: 'is required' })
  })

  it('类型/枚举/数组元素/长度/区间都拦得住', () => {
    expect(validateJsonSchemaValue({ type: 'number' }, 'x')?.message).toBe('expected number')
    expect(validateJsonSchemaValue({ type: 'string', enum: ['a'] }, 'b')?.message).toContain('one of')
    expect(
      validateJsonSchemaValue({ type: 'array', items: { type: 'string' } }, ['ok', 1])?.path
    ).toBe('$[1]')
    expect(validateJsonSchemaValue({ type: 'string', minLength: 2 }, 'a')?.message).toContain('length')
    expect(validateJsonSchemaValue({ type: 'integer', minimum: 2 }, 1)?.message).toContain('>=')
  })

  it('未知 type 宽松放行（宁可少拦也不误拦）', () => {
    expect(validateJsonSchemaValue({ type: 'weird' }, 123)).toBeNull()
  })
})

/* ---------- ToolsService ---------- */

describe('ToolsService：模型可见面只白名单三字段', () => {
  it('schemas() 不泄露 timeoutMs / isConcurrencySafe', () => {
    const tools = new ToolsService()
    tools.register(
      makeTool({ name: 'demo', execute: async () => ({ ok: true }), timeoutMs: 1000, isConcurrencySafe: () => true })
    )
    const [schema] = tools.schemas()
    expect(Object.keys(schema ?? {}).sort()).toEqual(['description', 'name', 'parameters'])
  })
})

/* ---------- 流水线 ---------- */

describe('ToolExecutionPipeline：执行契约', () => {
  it('未知工具 → TOOL_NOT_FOUND', async () => {
    const pipeline = new ToolExecutionPipeline(new ToolsService())
    const result = await pipeline.execute({ name: 'nope', arguments: {} })
    expect(result.isError && result.error.info?.code).toBe('TOOL_NOT_FOUND')
  })

  it('不可无损序列化的参数 → TOOL_ARGUMENTS_INVALID（不静默丢字段）', async () => {
    const tools = new ToolsService()
    tools.register(makeTool({ name: 'demo', execute: async () => ({ ok: true }) }))
    const pipeline = new ToolExecutionPipeline(tools)
    const result = await pipeline.execute({ name: 'demo', arguments: { bad: Number.NaN } })
    expect(result.isError && result.error.info?.code).toBe('TOOL_ARGUMENTS_INVALID')
  })

  it('参数在执行前被深冻结（工具改不动调用方）', async () => {
    let frozen = false
    const tools = new ToolsService()
    tools.register(
      makeTool({
        name: 'demo',
        execute: async (args) => {
          frozen = Object.isFrozen(args)
          return { ok: true }
        }
      })
    )
    const pipeline = new ToolExecutionPipeline(tools)
    await pipeline.execute({ name: 'demo', arguments: { nested: { a: 1 } } })
    expect(frozen).toBe(true)
  })

  it('canonical 输出不合 schema → TOOL_OUTPUT_INVALID', async () => {
    const tools = new ToolsService()
    tools.register(makeTool({ name: 'demo', execute: async () => ({ nope: 1 }) }))
    const pipeline = new ToolExecutionPipeline(tools)
    const result = await pipeline.execute({ name: 'demo', arguments: {} })
    expect(result.isError && result.error.info?.code).toBe('TOOL_OUTPUT_INVALID')
    expect(result.isError && result.error.message).toContain('$.ok')
  })

  it('成功时同时给 canonical 值与渲染内容', async () => {
    const tools = new ToolsService()
    tools.register(makeTool({ name: 'demo', execute: async () => ({ ok: true }) }))
    const pipeline = new ToolExecutionPipeline(tools)
    const result = await pipeline.execute({ name: 'demo', arguments: {} })
    expect(result.isError).toBe(false)
    if (!result.isError) {
      expect(result.value).toEqual({ ok: true })
      expect(result.content).toEqual([{ type: 'text', text: '{"ok":true}' }])
    }
  })

  it('并发 fail-closed：省略/抛错/非 true 一律 exclusive，精确 true 才 parallel', () => {
    const tools = new ToolsService()
    tools.register(makeTool({ name: 'none', execute: async () => ({ ok: true }) }))
    tools.register(makeTool({ name: 'throwing', execute: async () => ({ ok: true }), isConcurrencySafe: () => {
      throw new Error('boom')
    } }))
    tools.register(makeTool({ name: 'false', execute: async () => ({ ok: true }), isConcurrencySafe: () => false }))
    tools.register(makeTool({ name: 'true', execute: async () => ({ ok: true }), isConcurrencySafe: () => true }))
    const pipeline = new ToolExecutionPipeline(tools)
    expect(pipeline.executionMode({ name: 'none', arguments: {} })).toEqual({ kind: 'exclusive' })
    expect(pipeline.executionMode({ name: 'throwing', arguments: {} })).toEqual({ kind: 'exclusive' })
    expect(pipeline.executionMode({ name: 'false', arguments: {} })).toEqual({ kind: 'exclusive' })
    expect(pipeline.executionMode({ name: 'true', arguments: {} })).toEqual({ kind: 'parallel' })
  })

  it('策略链是环绕中间件：可短路、可替换结果', async () => {
    const tools = new ToolsService()
    tools.register(makeTool({ name: 'demo', execute: async () => ({ ok: true }) }))
    const pipeline = new ToolExecutionPipeline(tools)
    const seen: string[] = []
    pipeline.use(async (exec, next) => {
      seen.push(`before:${exec.name}`)
      const result = await next()
      seen.push(`after:${exec.name}`)
      return result
    })
    pipeline.use(async () => {
      seen.push('short-circuit')
      return { isError: true, content: [], error: { message: 'blocked', info: { code: 'BLOCKED' } } }
    })
    const result = await pipeline.execute({ name: 'demo', arguments: {} })
    expect(result.isError && result.error.info?.code).toBe('BLOCKED')
    // 外层先 before，内层短路，外层再 after
    expect(seen).toEqual(['before:demo', 'short-circuit', 'after:demo'])
  })

  it('finalizeContent 对每个结局都生效（含策略失败）', async () => {
    const tools = new ToolsService()
    tools.register(
      makeTool({
        name: 'demo',
        execute: async () => ({ ok: true }),
        finalizeContent: () => [{ type: 'text', text: 'FINAL' }]
      })
    )
    const pipeline = new ToolExecutionPipeline(tools)
    const result = await pipeline.execute({ name: 'demo', arguments: {} })
    expect(result.content).toEqual([{ type: 'text', text: 'FINAL' }])
  })

  it('调用前已取消 → aborted-before-dispatch，不执行工具', async () => {
    const tools = new ToolsService()
    const run = vi.fn(async () => ({ ok: true }))
    tools.register(makeTool({ name: 'demo', execute: run }))
    const pipeline = new ToolExecutionPipeline(tools)
    const controller = new AbortController()
    controller.abort()
    const result = await pipeline.execute({ name: 'demo', arguments: {}, signal: controller.signal })
    expect(result.isError && result.error.info?.code).toBe(TOOL_ABORTED_BEFORE_DISPATCH)
    expect(run).not.toHaveBeenCalled()
  })
})

/* ---------- 超时策略 ---------- */

describe('timeoutPolicy：只认自己的定时器，结束后还原 signal', () => {
  it('声明 timeoutMs 且未在预算内完成 → TOOL_TIMEOUT', async () => {
    const tools = new ToolsService()
    tools.register(
      makeTool({
        name: 'slow',
        timeoutMs: 10,
        execute: () => new Promise((resolve) => setTimeout(() => resolve({ ok: true }), 40))
      })
    )
    const pipeline = new ToolExecutionPipeline(tools)
    pipeline.use(createTimeoutPolicy((name) => tools.get(name)))
    const result = await pipeline.execute({ name: 'slow', arguments: {} })
    expect(result.isError && result.error.info?.code).toBe(TOOL_TIMEOUT)
  })

  it('未声明 timeoutMs → 不 arm deadline，原样委托', async () => {
    const tools = new ToolsService()
    tools.register(makeTool({ name: 'fast', execute: async () => ({ ok: true }) }))
    const pipeline = new ToolExecutionPipeline(tools)
    pipeline.use(createTimeoutPolicy((name) => tools.get(name)))
    const result = await pipeline.execute({ name: 'fast', arguments: {} })
    expect(result.isError).toBe(false)
  })

  it('结束后把调用方 signal 还原（post-execute 看不到派生 signal）', async () => {
    let observed: AbortSignal | undefined
    const tools = new ToolsService()
    tools.register(
      makeTool({
        name: 'probe',
        timeoutMs: 1000,
        execute: async () => ({ ok: true })
      })
    )
    const pipeline = new ToolExecutionPipeline(tools)
    // 探针必须在超时策略**外层**：dsh 的语义是「本策略结束后还原调用方 signal，
    // 让 post-execute 监听器看不到派生 signal」。内层看到派生 signal 是正确的。
    pipeline.use(async (exec, next) => {
      const result = await next()
      observed = exec.signal
      return result
    })
    pipeline.use(createTimeoutPolicy((name) => tools.get(name)))
    const caller = new AbortController()
    await pipeline.execute({ name: 'probe', arguments: {}, signal: caller.signal })
    expect(observed).toBe(caller.signal)
  })
})

/* ---------- 沙箱升级 ---------- */

describe('sandbox：严格更宽 + 参数成对 + 审批先于执行', () => {
  it('阶梯只允许更宽', () => {
    expect(WIDER_MODES['read-only']).toContain('workspace-write')
    expect(WIDER_MODES['workspace-write']).not.toContain('read-only')
  })

  it('参数必须成对，理由不能是空句子', () => {
    expect(() => validateEscalationArgs('workspace-write', undefined)).toThrow(/justification/)
    expect(() => validateEscalationArgs(undefined, 'reason')).toThrow(/justification/)
    expect(() => validateEscalationArgs('workspace-write', '   ')).toThrow(/non-empty/)
    expect(() => validateEscalationArgs('workspace-write', 'need to build')).not.toThrow()
  })

  it('不能升到更窄或未知目标；审批通过才返回新模式', async () => {
    const deny = await approveEscalation({
      current: 'workspace-write',
      requested: 'read-only',
      justification: 'x',
      subject: 'command',
      ask: async () => true
    })
    expect(deny.ok).toBe(false)

    const unknown = await approveEscalation({
      current: 'read-only',
      requested: 'root',
      justification: 'x',
      subject: 'command',
      ask: async () => true
    })
    expect(unknown.ok).toBe(false)

    const ask = vi.fn(async () => true)
    const allow = await approveEscalation({
      current: 'read-only',
      requested: 'workspace-write',
      justification: 'need to build',
      subject: 'command',
      ask
    })
    expect(allow).toEqual({ ok: true, mode: 'workspace-write' })
    expect(ask).toHaveBeenCalledTimes(1)
  })

  it('没请求升级时按当前模式继续，不打扰用户', async () => {
    const ask = vi.fn(async () => true)
    const outcome = await approveEscalation({
      current: 'read-only',
      requested: undefined,
      justification: undefined,
      subject: 'command',
      ask
    })
    expect(outcome).toEqual({ ok: true, mode: 'read-only' })
    expect(ask).not.toHaveBeenCalled()
  })
})

/* ---------- 适配层 + dispatcher 集成 ---------- */

describe('SkillDispatcher 走工具运行时（真实集成）', () => {
  it('注册即同步进运行时；执行返回归一结果', async () => {
    const dispatcher = new SkillDispatcher()
    dispatcher.register(
      makeSkill({
        id: 'demo.echo',
        execute: (params) => ({ success: true, message: `echo:${String(params.text ?? '')}` })
      })
    )
    const result = await dispatcher.execute('demo.echo', { text: 'hi' })
    expect(result).toMatchObject({ success: true, message: 'echo:hi' })
  })

  it('技能抛错被收敛为结构化失败（不再冒泡）', async () => {
    const dispatcher = new SkillDispatcher()
    dispatcher.register(
      makeSkill({
        id: 'demo.boom',
        execute: () => {
          throw new Error('kaboom')
        }
      })
    )
    const result = await dispatcher.execute('demo.boom', {})
    expect(result.success).toBe(false)
    expect(result.error).toContain('kaboom')
  })

  it('只返回 {success} 的技能被归一（canonical 仍满足 message 必填）', async () => {
    const dispatcher = new SkillDispatcher()
    // 故意返回不完整的 SkillResult（缺 message），验证适配层的归一兜底
    const partial = (() => ({ success: true })) as unknown as SkillProtocol['execute']
    dispatcher.register(makeSkill({ id: 'demo.partial', execute: partial }))
    const result = await dispatcher.execute('demo.partial', {})
    expect(result).toMatchObject({ success: true, message: '' })
  })

  it('executionMode 反映 isConcurrencySafe（fail-closed）', () => {
    const dispatcher = new SkillDispatcher()
    dispatcher.register(makeSkill({ id: 'demo.read', isConcurrencySafe: () => true }))
    dispatcher.register(makeSkill({ id: 'demo.write' }))
    expect(dispatcher.executionMode('demo.read', {})).toEqual({ kind: 'parallel' })
    expect(dispatcher.executionMode('demo.write', {})).toEqual({ kind: 'exclusive' })
  })
})
