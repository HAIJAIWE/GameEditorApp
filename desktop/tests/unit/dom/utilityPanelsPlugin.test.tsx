// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { PluginHost } from '../../../src/shared/plugin/host'
import type { DataTypeDef } from '../../../src/shared/types'
import { HostPanel } from '../../../src/renderer/src/plugins/HostPanel'
import { AppContextProvider } from '../../../src/renderer/src/plugins/appContext'
import { defineUtilityPanelsPlugin } from '../../../src/renderer/src/plugins/utilityPanelsPlugin'
import { installMbApi, renderDom, type RenderResult, appContextValue } from './render'

const TYPES: DataTypeDef[] = []

/** bundle 形态：一个插件带 8 个 panel 能力（不依赖 App 状态的面板） */
const PANEL_IDS = [
  'settings.panel',
  'cleanupImages.panel',
  'keywordTemplates.panel',
  'agentEditor.panel',
  'gameDataPreview.panel',
  'attrSystem.panel',
  'dataDiff.panel',
  'imageGen.panel'
] as const

let view: RenderResult | null = null
let api: ReturnType<typeof installMbApi> | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  api?.restore()
  api = null
})

describe('零依赖工具面板经宿主渲染（B 方案 Slice 4 · bundle 形态）', () => {
  it('一个 manifest 暴露 5 个 panel 能力与对应命令', () => {
    const host = new PluginHost()
    host.register(defineUtilityPanelsPlugin(host))

    expect(host.panels().map((panel) => panel.id).sort()).toEqual([...PANEL_IDS].sort())
    for (const id of PANEL_IDS) {
      expect(host.commands().some((command) => command.id === `${id.split('.')[0]}.open`)).toBe(true)
    }
  })

  it('面板经 HostPanel 渲染，testid 保留（迁移只换渲染通道，不改 DOM 契约）', async () => {
    const host = new PluginHost()
    host.register(defineUtilityPanelsPlugin(host))
    api = installMbApi()

    view = await renderDom(
      <AppContextProvider
        value={appContextValue({ types: TYPES })}
      >
        <HostPanel host={host} panelId="settings.panel" onClose={() => undefined} />
      </AppContextProvider>
    )

    expect(view.byTestId('settings-panel')).toBeTruthy()
  })

  it('禁用 bundle 后面板能力不再分发，HostPanel 渲染为空（不崩）', async () => {
    const host = new PluginHost()
    host.register(defineUtilityPanelsPlugin(host))
    api = installMbApi()
    host.disable('utility-panels')

    view = await renderDom(
      <AppContextProvider
        value={appContextValue({ types: TYPES })}
      >
        <HostPanel host={host} panelId="settings.panel" onClose={() => undefined} />
      </AppContextProvider>
    )

    expect(view.query('[data-testid="settings-panel"]')).toBeNull()
    expect(host.panels()).toHaveLength(0)
  })
})
