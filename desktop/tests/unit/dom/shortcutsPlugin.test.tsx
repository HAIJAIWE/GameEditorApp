// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { PluginHost } from '../../../src/shared/plugin/host'
import { HostPanel } from '../../../src/renderer/src/plugins/host/HostPanel'
import { defineShortcutsPlugin } from '../../../src/renderer/src/plugins/ux/shortcutsPlugin'
import { installMbApi, renderDom, type RenderResult } from './render'

let view: RenderResult | null = null
let api: ReturnType<typeof installMbApi> | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  api?.restore()
  api = null
})

describe('面板经宿主渲染（深层插件化首切片）', () => {
  it('shortcuts 面板经 HostPanel 渲染，保留原组件 testid', async () => {
    const host = new PluginHost()
    host.register(defineShortcutsPlugin(host))
    api = installMbApi()
    view = await renderDom(<HostPanel host={host} panelId="shortcuts.panel" onClose={() => undefined} />)

    // 富 React 绑定优先：原组件结构完整保留，App 不再硬编码导入
    expect(view.byTestId('shortcuts-panel')).toBeTruthy()
    expect(view.byTestId('shortcuts-table')).toBeTruthy()
    expect(view.byTestId('shortcuts-row')).toBeTruthy()
  })

  it('未知 panelId 返回 null（不崩宿主渲染链）', async () => {
    const host = new PluginHost()
    api = installMbApi()
    view = await renderDom(<HostPanel host={host} panelId="nope.panel" onClose={() => undefined} />)

    expect(view.container.textContent).toBe('')
  })
})
