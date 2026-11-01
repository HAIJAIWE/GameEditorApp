// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import type { PluginManifest } from '@mobai/shared/plugin/types'
import { PluginHost } from '@mobai/shared/plugin/host'
import { MainViewMount, type AppMainTab } from '../../../src/renderer/src/plugins/host'
import { defineCoreViewsPlugin } from '../../../src/renderer/src/plugins/panels'
import { getReactBinding, registerReactBinding } from '../../../src/renderer/src/plugins/host'
import { renderDom, type RenderResult } from './render'

let view: RenderResult | null = null

beforeEach(() => {
  localStorage.clear()
})

afterEach(async () => {
  await view?.cleanup()
  view = null
})

function CodeBody() {
  return <div data-testid="code-body">CODE</div>
}

function BrowserBody() {
  return <div data-testid="browser-body">BROWSER</div>
}

/** 用假插件验证挂载器本体（避免真 CodePanel/BrowserPanel 依赖 IPC） */
function makeHost(): PluginHost {
  registerReactBinding('test.code', CodeBody)
  registerReactBinding('test.browser', BrowserBody)
  const host = new PluginHost()
  const manifest: PluginManifest = {
    id: 'test-views',
    name: 'test-views',
    version: '0.1.0',
    capabilities: [
      { kind: 'mainView', id: 'test.code', label: '代码', order: 30, lazy: true, ui: { type: 'text', text: '代码' } },
      { kind: 'mainView', id: 'test.browser', label: '浏览器', order: 40, lazy: true, ui: { type: 'text', text: '浏览器' } }
    ]
  }
  host.register(manifest)
  return host
}

const appTabs: AppMainTab[] = [
  { id: 'editor', label: '策划书', order: 0, lazy: false, render: () => <div data-testid="editor-body">EDITOR</div> },
  { id: 'data', label: '数据', order: 10, lazy: true, render: () => <div data-testid="data-body">DATA</div> }
]

describe('主区视图挂载器（Slice 22）', () => {
  it('合并内联 + 插件页签并按 order 排序；lazy 首访才挂载；编辑器常驻不卸载', async () => {
    view = await renderDom(<MainViewMount host={makeHost()} appTabs={appTabs} />)

    const tabs = view
      .queryAll('[data-testid^="middle-tab-"]')
      .map((element) => element.getAttribute('data-testid'))
    expect(tabs).toEqual([
      'middle-tab-editor',
      'middle-tab-data',
      'middle-tab-test.code',
      'middle-tab-test.browser'
    ])

    // 默认 editor 已挂载；lazy 页签首访前未挂载
    expect(view.byTestId('editor-body')).toBeTruthy()
    expect(view.query('[data-testid="code-body"]')).toBeNull()

    // 点代码 → 挂载，编辑器仍在（常驻、不卸载）
    await view.click(view.byTestId('middle-tab-test.code'))
    expect(view.byTestId('code-body')).toBeTruthy()
    expect(view.byTestId('editor-body')).toBeTruthy()

    await view.click(view.byTestId('middle-tab-test.browser'))
    expect(view.byTestId('browser-body')).toBeTruthy()
  })

  it('插件被禁用后其页签消失，激活态回落到第一个（编辑器）', async () => {
    const host = makeHost()
    view = await renderDom(<MainViewMount host={host} appTabs={appTabs} />)
    await view.click(view.byTestId('middle-tab-test.code'))
    expect(view.byTestId('code-body')).toBeTruthy()

    await act(async () => {
      host.disable('test-views')
    })
    await view.flush()

    expect(view.query('[data-testid="middle-tab-test.code"]')).toBeNull()
    expect(view.byTestId('editor-body')).toBeTruthy()
  })

  it('core-views 插件声明策划书/数据/技术设计/代码/浏览器五个 mainView（order 0/10/20/30/40）+ React 绑定', () => {
    const manifest = defineCoreViewsPlugin()
    const views = manifest.capabilities.filter((cap) => cap.kind === 'mainView')
    expect(views.map((v) => v.id)).toEqual([
      'editor.mainView',
      'data.mainView',
      'techDoc.mainView',
      'code.mainView',
      'browser.mainView'
    ])
    expect(views.map((v) => v.order)).toEqual([0, 10, 20, 30, 40])
    // 编辑器常驻挂载（lazy:false），其余首访才挂
    expect(views.map((v) => v.lazy)).toEqual([false, true, true, true, true])
    for (const id of ['editor.mainView', 'data.mainView', 'techDoc.mainView', 'code.mainView', 'browser.mainView']) {
      expect(getReactBinding(id)).toBeDefined()
    }
  })

  it('`host: rightbar` 的 mainView 不进主区页签条（由右栏容器认领）', async () => {
    registerReactBinding('test.rightbar', () => <div data-testid="rightbar-body">RIGHT</div>)
    const host = makeHost()
    host.register({
      id: 'test-rightbar-view',
      name: 'test-rightbar-view',
      version: '0.1.0',
      capabilities: [
        {
          kind: 'mainView',
          id: 'test.rightbar',
          label: '会话',
          order: 50,
          lazy: true,
          host: 'rightbar',
          ui: { type: 'text', text: '会话' }
        }
      ]
    })
    view = await renderDom(<MainViewMount host={host} appTabs={appTabs} />)

    // 主区页签条只有内联页签 + 主区视图；右栏视图既不出页签、也不渲染内容
    expect(view.query('[data-testid="middle-tab-test.rightbar"]')).toBeNull()
    expect(view.query('[data-testid="rightbar-body"]')).toBeNull()
  })
})
