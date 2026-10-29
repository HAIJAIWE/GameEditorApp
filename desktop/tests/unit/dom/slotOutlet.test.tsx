// @vitest-environment jsdom
import { act, type ComponentType } from 'react'
import { describe, expect, it } from 'vitest'

import { renderDom } from './render'
import { PluginHost } from '../../../src/shared/plugin/host'
import { SlotOutlet } from '../../../src/renderer/src/plugins/slotOutlet'
import { registerSlotComponent } from '../../../src/renderer/src/plugins/reactBindings'

function Greeting(props: Record<string, unknown>) {
  return <span>你好 {String(props.name ?? '')}</span>
}

describe('SlotOutlet', () => {
  it('未声明 / 无条目时显示占位', async () => {
    const host = new PluginHost()
    const result = await renderDom(<SlotOutlet host={host} slotKey="app.statusbar" empty={<span>空</span>} />)
    expect(result.text()).toContain('空')
    await result.cleanup()
  })

  it('渲染已注册条目，且注册后实时响应（uSES）', async () => {
    const host = new PluginHost()
    const result = await renderDom(<SlotOutlet host={host} slotKey="app.statusbar" empty={<span>空</span>} />)
    expect(result.text()).toContain('空')

    await act(async () => {
      host.register({
        id: 'p1',
        name: 'p1',
        version: '0.1.0',
        capabilities: [
          { kind: 'slot', id: 'p1.status', key: 'app.statusbar', entryId: 'p1', ui: { type: 'text', text: '状态A' } }
        ]
      })
    })
    await result.flush()
    expect(result.text()).toContain('状态A')

    await act(async () => {
      host.disable('p1')
    })
    await result.flush()
    expect(result.text()).toContain('空')

    await result.cleanup()
  })

  it('渲染 component 富 UI 并下发 ownerProps', async () => {
    registerSlotComponent('test.greeting', Greeting as unknown as ComponentType<Record<string, unknown>>)
    const host = new PluginHost()
    host.register({
      id: 'p',
      name: 'p',
      version: '0.1.0',
      capabilities: [
        { kind: 'slot', id: 'p.greet', key: 'app.header', component: 'test.greeting', ui: { type: 'text', text: '回退' } }
      ]
    })
    const result = await renderDom(
      <SlotOutlet host={host} slotKey="app.header" ownerProps={{ name: '世界' }} />
    )
    expect(result.text()).toContain('你好 世界')
    await result.cleanup()
  })

  it('chain：select 胜出者接管（ownerProps 下发）', async () => {
    registerSlotComponent('test.takeover', Greeting as unknown as ComponentType<Record<string, unknown>>)
    const host = new PluginHost()
    host.register({
      id: 'p',
      name: 'p',
      version: '0.1.0',
      capabilities: [
        {
          kind: 'slot',
          id: 'p.composer',
          key: 'conversation.composer',
          priority: 1,
          select: (owner) => ((owner as { running: boolean }).running ? 'on' : null),
          component: 'test.takeover',
          ui: { type: 'text', text: '回退' }
        }
      ]
    })
    const result = await renderDom(
      <SlotOutlet host={host} slotKey="conversation.composer" ownerProps={{ running: true, name: '接管' }} />
    )
    expect(result.text()).toContain('你好 接管')
    await result.cleanup()
  })
})
