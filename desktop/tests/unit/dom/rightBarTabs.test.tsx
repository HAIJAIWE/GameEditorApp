// @vitest-environment jsdom
import { act } from 'react'
import { beforeEach, describe, expect, it } from 'vitest'

import {
  buildRightTabs,
  CONVERSATION_TAB_ID,
  RightBarTabs
} from '../../../src/renderer/src/plugins/RightBarTabs'
import { registerReactBinding } from '../../../src/renderer/src/plugins/reactBindings'
import { PluginHost } from '../../../src/shared/plugin/host'
import type { PluginManifest } from '../../../src/shared/plugin/types'
import { renderDom } from './render'

/**
 * 右栏页签容器（dsh 式停靠轨道）。
 *
 * 两条不能退化的契约：
 * 1. 「对话」是**内置**页签（dsh 的会话界面是保留 key），恒在最左、不可被插件挤掉；
 * 2. 切页签只 `hidden`，**不卸载**——对话里的滚动位置、草稿、运行中的流都不能因切页签丢。
 */

beforeEach(() => {
  localStorage.clear()
})

function SessionBody() {
  return <div data-testid="session-body">会话内容</div>
}

function makeHost(): PluginHost {
  registerReactBinding('test.session', SessionBody)
  const host = new PluginHost()
  const manifest: PluginManifest = {
    id: 'test-rightbar',
    name: 'test-rightbar',
    version: '0.1.0',
    capabilities: [
      {
        kind: 'mainView',
        id: 'test.session',
        label: '会话',
        order: 10,
        lazy: true,
        host: 'rightbar',
        ui: { type: 'text', text: '会话' }
      },
      {
        kind: 'mainView',
        id: 'test.main',
        label: '主区页',
        order: 0,
        ui: { type: 'text', text: '主区页' }
      }
    ]
  }
  host.register(manifest)
  return host
}

describe('右栏页签容器', () => {
  it('buildRightTabs：内置「对话」恒在最左，只收 host:rightbar 的视图并按 order 排', () => {
    const tabs = buildRightTabs([
      { kind: 'mainView', id: 'b', label: 'B', order: 20, host: 'rightbar', ui: { type: 'text', text: 'B' } },
      { kind: 'mainView', id: 'a', label: 'A', order: 5, host: 'rightbar', ui: { type: 'text', text: 'A' } },
      // 主区视图不该出现在右栏
      { kind: 'mainView', id: 'main', label: '主区', order: 0, ui: { type: 'text', text: '主区' } }
    ])
    expect(tabs.map((tab) => tab.id)).toEqual([CONVERSATION_TAB_ID, 'a', 'b'])
    expect(tabs[0]?.builtin).toBe(true)
    expect(tabs[0]?.label).toBe('对话')
  })

  it('默认停在「对话」；lazy 的会话首访才挂载；切走后对话仍挂载（只是 hidden）', async () => {
    const view = await renderDom(<RightBarTabs host={makeHost()} />)

    expect(view.byTestId('rightbar-tab-conversation').getAttribute('aria-current')).toBe('true')
    expect(view.byTestId('rightbar-pane-conversation').hasAttribute('hidden')).toBe(false)
    // lazy：没访问过就不挂载
    expect(view.query('[data-testid="session-body"]')).toBeNull()

    await view.click(view.byTestId('rightbar-tab-test.session'))
    expect(view.byTestId('session-body')).toBeTruthy()
    expect(view.byTestId('rightbar-tab-test.session').getAttribute('aria-current')).toBe('true')
    expect(view.byTestId('rightbar-pane-test.session').hasAttribute('hidden')).toBe(false)

    // 对话页签没被卸载（常驻、不丢滚动/草稿）
    expect(view.byTestId('rightbar-pane-conversation').hasAttribute('hidden')).toBe(true)

    await view.cleanup()
  })

  it('右栏插件被禁用后，激活态回落到内置「对话」', async () => {
    const host = makeHost()
    const view = await renderDom(<RightBarTabs host={host} />)

    await view.click(view.byTestId('rightbar-tab-test.session'))
    expect(view.byTestId('rightbar-tab-test.session').getAttribute('aria-current')).toBe('true')

    await act(async () => {
      host.disable('test-rightbar')
    })
    await view.flush()

    expect(view.query('[data-testid="rightbar-tab-test.session"]')).toBeNull()
    expect(view.byTestId('rightbar-tab-conversation').getAttribute('aria-current')).toBe('true')
    expect(view.byTestId('rightbar-pane-conversation').hasAttribute('hidden')).toBe(false)

    await view.cleanup()
  })
})
