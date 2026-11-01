// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'

import { CeshuView } from '../../../src/renderer/src/components/ceshuDoc'
import { defineCeshuMenusPlugin } from '../../../src/renderer/src/plugins/ceshu'
import { defineCeshuViewsPlugin } from '../../../src/renderer/src/plugins/ceshu'
import { createDefaultCeshu } from '@mobai/shared/ceshu/model'
import { PluginHost } from '@mobai/shared/plugin/host'
import { installMbApi, pressKey, renderDom, type ApiStub, type RenderResult } from './render'
import type { CeshuDocument } from '@mobai/shared/ceshu/reference'
import { CHAPTER_LABELS } from '@mobai/shared/ceshu/reference'

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
  // Slice 11：CeshuView 需要宿主来挂载编辑器内视图（路线/体检/影响面）
  const host = new PluginHost()
  host.register(defineCeshuViewsPlugin())
  host.register(defineCeshuMenusPlugin(host))
  view = await renderDom(
    <CeshuView
      ceshuId={ceshuId}
      onChanged={() => {}}
      onSelect={() => {}}
      types={[]}
      onBack={handlers.onBack ?? (() => {})}
      host={host}
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
   * 应当吃掉整段宽度。默认展开，偏好存 localStorage。
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

describe('CeshuView：全局审阅队列', () => {
  const withDraft = (): CeshuDocument => {
    const doc = makeDoc()
    doc.meta.field_status = {
      meta: { positioning: { status: 'ai_draft', at: '2026-10-20T00:00:00.000Z' } }
    }
    return doc
  }

  /** 两条待审（meta + story 各一）：用于验证光标移动与逐条接受 */
  const withTwoDrafts = (): CeshuDocument => {
    const doc = makeDoc()
    doc.meta.field_status = {
      meta: { positioning: { status: 'ai_draft', at: '2026-10-20T00:00:00.000Z' } },
      story: { main_plot: { status: 'ai_draft', at: '2026-10-20T00:00:00.000Z' } }
    }
    return doc
  }

  it('头部显示待审数量，点开浮层列出待审字段', async () => {
    api = installMbApi({ doc: withDraft() })
    const rendered = await mount()

    const toggle = rendered.byTestId('ceshu-review-toggle')
    expect(toggle.textContent).toContain('待审 1')

    await rendered.click(toggle)
    expect(rendered.query('[data-testid="review-panel"]')).not.toBeNull()
    expect(rendered.queryAll('[data-testid="review-row"]')).toHaveLength(1)
    expect(rendered.text()).toContain('一句话定位')
  })

  it('每行内联预览字段内容，不必先点「查看」跳章', async () => {
    const doc = withDraft()
    doc.meta.positioning = '一句话定位内容'
    api = installMbApi({ doc })
    const rendered = await mount()

    await rendered.click(rendered.byTestId('ceshu-review-toggle'))

    expect(rendered.byTestId('review-preview').textContent).toContain('一句话定位内容')
  })

  it('点「接受」把该字段写成 approved，待审数归零', async () => {
    const doc = withDraft()
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

    await rendered.click(rendered.byTestId('ceshu-review-toggle'))
    await rendered.click(rendered.byTestId('review-accept'))

    expect(api.calls).toContain('ceshu.saveChapter')
    expect(rendered.byTestId('ceshu-review-toggle').textContent).toContain('待审 0')
  })

  it('键盘：j/k 移动光标，当前行高亮', async () => {
    api = installMbApi({ doc: withTwoDrafts() })
    const rendered = await mount()

    await rendered.click(rendered.byTestId('ceshu-review-toggle'))
    const rows = rendered.queryAll('[data-testid="review-row"]')
    expect(rows).toHaveLength(2)
    expect(rows[0]?.getAttribute('data-current')).toBe('true')

    await pressKey('j')
    expect(rendered.queryAll('[data-testid="review-row"]')[1]?.getAttribute('data-current')).toBe('true')
    expect(rendered.queryAll('[data-testid="review-row"]')[0]?.getAttribute('data-current')).toBe('false')

    // 到头不回弹越界；k 回到第一条
    await pressKey('j')
    expect(rendered.queryAll('[data-testid="review-row"]')[1]?.getAttribute('data-current')).toBe('true')
    await pressKey('k')
    expect(rendered.queryAll('[data-testid="review-row"]')[0]?.getAttribute('data-current')).toBe('true')
  })

  it('键盘：a 接受当前行（保存一次 meta），Esc 关闭浮层', async () => {
    const doc = withTwoDrafts()
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

    await rendered.click(rendered.byTestId('ceshu-review-toggle'))
    await pressKey('j') // 光标移到第二条
    await pressKey('a') // 接受第二条

    expect(api.calls).toContain('ceshu.saveChapter')
    expect(rendered.byTestId('ceshu-review-toggle').textContent).toContain('待审 1')

    await pressKey('Escape')
    expect(rendered.query('[data-testid="review-panel"]')).toBeNull()
  })

  it('点第一行「接受」后光标自动落到剩余那条，连续审阅不必再按 j', async () => {
    const doc = withTwoDrafts()
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

    await rendered.click(rendered.byTestId('ceshu-review-toggle'))
    await rendered.click(rendered.queryAll('[data-testid="review-accept"]')[0] as HTMLElement)

    expect(rendered.byTestId('ceshu-review-toggle').textContent).toContain('待审 1')
    const rows = rendered.queryAll('[data-testid="review-row"]')
    expect(rows).toHaveLength(1)
    // 光标不能停在原地空等：剩下的那条要立刻成为当前行
    expect(rows[0]?.getAttribute('data-current')).toBe('true')
  })

  it('键盘：a 接受后光标同样前进到下一条', async () => {
    const doc = withTwoDrafts()
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

    await rendered.click(rendered.byTestId('ceshu-review-toggle'))
    await pressKey('a') // 光标在第一条（meta），接受后应落到 story 那条

    expect(rendered.byTestId('ceshu-review-toggle').textContent).toContain('待审 1')
    const rows = rendered.queryAll('[data-testid="review-row"]')
    expect(rows).toHaveLength(1)
    expect(rows[0]?.getAttribute('data-current')).toBe('true')
  })

  it('点末行「接受」后光标退到新的末行（不让光标悬在已消失的下标上）', async () => {
    const doc = withGroupedDrafts()
    api = installMbApi({
      doc,
      overrides: {
        // 状态写在 meta.field_status 里，故所有章节的接受都走 'meta' 这一路
        'ceshu.saveChapter': (req: unknown) => {
          const r = req as { chapter?: string; data?: unknown }
          return r.chapter === 'meta' ? { ...doc, meta: r.data } : doc
        }
      }
    })
    const rendered = await mount()

    await rendered.click(rendered.byTestId('ceshu-review-toggle'))
    const accepts = rendered.queryAll('[data-testid="review-accept"]')
    expect(accepts).toHaveLength(3)
    await rendered.click(accepts[2] as HTMLElement) // 接受末行（光标仍在首行）

    const rows = rendered.queryAll('[data-testid="review-row"]')
    expect(rows).toHaveLength(2)
    expect(rows[1]?.getAttribute('data-current')).toBe('true')
  })

  it('键盘：焦点在输入框内不拦截（打字优先）', async () => {
    const doc = withDraft()
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
    await rendered.click(rendered.byTestId('ceshu-review-toggle'))

    // 在表单输入框里按 a：不应触发「接受」
    const input = rendered.byTestId('ceshu-field-game_name')
    await act(async () => {
      input.focus()
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'a', bubbles: true }))
    })
    await rendered.flush()

    expect(api.calls).not.toContain('ceshu.saveChapter')
    expect(rendered.query('[data-testid="review-panel"]')).not.toBeNull()
  })

  it('快捷键提示条在队列非空时出现', async () => {
    api = installMbApi({ doc: withDraft() })
    const rendered = await mount()
    await rendered.click(rendered.byTestId('ceshu-review-toggle'))
    expect(rendered.byTestId('review-key-hint').textContent).toContain('Esc 关闭')
  })

  /** 两章共三条待审（meta 两条 + story 一条）：组头条数与折叠后的行数都能验出来 */
  const withGroupedDrafts = (): CeshuDocument => {
    const doc = makeDoc()
    doc.meta.field_status = {
      meta: {
        positioning: { status: 'ai_draft', at: '2026-10-20T00:00:00.000Z' },
        game_name: { status: 'ai_draft', at: '2026-10-20T00:00:00.000Z' }
      },
      story: { main_plot: { status: 'ai_draft', at: '2026-10-20T00:00:00.000Z' } }
    }
    return doc
  }

  it('队列按章节分组：组头显示章节名与条数', async () => {
    api = installMbApi({ doc: withGroupedDrafts() })
    const rendered = await mount()

    await rendered.click(rendered.byTestId('ceshu-review-toggle'))

    const groups = rendered.queryAll('[data-testid="review-group"]')
    expect(groups).toHaveLength(2)
    expect(groups.map((group) => group.getAttribute('data-chapter'))).toEqual(['meta', 'story'])

    const heads = rendered.queryAll('[data-testid="review-group-head"]')
    expect(heads[0]?.textContent).toContain('文档信息')
    expect(heads[0]?.textContent).toContain('（2）')
    expect(heads[1]?.textContent).toContain('世界观与角色')
    expect(heads[1]?.textContent).toContain('（1）')
  })

  it('点组头折叠该组行，其他组不受影响', async () => {
    api = installMbApi({ doc: withGroupedDrafts() })
    const rendered = await mount()
    await rendered.click(rendered.byTestId('ceshu-review-toggle'))
    expect(rendered.queryAll('[data-testid="review-row"]')).toHaveLength(3)

    await rendered.click(rendered.queryAll('[data-testid="review-group-head"]')[0] as HTMLElement)

    const groups = rendered.queryAll('[data-testid="review-group"]')
    expect(groups[0]?.querySelectorAll('[data-testid="review-row"]')).toHaveLength(0)
    expect(groups[1]?.querySelectorAll('[data-testid="review-row"]')).toHaveLength(1)
    expect(rendered.queryAll('[data-testid="review-row"]')).toHaveLength(1)
  })

  it('键盘回归：分组后 j 仍按扁平序移动光标', async () => {
    api = installMbApi({ doc: withGroupedDrafts() })
    const rendered = await mount()
    await rendered.click(rendered.byTestId('ceshu-review-toggle'))

    await pressKey('j')

    const rows = rendered.queryAll('[data-testid="review-row"]')
    expect(rows[1]?.getAttribute('data-current')).toBe('true')
    expect(rows[0]?.getAttribute('data-current')).toBe('false')
  })
})

describe('CeshuView：导入 AI 结果', () => {
  /** 受控 textarea 的输入模拟：绕过 React 的 value 缓存，走原生 setter + input 事件 */
  async function typeInto(textarea: HTMLTextAreaElement, text: string): Promise<void> {
    const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
    await act(async () => {
      setter?.call(textarea, text)
      textarea.dispatchEvent(new Event('input', { bubbles: true }))
    })
  }

  it('粘贴 → 解析预览 → 应用：按章写盘并标记 AI 草稿', async () => {
    const doc = makeDoc()
    doc.meta.positioning = '旧定位'
    api = installMbApi({
      doc,
      overrides: {
        'ceshu.saveChapter': (req: unknown) => {
          const r = req as { chapter: string; data: unknown }
          return r.chapter === 'meta' ? { ...doc, meta: r.data } : { ...doc, [r.chapter]: r.data }
        }
      }
    })
    const rendered = await mount()

    await rendered.click(rendered.byTestId('ceshu-more'))
    await rendered.click(rendered.byTestId('ceshu-import-patch'))
    await typeInto(rendered.byTestId('import-raw') as HTMLTextAreaElement, '{"meta": {"positioning": "新定位"}}')
    await rendered.flush()

    await rendered.click(rendered.byTestId('import-parse'))
    expect(rendered.queryAll('[data-testid="import-item"]')).toHaveLength(1)
    expect(rendered.byTestId('import-item').getAttribute('data-changed')).toBe('true')

    await rendered.click(rendered.byTestId('import-apply'))
    expect(api.calls).toContain('ceshu.saveChapter')
    expect(rendered.text()).toContain('已导入 1 个字段')
  })

  it('未知字段：解析报错、应用按钮不可用', async () => {
    api = installMbApi({ doc: makeDoc() })
    const rendered = await mount()

    await rendered.click(rendered.byTestId('ceshu-more'))
    await rendered.click(rendered.byTestId('ceshu-import-patch'))
    await typeInto(rendered.byTestId('import-raw') as HTMLTextAreaElement, '{"meta": {"nope": "x"}}')
    await rendered.flush()

    await rendered.click(rendered.byTestId('import-parse'))
    expect(rendered.byTestId('import-errors').textContent).toContain('没有字段「nope」')
    expect((rendered.byTestId('import-apply') as HTMLButtonElement).disabled).toBe(true)
  })

  it('粘贴审阅结果：展示问题清单（只读），应用按钮禁用且不再报「不能直接应用」', async () => {
    api = installMbApi({ doc: makeDoc() })
    const rendered = await mount()

    await rendered.click(rendered.byTestId('ceshu-more'))
    await rendered.click(rendered.byTestId('ceshu-import-patch'))
    await typeInto(
      rendered.byTestId('import-raw') as HTMLTextAreaElement,
      '{"issues":[{"chapter":"meta","field":"positioning","severity":"high","message":"定位过于笼统","suggestion":"补一句目标用户与核心玩法"},{"chapter":"story","field":"main_plot","severity":"low","message":"主线缺转折","suggestion":"加一个中段反转"}]}'
    )
    await rendered.flush()

    await rendered.click(rendered.byTestId('import-parse'))

    expect(rendered.byTestId('import-issues')).toBeTruthy()
    expect(rendered.queryAll('[data-testid="import-issue"]')).toHaveLength(2)
    expect(rendered.queryAll('[data-testid="import-issue"]')[0]?.getAttribute('data-severity')).toBe('high')
    expect((rendered.byTestId('import-apply') as HTMLButtonElement).disabled).toBe(true)
    // 审阅结果走清单展示，旧的「不能直接应用」引导不应再出现
    expect(rendered.text()).not.toContain('不能直接应用')
    expect(rendered.queryAll('[data-testid="import-errors"]')).toHaveLength(0)
  })

  /** 打开导入浮层并解析一段 issues JSON（三条用例共用同一套前置动作） */
  async function parseIssues(rendered: RenderResult, raw: string): Promise<void> {
    await rendered.click(rendered.byTestId('ceshu-more'))
    await rendered.click(rendered.byTestId('ceshu-import-patch'))
    await typeInto(rendered.byTestId('import-raw') as HTMLTextAreaElement, raw)
    await rendered.flush()
    await rendered.click(rendered.byTestId('import-parse'))
  }

  it('问题条目可定位：整行是按钮、章节显示中文名，点了切章并关浮层', async () => {
    api = installMbApi({ doc: makeDoc() })
    const rendered = await mount()

    await parseIssues(
      rendered,
      '{"issues":[{"chapter":"combat","field":"damage_formula","severity":"high","message":"公式不可计算","suggestion":"补上变量定义"}]}'
    )

    const row = rendered.byTestId('import-issue')
    // 可点才做成按钮：整行可点，不必去小图标上瞄准
    expect(row.tagName).toBe('BUTTON')
    expect(row.getAttribute('data-chapter')).toBe('combat')
    // 显示中文章名（与左侧章节导航同一套标签），而不是裸 key
    expect(row.textContent).toContain(CHAPTER_LABELS.combat)
    expect(row.textContent).not.toContain('combat')

    await rendered.click(row)

    expect(rendered.query('[data-testid="import-panel"]')).toBeNull()
    const activeTab = rendered
      .queryAll('[data-testid="chapter-tab"]')
      .find((tab) => tab.classList.contains('active'))
    expect(activeTab?.textContent).toContain(CHAPTER_LABELS.combat)
  })

  it('章节 key 非法时该行不可点（保留原文，不做点了没反应的按钮）', async () => {
    api = installMbApi({ doc: makeDoc() })
    const rendered = await mount()

    await parseIssues(
      rendered,
      '{"issues":[{"chapter":"unknown_ch","field":"damage_formula","severity":"low","message":"章节写错了","suggestion":"改成 combat"}]}'
    )

    const row = rendered.byTestId('import-issue')
    expect(row.tagName).toBe('DIV')
    expect(row.getAttribute('data-chapter')).toBeNull()
    expect(row.textContent).toContain('unknown_ch')

    // 点了也不该跳章/关浮层
    await rendered.click(row)
    expect(rendered.query('[data-testid="import-panel"]')).not.toBeNull()
  })
})

describe('CeshuView：迁移预览（只读）', () => {
  it('「更多」菜单可打开迁移预览，列出拆分项', async () => {
    const doc = makeDoc()
    doc.story.architecture = '一句话世界观\n- 设定一\n- 设定二'
    api = installMbApi({ doc })
    const rendered = await mount()

    await rendered.click(rendered.byTestId('ceshu-more'))
    await rendered.click(rendered.byTestId('ceshu-migration-preview'))

    expect(rendered.query('[data-testid="migration-panel"]')).not.toBeNull()
    expect(rendered.queryAll('[data-testid="migration-split"]').length).toBeGreaterThan(0)
    expect(rendered.text()).toContain('世界观架构')
    // 打开预览本身不应写盘
    expect(api.calls).not.toContain('ceshu.saveChapter')
  })

  it('点「执行迁移」调用 IPC，回填新字段后待迁数归零', async () => {
    const doc = makeDoc()
    const original = '一句话世界观\n- 设定一\n- 设定二'
    doc.story.architecture = original
    api = installMbApi({
      doc,
      overrides: {
        'ceshu.migrateFieldSplits': () => ({
          doc: {
            ...doc,
            story: {
              ...doc.story,
              architecture: original,
              architecture_points: ['一句话世界观', '设定一', '设定二'],
              architecture_notes: ''
            }
          },
          migrated: [{ chapter: 'story', fieldKey: 'architecture', points: 3 }]
        })
      }
    })
    const rendered = await mount()

    await rendered.click(rendered.byTestId('ceshu-more'))
    await rendered.click(rendered.byTestId('ceshu-migration-preview'))
    expect(rendered.byTestId('migration-run').textContent).toContain('执行迁移（1）')

    await rendered.click(rendered.byTestId('migration-run'))

    expect(api.calls).toContain('ceshu.migrateFieldSplits')
    expect(rendered.byTestId('migration-run').textContent).toContain('执行迁移（0）')
  })
})

describe('CeshuView：AI 消费提示词（双轨 JSON 配套）', () => {
  it('「更多」菜单打开面板：默认 draft 任务，提示词含契约与空缺字段', async () => {
    api = installMbApi({ doc: makeDoc() })
    const rendered = await mount()

    await rendered.click(rendered.byTestId('ceshu-more'))
    await rendered.click(rendered.byTestId('ceshu-consume-prompt'))

    const prompt = rendered.byTestId('consume-prompt') as HTMLTextAreaElement
    expect(prompt.value).toContain('mobai-ceshu-bundle/1')
    expect(prompt.value).toContain('aiDraftable=false')
    expect(prompt.value).toContain('一句话定位（positioning）')
    // 打开面板不写盘
    expect(api.calls).not.toContain('ceshu.saveChapter')
  })

  it('切到 review 任务：提示词换成审阅版（issues 输出格式）', async () => {
    api = installMbApi({ doc: makeDoc() })
    const rendered = await mount()

    await rendered.click(rendered.byTestId('ceshu-more'))
    await rendered.click(rendered.byTestId('ceshu-consume-prompt'))
    await rendered.click(rendered.byTestId('consume-task-review'))

    const prompt = rendered.byTestId('consume-prompt') as HTMLTextAreaElement
    expect(prompt.value).toContain('审阅')
    expect(prompt.value).toContain('"issues"')
    expect(prompt.value).not.toContain('本次要补全的空缺字段')
  })

  it('第三种任务「只审待审字段」可切换：提示词收窄到 ai_draft', async () => {
    const doc = makeDoc()
    doc.meta.field_status = {
      meta: { positioning: { status: 'ai_draft', at: '2026-10-20T00:00:00.000Z' } }
    }
    api = installMbApi({ doc })
    const rendered = await mount()

    await rendered.click(rendered.byTestId('ceshu-more'))
    await rendered.click(rendered.byTestId('ceshu-consume-prompt'))
    await rendered.click(rendered.byTestId('consume-task-reviewPending'))

    const prompt = rendered.byTestId('consume-prompt') as HTMLTextAreaElement
    expect(prompt.value).toContain('只审待审字段')
    expect(prompt.value).toContain('一句话定位（positioning）')
    expect(prompt.value).toContain('"issues"')
  })
})
