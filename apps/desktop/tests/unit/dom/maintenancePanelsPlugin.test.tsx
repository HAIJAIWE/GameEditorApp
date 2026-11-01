// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from 'vitest'

import { PluginHost } from '@mobai/shared/plugin/host'
import type { DataTypeDef, ItemRecord } from '@mobai/shared/types'
import { HostPanel } from '../../../src/renderer/src/plugins/host'
import { AppContextProvider } from '../../../src/renderer/src/plugins/host'
import { defineMaintenancePanelsPlugin } from '../../../src/renderer/src/plugins/panels'
import { appContextValue, installMbApi, renderDom, type RenderResult } from './render'

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

describe('依赖动作的面板经宿主渲染 + appContext 自供给（B 方案 Slice 6）', () => {
  it('一个 manifest 暴露 2 个 panel 能力与对应命令', () => {
    const host = new PluginHost()
    host.register(defineMaintenancePanelsPlugin(host))

    expect(host.panels().map((panel) => panel.id).sort()).toEqual(['backup.panel', 'clearAll.panel'])
    expect(host.commands().map((command) => command.id).sort()).toEqual(['backup.open', 'clearAll.open'])
  })

  it('清空面板：确认清空后调用的是 context 注入的 handleDataCleared（App 不再下发 props）', async () => {
    const host = new PluginHost()
    host.register(defineMaintenancePanelsPlugin(host))
    const cleared = vi.fn()
    api = installMbApi({
      overrides: {
        'data.listAll': () => ITEMS,
        'data.clearAll': () => ({ deleted: ITEMS.length })
      }
    })

    view = await renderDom(
      <AppContextProvider value={appContextValue({ types: TYPES, handleDataCleared: cleared })}>
        <HostPanel host={host} panelId="clearAll.panel" onClose={() => undefined} />
      </AppContextProvider>
    )
    await view.flush()

    // 面板先读全库条数，风险提示里带真实条数
    expect(view.byTestId('clearall-panel')).toBeTruthy()
    expect(view.text()).toContain('全部 2 条数据')

    await view.click(view.byTestId('clearall-start'))
    await view.click(view.byTestId('clearall-confirm-yes'))
    await view.flush()

    expect(cleared).toHaveBeenCalledWith(ITEMS.length)
  })

  it('备份面板经宿主渲染，onClose 由绑定转发（testid 保留）', async () => {
    const host = new PluginHost()
    host.register(defineMaintenancePanelsPlugin(host))
    api = installMbApi({ overrides: { 'backup.list': () => [] } })

    view = await renderDom(
      <AppContextProvider value={appContextValue({ types: TYPES })}>
        <HostPanel host={host} panelId="backup.panel" onClose={() => undefined} />
      </AppContextProvider>
    )
    await view.flush()

    expect(view.byTestId('backup-panel')).toBeTruthy()
  })
})
