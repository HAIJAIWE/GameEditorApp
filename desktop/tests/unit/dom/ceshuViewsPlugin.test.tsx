// @vitest-environment jsdom
/**
 * 编辑器内视图插件（B 方案 Slice 11：view 挂载点）。
 *
 * 覆盖：
 * 1. 3 个 view 能力都挂在 `ceshu.overlay`、按 order 排序；
 * 2. 三个 view 都有 React 绑定（缺绑定会退化成占位文本）；
 * 3. `openView` / `closeView` 按挂载点互斥；未知 view 抛错；
 * 4. `ViewMount` 真的把开发路线 / 影响面渲染出来、关掉后消失；
 * 5. 禁用插件时宿主关闭其已打开视图（不留悬挂状态）。
 *
 * 放在 `tests/unit/dom/` 且用 jsdom：ViewMount 渲染 React 组件。
 */
import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { CESHU_VIEW_MOUNT } from '../../../src/renderer/src/plugins/ceshuViewContext'
import { defineCeshuViewsPlugin } from '../../../src/renderer/src/plugins/ceshuViewsPlugin'
import { getReactBinding } from '../../../src/renderer/src/plugins/reactBindings'
import { ViewMount } from '../../../src/renderer/src/plugins/ViewMount'
import { createDefaultCeshu } from '../../../src/shared/ceshuModel'
import { PluginHost } from '../../../src/shared/plugin/host'
import { renderDom, type RenderResult } from './render'

let view: RenderResult | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  document.body.innerHTML = ''
})

function hostWithPlugin(): PluginHost {
  const host = new PluginHost()
  host.register(defineCeshuViewsPlugin())
  return host
}

function makeDoc() {
  const doc = createDefaultCeshu({ scope: 'full', name: '测试项目' })
  doc.ceshu_id = 'c1'
  return doc
}

describe('编辑器内视图插件（Slice 11：view 挂载点）', () => {
  it('声明 3 个 view 能力，都挂在 ceshu.overlay，按 order 排序', () => {
    const host = hostWithPlugin()
    expect(host.views(CESHU_VIEW_MOUNT).map((v) => v.id)).toEqual([
      'route.view',
      'health.view',
      'fieldImpact.view'
    ])
    expect(host.views('other.mount')).toEqual([])
    for (const v of host.views(CESHU_VIEW_MOUNT)) expect(v.mount).toBe(CESHU_VIEW_MOUNT)
  })

  it('三个 view 都有 React 绑定（否则会退化成占位文本）', () => {
    hostWithPlugin()
    for (const id of ['route.view', 'health.view', 'fieldImpact.view']) {
      expect(getReactBinding(id), id).toBeDefined()
    }
  })

  it('openView / closeView 按挂载点互斥，activeView 反映当前', () => {
    const host = hostWithPlugin()
    expect(host.activeView(CESHU_VIEW_MOUNT)).toBeNull()

    host.openView('route.view')
    expect(host.activeView(CESHU_VIEW_MOUNT)?.id).toBe('route.view')

    // 同一挂载点同时只留一个
    host.openView('health.view')
    expect(host.activeView(CESHU_VIEW_MOUNT)?.id).toBe('health.view')

    host.closeView(CESHU_VIEW_MOUNT)
    expect(host.activeView(CESHU_VIEW_MOUNT)).toBeNull()
  })

  it('openView 对未知 / 无挂载点的 view 抛错', () => {
    const host = hostWithPlugin()
    expect(() => host.openView('nope.view')).toThrow()
  })

  it('ViewMount 渲染当前视图：开发路线面板出现、关闭后消失', async () => {
    const host = hostWithPlugin()
    view = await renderDom(<ViewMount host={host} mount={CESHU_VIEW_MOUNT} doc={makeDoc()} />)
    expect(view.query('[data-testid="route-panel"]')).toBeNull()

    await act(async () => {
      host.openView('route.view')
    })
    await view.flush()
    expect(view.query('[data-testid="route-panel"]')).not.toBeNull()

    await act(async () => {
      host.closeView(CESHU_VIEW_MOUNT)
    })
    await view.flush()
    expect(view.query('[data-testid="route-panel"]')).toBeNull()
  })

  it('影响面视图按打开参数定位字段', async () => {
    const host = hostWithPlugin()
    view = await renderDom(<ViewMount host={host} mount={CESHU_VIEW_MOUNT} doc={makeDoc()} />)

    await act(async () => {
      host.openView('fieldImpact.view', { chapter: 'meta', field: 'positioning' })
    })
    await view.flush()
    expect(view.query('[data-testid="field-impact-overlay"]')).not.toBeNull()
  })

  it('禁用插件时宿主关闭其已打开视图', () => {
    const host = hostWithPlugin()
    host.openView('route.view')
    expect(host.activeView(CESHU_VIEW_MOUNT)).not.toBeNull()

    host.disable('ceshu-views')
    expect(host.activeView(CESHU_VIEW_MOUNT)).toBeNull()
  })
})
