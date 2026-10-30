// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import CeshuView from '../../../src/renderer/src/components/ceshuDoc/CeshuView'
import { defineCeshuMenusPlugin } from '../../../src/renderer/src/plugins/ceshuMenusPlugin'
import { defineCeshuViewsPlugin } from '../../../src/renderer/src/plugins/ceshuViewsPlugin'
import { createDefaultCeshu } from '../../../src/shared/ceshu/model/ceshuModel'
import { PluginHost } from '../../../src/shared/plugin/host'
import { installMbApi, renderDom, type ApiStub, type RenderResult } from './render'

/**
 * 左栏「产出物切换」（三栏布局第一步）：
 * 默认设计文档 → 有章节大纲；切到原型/数据/任务 → 出占位、大纲隐藏；切回文档 → 恢复。
 */

let view: RenderResult | null = null
let api: ApiStub | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  api?.restore()
  api = null
  localStorage.clear()
})

function makeDoc() {
  const doc = createDefaultCeshu({ scope: 'full', name: '星海计划' })
  doc.ceshu_id = 'c1'
  doc.meta.system_confirmed = true
  return doc
}

async function mount(): Promise<RenderResult> {
  // Slice 11：CeshuView 需要宿主来挂载编辑器内视图
  const host = new PluginHost()
  host.register(defineCeshuViewsPlugin())
  host.register(defineCeshuMenusPlugin(host))
  view = await renderDom(
    <CeshuView
      ceshuId="c1"
      onChanged={() => {}}
      onSelect={() => {}}
      types={[]}
      onBack={() => {}}
      host={host}
    />
  )
  return view
}

describe('CeshuView：左栏产出物切换', () => {
  it('默认设计文档有章节大纲；切到原型 → 出占位、大纲隐藏；切回 → 恢复', async () => {
    api = installMbApi({ doc: makeDoc() })
    const rendered = await mount()

    expect(rendered.byTestId('artifact-doc').className).toContain('active')
    expect(rendered.queryAll('[data-testid="chapter-tab"]').length).toBeGreaterThan(0)

    await rendered.click(rendered.byTestId('artifact-prototype'))
    expect(rendered.byTestId('prototype-panel')).toBeTruthy()
    expect(rendered.byTestId('artifact-nav-hint').textContent).toContain('原型预览')
    expect(rendered.queryAll('[data-testid="chapter-tab"]')).toHaveLength(0)

    await rendered.click(rendered.byTestId('artifact-data'))
    expect(rendered.byTestId('machine-panel')).toBeTruthy()

    await rendered.click(rendered.byTestId('artifact-tasks'))
    expect(rendered.byTestId('tasks-panel')).toBeTruthy()

    await rendered.click(rendered.byTestId('artifact-doc'))
    expect(rendered.queryAll('[data-testid="chapter-tab"]').length).toBeGreaterThan(0)
    expect(rendered.query('[data-testid="prototype-panel"]')).toBeNull()
  })
})
