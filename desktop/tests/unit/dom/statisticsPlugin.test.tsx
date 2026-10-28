// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { PluginHost } from '../../../src/shared/plugin/host'
import type { DataTypeDef, ItemRecord } from '../../../src/shared/types'
import { HostPanel } from '../../../src/renderer/src/plugins/HostPanel'
import { AppContextProvider } from '../../../src/renderer/src/plugins/appContext'
import { defineStatisticsPlugin } from '../../../src/renderer/src/plugins/statisticsPlugin'
import { installMbApi, renderDom, type RenderResult, appContextValue } from './render'

const TYPES: DataTypeDef[] = [
  { id: 'weapon', name: '武器', pluralKey: 'weapons', color: '#c00', formFields: [] }
]

const ITEMS: ItemRecord[] = [
  { id: 'w1', type: 'weapon', data: {}, createdAt: '', updatedAt: '' },
  { id: 'w2', type: 'weapon', data: {}, createdAt: '', updatedAt: '' }
]

let view: RenderResult | null = null
let api: ReturnType<typeof installMbApi> | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  api?.restore()
  api = null
})

describe('状态化面板经宿主渲染 + appContext 自供给（B 方案 Slice 2）', () => {
  it('统计面板经 HostPanel 渲染，types 来自 context 而非 App props', async () => {
    const host = new PluginHost()
    host.register(defineStatisticsPlugin(host))
    api = installMbApi({ overrides: { 'data.listAll': () => ITEMS } })

    view = await renderDom(
      <AppContextProvider
        value={appContextValue({ types: TYPES })}
      >
        <HostPanel host={host} panelId="statistics.panel" onClose={() => undefined} />
      </AppContextProvider>
    )

    // 面板本体经绑定渲染（testid 保留）
    expect(view.byTestId('stats-panel')).toBeTruthy()
    // types 由 context 注入 → 概览里出现该类型名与统计总数
    expect(view.text()).toContain('武器')
    expect(view.text()).toContain('总数据量：2 项')
  })

  it('插件已注册进宿主，命令可打开对应面板', async () => {
    const host = new PluginHost()
    const manifest = defineStatisticsPlugin(host)
    host.register(manifest)

    const command = host.commands().find((capability) => capability.id === 'statistics.open')
    expect(command).toBeTruthy()
    command!.run()
    expect(host.activePanel()?.id).toBe('statistics.panel')
  })
})
