import { describe, expect, it } from 'vitest'

import { reduceSubagents } from '../../../src/renderer/src/agent/subagentStore'
import type { DigitalSubagent } from '@mobai/shared/agent/ui'

const started: DigitalSubagent[] = [
  { id: 's1', task: '写策划书第一章', status: 'running' },
  { id: 's2', task: '生成怪物数值', status: 'running' }
]

describe('reduceSubagents', () => {
  it('adds a running entry on subagent_started (idempotent if already present)', () => {
    const next = reduceSubagents([], { type: 'subagent_started', id: 's1', task: '写策划书第一章' })
    expect(next).toHaveLength(1)
    expect(next[0]).toMatchObject({ id: 's1', status: 'running', task: '写策划书第一章' })
    // 重复 started 幂等
    const again = reduceSubagents(next, { type: 'subagent_started', id: 's1', task: '写策划书第一章' })
    expect(again).toBe(next)
  })

  it('flips status to done with result on subagent_done (success)', () => {
    const next = reduceSubagents(started, { type: 'subagent_done', id: 's1', success: true, text: '完成' })
    expect(next.find((s) => s.id === 's1')).toMatchObject({ status: 'done', result: '完成' })
    // 另一个不受影响
    expect(next.find((s) => s.id === 's2')?.status).toBe('running')
  })

  it('flips status to failed on subagent_done (failure)', () => {
    const next = reduceSubagents(started, { type: 'subagent_done', id: 's2', success: false, text: '出错' })
    expect(next.find((s) => s.id === 's2')).toMatchObject({ status: 'failed', result: '出错' })
  })

  it('ignores unrelated events (returns same reference)', () => {
    const event = { type: 'step', tool: 'x', action: 'run', params: {} } as unknown as Parameters<typeof reduceSubagents>[1]
    expect(reduceSubagents(started, event)).toBe(started)
  })
})
