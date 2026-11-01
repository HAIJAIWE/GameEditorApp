// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { PluginHost } from '@mobai/shared/plugin/host'
import type { DataTypeDef, ImportPreview } from '@mobai/shared/types'
import { HostPanel } from '../../../src/renderer/src/plugins/host'
import { AppContextProvider } from '../../../src/renderer/src/plugins/host'
import { defineEntryPanelsPlugin } from '../../../src/renderer/src/plugins/panels'
import { appContextValue, installMbApi, renderDom, type RenderResult } from './render'

const TYPES: DataTypeDef[] = [
  { id: 'weapon', name: '武器', pluralKey: 'weapons', color: '#c00', formFields: [] },
  { id: 'role', name: '角色', pluralKey: 'roles', color: '#0a0', formFields: [] }
]

const PREVIEW: ImportPreview = {
  kind: 'csv',
  filePath: 'D:/tmp/weapons.csv',
  totalRows: 3,
  createCount: 2,
  updateCount: 1,
  unchangedCount: 0,
  skipped: 0,
  byType: { weapon: { create: 2, update: 1, unchanged: 0 } },
  records: [],
  truncated: false,
  unknownTypes: {},
  missingIdSources: []
}

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
    <AppContextProvider value={appContextValue({ types: TYPES })}>
      <HostPanel host={host} panelId={panelId} onClose={() => undefined} />
    </AppContextProvider>
  )
}

describe('带打开参数的数据录入面板经宿主渲染（B 方案 Slice 7）', () => {
  it('一个 manifest 暴露 4 个 panel 能力（导入预览无菜单命令，只由导入流程带参打开）', () => {
    const host = new PluginHost()
    host.register(defineEntryPanelsPlugin(host))

    expect(host.panels().map((panel) => panel.id).sort()).toEqual([
      'batch.panel',
      'importPreview.panel',
      'quickCreate.panel',
      'typeEditor.panel'
    ])
    expect(host.commands().map((command) => command.id).sort()).toEqual([
      'batch.open',
      'quickCreate.open',
      'typeEditor.open'
    ])
  })

  it('字段结构编辑器：预选类型由宿主参数决定（不再由 App 传 initialTypeId）', async () => {
    const host = new PluginHost()
    host.register(defineEntryPanelsPlugin(host))
    api = installMbApi()

    host.openPanel('typeEditor.panel', { initialTypeId: 'role' })
    view = await renderDom(tree(host, 'typeEditor.panel'))
    await view.flush()

    const tabs = view.queryAll('[data-testid="te-type-tab"]')
    expect(tabs).toHaveLength(2)
    // 第二个页签 = role，被参数选中
    expect(tabs[1].className).toContain('active')
    expect(tabs[0].className).not.toContain('active')
  })

  it('字段结构编辑器：无参数时回落到第一个类型', async () => {
    const host = new PluginHost()
    host.register(defineEntryPanelsPlugin(host))
    api = installMbApi()

    host.openPanel('typeEditor.panel')
    view = await renderDom(tree(host, 'typeEditor.panel'))
    await view.flush()

    const tabs = view.queryAll('[data-testid="te-type-tab"]')
    expect(tabs[0].className).toContain('active')
  })

  it('快速创建：目标类型由宿主参数下发', async () => {
    const host = new PluginHost()
    host.register(defineEntryPanelsPlugin(host))
    api = installMbApi()

    host.openPanel('quickCreate.panel', { type: 'role' })
    view = await renderDom(tree(host, 'quickCreate.panel'))
    await view.flush()

    expect(view.byTestId('qc-panel')).toBeTruthy()
    expect(view.text()).toContain('角色')
  })

  it('导入预览：参数带整份预览数据；形状不对则不渲染空壳', async () => {
    const host = new PluginHost()
    host.register(defineEntryPanelsPlugin(host))
    api = installMbApi()

    host.openPanel('importPreview.panel', { previewId: 'p1', preview: PREVIEW })
    view = await renderDom(tree(host, 'importPreview.panel'))
    await view.flush()
    expect(view.byTestId('import-preview-panel')).toBeTruthy()
    expect(view.text()).toContain('weapons.csv')

    // 只给 id 不给预览数据 → 绑定返回 null（不崩、不画空壳）
    await view.cleanup()
    view = null
    host.openPanel('importPreview.panel', { previewId: 'p2' })
    view = await renderDom(tree(host, 'importPreview.panel'))
    await view.flush()
    expect(view.query('[data-testid="import-preview-panel"]')).toBeNull()
  })
})
