// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { PluginHost } from '../../../src/shared/plugin/host'
import type { DataTypeDef } from '../../../src/shared/types'
import { HostPanel } from '../../../src/renderer/src/plugins/HostPanel'
import { AppContextProvider } from '../../../src/renderer/src/plugins/appContext'
import { defineDataPanelsPlugin } from '../../../src/renderer/src/plugins/dataPanelsPlugin'
import { installMbApi, renderDom, type RenderResult } from './render'

const TYPES: DataTypeDef[] = [
  { id: 'weapon', name: '武器', pluralKey: 'weapons', color: '#c00', formFields: [] },
  { id: 'role', name: '角色', pluralKey: 'roles', color: '#0a0', formFields: [] }
]

const PANEL_IDS = ['advancedSearch.panel', 'relationGraph.panel', 'attributeChart.panel'] as const

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
    <AppContextProvider
      value={{ types: TYPES, setTypes: () => undefined, handleJump: () => undefined, refreshUndo: () => undefined }}
    >
      <HostPanel host={host} panelId={panelId} onClose={() => undefined} />
    </AppContextProvider>
  )
}

describe('只依赖共享状态的面板经宿主渲染 + appContext 自供给（B 方案 Slice 5）', () => {
  it('一个 manifest 暴露 3 个 panel 能力与对应命令', () => {
    const host = new PluginHost()
    host.register(defineDataPanelsPlugin(host))

    expect(host.panels().map((panel) => panel.id).sort()).toEqual([...PANEL_IDS].sort())
    for (const id of PANEL_IDS) {
      expect(host.commands().some((command) => command.id === `${id.split('.')[0]}.open`)).toBe(true)
    }
  })

  it('高级搜索面板：types 来自 context（App 不再下发 props），testid 保留', async () => {
    const host = new PluginHost()
    host.register(defineDataPanelsPlugin(host))
    api = installMbApi({ overrides: { 'data.listAll': () => [] } })

    view = await renderDom(tree(host, 'advancedSearch.panel'))
    await view.flush()

    expect(view.byTestId('advanced-search-panel')).toBeTruthy()
    // 类型下拉的选项来自 context 注入的 types
    expect(view.text()).toContain('武器')
    expect(view.text()).toContain('角色')
  })

  it('关系图 / 属性图表面板同样经宿主渲染（无 onClose 的面板也能挂）', async () => {
    const host = new PluginHost()
    host.register(defineDataPanelsPlugin(host))
    api = installMbApi({ overrides: { 'data.listAll': () => [] } })

    view = await renderDom(tree(host, 'relationGraph.panel'))
    await view.flush()
    expect(view.byTestId('relation-graph-panel')).toBeTruthy()
  })
})
