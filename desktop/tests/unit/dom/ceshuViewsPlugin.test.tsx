// @vitest-environment jsdom
/**
 * 编辑器内视图插件（B 方案 Slice 11/12：view 挂载点 + 内容槽）。
 *
 * 覆盖：
 * 1. 浮层挂载点 3 个 view、内容槽挂载点 2 个 view，均按 order 排序；
 * 2. 五个 view 都有 React 绑定；
 * 3. `openView` / `closeView` 按挂载点互斥；未知 view 抛错；
 * 4. `ViewMount` 真把开发路线（浮层）/ 版本对比（内容槽）渲染出来、关掉后消失；
 * 5. 禁用插件时宿主关闭其已打开视图。
 *
 * 放在 `tests/unit/dom/` 且用 jsdom：ViewMount 渲染 React 组件；版本对比挂载即请求版本列表，
 * 故需 `installMbApi` 桩住 `ceshu.versions`。
 */
import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import {
  CESHU_CONTENT_MOUNT,
  CESHU_VIEW_MOUNT,
  type CeshuViewContextValue
} from '../../../src/renderer/src/plugins/ceshuViewContext'
import { defineCeshuViewsPlugin } from '../../../src/renderer/src/plugins/ceshuViewsPlugin'
import { getReactBinding } from '../../../src/renderer/src/plugins/reactBindings'
import { ViewMount } from '../../../src/renderer/src/plugins/ViewMount'
import { createDefaultCeshu } from '../../../src/shared/ceshuModel'
import { PluginHost } from '../../../src/shared/plugin/host'
import { installMbApi, renderDom, type ApiStub, type RenderResult } from './render'

let view: RenderResult | null = null
let api: ApiStub | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  api?.restore()
  api = null
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

function ctx(overrides: Partial<CeshuViewContextValue> = {}): CeshuViewContextValue {
  return {
    doc: makeDoc(),
    types: [],
    onSelect: () => undefined,
    gameName: '测试项目',
    currentChapter: 'meta',
    changelog: null,
    validateErrors: [],
    readiness: null,
    busy: false,
    onRunMigration: () => undefined,
    onApproveAllPending: () => undefined,
    onFieldStatus: () => undefined,
    onApplyImport: async () => false,
    onDerive: () => undefined,
    onToggleModule: () => undefined,
    onAiApplied: () => undefined,
    onTemplateApplied: () => undefined,
    onPresetApplied: () => undefined,
    onSystemConfirmed: () => undefined,
    onExportChangelog: () => undefined,
    onExportValidation: () => undefined,
    onExportReadiness: () => undefined,
    onJumpChapter: () => undefined,
    onJumpField: () => undefined,
    ...overrides
  }
}

describe('编辑器内视图插件（Slice 11/12/13：view 挂载点 + 内容槽）', () => {
  it('浮层挂载点声明 7 个 view（路线/体检/影响面/迁移/消费/审阅/导入），按 order 排序', () => {
    const host = hostWithPlugin()
    expect(host.views(CESHU_VIEW_MOUNT).map((v) => v.id)).toEqual([
      'route.view',
      'health.view',
      'fieldImpact.view',
      'migration.view',
      'consume.view',
      'review.view',
      'import.view'
    ])
    for (const v of host.views(CESHU_VIEW_MOUNT)) expect(v.mount).toBe(CESHU_VIEW_MOUNT)
  })

  it('内容槽挂载点声明 13 个 view（版本对比/时间线/报告/AI/预设…）', () => {
    const host = hostWithPlugin()
    expect(host.views(CESHU_CONTENT_MOUNT).map((v) => v.id)).toEqual([
      'diff.view',
      'timeline.view',
      'changelog.view',
      'validate.view',
      'readiness.view',
      'notes.view',
      'dataRefs.view',
      'aiReview.view',
      'aiFull.view',
      'aiDataGen.view',
      'presetMarket.view',
      'systemConfirm.view',
      'templateEditor.view'
    ])
    expect(host.views('other.mount')).toEqual([])
  })

  it('22 个 view 都有 React 绑定（否则会退化成占位文本）', () => {
    hostWithPlugin()
    const ids = [
      'route.view',
      'health.view',
      'fieldImpact.view',
      'migration.view',
      'consume.view',
      'review.view',
      'import.view',
      'derive.view',
      'modulePicker.view',
      'diff.view',
      'timeline.view',
      'changelog.view',
      'validate.view',
      'readiness.view',
      'notes.view',
      'dataRefs.view',
      'aiReview.view',
      'aiFull.view',
      'aiDataGen.view',
      'presetMarket.view',
      'systemConfirm.view',
      'templateEditor.view'
    ]
    for (const id of ids) expect(getReactBinding(id), id).toBeDefined()
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

  it('浮层 ViewMount：开发路线出现、关闭后消失', async () => {
    const host = hostWithPlugin()
    view = await renderDom(<ViewMount host={host} mount={CESHU_VIEW_MOUNT} context={ctx()} />)
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
    view = await renderDom(<ViewMount host={host} mount={CESHU_VIEW_MOUNT} context={ctx()} />)

    await act(async () => {
      host.openView('fieldImpact.view', { chapter: 'meta', field: 'positioning' })
    })
    await view.flush()
    expect(view.query('[data-testid="field-impact-overlay"]')).not.toBeNull()
  })

  it('内容槽 ViewMount：版本对比替换内容区、关闭后消失', async () => {
    api = installMbApi()
    const host = hostWithPlugin()
    view = await renderDom(<ViewMount host={host} mount={CESHU_CONTENT_MOUNT} context={ctx()} />)
    expect(view.query('[data-testid="diff-panel"]')).toBeNull()

    await act(async () => {
      host.openView('diff.view')
    })
    await view.flush()
    expect(view.query('[data-testid="diff-panel"]')).not.toBeNull()
    expect(api.calls).toContain('ceshu.versions')

    await act(async () => {
      host.closeView(CESHU_CONTENT_MOUNT)
    })
    await view.flush()
    expect(view.query('[data-testid="diff-panel"]')).toBeNull()
  })

  it('禁用插件时宿主关闭其已打开视图', () => {
    const host = hostWithPlugin()
    host.openView('route.view')
    expect(host.activeView(CESHU_VIEW_MOUNT)).not.toBeNull()

    host.disable('ceshu-views')
    expect(host.activeView(CESHU_VIEW_MOUNT)).toBeNull()
  })
})
