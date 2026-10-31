// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { PluginHost } from '../../../src/shared/plugin/host'
import { PluginsPanel } from '../../../src/renderer/src/components/common'
import { registerReactBinding } from '../../../src/renderer/src/plugins/host'
import { installMbApi, renderDom, type RenderResult } from './render'

const Stub = () => <div data-testid="stub">stub 面板</div>

/** 与 builtins 同构的宿主：示例插件（命令/面板/服务）+ 受保护核心插件。
 *  manifest 用声明式 `ui`；富 React 组件通过 `registerReactBinding` 外置（out-of-band）。 */
function makeHost(): PluginHost {
  const host = new PluginHost()
  host.register({
    id: 'demo',
    name: '示例插件',
    version: '0.0.1',
    capabilities: [
      { kind: 'command', id: 'demo.open', label: '打开', run: () => host.openPanel('demo-panel') },
      { kind: 'panel', id: 'demo-panel', title: '面板', ui: { type: 'container', children: [{ type: 'text', text: '面板' }] } },
      { kind: 'service', id: 'demo.ping', invoke: () => '你好，来自示例插件' }
    ]
  })
  host.register({ id: 'core', name: '核心', version: '1.0.0', protected: true, capabilities: [] })
  registerReactBinding('demo-panel', Stub)
  return host
}

let view: RenderResult | null = null
let api: ReturnType<typeof installMbApi> | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  api?.restore()
  api = null
})

describe('插件中心面板', () => {
  it('列出已注册插件与能力条数', async () => {
    const host = makeHost()
    api = installMbApi()
    view = await renderDom(<PluginsPanel host={host} onClose={() => undefined} />)

    expect(view.text()).toContain('已注册 2 个插件')
    expect(view.byTestId('plugin-demo')).toBeTruthy()
    expect(view.byTestId('plugin-core')).toBeTruthy()
    expect(view.byTestId('cap-demo.ping')).toBeTruthy()
  })

  it('调用服务能力显示返回值', async () => {
    const host = makeHost()
    api = installMbApi()
    view = await renderDom(<PluginsPanel host={host} onClose={() => undefined} />)

    await view.click(view.byTestId('cap-call-demo.ping'))
    expect(view.text()).toContain('你好，来自示例插件')
  })

  it('运行命令打开对应面板（React 绑定优先）', async () => {
    const host = makeHost()
    api = installMbApi()
    view = await renderDom(<PluginsPanel host={host} onClose={() => undefined} />)

    await view.click(view.byTestId('cap-run-demo.open'))
    expect(view.byTestId('stub')).toBeTruthy()
  })

  it('禁用插件翻转状态并出现启用按钮（受保护核心不可禁）', async () => {
    const host = makeHost()
    api = installMbApi()
    view = await renderDom(<PluginsPanel host={host} onClose={() => undefined} />)

    await view.click(view.byTestId('plugin-disable-demo'))
    expect(view.text()).toContain('已禁用')
    expect(view.byTestId('plugin-enable-demo')).toBeTruthy()
    expect(host.get('core')?.enabled).toBe(true)
  })

  it('无 React 绑定的面板走声明式 UiNode 回退渲染（任意宿主都能接）', async () => {
    const host = new PluginHost()
    host.register({
      id: 'plain',
      name: '纯声明式',
      version: '1.0.0',
      capabilities: [{ kind: 'panel', id: 'plain.panel', title: 'P', ui: { type: 'text', text: '声明式内容' } }]
    })
    api = installMbApi()
    view = await renderDom(<PluginsPanel host={host} onClose={() => undefined} />)

    await view.click(view.byTestId('cap-open-plain.panel'))
    expect(view.text()).toContain('声明式内容')
  })

  it('坏插件（activate 抛错）显示错误态且不可启用（dsh 风格非致命激活）', async () => {
    const host = new PluginHost()
    host.register({
      id: 'broken',
      name: '坏插件',
      version: '1.0.0',
      activate: () => {
        throw new Error('boom')
      },
      capabilities: []
    })
    api = installMbApi()
    view = await renderDom(<PluginsPanel host={host} onClose={() => undefined} />)

    expect(view.byTestId('plugin-broken-broken')).toBeTruthy()
    expect(view.byTestId('plugin-error-broken')).toBeTruthy()
    expect(view.text()).toContain('boom')
    expect(view.query('[data-testid="plugin-enable-broken"]')).toBeNull() // 错误态无启用按钮
  })
})
