// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { defineTrajectoryPlugin } from '../../../src/renderer/src/plugins/trajectoryPlugin'
import { getReactBinding } from '../../../src/renderer/src/plugins/reactBindings'
import {
  CONVERSATION_STORE_KEY,
  createConversationStoreDecl
} from '../../../src/shared/agent/conversationStore'
import { PluginHost } from '../../../src/shared/plugin/host'
import { renderDom } from './render'

/**
 * 轨迹页签：概览 / 按轮次的步骤表 / 消息序列 / 空态。
 *
 * 与团队页签同构——都从根级 store `conversation.state` 读，故这里也顺带守住
 * 「换插件消费同一份状态」这条接线不会退化。
 */

const noop = (): void => undefined

function renderTrajectory(host: PluginHost): ReturnType<typeof renderDom> {
  defineTrajectoryPlugin(host)
  const Bound = getReactBinding('trajectory.mainView')
  if (Bound === undefined) throw new Error('trajectory.mainView 绑定未注册')
  return renderDom(<Bound onClose={noop} close={noop} params={undefined} />)
}

describe('会话轨迹页签', () => {
  it('没有记录时给引导文案', async () => {
    const host = new PluginHost()
    host.declareStore(CONVERSATION_STORE_KEY, createConversationStoreDecl())

    const result = await renderTrajectory(host)
    expect(result.byTestId('trajectory-empty')).toBeTruthy()
    expect(result.byTestId('trajectory-status').textContent).toBe('待命')
    expect(result.byTestId('trajectory-steps').textContent).toContain('0')
    await result.cleanup()
  })

  it('按轮次渲染步骤行，失败数单独高亮', async () => {
    const host = new PluginHost()
    const store = host.declareStore(CONVERSATION_STORE_KEY, createConversationStoreDecl())
    store.actions.dispatch({ kind: 'submit', text: '列一下数据' })
    store.actions.dispatch({ kind: 'event', event: { type: 'step_start', order: 0, tool: 'llm_think' } })
    store.actions.dispatch({
      kind: 'event',
      event: { type: 'step_done', tool: 'system.game_data', result: '共 13 种数据类型', success: true }
    })
    store.actions.dispatch({
      kind: 'event',
      event: { type: 'step_done', tool: 'system.shell', result: '[STOP] 拒绝', success: false }
    })

    const result = await renderTrajectory(host)
    expect(result.queryAll('[data-testid="trajectory-turn"]')).toHaveLength(1)
    const rows = result.queryAll('[data-testid="trajectory-row"]')
    expect(rows).toHaveLength(3) // 1 个思考轮 + 2 个工具
    expect(rows.map((row) => row.getAttribute('data-status'))).toEqual(['running', 'done', 'failed'])
    expect(result.byTestId('trajectory-failed').textContent).toContain('1')
    expect(result.byTestId('trajectory-steps').textContent).toContain('3')
    await result.cleanup()
  })

  it('消息序列按角色渲染', async () => {
    const host = new PluginHost()
    const store = host.declareStore(CONVERSATION_STORE_KEY, createConversationStoreDecl())
    store.actions.hydrate([
      { role: 'user', content: '问题' },
      { role: 'assistant', content: '回答' }
    ])

    const result = await renderTrajectory(host)
    const messages = result.queryAll('[data-testid="trajectory-message"]')
    expect(messages.map((node) => node.getAttribute('data-role'))).toEqual(['user', 'assistant'])
    expect(result.byTestId('trajectory').textContent).toContain('回答')
    await result.cleanup()
  })

  it('有参数/输出的行可展开看详情；思考轮（无参数无输出）不可展开', async () => {
    const host = new PluginHost()
    const store = host.declareStore(CONVERSATION_STORE_KEY, createConversationStoreDecl())
    store.actions.dispatch({ kind: 'event', event: { type: 'step_start', order: 0, tool: 'llm_think' } })
    store.actions.dispatch({
      kind: 'event',
      event: {
        type: 'step_done',
        tool: 'system.game_data',
        result: '共 13 种数据类型',
        success: true,
        args: '{"action":"list"}'
      }
    })

    const result = await renderTrajectory(host)
    const rows = result.queryAll('[data-testid="trajectory-row"]')
    expect(rows).toHaveLength(2)
    // 思考轮：没有 args/result → 不是 summary（不可展开）
    expect(rows[0]?.tagName.toLowerCase()).toBe('div')
    // 工具行：可展开，详情里有美化后的参数与输出
    expect(rows[1]?.tagName.toLowerCase()).toBe('summary')
    const detail = result.byTestId('trajectory-row-detail')
    expect(detail.textContent).toContain('参数')
    expect(detail.textContent).toContain('"action": "list"')
    expect(detail.textContent).toContain('共 13 种数据类型')
    await result.cleanup()
  })
})
