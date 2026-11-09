
import { describe, expect, it } from 'vitest'
import {
  CONVERSATION_STORE_KEY,
  createConversationStoreDecl,
  reduceConversation
} from '@mobai/shared/agent/conversation'

/**
 * 渲染层接线守卫：菜单项 -> 命令 -> 桥 -> CeshuView 的 handleStartAiDev。
 *
 * 真正要钉住的是「派工单只预填、不发送」这条约定——它是整套流程里唯一会误伤
 * 用户的动作（替他下命令）。这里直接对 conversation store 的 reducer 断言。
 */
describe('让 AI 开工：预填而不发送', () => {
  it('prefill 只写待消费的槽，消息列表一条都不加', () => {
    const decl = createConversationStoreDecl()
    const init = decl.init
    const before = typeof init === 'function' ? init() : init
    const after = reduceConversation(before, { kind: 'prefill', text: '派工单全文' })
    expect(after.prefill).toBe('派工单全文')
    expect(after.messages).toHaveLength(before.messages.length)
  })

  it('清空 prefill 用 text:null（消费端读完就清，避免重复预填）', () => {
    const decl = createConversationStoreDecl()
    const init = decl.init
    const initialState = typeof init === 'function' ? init() : init
    const state = reduceConversation(initialState, { kind: 'prefill', text: '派工单全文' })
    expect(reduceConversation(state, { kind: 'prefill', text: null }).prefill).toBeNull()
  })

  it('预设槽：只写待消费的槽，不改预设本身、动不了消息', () => {
    const decl = createConversationStoreDecl()
    const init = decl.init
    const before = typeof init === 'function' ? init() : init
    const after = reduceConversation(before, { kind: 'preset', id: 'tech_writer' })
    expect(after.presetRequest).toBe('tech_writer')
    expect(after.messages).toHaveLength(before.messages.length)
  })

  it('预设槽清空用 id:null（消费端读完就清）', () => {
    const decl = createConversationStoreDecl()
    const init = decl.init
    const initialState = typeof init === 'function' ? init() : init
    const state = reduceConversation(initialState, { kind: 'preset', id: 'tech_writer' })
    expect(reduceConversation(state, { kind: 'preset', id: null }).presetRequest).toBeNull()
  })

  it('store 声明的 key 与消费方（DigitalPanel）读的是同一个', () => {
    expect(CONVERSATION_STORE_KEY).toBe('conversation.state')
  })
})
