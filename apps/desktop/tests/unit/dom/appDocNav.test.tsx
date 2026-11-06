// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { CeshuView } from '../../../src/renderer/src/components/ceshuDoc'
import { defineCeshuMenusPlugin, defineCeshuViewsPlugin } from '../../../src/renderer/src/plugins/ceshu'
import { createDefaultCeshu, visibleChaptersForDoc } from '@mobai/shared/ceshu/model'
import { APP_CHAPTER_LABELS } from '@mobai/shared/appSchema'
import { CHAPTER_LABELS } from '@mobai/shared/ceshu/reference'
import { PluginHost } from '@mobai/shared/plugin/host'
import { installMbApi, renderDom, type ApiStub, type RenderResult } from './render'
import type { CeshuDocument } from '@mobai/shared/ceshu/reference'

/**
 * 任务 #37 守卫：应用档界面真正显示 SDD 章，而不是游戏 24 章 / undefined 标签。
 *
 * 这一层专门补 tsc 测不出的洞：把章 key 放宽成 string 之后，若章导航/表单仍直接查
 * `CHAPTER_LABELS[应用章]`，类型检查一声不吭，界面却全是 undefined。
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

function makeAppDoc(id = 'app1'): CeshuDocument {
  const doc = createDefaultCeshu({ scope: 'full', docKind: 'application', name: '测试应用' })
  doc.ceshu_id = id
  doc.meta.system_confirmed = true
  return doc
}

async function mount(doc: CeshuDocument): Promise<RenderResult> {
  const host = new PluginHost()
  host.register(defineCeshuViewsPlugin())
  host.register(defineCeshuMenusPlugin(host))
  api = installMbApi({ doc })
  view = await renderDom(
    <CeshuView
      ceshuId={doc.ceshu_id}
      onChanged={() => {}}
      onSelect={() => {}}
      types={[]}
      onBack={() => {}}
      host={host}
    />
  )
  return view
}

describe('应用档：章导航与表单按 SDD 规格渲染', () => {
  it('章导航列出全部可见 SDD 章，标签来自 APP_CHAPTER_LABELS', async () => {
    const doc = makeAppDoc()
    const rendered = await mount(doc)
    const visible = visibleChaptersForDoc(doc)

    const tabs = Array.from(rendered.container.querySelectorAll('[data-testid="chapter-tab"] .chapter-tab-label'))
    expect(tabs).toHaveLength(visible.length)
    const labels = tabs.map((node) => node.textContent ?? '')
    for (const key of visible) expect(labels).toContain(APP_CHAPTER_LABELS[key])
    for (const label of labels) expect(label).not.toContain('undefined')
  })

  it('章导航不混入游戏专属章（如「战斗系统设计」「经济系统设计」）', async () => {
    const rendered = await mount(makeAppDoc())
    const text = rendered.container.querySelector('.chapter-nav')?.textContent ?? ''
    expect(text).not.toContain(CHAPTER_LABELS.combat)
    expect(text).not.toContain(CHAPTER_LABELS.economy)
  })

  it('表单标题与字段来自应用规格（不是游戏章标签 / undefined）', async () => {
    const doc = makeAppDoc()
    const rendered = await mount(doc)
    const title = rendered.container.querySelector('.chapter-form-title')?.textContent ?? ''
    // 初始章 'meta' 两档共用，但标签必须由规格给出且非空
    expect(title).toContain(APP_CHAPTER_LABELS.meta)
    expect(title).not.toContain('undefined')

    const form = rendered.container.querySelector('[data-testid="chapter-form"]')
    expect(form).not.toBeNull()
    expect((form?.textContent ?? '').length).toBeGreaterThan(0)
  })

  it('点 SDD 编号章可切换，表单标题随之变成该章标签', async () => {
    const doc = makeAppDoc()
    const rendered = await mount(doc)
    const numberedKey = visibleChaptersForDoc(doc).find((key) => key !== 'meta')
    expect(numberedKey).toBeDefined()

    const tabs = Array.from(rendered.container.querySelectorAll<HTMLButtonElement>('[data-testid="chapter-tab"]'))
    const target = tabs.find((tab) => tab.textContent?.includes(APP_CHAPTER_LABELS[numberedKey!]))
    expect(target).toBeDefined()
    await rendered.click(target!)

    const title = rendered.container.querySelector('.chapter-form-title')?.textContent ?? ''
    expect(title).toContain(APP_CHAPTER_LABELS[numberedKey!])
  })
})
