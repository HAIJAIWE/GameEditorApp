import { describe, expect, it } from 'vitest'

import type { BrainEvent } from '../../src/shared/agent/brain'
import {
  TASK_SUMMARY_LIMIT,
  applyBrainEvents,
  hydrateFromSession,
  initialDigitalPanelState,
  isRunning,
  reduceBrainEvent,
  resolveApproval,
  resolveInteraction,
  submitUserMessage,
  summarizeToolTasks
} from '../../src/shared/agent/panel'

function stepStart(order: number, tool: string): BrainEvent {
  return { type: 'step_start', order, tool }
}

describe('digital panel：发送与状态', () => {
  it('submitUserMessage：追加用户气泡并进入思考态，清空上一轮步骤', () => {
    const previous = applyBrainEvents(initialDigitalPanelState, [stepStart(0, 'llm_think')])
    const next = submitUserMessage(previous, '列出所有角色')

    expect(next.messages).toEqual([{ id: 'm1', role: 'user', text: '列出所有角色' }])
    expect(next.steps).toEqual([])
    expect(next.status).toBe('thinking')
    expect(next.streaming).toBe('')
    expect(next.error).toBeNull()
    expect(isRunning(next)).toBe(true)
  })

  it('思考轮与工具批分别标记 kind，工具执行产出独立 step', () => {
    const state = applyBrainEvents(initialDigitalPanelState, [
      stepStart(0, 'llm_think'),
      { type: 'step_start', order: 0, tool: '并行1工具' },
      { type: 'step_done', tool: 'system.game_data', result: '共 2 条角色数据', success: true }
    ])
    expect(state.steps.map((step) => step.kind)).toEqual(['think', 'batch', 'tool'])
    expect(state.steps[0]?.status).toBe('running')
    expect(state.steps[1]?.order).toBe(0)
    expect(state.steps[2]).toMatchObject({
      tool: 'system.game_data',
      status: 'done',
      success: true,
      result: '共 2 条角色数据'
    })
  })

  it('工具失败标记 failed', () => {
    const state = applyBrainEvents(initialDigitalPanelState, [
      { type: 'step_done', tool: 'system.game_data', result: '执行失败: 缺少参数', success: false }
    ])
    expect(state.steps[0]?.status).toBe('failed')
    expect(state.steps[0]?.success).toBe(false)
  })
})

describe('digital panel：流式与终稿', () => {
  it('stream_chunk 累积，stream_done 以完整文本覆盖', () => {
    let state = applyBrainEvents(initialDigitalPanelState, [
      { type: 'stream_chunk', text: '你' },
      { type: 'stream_chunk', text: '好' }
    ])
    expect(state.streaming).toBe('你好')

    state = reduceBrainEvent(state, { type: 'stream_done', fullText: '你好，需要什么帮助？' })
    expect(state.streaming).toBe('你好，需要什么帮助？')
  })

  it('done：追加助手气泡、清空流式、状态完成', () => {
    const state = applyBrainEvents(initialDigitalPanelState, [
      { type: 'stream_chunk', text: '临时' },
      { type: 'done', text: '最终答复' }
    ])
    expect(state.messages).toEqual([{ id: 'm1', role: 'assistant', text: '最终答复' }])
    expect(state.streaming).toBe('')
    expect(state.status).toBe('done')
    expect(isRunning(state)).toBe(false)
  })

  it('done 带空文本时不产生空气泡', () => {
    const state = reduceBrainEvent(initialDigitalPanelState, { type: 'done', text: '   ' })
    expect(state.messages).toEqual([])
    expect(state.status).toBe('done')
  })

  it('error：记录错误并结束等待态', () => {
    const state = reduceBrainEvent(initialDigitalPanelState, { type: 'error', message: '未检测到本地 Ollama 服务' })
    expect(state.error).toBe('未检测到本地 Ollama 服务')
    expect(state.status).toBe('error')
    expect(isRunning(state)).toBe(false)
  })
})

describe('digital panel：危险操作审批', () => {
  it('approval_required：进入等待确认态并携带 requestId', () => {
    const state = reduceBrainEvent(initialDigitalPanelState, {
      type: 'approval_required',
      requestId: 'approval_7',
      tool: 'system.shell',
      action: 'execute',
      params: { action: 'exec' }
    })
    expect(state.approval).toEqual({
      requestId: 'approval_7',
      tool: 'system.shell',
      action: 'execute',
      params: { action: 'exec' }
    })
    expect(state.status).toBe('waiting_approval')
    expect(isRunning(state)).toBe(true)
  })

  it('resolveApproval：批准回思考态、拒绝回完成态，且都清掉待办（模态不卡住）', () => {
    const waiting = reduceBrainEvent(initialDigitalPanelState, {
      type: 'approval_required',
      requestId: 'approval_1',
      tool: 'system.shell',
      action: 'execute',
      params: {}
    })
    expect(resolveApproval(waiting, true)).toMatchObject({ approval: null, status: 'thinking' })
    expect(resolveApproval(waiting, false)).toMatchObject({ approval: null, status: 'done' })
    // 无待办时是恒等变换
    expect(resolveApproval(initialDigitalPanelState, true)).toBe(initialDigitalPanelState)
  })

  it('done/error 会顺带清掉残留的待审批项', () => {
    const waiting = reduceBrainEvent(initialDigitalPanelState, {
      type: 'approval_required',
      requestId: 'approval_1',
      tool: 'system.shell',
      action: 'execute',
      params: {}
    })
    expect(reduceBrainEvent(waiting, { type: 'done', text: '好' }).approval).toBeNull()
    expect(reduceBrainEvent(waiting, { type: 'error', message: '炸了' }).approval).toBeNull()
  })
})

describe('digital panel：技能交互（确认 / 提问）', () => {
  const confirmEvent: BrainEvent = {
    type: 'interaction_required',
    requestId: 'approval_9',
    tool: 'system.game_data',
    action: 'delete',
    interaction: { kind: 'confirm', prompt: '确认删除角色【法师】？' }
  }

  it('interaction_required：进入等待回答态并携带交互内容', () => {
    const state = reduceBrainEvent(initialDigitalPanelState, confirmEvent)
    expect(state.interaction).toEqual({
      requestId: 'approval_9',
      tool: 'system.game_data',
      action: 'delete',
      interaction: { kind: 'confirm', prompt: '确认删除角色【法师】？' }
    })
    expect(state.status).toBe('waiting_input')
    expect(isRunning(state)).toBe(true)
  })

  it('resolveInteraction：清掉待答复并回到思考态；无待办时是恒等变换', () => {
    const waiting = reduceBrainEvent(initialDigitalPanelState, confirmEvent)
    expect(resolveInteraction(waiting)).toMatchObject({ interaction: null, status: 'thinking' })
    expect(resolveInteraction(initialDigitalPanelState)).toBe(initialDigitalPanelState)
  })

  it('done / error 会顺带清掉残留的交互项', () => {
    const waiting = reduceBrainEvent(initialDigitalPanelState, confirmEvent)
    expect(reduceBrainEvent(waiting, { type: 'done', text: '好' }).interaction).toBeNull()
    expect(reduceBrainEvent(waiting, { type: 'error', message: '炸了' }).interaction).toBeNull()
  })

  it('提交新消息也会清掉上一轮的交互项', () => {
    const waiting = reduceBrainEvent(initialDigitalPanelState, confirmEvent)
    expect(submitUserMessage(waiting, '换个说法').interaction).toBeNull()
  })

  it('question 交互带候选选项', () => {
    const state = reduceBrainEvent(initialDigitalPanelState, {
      type: 'interaction_required',
      requestId: 'approval_10',
      tool: 'tool.ask_user',
      action: 'ask',
      interaction: { kind: 'question', prompt: '用哪个职业？', options: ['战士', '法师'] }
    })
    expect(state.interaction?.interaction.options).toEqual(['战士', '法师'])
    expect(state.status).toBe('waiting_input')
  })
})

describe('digital panel：任务列表与会话恢复', () => {
  it('summarizeToolTasks：只取工具步骤并截断摘要', () => {
    const long = 'x'.repeat(TASK_SUMMARY_LIMIT + 30)
    const state = applyBrainEvents(initialDigitalPanelState, [
      stepStart(0, 'llm_think'),
      { type: 'step_done', tool: 'system.game_data', result: '共 2 条', success: true },
      { type: 'step_done', tool: 'system.ceshu', result: long, success: false }
    ])
    const tasks = summarizeToolTasks(state.steps)
    expect(tasks).toHaveLength(2)
    expect(tasks[0]).toEqual({ tool: 'system.game_data', success: true, summary: '共 2 条' })
    expect(tasks[1]?.summary).toHaveLength(TASK_SUMMARY_LIMIT)
  })

  it('hydrateFromSession：只吸收 user/assistant 且有内容的条目', () => {
    const state = hydrateFromSession(initialDigitalPanelState, [
      { role: 'system', content: '系统提示词' },
      { role: 'user', content: '你好' },
      { role: 'assistant', content: '在的' },
      { role: 'tool', content: '工具结果' },
      { role: 'user', content: '' },
      { role: 'user', content: 123 }
    ])
    expect(state.messages.map((message) => `${message.role}:${message.text}`)).toEqual(['user:你好', 'assistant:在的'])
    expect(state.messages.map((message) => message.id)).toEqual(['m1', 'm2'])
    expect(state.status).toBe('idle')
    expect(state.seq).toBe(2)
  })

  it('hydrate 后继续发送，消息 id 不冲突', () => {
    const restored = hydrateFromSession(initialDigitalPanelState, [{ role: 'user', content: '历史' }])
    const sent = submitUserMessage(restored, '新问题')
    expect(sent.messages.map((message) => message.id)).toEqual(['m1', 'm2'])
  })
})
