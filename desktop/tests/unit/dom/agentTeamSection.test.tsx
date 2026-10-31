// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { AgentTeamSection } from '../../../src/renderer/src/plugins/session'
import {
  CONVERSATION_STORE_KEY,
  createConversationStoreDecl
} from '../../../src/shared/agent/conversation'
import { PluginHost } from '../../../src/shared/plugin/host'
import { renderDom } from './render'

/**
 * 「会话」页签的主对话摘要分区：读根级 store `conversation.state`。
 *
 * 这条用例锁的是**跨插件读状态**的接线：面板写 store、会话页签 uSES 订阅，
 * 中间不经过 App 的 props 或全局单例 import（只认宿主传入的实例）。
 */

function renderTeam(host: PluginHost): ReturnType<typeof renderDom> {
  return renderDom(<AgentTeamSection host={host} />)
}

describe('会话 · 主对话摘要', () => {
  it('显示 store 里的状态、消息数与最近助手回复', async () => {
    const host = new PluginHost()
    const store = host.declareStore(CONVERSATION_STORE_KEY, createConversationStoreDecl())
    store.actions.hydrate([
      { role: 'user', content: '列出所有角色' },
      { role: 'assistant', content: '共 13 种数据类型' }
    ])

    const result = await renderTeam(host)
    expect(result.byTestId('agent-team-conversation-status').textContent).toBe('待命')
    expect(result.byTestId('agent-team-conversation').textContent).toContain('2 条')
    expect(result.byTestId('agent-team-conversation-last').textContent).toBe('共 13 种数据类型')
    await result.cleanup()
  })

  it('没有助手回复时给引导文案而不是空白', async () => {
    const host = new PluginHost()
    host.declareStore(CONVERSATION_STORE_KEY, createConversationStoreDecl())

    const result = await renderTeam(host)
    expect(result.query('[data-testid="agent-team-conversation-last"]')).toBeNull()
    expect(result.byTestId('agent-team-conversation').textContent).toContain('还没有助手回复')
    await result.cleanup()
  })

  it('最近回复过长时截断到 120 字', async () => {
    const host = new PluginHost()
    const store = host.declareStore(CONVERSATION_STORE_KEY, createConversationStoreDecl())
    store.actions.hydrate([{ role: 'assistant', content: 'x'.repeat(200) }])

    const result = await renderTeam(host)
    const text = result.byTestId('agent-team-conversation-last').textContent ?? ''
    expect(text).toHaveLength(121) // 120 字 + 省略号
    expect(text.endsWith('…')).toBe(true)
    await result.cleanup()
  })
})
