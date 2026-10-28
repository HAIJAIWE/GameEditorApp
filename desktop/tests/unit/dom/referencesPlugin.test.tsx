// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { PluginHost } from '../../../src/shared/plugin/host'
import type { DataTypeDef } from '../../../src/shared/types'
import { HostPanel } from '../../../src/renderer/src/plugins/HostPanel'
import { AppContextProvider } from '../../../src/renderer/src/plugins/appContext'
import { defineReferencesPlugin } from '../../../src/renderer/src/plugins/referencesPlugin'
import { installMbApi, renderDom, type RenderResult } from './render'

const TYPES: DataTypeDef[] = [
  { id: 'weapon', name: '武器', pluralKey: 'weapons', color: '#c00', formFields: [] }
]

const EMPTY_REPORT = { referencedBy: [], references: [], similar: [] }

let view: RenderResult | null = null
let api: ReturnType<typeof installMbApi> | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  api?.restore()
  api = null
})

/** 面板本体需要 appContext（types / 跳转）——与生产环境同一条渲染链 */
function tree(host: PluginHost) {
  return (
    <AppContextProvider
      value={{ types: TYPES, setTypes: () => undefined, handleJump: () => undefined, refreshUndo: () => undefined }}
    >
      <HostPanel host={host} panelId="references.panel" onClose={() => undefined} />
    </AppContextProvider>
  )
}

describe('带打开参数的面板经宿主渲染 + 参数自供给（B 方案 Slice 3）', () => {
  it('目标条目由宿主参数下发：面板头部显示条目名与类型名', async () => {
    const host = new PluginHost()
    host.register(defineReferencesPlugin(host))
    api = installMbApi({ overrides: { 'data.references': () => EMPTY_REPORT } })

    host.openPanel('references.panel', { type: 'weapon', id: 'w1', name: '铁剑' })
    view = await renderDom(tree(host))
    await view.flush()

    // testid 保留（迁移只换渲染通道，不改 DOM 契约）
    expect(view.byTestId('references-panel')).toBeTruthy()
    expect(view.text()).toContain('铁剑')
    expect(view.text()).toContain('武器')
  })

  it('面板已打开时宿主换参数 → 面板跟着刷新（不依赖 App state 变化）', async () => {
    const host = new PluginHost()
    host.register(defineReferencesPlugin(host))
    api = installMbApi({ overrides: { 'data.references': () => EMPTY_REPORT } })

    host.openPanel('references.panel', { type: 'weapon', id: 'w1', name: '铁剑' })
    view = await renderDom(tree(host))
    await view.flush()
    expect(view.text()).toContain('铁剑')

    // 真实场景：面板开着，用户从搜索里又定位到另一条 → 宿主替换打开参数
    await act(async () => {
      host.openPanel('references.panel', { type: 'weapon', id: 'w2', name: '木剑' })
    })
    await view.flush()

    expect(view.text()).toContain('木剑')
    expect(view.text()).not.toContain('铁剑')
  })

  it('参数形状不对时不渲染空壳（不崩）', async () => {
    const host = new PluginHost()
    host.register(defineReferencesPlugin(host))
    api = installMbApi({ overrides: { 'data.references': () => EMPTY_REPORT } })

    host.openPanel('references.panel', { name: '只有名字没有 id' })
    view = await renderDom(tree(host))
    await view.flush()

    expect(view.query('[data-testid="references-panel"]')).toBeNull()
  })

  it('命令打开面板时沿用已预置的目标（先定位、后从菜单打开）', () => {
    const host = new PluginHost()
    host.register(defineReferencesPlugin(host))

    const command = host.commands().find((capability) => capability.id === 'references.open')
    expect(command).toBeTruthy()
    command!.run()

    expect(host.activePanel()?.id).toBe('references.panel')
    // 未预置参数时不崩、不产生目标（面板自身不渲染空壳）
    expect(host.panelParams('references.panel')).toBeUndefined()
  })
})
