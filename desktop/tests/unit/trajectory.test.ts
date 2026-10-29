import { describe, expect, it } from 'vitest'

import { freshConversationState } from '../../src/shared/agent/conversationStore'
import type { DigitalStep } from '../../src/shared/agent/panel'
import { buildTrajectory, formatLatency } from '../../src/shared/agent/trajectory'

/**
 * 会话轨迹的纯逻辑：按轮次分组、计数、消息投影、耗时格式化。
 *
 * 分组口径与 `DigitalStepList` 一致（**连续** order 相同即同一轮，不排序），
 * 这里锁住「不排序」这一点：排序会把真实交错顺序抹平。
 */

function step(tool: string, order: number, status: DigitalStep['status'] = 'done'): DigitalStep {
  return { order, tool, kind: 'tool', status, ...(status === 'done' ? { success: true } : {}) }
}

describe('buildTrajectory', () => {
  it('空状态：概览全零、无轮次无消息', () => {
    const model = buildTrajectory(freshConversationState())
    expect(model.overview).toMatchObject({
      status: 'idle',
      messageCount: 0,
      turnCount: 0,
      stepCount: 0,
      failedCount: 0,
      runningSubagents: 0,
      totalTokens: 0
    })
    expect(model.turns).toEqual([])
    expect(model.messages).toEqual([])
  })

  it('按连续 order 分轮，并统计每轮完成/失败', () => {
    const state = {
      ...freshConversationState(),
      steps: [step('a', 0), step('b', 0, 'failed'), step('c', 1)]
    }
    const model = buildTrajectory(state)
    expect(model.turns).toHaveLength(2)
    expect(model.turns[0]).toMatchObject({ order: 0, done: 1, failed: 1 })
    expect(model.turns[1]).toMatchObject({ order: 1, done: 1, failed: 0 })
    expect(model.overview.stepCount).toBe(3)
    expect(model.overview.failedCount).toBe(1)
  })

  it('同一 order 不连续出现时按出现顺序各起一轮（不排序）', () => {
    const state = { ...freshConversationState(), steps: [step('a', 0), step('b', 1), step('c', 0)] }
    const model = buildTrajectory(state)
    expect(model.turns.map((turn) => turn.order)).toEqual([0, 1, 0])
  })

  it('行序号跨轮累加，摘要取结果首行并截断 80 字', () => {
    const long = `${'x'.repeat(120)}\n第二行`
    const state = {
      ...freshConversationState(),
      steps: [{ ...step('a', 0), result: long }, step('b', 1)]
    }
    const model = buildTrajectory(state)
    expect(model.turns[0]?.steps[0]?.index).toBe(0)
    expect(model.turns[1]?.steps[0]?.index).toBe(1)
    expect(model.turns[0]?.steps[0]?.summary).toHaveLength(81)
    expect(model.turns[0]?.steps[0]?.summary.endsWith('…')).toBe(true)
    expect(model.turns[1]?.steps[0]?.summary).toBe('')
  })

  it('消息按原文投影（role + text），运行中子智能体计入概览', () => {
    const state = {
      ...freshConversationState(),
      messages: [
        { id: 'm1', role: 'user' as const, text: '问题' },
        { id: 'm2', role: 'assistant' as const, text: '回答' }
      ],
      subagents: [
        { id: 's1', task: 'a', status: 'running' as const },
        { id: 's2', task: 'b', status: 'done' as const }
      ]
    }
    const model = buildTrajectory(state)
    expect(model.messages).toEqual([
      { role: 'user', text: '问题' },
      { role: 'assistant', text: '回答' }
    ])
    expect(model.overview.runningSubagents).toBe(1)
  })

  it('概览带上 token / 耗时 / 模型（来自 state.runStats）', () => {
    const state = {
      ...freshConversationState(),
      runStats: {
        ...freshConversationState().runStats,
        totalTokens: 1234,
        latencyMs: 2500,
        model: 'deepseek-v4'
      }
    }
    const model = buildTrajectory(state)
    expect(model.overview.totalTokens).toBe(1234)
    expect(model.overview.latencyMs).toBe(2500)
    expect(model.overview.model).toBe('deepseek-v4')
  })
})

describe('formatLatency', () => {
  it('0 / 非法值返回空串（未开始不显示 0ms）', () => {
    expect(formatLatency(0)).toBe('')
    expect(formatLatency(Number.NaN)).toBe('')
  })

  it('毫秒 / 秒 / 分秒三档', () => {
    expect(formatLatency(850)).toBe('850ms')
    expect(formatLatency(1200)).toBe('1.2s')
    expect(formatLatency(65_000)).toBe('1m5s')
  })
})
