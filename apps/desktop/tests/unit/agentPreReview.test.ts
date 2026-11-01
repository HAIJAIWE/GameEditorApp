import { describe, expect, it } from 'vitest'

import {
  isPreReviewEnabled,
  makePreExecReview,
  setPreReviewEnabled
} from '../../src/main/agent/agentService/preReview'
import type { BrainLlmRequest, BrainLlmReply, BrainLlmTransport } from '@mobai/shared/agent/brain'

/** 桩传输层：固定返回一段 content，并记录请求（便于断言 system 策略确实下发） */
function stubTransport(content: string): BrainLlmTransport & { calls: BrainLlmRequest[] } {
  const calls: BrainLlmRequest[] = []
  return {
    calls,
    complete: async (request) => {
      calls.push(request)
      const reply: BrainLlmReply = { content, toolCalls: [], finishReason: 'stop' }
      return reply
    }
  }
}

const ctx = { tool: 'system.shell', action: 'execute', params: { cmd: 'rm -rf x' }, risk: 4 }

describe('preReview provider（#27 LLM 判读，dsh Auto 语义）', () => {
  it('low + allow → approve:true（放行直接执行）', async () => {
    const transport = stubTransport('{"risk":"low","decision":"allow"}')
    const verdict = await makePreExecReview(transport)(ctx)
    expect(verdict.approve).toBe(true)
    expect(verdict.risk).toBe('low')
    // 发了固定策略（system）+ 一条待审调用（user）
    expect(transport.calls).toHaveLength(1)
    expect(transport.calls[0]?.messages[0]?.role).toBe('system')
    expect(transport.calls[0]?.messages[1]?.role).toBe('user')
  })

  it('high + deny（带 reason）→ approve:false 且透传原因', async () => {
    const transport = stubTransport('{"risk":"high","decision":"deny","reason":"跨信任边界外泄密钥"}')
    const verdict = await makePreExecReview(transport)(ctx)
    expect(verdict.approve).toBe(false)
    expect(verdict.risk).toBe('high')
    expect(verdict.reason).toContain('外泄密钥')
  })

  it('medium + deny（无 reason）→ 用兜底原因', async () => {
    const transport = stubTransport('{"risk":"medium","decision":"deny"}')
    const verdict = await makePreExecReview(transport)(ctx)
    expect(verdict.approve).toBe(false)
    expect(verdict.reason).toContain('medium')
  })

  it('容忍 ```json 围栏与前后杂字', async () => {
    const transport = stubTransport('好的：\n```json\n{"risk":"medium","decision":"allow"}\n```\n以上。')
    const verdict = await makePreExecReview(transport)(ctx)
    expect(verdict.approve).toBe(true)
    expect(verdict.risk).toBe('medium')
  })

  it('非法组合 high+allow → 抛错（fail-closed）', async () => {
    const transport = stubTransport('{"risk":"high","decision":"allow"}')
    await expect(makePreExecReview(transport)(ctx)).rejects.toThrow()
  })

  it('非 JSON 输出 → 抛错（fail-closed）', async () => {
    const transport = stubTransport('我觉得这个操作没问题，可以执行。')
    await expect(makePreExecReview(transport)(ctx)).rejects.toThrow()
  })

  it('传输层抛错 → 冒泡（由循环 fail-closed 处理）', async () => {
    const transport: BrainLlmTransport = {
      complete: async () => {
        throw new Error('网络挂了')
      }
    }
    await expect(makePreExecReview(transport)(ctx)).rejects.toThrow('网络挂了')
  })

  it('开关可被 setPreReviewEnabled 翻转，并经 isPreReviewEnabled 读回', () => {
    setPreReviewEnabled(true)
    expect(isPreReviewEnabled()).toBe(true)
    setPreReviewEnabled(false)
    expect(isPreReviewEnabled()).toBe(false)
    // 复位，避免污染其它用例（模块级状态）
    setPreReviewEnabled(false)
  })
})
