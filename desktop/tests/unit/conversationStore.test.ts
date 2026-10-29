import { describe, expect, it } from 'vitest'

import {
  createConversationStoreDecl,
  freshConversationState,
  reduceConversation
} from '../../src/shared/agent/conversationStore'
import { initialDigitalPanelState } from '../../src/shared/agent/panel'
import { createStoreInstance } from '../../src/shared/plugin/slotRegistry'

/**
 * 对话状态 store：归约语义（与面板此前的本地 reducer 等价）+ store 声明行为。
 *
 * 这些用例锁的是**迁移不回归**：把 `useReducer` 换成根级 store 之后，
 * 消息追加 / 流式 / 审批 / 清空 的语义必须一字不差。
 */

describe('reduceConversation（对话状态归约）', () => {
  it('submit：追加用户消息并进入运行态', () => {
    const next = reduceConversation(freshConversationState(), { kind: 'submit', text: '你好' })
    expect(next.messages).toHaveLength(1)
    expect(next.messages[0]?.role).toBe('user')
    expect(next.messages[0]?.text).toBe('你好')
  })

  it('event：brain 事件归约（step_start 进步骤列表）', () => {
    const next = reduceConversation(freshConversationState(), {
      kind: 'event',
      event: { type: 'step_start', order: 0, tool: 'llm_think' }
    })
    expect(next.steps).toHaveLength(1)
    expect(next.steps[0]?.kind).toBe('think')
  })

  it('approval / interaction：解决后清空待确认', () => {
    const withApproval = reduceConversation(freshConversationState(), {
      kind: 'event',
      event: {
        type: 'approval_required',
        requestId: 'r1',
        tool: 'system.shell',
        action: 'exec',
        params: {}
      }
    })
    expect(withApproval.approval?.requestId).toBe('r1')
    expect(reduceConversation(withApproval, { kind: 'approval', approved: false }).approval).toBeNull()
  })

  it('hydrate：从历史播种消息', () => {
    const next = reduceConversation(freshConversationState(), {
      kind: 'hydrate',
      history: [
        { role: 'user', content: '旧问题' },
        { role: 'assistant', content: '旧回答' }
      ]
    })
    expect(next.messages.map((message) => message.text)).toEqual(['旧问题', '旧回答'])
  })

  it('subagentStop：乐观标记为失败并回显「已停止」', () => {
    const started = reduceConversation(freshConversationState(), {
      kind: 'event',
      event: { type: 'subagent_started', id: 's1', task: '查表' }
    })
    const stopped = reduceConversation(started, { kind: 'subagentStop', id: 's1' })
    expect(stopped.subagents[0]?.status).toBe('failed')
    expect(stopped.subagents[0]?.result).toBe('已停止')
  })
})

describe('createConversationStoreDecl / store 实例', () => {
  it('init 返回新对象，不与常量初始态共享引用', () => {
    const state = freshConversationState()
    expect(state).not.toBe(initialDigitalPanelState)
    expect(state.messages).not.toBe(initialDigitalPanelState.messages)
    expect(state.messages).toHaveLength(0)
  })

  it('reset 产出新快照（uSES 靠引用变化才会重渲染）', () => {
    const store = createStoreInstance(createConversationStoreDecl())
    store.actions.dispatch({ kind: 'submit', text: '问题' })
    const before = store.getSnapshot()
    expect(before.messages).toHaveLength(1)

    store.actions.reset()
    const after = store.getSnapshot()
    expect(after).not.toBe(before)
    expect(after.messages).toHaveLength(0)
  })

  it('actions 写后通知订阅者；unsubscribe 后不再通知', () => {
    const store = createStoreInstance(createConversationStoreDecl())
    let calls = 0
    const unsubscribe = store.subscribe(() => {
      calls += 1
    })
    store.actions.dispatch({ kind: 'submit', text: 'a' })
    expect(calls).toBe(1)
    unsubscribe()
    store.actions.dispatch({ kind: 'submit', text: 'b' })
    expect(calls).toBe(1)
    expect(store.getSnapshot().messages).toHaveLength(2)
  })

  it('hydrate action 接受会话历史（恢复草稿）', () => {
    const store = createStoreInstance(createConversationStoreDecl())
    store.actions.hydrate([{ role: 'user', content: '草稿里的问题' }])
    expect(store.getSnapshot().messages[0]?.text).toBe('草稿里的问题')
  })
})
