// @vitest-environment jsdom
import { act } from 'react'
import { describe, expect, it } from 'vitest'

import { renderDom } from './render'
import { PluginHost } from '../../../src/shared/plugin/host'
import { SlotOutlet } from '../../../src/renderer/src/plugins/slotOutlet'

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
})
