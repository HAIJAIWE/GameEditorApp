import { describe, expect, it } from 'vitest'

import {
  hydrateFromSession,
  initialDigitalPanelState,
  reduceBrainEvent,
  submitUserMessage
} from '../../../src/shared/agent/panel'
import type { DigitalPanelState } from '../../../src/shared/agent/panel'

/**
 * `reduceBrainEvent` 的收尾语义。
 *
 * 背景坑：`step_start` 压入的是**占位步**（think / batch，状态 running），
 * 完成信息由 `step_done` **另起一条** tool 步承载 —— 占位步自己永远不会被关闭。
 * 于是面板已经是「已完成」，`DigitalRunPlan` 的徽标却永远停在「进行中」，
 * 长这样：状态行说「已完成分析 · 用时 2 秒」，上面的进度条说「1/4 进行中」。
 *
 * 这里的断言就是锁住「run 结束必须把 running 落定」这条不变式。
 */

const runStepStart = (state: DigitalPanelState, tool: string, order: number): DigitalPanelState =>
  reduceBrainEvent(state, { type: 'step_start', tool, order } as never)

describe('reduceBrainEvent：本轮收尾落定步骤', () => {
  it('step_start 压入的是 running 占位步', () => {
    const next = runStepStart(initialDigitalPanelState, 'llm_think', 0)
    expect(next.steps).toHaveLength(1)
    expect(next.steps[0]).toMatchObject({ tool: 'llm_think', kind: 'think', status: 'running' })
  })

  it('done：仍挂着的 running 步骤一律落定为 done', () => {
    let state = runStepStart(initialDigitalPanelState, 'llm_think', 0)
    state = reduceBrainEvent(state, { type: 'step_done', tool: 'system.game_data', success: true, result: 'ok' } as never)
    expect(state.steps.filter((step) => step.status === 'running')).toHaveLength(1)

    const done = reduceBrainEvent(state, { type: 'done', text: '最终答复' } as never)
    expect(done.status).toBe('done')
    expect(done.steps.some((step) => step.status === 'running')).toBe(false)
    // 已完成的 tool 步不受影响
    expect(done.steps.find((step) => step.tool === 'system.game_data')?.status).toBe('done')
  })

  it('error：仍挂着的 running 步骤落定为 failed', () => {
    const running = runStepStart(initialDigitalPanelState, 'llm_think', 0)
    const failed = reduceBrainEvent(running, { type: 'error', message: '模型不可用' } as never)
    expect(failed.status).toBe('error')
    expect(failed.steps.every((step) => step.status === 'failed')).toBe(true)
  })

  it('没有 running 步骤时返回同一数组（不做无意义的重建）', () => {
    const state = reduceBrainEvent(initialDigitalPanelState, { type: 'done', text: 'x' } as never)
    expect(state.steps).toBe(initialDigitalPanelState.steps)
  })
})

describe('submitUserMessage：附件随用户消息携带', () => {
  it('有附件时写进用户消息；空数组不写字段', () => {
    const file = { name: 'design.md', path: '/lib/attachments/design.md', mime: 'text/markdown', bytes: 1234 }
    const withFile = submitUserMessage(initialDigitalPanelState, '看看这个', [file])
    expect(withFile.messages.at(-1)).toMatchObject({ role: 'user', text: '看看这个', attachments: [file] })

    // 空数组等同没有附件：不写 attachments 字段（保持消息形状干净）
    const empty = submitUserMessage(initialDigitalPanelState, '没有附件', [])
    expect(empty.messages.at(-1)).not.toHaveProperty('attachments')
  })
})

describe('hydrateFromSession：附件重放', () => {
  it('快照里的 attachments 恢复成消息附件；坏条目逐条丢弃', () => {
    const file = { name: 'a.md', path: '/lib/attachments/a.md', mime: 'text/markdown', bytes: 10 }
    const state = hydrateFromSession(initialDigitalPanelState, [
      { role: 'user', content: '看看', attachments: [file, { name: '坏条目' }] },
      { role: 'assistant', content: '好' }
    ])
    expect(state.messages[0]).toMatchObject({ role: 'user', text: '看看', attachments: [file] })
    expect(state.messages[1]).not.toHaveProperty('attachments')
  })
})
