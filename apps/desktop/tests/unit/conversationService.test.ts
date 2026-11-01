import { describe, expect, it } from 'vitest'

import { createConversationService, snapshotConversation } from '@mobai/shared/agent/conversation'
import { createConversationStoreDecl, freshConversationState } from '@mobai/shared/agent/conversation'
import { createStoreInstance } from '@mobai/shared/plugin/slotRegistry'

/**
 * 对话服务面（`agent.conversation`）：摘要派生 + 请求分派。
 *
 * 契约要点：**不抛异常**——失败一律 `{ ok:false, error }`，
 * 因为调用方可能是外部 bundle，拿不到我们的异常类型。
 */

const store = (): ReturnType<typeof createStoreInstance<ReturnType<typeof freshConversationState>>> =>
  createStoreInstance(createConversationStoreDecl())

describe('snapshotConversation', () => {
  it('空状态：状态/计数/文本都给确定的初值', () => {
    const snapshot = snapshotConversation(freshConversationState())
    expect(snapshot).toEqual({
      status: 'idle',
      messageCount: 0,
      streaming: false,
      stepCount: 0,
      runningSubagents: 0,
      lastAssistantText: ''
    })
  })

  it('取最近一条助手消息并截断 200 字', () => {
    const state = {
      ...freshConversationState(),
      messages: [
        { id: 'm1', role: 'assistant' as const, text: '旧回答' },
        { id: 'm2', role: 'user' as const, text: '追问' },
        { id: 'm3', role: 'assistant' as const, text: 'x'.repeat(300) }
      ]
    }
    const snapshot = snapshotConversation(state)
    expect(snapshot.messageCount).toBe(3)
    expect(snapshot.lastAssistantText).toHaveLength(201) // 200 字 + 省略号
    expect(snapshot.lastAssistantText.endsWith('…')).toBe(true)
  })

  it('流式与运行中子智能体如实反映', () => {
    const state = {
      ...freshConversationState(),
      streaming: '半截输出',
      subagents: [
        { id: 's1', task: 'a', status: 'running' as const },
        { id: 's2', task: 'b', status: 'done' as const }
      ]
    }
    const snapshot = snapshotConversation(state)
    expect(snapshot.streaming).toBe(true)
    expect(snapshot.runningSubagents).toBe(1)
  })
})

describe('createConversationService', () => {
  it('缺省 op 视为 snapshot', () => {
    const service = createConversationService(store())
    const result = service()
    expect(result).toMatchObject({ ok: true, snapshot: { status: 'idle', messageCount: 0 } })
  })

  it('clear 清空对话并回报 cleared', () => {
    const target = store()
    target.actions.dispatch({ kind: 'submit', text: '问题' })
    const service = createConversationService(target)

    expect(service({ op: 'clear' })).toEqual({ ok: true, cleared: true })
    expect(target.getSnapshot().messages).toHaveLength(0)
  })

  it('未知 op 返回错误（不静默成功）', () => {
    const service = createConversationService(store())
    expect(service({ op: 'delete-everything' })).toEqual({
      ok: false,
      error: '未知操作：delete-everything（支持 snapshot / clear）'
    })
  })

  it('store 未声明时返回错误而不是抛异常', () => {
    const service = createConversationService(null)
    expect(service({ op: 'snapshot' })).toEqual({
      ok: false,
      error: '对话 store 未声明（智能体面板插件未加载）'
    })
  })
})
