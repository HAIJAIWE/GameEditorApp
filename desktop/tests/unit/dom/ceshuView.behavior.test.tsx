// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import CeshuView from '../../../src/renderer/src/components/CeshuView'
import { createDefaultCeshu } from '../../../src/shared/ceshuModel'
import { installMbApi, renderDom, type ApiStub, type RenderResult } from './render'
import type { CeshuDocument } from '../../../src/shared/ceshuConstants'

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
  /*
   * 组件会把「数据栏展开状态」写进 localStorage（这是有意的产品行为）。
   * 但 jsdom 的 localStorage 在同一个测试文件内**跨用例共享** —— 不清理的话，
   * 上一个用例留下的「收起」会让下一个用例的默认态错乱（实测：两条用例互相污染）。
   */
  localStorage.clear()
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

describe('CeshuView：工作区 / 智能体分区', () => {
  /*
   * 布局心智：**左栏 + 中间 = 工作区，右栏 = 智能体**。
   * 数据栏属于工作区（写文档时要对照数据），但它不该常驻 —— 收起后章节表单
   * 应当吃掉整段宽度。默认展开（对齐 PyQt 55:45），偏好存 localStorage。
   */
  it('默认收起数据栏（审阅正文时把宽度留给工作区）', async () => {
    api = installMbApi({ doc: makeDoc() })
    const rendered = await mount()

    expect(rendered.query('[data-testid="ceshu-preview"]')).toBeNull()
    expect(rendered.byTestId('ceshu-preview-toggle').textContent).toContain('数据栏')
  })

  it('点开关后数据栏出现、按钮改文案（收起的是数据栏，不是整个工作区）', async () => {
    api = installMbApi({ doc: makeDoc() })
    const rendered = await mount()

    await rendered.click(rendered.byTestId('ceshu-preview-toggle'))

    expect(rendered.query('[data-testid="ceshu-preview"]')).not.toBeNull()
    expect(rendered.byTestId('ceshu-preview-toggle').textContent).toContain('收起数据')
    expect(rendered.query('[data-testid="chapter-form"]')).not.toBeNull()
  })

  it('再次点击恢复收起', async () => {
    api = installMbApi({ doc: makeDoc() })
    const rendered = await mount()
    const toggle = (): HTMLElement => rendered.byTestId('ceshu-preview-toggle')

    await rendered.click(toggle())
    await rendered.click(toggle())

    expect(rendered.query('[data-testid="ceshu-preview"]')).toBeNull()
  })
})

describe('CeshuView：AI 生成「待核对」标记', () => {
  /*
   * 工作流是「AI 生成 → 人扫一遍」。标记写在 meta.ai_generated，
   * 章节列表据此画圆点；人点「保存本章」即清除该章标记。
   * 锁三件事：标记能读出、圆点会渲染、保存后清掉。
   */
  const withMark = (chapters: string[]): CeshuDocument => {
    const doc = makeDoc()
    doc.meta.ai_generated = Object.fromEntries(chapters.map((key) => [key, '2026-10-20T00:00:00.000Z']))
    return doc
  }

  it('meta 有标记的章节渲染圆点', async () => {
    api = installMbApi({ doc: withMark(['vision']) })
    const rendered = await mount()

    // 直接断言圆点的存在性与"仅此一章"：章节导航里多一个点是最容易悄悄丢失的
    const dots = rendered.queryAll('.chapter-tab-ai')
    expect(dots).toHaveLength(1)
    expect(rendered.byTestId('chapter-ai-vision')).toBeTruthy()
  })

  it('没有标记时不渲染任何圆点', async () => {
    api = installMbApi({ doc: makeDoc() })
    const rendered = await mount()

    expect(rendered.queryAll('.chapter-tab-ai')).toHaveLength(0)
  })

  it('保存某章后清除该章标记（写回 meta）', async () => {
    const doc = withMark(['vision', 'combat'])
    /*
     * 桩的 saveChapter 默认**原样返回同一个文档**，那样即使逻辑正确也看不出圆点消失。
     * 这里改成真正回显：存 meta 时返回替换过 meta 的文档 —— 模拟主进程的真实行为。
     */
    api = installMbApi({
      doc,
      overrides: {
        'ceshu.saveChapter': (req: unknown) => {
          const r = req as { chapter?: string; data?: unknown }
          return r.chapter === 'meta' ? { ...doc, meta: r.data } : doc
        }
      }
    })
    const rendered = await mount()

    // 切到「产品愿景」——默认落在「文档信息」，那章没有标记，会被 clearAiGenerated 短路掉
    const visionTab = rendered
      .queryAll('[data-testid="chapter-tab"]')
      .find((tab) => tab.textContent?.includes('产品愿景'))
    expect(visionTab).toBeTruthy()
    await rendered.click(visionTab as HTMLElement)

    const saveBtn = [...rendered.container.querySelectorAll('button')].find(
      (node) => node.textContent?.trim() === '保存本章'
    )
    expect(saveBtn).toBeTruthy()
    await rendered.click(saveBtn as HTMLElement)

    expect(rendered.query('[data-testid="chapter-ai-vision"]')).toBeNull()
    // 只清当前章，另一章的标记还在
    expect(rendered.queryAll('.chapter-tab-ai')).toHaveLength(1)
  })
})
