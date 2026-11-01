import { describe, expect, it } from 'vitest'

import {
  accumulateTurn,
  emptyAgentRunStats,
  turnStatFromReply
} from '@mobai/shared/agent/observability'

/**
 * M1 观测纯代数单测。
 *
 * 这层是「循环单测」与「面板单测」的共同底座：累加语义（末轮覆盖 / 空值回落 / 纯函数）
 * 在此锁死，别处只验接线。故用例聚焦**边界与代数律**，不重复验证线（接线由 agentBrain /
 * agentPanel 各自覆盖）。
 */
describe('agent observability：观测纯代数', () => {
  it('emptyAgentRunStats：全零，tier 可指定（默认 local）', () => {
    expect(emptyAgentRunStats()).toEqual({
      turns: 0,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      latencyMs: 0,
      toolCalls: 0,
      model: '',
      tier: 'local'
    })
    expect(emptyAgentRunStats('cloud').tier).toBe('cloud')
  })

  it('turnStatFromReply：usage 缺失回落零值，其余字段原样保留', () => {
    expect(turnStatFromReply(2, 'qwen3:4b', 'local', undefined, 42, 3)).toEqual({
      turn: 2,
      model: 'qwen3:4b',
      tier: 'local',
      usage: { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      latencyMs: 42,
      toolCalls: 3
    })
  })

  it('accumulateTurn：纯函数（不改入参）且各字段正确累加', () => {
    const base = emptyAgentRunStats()
    const next = accumulateTurn(base, {
      turn: 0,
      model: 'qwen3:4b',
      tier: 'local',
      usage: { promptTokens: 10, completionTokens: 2, totalTokens: 12 },
      latencyMs: 30,
      toolCalls: 1
    })
    // 入参未被就地修改（不可变归约取向，便于单测与回放）
    expect(base.turns).toBe(0)
    expect(base.totalTokens).toBe(0)
    expect(next).toEqual({
      turns: 1,
      promptTokens: 10,
      completionTokens: 2,
      totalTokens: 12,
      latencyMs: 30,
      toolCalls: 1,
      model: 'qwen3:4b',
      tier: 'local'
    })
  })

  it('accumulateTurn：末轮模型覆盖；空模型名保留已有非空值（桩未回报时不擦除）', () => {
    const first = accumulateTurn(emptyAgentRunStats(), turnStatFromReply(0, 'qwen3:4b', 'local', undefined, 1, 0))
    expect(accumulateTurn(first, turnStatFromReply(1, '', 'local', undefined, 1, 0)).model).toBe('qwen3:4b')
    expect(accumulateTurn(first, turnStatFromReply(1, 'qwen3.5:9b', 'local', undefined, 1, 0)).model).toBe('qwen3.5:9b')
  })

  it('accumulateTurn：tier 以末轮为准（档位切换可被观测到）', () => {
    const local = accumulateTurn(emptyAgentRunStats(), turnStatFromReply(0, 'm', 'local', undefined, 1, 0))
    const cloud = accumulateTurn(local, turnStatFromReply(1, 'm', 'cloud', undefined, 1, 0))
    expect(cloud.tier).toBe('cloud')
  })

  it('accumulateTurn：多轮 token 累加是逐项相加（total 与 prompt+completion 独立入账）', () => {
    let stats = emptyAgentRunStats()
    stats = accumulateTurn(stats, turnStatFromReply(0, 'm', 'local', { promptTokens: 3, completionTokens: 1, totalTokens: 4 }, 5, 1))
    stats = accumulateTurn(stats, turnStatFromReply(1, 'm', 'local', { promptTokens: 7, completionTokens: 2, totalTokens: 9 }, 8, 2))
    expect(stats).toMatchObject({
      turns: 2,
      promptTokens: 10,
      completionTokens: 3,
      totalTokens: 13,
      latencyMs: 13,
      toolCalls: 3
    })
  })
})
