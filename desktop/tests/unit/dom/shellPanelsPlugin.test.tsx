// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { PluginHost } from '../../../src/shared/plugin/host'
import { HostPanel } from '../../../src/renderer/src/plugins/host'
import { AppContextProvider } from '../../../src/renderer/src/plugins/host'
import { defineShellPanelsPlugin } from '../../../src/renderer/src/plugins/panels'
import { appContextValue, installMbApi, renderDom, type RenderResult } from './render'

let view: RenderResult | null = null
let api: ReturnType<typeof installMbApi> | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  api?.restore()
  api = null
})

function tree(host: PluginHost, panelId: string) {
  return (
    <AppContextProvider value={appContextValue()}>
      <HostPanel host={host} panelId={panelId} onClose={() => undefined} />
    </AppContextProvider>
  )
}

describe('外壳面板（关于 / 插件中心）经宿主渲染（B 方案 Slice 8 前置）', () => {
  it('一个 manifest 暴露 2 个 panel 能力与 2 个命令', () => {
    const host = new PluginHost()
    host.register(defineShellPanelsPlugin(host))

    expect(host.panels().map((panel) => panel.id).sort()).toEqual(['about.panel', 'plugins.panel'])
    expect(host.commands().map((command) => command.id).sort()).toEqual(['about.open', 'plugins.open'])
  })

  it('关于面板：版本号由打开参数下发（App 不再直接渲染 AboutPanel）', async () => {
    const host = new PluginHost()
    host.register(defineShellPanelsPlugin(host))
    api = installMbApi()

    host.openPanel('about.panel', { version: '1.2.3' })
    view = await renderDom(tree(host, 'about.panel'))

    expect(view.byTestId('about-panel')).toBeTruthy()
    expect(view.text()).toContain('版本 1.2.3')
  })

  it('关于面板：没拿到版本时展示占位文案，不编造假版本号', async () => {
    const host = new PluginHost()
    host.register(defineShellPanelsPlugin(host))
    api = installMbApi()

    host.openPanel('about.panel')
    view = await renderDom(tree(host, 'about.panel'))

    expect(view.text()).toContain('正在读取版本')
  })

  it('插件中心自举：经宿主渲染，且能列出宿主里已注册的插件', async () => {
    const host = new PluginHost()
    host.register(defineShellPanelsPlugin(host))
    api = installMbApi()

    host.openPanel('plugins.panel')
    view = await renderDom(tree(host, 'plugins.panel'))

    expect(view.byTestId('plugins-panel')).toBeTruthy()
    expect(view.text()).toContain('已注册 1 个插件')
    expect(view.byTestId('plugin-shell-panels')).toBeTruthy()
  })
})
