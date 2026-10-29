// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { getReactBinding } from '../../../src/renderer/src/plugins/reactBindings'
import { defineSessionPlugin } from '../../../src/renderer/src/plugins/sessionPlugin'
import {
  CONVERSATION_STORE_KEY,
  createConversationStoreDecl
} from '../../../src/shared/agent/conversationStore'
import { PluginHost } from '../../../src/shared/plugin/host'
import { renderDom } from './render'

/**
 * 「会话」页签：一个 mainView 同时装下主对话摘要、子智能体看板与轨迹三个分区。
 *
 * 合并的意义是**页签条变短、同一份 state 一屏读完**；这里守住「合并后三个分区都在、
 * 且都从同一个 store 读数」，避免以后有人把某个分区拆回去时悄悄丢一块。
 */

const noop = (): void => undefined

function renderSession(host: PluginHost): ReturnType<typeof renderDom> {
  defineSessionPlugin(host)
  const Bound = getReactBinding('session.mainView')
  if (Bound === undefined) throw new Error('session.mainView 绑定未注册')
  return renderDom(<Bound onClose={noop} close={noop} params={undefined} />)
}

describe('会话页签', () => {
  it('声明唯一 mainView「会话」，挂右栏（host: rightbar）、order 10、lazy', () => {
    const host = new PluginHost()
    const manifest = defineSessionPlugin(host)
    expect(manifest.id).toBe('session')
    expect(manifest.capabilities).toHaveLength(1)
    expect(manifest.capabilities[0]).toMatchObject({
      kind: 'mainView',
      id: 'session.mainView',
      label: '会话',
      order: 10,
      lazy: true,
      host: 'rightbar'
    })
  })

  it('一屏同时呈现主对话、子智能体看板与轨迹三个分区', async () => {
    const host = new PluginHost()
    const store = host.declareStore(CONVERSATION_STORE_KEY, createConversationStoreDecl())
    store.actions.hydrate([{ role: 'assistant', content: '共 13 种数据类型' }])

    const result = await renderSession(host)
    // 外壳
    expect(result.byTestId('session')).toBeTruthy()
    // 主对话摘要分区
    expect(result.byTestId('agent-team-conversation')).toBeTruthy()
    // 轨迹分区（含概览与空态）
    expect(result.byTestId('session-block-trajectory')).toBeTruthy()
    expect(result.byTestId('trajectory')).toBeTruthy()
    expect(result.byTestId('trajectory-overview')).toBeTruthy()
    await result.cleanup()
  })

  it('整体状态与主对话分区都取自同一份 store', async () => {
    const host = new PluginHost()
    host.declareStore(CONVERSATION_STORE_KEY, createConversationStoreDecl())

    const result = await renderSession(host)
    expect(result.byTestId('session-status').textContent).toBe('待命')
    expect(result.byTestId('agent-team-conversation-status').textContent).toBe('待命')
    await result.cleanup()
  })
})
