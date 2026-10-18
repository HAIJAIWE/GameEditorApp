// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import CeshuView from '../../../src/renderer/src/components/CeshuView'
import { createDefaultCeshu } from '../../../src/shared/ceshuModel'
import { installMbApi, renderDom, type ApiStub, type RenderResult } from './render'

/**
 * `CeshuView` 的**行为级**测试（W2）。
 *
 * ## 为什么需要这一层
 * 该组件 900+ 行、挂 15 个子面板，而此前渲染层测试覆盖率 ≈ 0 ——
 * tsc 只管类型，eslint 只管风格，55 个 e2e 跑的是打包产物、反馈以分钟计。
 * 于是「改一行渲染层、跑一遍 e2e 才知道坏没坏」，这也是 Wave 3 不敢拆大组件的原因。
 *
 * ## 测什么、不测什么
 * 只测**行为**（点了会发生什么、状态怎么变），不测布局与样式 ——
 * 后者交给 e2e 截图，jsdom 也测不了。
 */

let view: RenderResult | null = null
let api: ApiStub | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  api?.restore()
  api = null
})

/** 造一份「已确认系统」的文档：避开打开时自动弹「确认游戏系统」的干扰 */
function makeDoc(id = 'c1') {
  const doc = createDefaultCeshu({ scope: 'full', name: '星海计划' })
  doc.ceshu_id = id
  doc.meta.system_confirmed = true
  return doc
}

async function mount(
  ceshuId = 'c1',
  handlers: { onBack?: () => void } = {}
): Promise<RenderResult> {
  view = await renderDom(
    <CeshuView
      ceshuId={ceshuId}
      onChanged={() => {}}
      onSelect={() => {}}
      types={[]}
      onBack={handlers.onBack ?? (() => {})}
    />
  )
  return view
}

describe('CeshuView：加载与展示', () => {
  it('挂载后按 id 拉取文档，并渲染标题与总进度', async () => {
    api = installMbApi({ doc: makeDoc() })
    const rendered = await mount()

    expect(api.calls).toContain('ceshu.get')
    expect(rendered.text()).toContain('星海计划')
    expect(rendered.byTestId('ceshu-total-progress').textContent).toContain('总进度')
  })

  it('加载失败时显示错误条，而不是空白页', async () => {
    api = installMbApi({ doc: makeDoc(), getError: new Error('磁盘读取失败') })
    const rendered = await mount()

    const banner = rendered.query('.error-banner')
    expect(banner).not.toBeNull()
    expect(banner?.textContent).toContain('磁盘读取失败')
  })

  it('加载失败时提供返回出口，不让用户停在死页面', async () => {
    api = installMbApi({ doc: makeDoc(), getError: new Error('磁盘读取失败') })
    let backed = false
    const rendered = await mount('c1', { onBack: () => { backed = true } })

    await rendered.click(rendered.byTestId('ceshu-load-error-back'))

    expect(backed).toBe(true)
  })

  it('未选择策划书时给出空状态提示', async () => {
    api = installMbApi({ doc: makeDoc() })
    const rendered = await mount('')

    expect(rendered.text()).toContain('请选择或新建策划书')
    expect(api.calls).not.toContain('ceshu.get')
  })
})

describe('CeshuView：「更多」菜单', () => {
  it('菜单里保留「补全空白字段」入口（W0 移除 ChecklistPanel 后的能力承载体）', async () => {
    api = installMbApi({ doc: makeDoc() })
    const rendered = await mount()

    await rendered.click(rendered.byTestId('ceshu-more'))

    const item = rendered.byTestId('ceshu-autofill')
    expect(item.textContent).toContain('补全空白字段')
  })

  it('点「补全空白字段」会调用 ceshu.autoFill，并回显补全条数', async () => {
    api = installMbApi({ doc: makeDoc() })
    const rendered = await mount()

    await rendered.click(rendered.byTestId('ceshu-more'))
    await rendered.click(rendered.byTestId('ceshu-autofill'))

    expect(api.calls).toContain('ceshu.autoFill')
    expect(rendered.query('.notice-banner')?.textContent).toContain('已补全 2 个空白字段')
  })

  it('点「版本对比」会挂载对比面板并请求版本列表', async () => {
    api = installMbApi({ doc: makeDoc() })
    const rendered = await mount()

    await rendered.click(rendered.byTestId('ceshu-more'))
    await rendered.click(rendered.byTestId('ceshu-diff'))

    expect(api.calls).toContain('ceshu.versions')
    // 面板打开后「更多」菜单应收起，避免遮挡
    expect(rendered.query('[data-testid="ceshu-more-menu"]')).toBeNull()
  })
})
