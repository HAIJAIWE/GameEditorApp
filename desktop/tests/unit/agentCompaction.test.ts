/**
 * 上下文压缩子包单测（压力阈值 / 工具结果剪枝 / 工具配对 / 编排）。
 *
 * 设计出处：dsh `compaction-basic`（按模型窗口推导阈值）、
 * `compaction-tool-result-pruner`（首尾保留 + 码点切分）、
 * `compaction/tool-pairing`（工具配对计数器）。
 *
 * `estimateTokens` = ceil(len/2)，故 6000 字 ≈ 3000 token。
 * 本地档阈值 6000，因此 3 条 6000 字的消息（9000 token）会触发压缩。
 */
import { describe, expect, it } from 'vitest'
import {
  PRUNE_MARKER,
  codePointLength,
  pruneText,
  pruneToolResult
} from '../../src/shared/agent/compaction/prune'
import { cutBalanced, pairingDelta, safeTailCount } from '../../src/shared/agent/compaction/pairing'
import { resolvePressureBudget } from '../../src/shared/agent/compaction/pressure'
import { compactHistory, estimateTokensOf } from '../../src/shared/agent/compaction/compact'
import { clipToolResult } from '../../src/shared/agent/brain/context'
import type { BrainMessage } from '../../src/shared/agent/runtime/brainMessages'

const big = (tag: string) => `${tag}-${'x'.repeat(6000)}`

function assistantWithTool(content: string): BrainMessage {
  return {
    role: 'assistant',
    content,
    tool_calls: [{ id: 'call-1', type: 'function', function: { name: 'demo', arguments: '{}' } }]
  }
}

function toolResultOf(content: string): BrainMessage {
  return { role: 'tool', content, tool_call_id: 'call-1', name: 'demo' }
}

/** 检测落单的代理项（劈开 surrogate pair 会产生半个字符） */
const LONE_SURROGATE = /[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF]/

describe('工具结果剪枝（保留首尾 + 码点安全）', () => {
  it('未超阈值时原样返回', () => {
    const text = '短结果'
    expect(pruneText(text, { thresholdChars: 100, headChars: 40, tailChars: 30 })).toBe(text)
  })

  it('超阈值时保留 head + 标记 + tail（不再像旧实现那样丢掉尾部）', () => {
    const text = `HEAD${'x'.repeat(900)}TAIL`
    const pruned = pruneText(text, { thresholdChars: 100, headChars: 40, tailChars: 30 })
    expect(pruned).toContain('HEAD')
    expect(pruned).toContain('TAIL') // 旧实现 slice(0,max) 会把 TAIL 砍掉
    expect(pruned).toContain(PRUNE_MARKER)
    expect(pruned.length).toBeLessThan(text.length)
  })

  it('按 Unicode 码点切分，不会劈开代理对（emoji 安全）', () => {
    const text = '😀'.repeat(600)
    expect(codePointLength(text)).toBe(600) // 不是 1200（UTF-16 码元）
    const pruned = pruneText(text, { thresholdChars: 100, headChars: 50, tailChars: 30 })
    expect(LONE_SURROGATE.test(pruned)).toBe(false)
    expect(codePointLength(pruned)).toBeLessThan(600)
  })

  it('按档位剪枝：本地档阈值 1500、云端档 4000', () => {
    const local = pruneToolResult('y'.repeat(3000), 'local')
    const cloud = pruneToolResult('y'.repeat(3000), 'cloud')
    expect(local.length).toBeLessThan(3000)
    // 云端预算更宽，剪得更少 ⇒ 保留的内容更多
    expect(cloud.length).toBeGreaterThan(local.length)
  })
})

describe('工具配对（压缩不得留下悬空 tool_call）', () => {
  it('增量：assistant 的 tool_calls 开 N，tool 关 1，其余为 0', () => {
    expect(pairingDelta({ role: 'user', content: 'hi' })).toBe(0)
    expect(pairingDelta(assistantWithTool('x'))).toBe(1)
    expect(pairingDelta(toolResultOf('x'))).toBe(-1)
  })

  it('切点平衡：assistant 之后不平衡，其 tool 应答之后才平衡', () => {
    const messages: BrainMessage[] = [assistantWithTool('a'), toolResultOf('b')]
    expect(cutBalanced(messages)).toEqual([true, false, true])
  })

  it('尾部保留数：为闭合配对会多留，而不是少留', () => {
    const messages: BrainMessage[] = [
      { role: 'user', content: 'u1' },
      assistantWithTool('a1'),
      toolResultOf('t1'),
      { role: 'user', content: 'u2' }
    ]
    // 想留 2 条会把 assistant 和它的 tool 应答切散 ⇒ 必须留 3 条
    expect(safeTailCount(messages, 2)).toBe(3)
  })

  it('已闭合时按意愿保留，不多留', () => {
    const messages: BrainMessage[] = [
      { role: 'user', content: 'u1' },
      { role: 'user', content: 'u2' },
      { role: 'user', content: 'u3' }
    ]
    expect(safeTailCount(messages, 2)).toBe(2)
  })
})

describe('压力预算（由模型窗口推导，小模型被保护）', () => {
  it('本地档保持 6000（与改造前硬编码一致，零回归）', () => {
    expect(resolvePressureBudget('local', 'qwen3:8b').thresholdTokens).toBe(6000)
  })

  it('云端档未知模型保持 30000（与改造前一致）', () => {
    expect(resolvePressureBudget('cloud', '').thresholdTokens).toBe(30000)
  })

  it('云端档小窗口模型会提前压缩（gpt-4 仅 8192 窗口）', () => {
    const budget = resolvePressureBudget('cloud', 'gpt-4')
    expect(budget.contextWindow).toBe(8192)
    expect(budget.thresholdTokens).toBeLessThan(30000)
    expect(budget.thresholdTokens).toBe(Math.floor(8192 * 0.8))
  })
})

describe('压缩编排', () => {
  it('未达阈值不压缩', () => {
    const messages: BrainMessage[] = [
      { role: 'user', content: '短' },
      { role: 'assistant', content: '也很短' }
    ]
    const result = compactHistory(messages, { tier: 'local' })
    expect(result.compacted).toBe(false)
    expect(result.messages).toBe(messages)
  })

  it('超阈值时压缩成交接摘要，并声明压了多少条', () => {
    const messages: BrainMessage[] = [
      { role: 'system', content: 'SYS' },
      { role: 'user', content: big('u1') },
      { role: 'assistant', content: big('a1') },
      { role: 'user', content: big('u2') }
    ]
    expect(estimateTokensOf(messages)).toBeGreaterThan(6000)
    const result = compactHistory(messages, { tier: 'local' })
    expect(result.compacted).toBe(true)
    expect(result.dropped).toBe(1)
    // system 保留在最前，摘要紧随其后
    expect(result.messages[0]?.role).toBe('system')
    expect(result.messages[0]?.content).toBe('SYS')
    expect(result.messages[1]?.content).toContain('上下文交接摘要')
    expect(result.messages[1]?.content).toContain('前 1 条已压缩')
  })

  it('压缩不拆散工具配对（不会留下悬空 tool_call）', () => {
    const messages: BrainMessage[] = [
      { role: 'user', content: big('u1') },
      assistantWithTool(big('a1')),
      toolResultOf(big('t1')),
      { role: 'user', content: big('u2') }
    ]
    const result = compactHistory(messages, { tier: 'local' })
    expect(result.compacted).toBe(true)
    // 保留了 assistant 与其 tool 应答 ⇒ 3 条，只压掉开头 1 条
    expect(result.dropped).toBe(1)
    const roles = result.messages.map((message) => message.role)
    expect(roles).toContain('assistant')
    expect(roles).toContain('tool')
    // 尾部区域本身必须是配对平衡的
    const tail = result.messages.filter((message) => message.role !== 'system').slice(-3)
    expect(cutBalanced(tail).at(-1)).toBe(true)
  })
})

describe('clipToolResult 回归（保留尾部）', () => {
  it('长结果同时保留开头与结尾', () => {
    const text = `BEGIN${'z'.repeat(2000)}ERROR-at-end`
    const clipped = clipToolResult(text, 300)
    expect(clipped).toContain('BEGIN')
    expect(clipped).toContain('ERROR-at-end')
  })

  it('短结果不受影响', () => {
    expect(clipToolResult('很短', 300)).toBe('很短')
  })
})
