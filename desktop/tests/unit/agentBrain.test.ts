import { describe, expect, it } from 'vitest'

import {
  DEFAULT_MAX_TOOL_CALLS,
  DEFAULT_MAX_TURNS,
  DEFAULT_WALL_CLOCK_MS,
  FALLBACK_ANSWER,
  buildAssistantMessage,
  buildToolMessage,
  fallbackAnswer,
  formatToolResult,
  parseToolArguments,
  runBrainLoop,
  type BrainEvent,
  type BrainLlmReply,
  type BrainLlmRequest,
  type BrainLlmTransport,
  type BrainToolRunner
} from '../../src/shared/agent/brain'
import { RISK_LEVEL, fixParams, resolveRiskLevel, type SkillResult } from '../../src/shared/agent/protocol'

/* ---- 测试替身 ---- */

interface ScriptedTransport extends BrainLlmTransport {
  calls: BrainLlmRequest[]
}

/** 脚本化传输层：按顺序吐出预设回复（超出则复用最后一条） */
function scripted(replies: BrainLlmReply[]): ScriptedTransport {
  const calls: BrainLlmRequest[] = []
  const transport: ScriptedTransport = {
    calls,
    complete: async (request) => {
      calls.push(request)
      const index = Math.min(calls.length - 1, replies.length - 1)
      return replies[index] as BrainLlmReply
    }
  }
  return transport
}

interface StubRunner extends BrainToolRunner {
  executed: Array<{ tool: string; params: Record<string, unknown> }>
}

function makeRunner(
  options: {
    resolvable?: (name: string) => string | null
    dangerous?: (tool: string, action: string) => boolean
    result?: SkillResult
  } = {}
): StubRunner {
  const executed: Array<{ tool: string; params: Record<string, unknown> }> = []
  return {
    executed,
    resolve: options.resolvable ?? ((name) => (name.startsWith('system.') ? name : null)),
    needsConfirmation: options.dangerous ?? (() => false),
    execute: async (tool, params) => {
      executed.push({ tool, params })
      return options.result ?? { success: true, message: `已执行 ${tool}` }
    }
  }
}

function types(events: BrainEvent[]): string[] {
  return events.map((event) => event.type)
}

function toolCall(id: string, name: string, args: Record<string, unknown> = {}): BrainLlmReply {
  return { content: '', toolCalls: [{ id, name, arguments: args }], finishReason: 'tool_calls' }
}

const FINAL: BrainLlmReply = { content: '这是最终答复', toolCalls: [], finishReason: 'stop' }

/* ---- 纯辅助函数 ---- */

describe('brain 辅助函数', () => {
  it('parseToolArguments：对象直通 / JSON 字符串解析 / 非法回落 {}', () => {
    expect(parseToolArguments({ action: 'list' })).toEqual({ action: 'list' })
    expect(parseToolArguments('{"action":"list"}')).toEqual({ action: 'list' })
    expect(parseToolArguments('{坏 JSON')).toEqual({})
    expect(parseToolArguments('[1,2]')).toEqual({})
    expect(parseToolArguments('')).toEqual({})
    expect(parseToolArguments(null)).toEqual({})
  })

  it('buildAssistantMessage：有工具调用时序列化 arguments 以符合 OpenAI 协议', () => {
    expect(buildAssistantMessage({ content: '想说点啥', toolCalls: [], finishReason: 'stop' })).toEqual({
      role: 'assistant',
      content: '想说点啥'
    })
    const withCalls = buildAssistantMessage({
      content: '',
      toolCalls: [{ id: 'c1', name: 'system.game_data', arguments: { action: 'list' } }],
      finishReason: 'tool_calls'
    })
    expect(withCalls.tool_calls).toEqual([
      { id: 'c1', type: 'function', function: { name: 'system.game_data', arguments: '{"action":"list"}' } }
    ])
  })

  it('buildToolMessage：携带 tool_call_id 与工具名', () => {
    expect(buildToolMessage('c1', 'system.game_data', '共 2 条')).toEqual({
      role: 'tool',
      tool_call_id: 'c1',
      name: 'system.game_data',
      content: '共 2 条'
    })
  })

  it('fallbackAnswer：取首个非空结果，全空用兜底文案（对齐 Python _fallback_answer）', () => {
    expect(fallbackAnswer(['', '   ', '有内容'])).toBe('有内容')
    expect(fallbackAnswer([' 前后空白 '])).toBe('前后空白')
    expect(fallbackAnswer(['', '  '])).toBe(FALLBACK_ANSWER)
    expect(fallbackAnswer([])).toBe(FALLBACK_ANSWER)
    expect(FALLBACK_ANSWER).toBe('抱歉，暂时无法处理这个请求。')
  })

  it('formatToolResult：成功用 message，失败用「执行失败: 原因」', () => {
    expect(formatToolResult({ success: true, message: '共 1 条' })).toBe('共 1 条')
    expect(formatToolResult({ success: false, message: '', error: '缺少参数' })).toBe('执行失败: 缺少参数')
    expect(formatToolResult({ success: false, message: '' })).toBe('执行失败: 未知')
  })
})

/* ---- 循环 ---- */

describe('runBrainLoop：事件序列', () => {
  it('无需工具：step_start(llm_think) → stream_done → done', async () => {
    const transport = scripted([FINAL])
    const result = await runBrainLoop({
      input: '你好',
      systemPrompts: ['你是助手'],
      transport,
      runner: makeRunner()
    })

    expect(types(result.events)).toEqual(['step_start', 'turn_stats', 'stream_done', 'done'])
    expect(result.events[0]).toEqual({ type: 'step_start', order: 0, tool: 'llm_think' })
    expect(result.events[3]).toEqual({ type: 'done', text: '这是最终答复' })
    expect(result.text).toBe('这是最终答复')
    expect(result.completed).toBe(true)
    // 系统提示词与用户消息按顺序注入
    expect(transport.calls[0]?.messages).toEqual([
      { role: 'system', content: '你是助手' },
      { role: 'user', content: '你好' }
    ])
  })

  it('一轮工具后终稿：完整事件序列 + 工具被实际执行', async () => {
    const transport = scripted([toolCall('c1', 'system.game_data', { action: 'list' }), FINAL])
    const runner = makeRunner()
    const result = await runBrainLoop({
      input: '列出角色',
      systemPrompts: [],
      transport,
      runner
    })

    expect(types(result.events)).toEqual([
      'step_start', // order 0 llm_think
      'turn_stats',
      'stream_done',
      'step_start', // 并行1工具
      'step_done',
      'step_start', // order 1 llm_think
      'turn_stats',
      'stream_done',
      'done'
    ])
    expect(result.events[3]).toEqual({ type: 'step_start', order: 0, tool: '并行1工具' })
    expect(result.events[4]).toEqual({
      type: 'step_done',
      tool: 'system.game_data',
      result: '已执行 system.game_data',
      success: true
    })
    expect(runner.executed).toEqual([{ tool: 'system.game_data', params: { action: 'list' } }])
    expect(result.text).toBe('这是最终答复')
  })

  it('同轮多工具：并发计数正确且各自产出 step_done', async () => {
    const transport = scripted([
      {
        content: '',
        toolCalls: [
          { id: 'c1', name: 'system.game_data', arguments: { action: 'list', data_type: 'role' } },
          { id: 'c2', name: 'system.ceshu', arguments: { action: 'list' } }
        ],
        finishReason: 'tool_calls'
      },
      FINAL
    ])
    const runner = makeRunner()
    const result = await runBrainLoop({ input: 'x', systemPrompts: [], transport, runner })

    expect(result.events[3]).toEqual({ type: 'step_start', order: 0, tool: '并行2工具' })
    expect(runner.executed.map((entry) => entry.tool)).toEqual(['system.game_data', 'system.ceshu'])
    expect(types(result.events).filter((type) => type === 'step_done')).toHaveLength(2)
  })

  it('流式增量：onChunk 触发 stream_chunk（含累积文本）', async () => {
    const transport: BrainLlmTransport = {
      complete: async (request) => {
        request.onChunk?.('你')
        request.onChunk?.('好')
        return FINAL
      }
    }
    const result = await runBrainLoop({ input: 'x', systemPrompts: [], transport, runner: makeRunner() })
    expect(types(result.events)).toEqual([
      'step_start',
      'stream_chunk',
      'stream_chunk',
      'turn_stats',
      'stream_done',
      'done'
    ])
    expect(result.events[1]).toEqual({ type: 'stream_chunk', text: '你' })
    expect(result.events[4]).toEqual({ type: 'stream_done', fullText: '这是最终答复' })
  })

  it('协议合法性：每个 tool_call 都有对应的 tool 消息回灌（Python 会在此留非法序列）', async () => {
    const transport = scripted([
      {
        content: '',
        toolCalls: [
          { id: 'c1', name: 'system.game_data', arguments: {} },
          { id: 'c2', name: '不存在的工具', arguments: {} }
        ],
        finishReason: 'tool_calls'
      },
      FINAL
    ])
    await runBrainLoop({ input: 'x', systemPrompts: [], transport, runner: makeRunner() })

    const secondMessages = transport.calls[1]?.messages ?? []
    const toolIds = secondMessages.filter((message) => message.role === 'tool').map((message) => message.tool_call_id)
    expect(toolIds).toEqual(['c1', 'c2'])
    // assistant 的 tool_calls 与 tool 结果一一对应
    const assistant = secondMessages.find((message) => message.role === 'assistant' && message.tool_calls)
    expect(assistant?.tool_calls?.map((call) => call.id)).toEqual(['c1', 'c2'])
  })
})

describe('runBrainLoop：分支与兜底', () => {
  it('未知工具：记失败并回灌；全部不可解析则退出循环走兜底', async () => {
    const transport = scripted([toolCall('c1', '不存在的工具'), FINAL])
    const result = await runBrainLoop({ input: 'x', systemPrompts: [], transport, runner: makeRunner() })

    expect(result.events[4]).toEqual({
      type: 'step_done',
      tool: '不存在的工具',
      result: '未知工具: 不存在的工具',
      success: false
    })
    // 没有任何工具执行成功 → 不进第二轮
    expect(transport.calls).toHaveLength(1)
    expect(types(result.events)).toEqual([
      'step_start',
      'turn_stats',
      'stream_done',
      'step_start',
      'step_done',
      'done'
    ])
    expect(result.text).toBe('未知工具: 不存在的工具')
  })

  it('危险操作无审批通道 → 一律拒绝执行并回灌 [STOP]；拒绝后继续循环（不误判为不可解析）', async () => {
    const transport = scripted([toolCall('c1', 'system.shell', { action: 'exec' }), FINAL])
    const runner = makeRunner({ dangerous: () => true })
    const result = await runBrainLoop({ input: 'x', systemPrompts: [], transport, runner })

    expect(types(result.events)).toContain('approval_required')
    const approval = result.events.find((event) => event.type === 'approval_required')
    expect(approval).toEqual({
      type: 'approval_required',
      requestId: expect.any(String),
      tool: 'system.shell',
      // 与 dispatcher 同口径：别名 `exec` 已归一为 `execute`（否则用户批准了也过不了令牌比对）
      action: 'execute',
      params: { action: 'exec' }
    })
    expect(runner.executed).toHaveLength(0)
    // 拒绝 ≠ 工具不可用：继续循环把 [STOP] 交给 LLM（下一轮拿到 FINAL），而非直接终止整轮
    expect(types(result.events)).toEqual([
      'step_start',
      'turn_stats',
      'stream_done',
      'step_start',
      'approval_required',
      'step_done',
      'step_start',
      'turn_stats',
      'stream_done',
      'done'
    ])
    expect(result.events[5]).toEqual({
      type: 'step_done',
      tool: 'system.shell',
      result: '[STOP] 用户未确认危险操作: system.shell',
      success: false
    })
    expect(result.stopReason).toBe('final')
    expect(result.text).toBe('这是最终答复')
  })

  it('危险操作获批 → 执行并写入一次性确认令牌', async () => {
    const transport = scripted([toolCall('c1', 'system.shell', { action: 'exec' }), FINAL])
    const runner = makeRunner({ dangerous: () => true })
    const context = {}
    const approvals: string[] = []
    const result = await runBrainLoop({
      input: 'x',
      systemPrompts: [],
      transport,
      runner,
      context,
      requestApproval: (request) => {
        approvals.push(`${request.requestId}:${request.tool}/${request.action}`)
        return true
      }
    })

    // 令牌与判定均用归一化后的 action（`exec` → `execute`），与 dispatcher 的比对口径一致
    expect(approvals).toEqual([expect.stringMatching(/^approval_\d+:system\.shell\/execute$/u)])
    expect(runner.executed).toEqual([{ tool: 'system.shell', params: { action: 'exec' } }])
    expect(context).toMatchObject({ dangerConfirmed: { tool: 'system.shell', action: 'execute' } })
    expect(result.events.some((event) => event.type === 'step_done' && event.success)).toBe(true)
  })

  it('工具抛错 → 收敛为「执行失败: …」并继续循环', async () => {
    const transport = scripted([toolCall('c1', 'system.game_data'), FINAL])
    const runner = makeRunner()
    runner.execute = async () => {
      throw new Error('数据库炸了')
    }
    const result = await runBrainLoop({ input: 'x', systemPrompts: [], transport, runner })
    expect(result.events.some((event) => event.type === 'step_done' && event.result === '执行失败: 数据库炸了')).toBe(true)
    expect(result.text).toBe('这是最终答复')
  })

  it('LLM 传输失败 → error 事件 + completed=false + 兜底文案', async () => {
    const transport: BrainLlmTransport = {
      complete: async () => {
        throw new Error('未检测到本地 Ollama 服务')
      }
    }
    const result = await runBrainLoop({ input: 'x', systemPrompts: [], transport, runner: makeRunner() })
    expect(types(result.events)).toEqual(['step_start', 'error'])
    expect(result.events[1]).toEqual({ type: 'error', message: '未检测到本地 Ollama 服务' })
    expect(result.completed).toBe(false)
    expect(result.text).toBe(FALLBACK_ANSWER)
  })

  it('工具执行失败时兜底答复取失败文案', async () => {
    const transport: BrainLlmTransport = {
      complete: async () => {
        throw new Error('炸了')
      }
    }
    const runner = makeRunner()
    const result = await runBrainLoop({
      input: 'x',
      systemPrompts: [],
      transport,
      runner,
      maxTurns: 1
    })
    expect(result.text).toBe(FALLBACK_ANSWER)
  })

  it('迭代用尽 → 兜底答复取最后一次工具结果', async () => {
    const transport = scripted([toolCall('c1', 'system.game_data')])
    const result = await runBrainLoop({
      input: 'x',
      systemPrompts: [],
      transport,
      runner: makeRunner(),
      maxTurns: 1
    })
    expect(transport.calls).toHaveLength(1)
    expect(result.text).toBe('已执行 system.game_data')
    expect(result.completed).toBe(true)
  })

  it('无工具调用但 finishReason 非 stop → 退出循环并兜底', async () => {
    const transport = scripted([{ content: '半截话', toolCalls: [], finishReason: 'length' }])
    const result = await runBrainLoop({ input: 'x', systemPrompts: [], transport, runner: makeRunner() })
    expect(types(result.events)).toEqual(['step_start', 'turn_stats', 'stream_done', 'done'])
    expect(result.text).toBe(FALLBACK_ANSWER)
    expect(result.events.at(-1)).toEqual({ type: 'done', text: FALLBACK_ANSWER })
  })

  it('options.tools 透传给传输层；onEvent 实时回调与返回值一致', async () => {
    const transport = scripted([FINAL])
    const streamed: BrainEvent[] = []
    const schemas = [{ name: 'system.game_data' }]
    const result = await runBrainLoop({
      input: 'x',
      systemPrompts: [],
      transport,
      runner: makeRunner(),
      tools: schemas,
      onEvent: (event) => streamed.push(event)
    })
    expect(transport.calls[0]?.tools).toEqual(schemas)
    expect(streamed).toEqual(result.events)
    expect(DEFAULT_MAX_TURNS).toBe(6)
    expect(DEFAULT_MAX_TOOL_CALLS).toBe(8)
    expect(DEFAULT_WALL_CLOCK_MS).toBe(120_000)
  })
})

/* ---- 技能交互（确认破坏性动作 / 提问澄清） ---- */

interface InteractionRunner extends BrainToolRunner {
  calls: Array<Record<string, unknown>>
}

/** 首次返回 confirm 交互、带 confirm:true 时成功删除的 runner */
function makeConfirmRunner(): InteractionRunner {
  const calls: Array<Record<string, unknown>> = []
  return {
    calls,
    resolve: (name) => name,
    needsConfirmation: () => false,
    execute: async (_tool, params) => {
      calls.push({ ...params })
      if (params.confirm !== true) {
        const prompt = '确认删除角色【法师】？此操作不可撤销。'
        return {
          success: false,
          message: '',
          error: `[WARN] ${prompt}`,
          interaction: { kind: 'confirm', prompt }
        }
      }
      return { success: true, message: '已删除角色【法师】' }
    }
  }
}

describe('runBrainLoop：技能交互（确认 / 提问）', () => {
  it('confirm：批准后带 confirm:true 重执行，结果回灌', async () => {
    const runner = makeConfirmRunner()
    const transport = scripted([toolCall('c1', 'system.game_data', { action: 'delete', name: '法师' }), FINAL])
    const result = await runBrainLoop({
      input: '删掉法师',
      systemPrompts: [],
      transport,
      runner,
      requestInteraction: () => ({ approved: true })
    })

    expect(runner.calls).toEqual([
      { action: 'delete', name: '法师' },
      { action: 'delete', name: '法师', confirm: true }
    ])
    const required = result.events.find((event) => event.type === 'interaction_required')
    expect(required).toEqual({
      type: 'interaction_required',
      requestId: expect.any(String),
      tool: 'system.game_data',
      action: 'delete',
      interaction: { kind: 'confirm', prompt: '确认删除角色【法师】？此操作不可撤销。' }
    })
    expect(result.events.some((event) => event.type === 'step_done' && event.result === '已删除角色【法师】')).toBe(true)
  })

  it('confirm：用户取消 → 记 [STOP] 且不重执行', async () => {
    const runner = makeConfirmRunner()
    const transport = scripted([toolCall('c1', 'system.game_data', { action: 'delete' }), FINAL])
    const result = await runBrainLoop({
      input: 'x',
      systemPrompts: [],
      transport,
      runner,
      requestInteraction: () => ({ approved: false })
    })

    expect(runner.calls).toHaveLength(1)
    expect(
      result.events.some(
        (event) => event.type === 'step_done' && event.result === '[STOP] 用户未确认该操作: system.game_data'
      )
    ).toBe(true)
  })

  it('confirm：无答复通道 → 按未确认处理（不做隐式放行）', async () => {
    const runner = makeConfirmRunner()
    const transport = scripted([toolCall('c1', 'system.game_data', { action: 'delete' }), FINAL])
    const result = await runBrainLoop({ input: 'x', systemPrompts: [], transport, runner })
    expect(runner.calls).toHaveLength(1)
    expect(result.events.some((event) => event.type === 'step_done' && event.result.includes('[STOP]'))).toBe(true)
  })

  it('confirm：确认后仍要求确认 → 直接停止（不做多次重试）', async () => {
    const runner: BrainToolRunner = {
      resolve: (name) => name,
      needsConfirmation: () => false,
      execute: async () => ({
        success: false,
        message: '',
        error: '[WARN] 还要确认',
        interaction: { kind: 'confirm', prompt: '还要确认' }
      })
    }
    const transport = scripted([toolCall('c1', 'system.game_data', { action: 'delete' }), FINAL])
    const result = await runBrainLoop({
      input: 'x',
      systemPrompts: [],
      transport,
      runner,
      requestInteraction: () => ({ approved: true })
    })
    expect(
      result.events.some(
        (event) =>
          event.type === 'step_done' && event.result === '[STOP] 确认后该操作仍要求再次确认: system.game_data'
      )
    ).toBe(true)
  })

  it('question：答复作为「用户回答：…」回灌，且不重执行', async () => {
    const calls: Array<Record<string, unknown>> = []
    const runner: BrainToolRunner = {
      resolve: (name) => name,
      needsConfirmation: () => false,
      execute: async (_tool, params) => {
        calls.push({ ...params })
        return {
          success: true,
          message: '',
          interaction: { kind: 'question', prompt: '用哪个职业？', options: [{ label: '战士' }, { label: '法师' }] }
        }
      }
    }
    const transport = scripted([toolCall('c1', 'tool.ask_user', { action: 'ask' }), FINAL])
    const result = await runBrainLoop({
      input: 'x',
      systemPrompts: [],
      transport,
      runner,
      requestInteraction: () => ({ answer: '法师' })
    })

    expect(calls).toHaveLength(1)
    expect(result.events.some((event) => event.type === 'step_done' && event.result === '用户回答：法师')).toBe(true)
    // 答复回灌进消息序列，供 LLM 下一轮使用
    const secondMessages = transport.calls[1]?.messages ?? []
    expect(secondMessages.some((message) => message.role === 'tool' && message.content === '用户回答：法师')).toBe(true)
  })

  it('超时保护：用户迟迟不答复 → 按未确认回落，循环不永久挂住', async () => {
    const runner = makeConfirmRunner()
    const transport = scripted([toolCall('c1', 'system.game_data', { action: 'delete' }), FINAL])
    const result = await runBrainLoop({
      input: 'x',
      systemPrompts: [],
      transport,
      runner,
      interactionTimeoutMs: 10,
      // 永不兑现的答复通道（模拟用户无视弹窗）
      requestInteraction: () => new Promise(() => undefined)
    })

    expect(runner.calls).toHaveLength(1)
    expect(
      result.events.some(
        (event) => event.type === 'step_done' && event.result === '[STOP] 用户未确认该操作: system.game_data'
      )
    ).toBe(true)
    expect(result.completed).toBe(true)
  })

  it('超时保护：危险操作审批超时同样按未批准处理', async () => {
    const transport = scripted([toolCall('c1', 'system.shell', { action: 'execute' }), FINAL])
    const runner = makeRunner({ dangerous: () => true })
    const result = await runBrainLoop({
      input: 'x',
      systemPrompts: [],
      transport,
      runner,
      interactionTimeoutMs: 10,
      requestApproval: () => new Promise(() => undefined)
    })
    expect(runner.executed).toHaveLength(0)
    expect(result.events.some((event) => event.type === 'step_done' && event.result.includes('[STOP]'))).toBe(true)
  })

  it('多问题：全部作答 → 按序号回灌；缺项 → 记 [STOP]', async () => {
    const runner: BrainToolRunner = {
      resolve: (name) => name,
      needsConfirmation: () => false,
      execute: async () => ({
        success: true,
        message: '',
        interaction: {
          kind: 'question',
          prompt: '请回答以下 2 个问题',
          questions: [
            { prompt: '用哪个职业？', options: [{ label: '战士' }, { label: '法师' }] },
            { prompt: '要哪些流派？', options: [{ label: '普攻流' }, { label: 'CD 流' }], multiSelect: true }
          ]
        }
      })
    }

    const okTransport = scripted([toolCall('c1', 'tool.ask_user', { action: 'ask' }), FINAL])
    const ok = await runBrainLoop({
      input: 'x',
      systemPrompts: [],
      transport: okTransport,
      runner,
      requestInteraction: () => ({ answers: ['法师', '普攻流、CD 流'] })
    })
    const expected = '用户回答：\n1. 用哪个职业？ → 法师\n2. 要哪些流派？ → 普攻流、CD 流'
    expect(ok.events.some((event) => event.type === 'step_done' && event.result === expected)).toBe(true)

    // 只答一题 → 拒绝（要求全部作答）
    const partialTransport = scripted([toolCall('c1', 'tool.ask_user', { action: 'ask' }), FINAL])
    const partial = await runBrainLoop({
      input: 'x',
      systemPrompts: [],
      transport: partialTransport,
      runner,
      requestInteraction: () => ({ answers: ['法师', ''] })
    })
    expect(
      partial.events.some(
        (event) => event.type === 'step_done' && event.result === '[STOP] 用户未解答全部提问（缺 1/2）'
      )
    ).toBe(true)

    // 完全没给 answers → 同样按缺 2/2 处理
    const noneTransport = scripted([toolCall('c1', 'tool.ask_user', { action: 'ask' }), FINAL])
    const none = await runBrainLoop({
      input: 'x',
      systemPrompts: [],
      transport: noneTransport,
      runner,
      requestInteraction: () => ({})
    })
    expect(
      none.events.some(
        (event) => event.type === 'step_done' && event.result === '[STOP] 用户未解答全部提问（缺 2/2）'
      )
    ).toBe(true)
  })

  it('question：答复为空 → 记 [STOP] 未解答', async () => {
    const runner: BrainToolRunner = {
      resolve: (name) => name,
      needsConfirmation: () => false,
      execute: async () => ({
        success: true,
        message: '',
        interaction: { kind: 'question', prompt: '用哪个职业？' }
      })
    }
    const transport = scripted([toolCall('c1', 'tool.ask_user', { action: 'ask' }), FINAL])
    const result = await runBrainLoop({
      input: 'x',
      systemPrompts: [],
      transport,
      runner,
      requestInteraction: () => ({})
    })
    expect(
      result.events.some(
        (event) => event.type === 'step_done' && event.result === '[STOP] 用户未解答提问: 用哪个职业？'
      )
    ).toBe(true)
  })
})

/* ---- M1 观测（每轮 token / 耗时 / 轮数 / 模型） ---- */

describe('runBrainLoop：M1 观测', () => {
  it('两轮工具往返：stats 累加 usage / 轮数 / 工具数，末轮模型入账', async () => {
    const transport = scripted([
      {
        content: '',
        toolCalls: [{ id: 'c1', name: 'system.game_data', arguments: { action: 'list' } }],
        finishReason: 'tool_calls',
        model: 'qwen3:4b',
        usage: { promptTokens: 100, completionTokens: 20, totalTokens: 120 }
      },
      {
        content: '完成',
        toolCalls: [],
        finishReason: 'stop',
        model: 'qwen3:4b',
        usage: { promptTokens: 200, completionTokens: 30, totalTokens: 230 }
      }
    ])
    const result = await runBrainLoop({ input: 'x', systemPrompts: [], transport, runner: makeRunner() })

    expect(result.stats).toMatchObject({
      turns: 2,
      promptTokens: 300,
      completionTokens: 50,
      totalTokens: 350,
      toolCalls: 1,
      model: 'qwen3:4b',
      tier: 'local'
    })
    expect(result.stats.latencyMs).toBeGreaterThanOrEqual(0)

    // 每轮恰好一个 turn_stats，且轮号 / 用量对齐
    const turnStats = result.events.filter((event) => event.type === 'turn_stats')
    expect(turnStats).toHaveLength(2)
    expect(turnStats[0]).toMatchObject({ turn: 0, model: 'qwen3:4b', toolCalls: 1, usage: { totalTokens: 120 } })
    expect(turnStats[1]).toMatchObject({ turn: 1, toolCalls: 0, usage: { totalTokens: 230 } })
  })

  it('M3 档位注入：tier 选项透传到 stats 与每轮 turn_stats（缺省仍为 local）', async () => {
    const withTier = await runBrainLoop({
      input: 'x',
      systemPrompts: [],
      transport: scripted([FINAL]),
      runner: makeRunner(),
      tier: 'cloud'
    })
    expect(withTier.stats.tier).toBe('cloud')
    expect(withTier.events.find((event) => event.type === 'turn_stats')).toMatchObject({ tier: 'cloud' })

    const byDefault = await runBrainLoop({
      input: 'x',
      systemPrompts: [],
      transport: scripted([FINAL]),
      runner: makeRunner()
    })
    expect(byDefault.stats.tier).toBe('local')
  })

  it('usage 缺失（桩未回报）→ 回落零值，不产生 NaN，也不阻塞终稿', async () => {
    const transport = scripted([FINAL]) // FINAL 无 usage / model
    const result = await runBrainLoop({ input: 'x', systemPrompts: [], transport, runner: makeRunner() })

    expect(result.stats.totalTokens).toBe(0)
    expect(result.stats.model).toBe('')
    const turnStats = result.events.find((event) => event.type === 'turn_stats')
    expect(turnStats).toMatchObject({
      model: '',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
    })
  })

  it('传输失败（未进入完成态）→ 无 turn_stats、stats 保持零（错误不是被观测吞掉）', async () => {
    const transport: BrainLlmTransport = {
      complete: async () => {
        throw new Error('炸了')
      }
    }
    const result = await runBrainLoop({ input: 'x', systemPrompts: [], transport, runner: makeRunner() })

    expect(result.completed).toBe(false)
    expect(result.stats.turns).toBe(0)
    expect(result.events.some((event) => event.type === 'turn_stats')).toBe(false)
  })
})

/* ---- M0.5 三道计数闸（DD-5） ---- */

describe('runBrainLoop：M0.5 终止闸', () => {
  it('max_turns：轮次用尽 → 部分产出 finalize + stopReason=max_turns + terminated 事件', async () => {
    // 每轮都要求工具（永不终稿）⇒ 只受轮次闸约束
    const transport = scripted([toolCall('c1', 'system.game_data')])
    const result = await runBrainLoop({
      input: 'x',
      systemPrompts: [],
      transport,
      runner: makeRunner(),
      maxTurns: 2
    })

    expect(transport.calls).toHaveLength(2)
    expect(result.completed).toBe(true)
    expect(result.stopReason).toBe('max_turns')
    expect(result.events.find((event) => event.type === 'terminated')).toEqual({
      type: 'terminated',
      reason: 'max_turns',
      detail: expect.stringContaining('轮次上限')
    })
    // 部分产出：取最后一次工具结果，而非兜底文案
    expect(result.text).toBe('已执行 system.game_data')
  })

  it('max_tool_calls：累计超限 → 本批不执行且补 [STOP] tool 消息（会话协议仍合法）', async () => {
    // 单轮 2 个工具、上限 1 ⇒ 累计 2 > 1 ⇒ 不执行本批
    const transport = scripted([
      {
        content: '',
        toolCalls: [
          { id: 'c1', name: 'system.game_data', arguments: { action: 'list' } },
          { id: 'c2', name: 'system.ceshu', arguments: { action: 'list' } }
        ],
        finishReason: 'tool_calls'
      },
      FINAL
    ])
    const runner = makeRunner()
    const result = await runBrainLoop({
      input: 'x',
      systemPrompts: [],
      transport,
      runner,
      maxToolCalls: 1
    })

    expect(runner.executed).toHaveLength(0) // 超限的工具一个都没跑
    expect(result.stopReason).toBe('max_tool_calls')
    expect(result.events.some((event) => event.type === 'terminated' && event.reason === 'max_tool_calls')).toBe(true)
    expect(result.completed).toBe(true)
    // 断言真正的行为差异：每个 tool_call 都有配对的 tool 消息（否则后续会话续跑会报错）
    const assistant = result.messages.find((message) => message.role === 'assistant' && message.tool_calls)
    const toolIds = result.messages.filter((message) => message.role === 'tool').map((message) => message.tool_call_id)
    expect(assistant?.tool_calls?.map((call) => call.id)).toEqual(['c1', 'c2'])
    expect(toolIds).toEqual(['c1', 'c2'])
    expect(result.messages.filter((message) => message.role === 'tool').every((m) => m.content.includes('工具调用上限'))).toBe(true)
  })

  it('max_tool_calls：刚好不超限时正常执行到底', async () => {
    const transport = scripted([toolCall('c1', 'system.game_data'), FINAL])
    const runner = makeRunner()
    const result = await runBrainLoop({ input: 'x', systemPrompts: [], transport, runner, maxToolCalls: 1 })
    expect(runner.executed).toHaveLength(1)
    expect(result.stopReason).toBe('final')
    expect(result.events.some((event) => event.type === 'terminated')).toBe(false)
  })

  it('wall_clock：墙钟超时 → 在下一轮 LLM 调用前止住并 finalize', async () => {
    const transport: BrainLlmTransport = {
      complete: async () => {
        // 每轮 LLM 调用耗时 40ms，闸值 15ms ⇒ 第二轮开始前即超时
        await new Promise((resolve) => setTimeout(resolve, 40))
        return toolCall('c1', 'system.game_data')
      }
    }
    const result = await runBrainLoop({
      input: 'x',
      systemPrompts: [],
      transport,
      runner: makeRunner(),
      wallClockMs: 15
    })
    expect(result.stopReason).toBe('wall_clock')
    expect(result.events.some((event) => event.type === 'terminated' && event.reason === 'wall_clock')).toBe(true)
    expect(result.completed).toBe(true)
    expect(result.stats.turns).toBe(1) // 只跑了 1 轮就被墙钟止住
  })

  it('正常终稿：无 terminated 事件、stopReason=final（闸不误伤正常完成）', async () => {
    const transport = scripted([FINAL])
    const result = await runBrainLoop({ input: 'x', systemPrompts: [], transport, runner: makeRunner() })
    expect(result.stopReason).toBe('final')
    expect(result.events.some((event) => event.type === 'terminated')).toBe(false)
  })

  it('工具全不可解析：stopReason=unresolvable_tools，且不发 terminated（非计数闸，不冒充部分结果）', async () => {
    const transport = scripted([toolCall('c1', '不存在的工具')])
    const result = await runBrainLoop({ input: 'x', systemPrompts: [], transport, runner: makeRunner() })
    expect(result.stopReason).toBe('unresolvable_tools')
    expect(result.events.some((event) => event.type === 'terminated')).toBe(false)
  })
})

/* ---- 审查修复回归（F1/F2 令牌与判定口径、F3 拒绝后继续、F4 审批通道异常） ---- */

describe('runBrainLoop：审查修复回归', () => {
  /**
   * 模拟 dispatcher 的真实语义：执行前 `fixParams` 归一 action，
   * 再用**归一化 action** 与一次性令牌比对，匹配才执行并就地置空。
   */
  function makeDispatcherLikeRunner(): {
    runner: BrainToolRunner
    seen: Array<{ action: string; token?: string }>
  } {
    const seen: Array<{ action: string; token?: string }> = []
    const runner: BrainToolRunner = {
      resolve: (name) => name,
      needsConfirmation: (tool, action) => resolveRiskLevel(tool, action) >= RISK_LEVEL.SYSTEM,
      execute: async (tool, params, ctx) => {
        const fixed = fixParams(tool, params)
        const action = typeof fixed.action === 'string' ? fixed.action : ''
        const token = ctx.dangerConfirmed
        seen.push({ action, token: token === null || token === undefined ? undefined : token.action })
        if (token === null || token === undefined || token.action !== action) {
          return { success: false, message: '', error: `高危操作需用户确认: ${tool}/${action}` }
        }
        ctx.dangerConfirmed = null
        return { success: true, message: '沙箱执行成功' }
      }
    }
    return { runner, seen }
  }

  it('F1+F2：模型输出别名 action（执行 → execute）时，判定与令牌均用归一值，批准后能真正执行', async () => {
    const { runner, seen } = makeDispatcherLikeRunner()
    const gateActions: string[] = []
    const gate: BrainToolRunner = {
      ...runner,
      needsConfirmation: (tool, action) => {
        gateActions.push(action)
        return resolveRiskLevel(tool, action) >= RISK_LEVEL.SYSTEM
      }
    }
    const transport = scripted([toolCall('c1', 'system.code', { action: '执行', code: 'return 1' }), FINAL])
    const result = await runBrainLoop({
      input: 'x',
      systemPrompts: [],
      transport,
      runner: gate,
      requestApproval: () => true
    })

    // 修复前：gate 收到 '执行'、令牌写成 '执行' ⇒ 执行时与归一值 'execute' 比对失败（批准了仍被拒）
    expect(gateActions).toEqual(['execute'])
    expect(seen).toEqual([{ action: 'execute', token: 'execute' }])
    expect(result.events.some((event) => event.type === 'step_done' && event.success)).toBe(true)
  })

  it('F3：全部被用户拒绝 → 不停机，继续把 [STOP] 交给模型（stopReason 不再误报 unresolvable_tools）', async () => {
    const transport = scripted([toolCall('c1', 'system.shell', { action: 'execute' }), FINAL])
    const runner = makeRunner({ dangerous: () => true })
    const result = await runBrainLoop({ input: 'x', systemPrompts: [], transport, runner })

    expect(transport.calls).toHaveLength(2)
    expect(result.stopReason).toBe('final')
    expect(result.text).toBe('这是最终答复')
  })

  it('F4：审批通道抛错 → 按未批准处理，整轮不 reject', async () => {
    const transport = scripted([toolCall('c1', 'system.shell', { action: 'execute' }), FINAL])
    const runner = makeRunner({ dangerous: () => true })
    const result = await runBrainLoop({
      input: 'x',
      systemPrompts: [],
      transport,
      runner,
      requestApproval: () => {
        throw new Error('审批通道断了')
      }
    })

    expect(result.completed).toBe(true)
    expect(runner.executed).toHaveLength(0)
    expect(
      result.events.some(
        (event) => event.type === 'step_done' && event.result === '[STOP] 用户未确认危险操作: system.shell'
      )
    ).toBe(true)
  })
})
