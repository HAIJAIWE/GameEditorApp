// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { parseHeadings, TechDocPanel } from '../../../src/renderer/src/components/techDoc/TechDocPanel'
import { flush, installMbApi, renderDom } from './render'

let stub: ReturnType<typeof installMbApi> | null = null

beforeEach(() => {
  // 本仓 vitest 用 `isolate: false`（为规避 worker 启动超时，见 vitest.config 注释），
  // 同一 worker 里前一个测试文件可能把 `window.mbApi` 留在这里。
  // 下面有一条用例断言「没有 mbApi」的分支，必须先清干净 —— 否则它偶发拿到
  // 上一个文件残留的桩，显示空态而不是「未提供接口」，成为长期 flaky。
  delete (window as unknown as { mbApi?: unknown }).mbApi
})

afterEach(() => {
  stub?.restore()
  stub = null
})

async function typeInto(input: HTMLInputElement, text: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  await act(async () => {
    setter?.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('技术设计文档面板', () => {
  it('列出文档，点击打开显示内容', async () => {
    stub = installMbApi({
      overrides: {
        'techDoc.list': () => ({ docs: ['battle'] }),
        'techDoc.read': () => ({ content: '# 战斗系统' }),
        'techDoc.outline': () => ({ content: '# 大纲\n\n## 1. 概述' }),
        'techDoc.write': () => ({ ok: true }),
        'techDoc.export': () => ({ path: '/x.md' })
      }
    })
    const view = await renderDom(<TechDocPanel />)
    await view.flush()
    expect(view.text()).toContain('battle')

    await view.click(view.byTestId('techdoc-item'))
    await view.flush()
    const textarea = view.byTestId('techdoc-textarea') as HTMLTextAreaElement
    expect(textarea.value).toBe('# 战斗系统')
    await view.cleanup()
  })

  it('新建：预填大纲并写入', async () => {
    stub = installMbApi({
      overrides: {
        'techDoc.list': () => ({ docs: [] }),
        'techDoc.read': () => ({ content: '' }),
        'techDoc.outline': () => ({ content: '# 技术设计文档大纲\n\n## 1. 概述与目标' }),
        'techDoc.write': () => ({ ok: true }),
        'techDoc.export': () => ({ path: null })
      }
    })
    const view = await renderDom(<TechDocPanel />)
    await view.flush()

    const input = view.byTestId('techdoc-new-name') as HTMLInputElement
    await typeInto(input, 'battle')
    await view.click(view.byTestId('techdoc-create'))
    await view.flush()

    const textarea = view.byTestId('techdoc-textarea') as HTMLTextAreaElement
    expect(textarea.value).toContain('# battle')
    expect(textarea.value).toContain('概述与目标')
    expect(stub?.calls).toContain('techDoc.write')
    await view.cleanup()
  })

  it('编辑/预览切换：预览渲染 markdown，编辑回到 textarea', async () => {
    stub = installMbApi({
      overrides: {
        'techDoc.list': () => ({ docs: ['battle'] }),
        'techDoc.read': () => ({ content: '# 战斗系统\n\n## 1. 概述\n正文' }),
        'techDoc.outline': () => ({ content: '' }),
        'techDoc.write': () => ({ ok: true }),
        'techDoc.export': () => ({ path: null })
      }
    })
    const view = await renderDom(<TechDocPanel />)
    await view.flush()
    await view.click(view.byTestId('techdoc-item'))
    await view.flush()
    expect(view.query('[data-testid="techdoc-preview"]')).toBeNull()

    await view.click(view.byTestId('techdoc-mode-preview'))
    await view.flush()
    expect(view.byTestId('techdoc-preview')).toBeTruthy()
    expect(view.query('[data-testid="techdoc-textarea"]')).toBeNull()
    expect(view.text()).toContain('战斗系统')

    await view.click(view.byTestId('techdoc-mode-edit'))
    await view.flush()
    expect(view.byTestId('techdoc-textarea')).toBeTruthy()
    await view.cleanup()
  })

  it('章节大纲：列出标题，点击切到预览', async () => {
    stub = installMbApi({
      overrides: {
        'techDoc.list': () => ({ docs: ['battle'] }),
        'techDoc.read': () => ({ content: '# 战斗系统\n\n## 1. 概述\n\n## 2. 架构' }),
        'techDoc.outline': () => ({ content: '' }),
        'techDoc.write': () => ({ ok: true }),
        'techDoc.export': () => ({ path: null })
      }
    })
    const view = await renderDom(<TechDocPanel />)
    await view.flush()
    await view.click(view.byTestId('techdoc-item'))
    await view.flush()

    expect(view.byTestId('techdoc-outline')).toBeTruthy()
    expect(view.text()).toContain('1. 概述')
    expect(view.text()).toContain('2. 架构')

    await view.click(view.byTestId('techdoc-outline-item'))
    await view.flush()
    expect(view.byTestId('techdoc-preview')).toBeTruthy()
    await view.cleanup()
  })

  it('删除：两步确认后调用 delete 并清空', async () => {
    let docs = ['battle']
    stub = installMbApi({
      overrides: {
        'techDoc.list': () => ({ docs }),
        'techDoc.read': () => ({ content: '# 战斗系统' }),
        'techDoc.outline': () => ({ content: '' }),
        'techDoc.write': () => ({ ok: true }),
        'techDoc.delete': () => {
          docs = []
          return { ok: true }
        },
        'techDoc.export': () => ({ path: null })
      }
    })
    const view = await renderDom(<TechDocPanel />)
    await view.flush()
    await view.click(view.byTestId('techdoc-item'))
    await view.flush()

    await view.click(view.byTestId('techdoc-delete'))
    await view.flush()
    expect(view.text()).toContain('确认删除')

    await view.click(view.byTestId('techdoc-delete'))
    await view.flush()
    expect(stub?.calls).toContain('techDoc.delete')
    expect(view.query('[data-testid="techdoc-textarea"]')).toBeNull()
    await view.cleanup()
  })

  it('加载中显示「加载中」而不是「还没有技术设计文档」（Phase C3）', async () => {
    let resolveList: (value: unknown) => void = () => undefined
    const pending = new Promise((resolve) => {
      resolveList = resolve
    })
    stub = installMbApi({ overrides: { 'techDoc.list': () => pending } })
    const view = await renderDom(<TechDocPanel />)

    // 请求未回：必须是加载态，不能把「正在读」显示成「没有」
    expect(view.text()).toContain('加载中')
    expect(view.text()).not.toContain('还没有技术设计文档')

    resolveList({ docs: ['battle'] })
    await view.flush()
    expect(view.text()).toContain('battle')
    await view.cleanup()
  })

  it('无 techDoc 接口时给出提示', async () => {
    // 不安装 mbApi → window.mbApi 为 undefined
    const view = await renderDom(<TechDocPanel />)
    expect(view.text()).toContain('未提供技术设计文档接口')
    await view.cleanup()
  })
})

describe('parseHeadings（章节大纲提取）', () => {
  it('提取 #~###### 标题与层级', () => {
    const headings = parseHeadings('# A\n\ntext\n\n## B\n\n### C\n')
    expect(headings).toEqual([
      { level: 1, text: 'A' },
      { level: 2, text: 'B' },
      { level: 3, text: 'C' }
    ])
  })

  it('忽略正文与无空格的 #', () => {
    expect(parseHeadings('正文\n#不是标题\n## 是标题')).toEqual([{ level: 2, text: '是标题' }])
  })
})

/** 从策划书生成 TDD 草稿（2026-11-08，GDD→TDD 链路） */
describe('技术设计文档面板：从策划书生成草稿', () => {
  it('无活动文档时给出明确提示，不写入', async () => {
    const { setHostUi } = await import('../../../src/renderer/src/plugins/host')
    setHostUi({ notify: () => {}, openPanel: () => {}, setHomeVisible: () => {}, getActiveCeshuId: () => null })
    stub = installMbApi({ overrides: { 'techDoc.list': () => ({ docs: [] }), 'techDoc.write': () => ({ ok: true }) } })
    const view = await renderDom(<TechDocPanel />)
    await view.flush()
    await view.click(view.byTestId('techdoc-create-from-gdd'))
    await view.flush()
    expect(view.text()).toContain('请先在策划书里打开一份文档')
    setHostUi(null)
    await view.cleanup()
  })

  it('有活动文档时按 GDD 素材生成草稿并写入', async () => {
    const { setHostUi } = await import('../../../src/renderer/src/plugins/host')
    const { createDefaultCeshu } = await import('@mobai/shared/ceshu/model')
    const doc = createDefaultCeshu({ scope: 'full', name: '星河战记' })
    doc.vision.design_vision = '星际考古的核心幻想'
    setHostUi({ notify: () => {}, openPanel: () => {}, setHomeVisible: () => {}, getActiveCeshuId: () => 'c1' })
    let written = ''
    stub = installMbApi({
      overrides: {
        'ceshu.get': () => doc,
        'techDoc.list': () => ({ docs: [] }),
        'techDoc.write': (req: unknown) => {
          written = (req as { content: string }).content
          return { ok: true }
        }
      }
    })
    const view = await renderDom(<TechDocPanel />)
    await view.flush()
    await view.click(view.byTestId('techdoc-create-from-gdd'))
    await view.flush()
    expect(written).toContain('星际考古的核心幻想')
    expect(written).toContain('## 架构总览')
    expect(written).toContain('## 来源小节')
    setHostUi(null)
    await view.cleanup()
  })
})
/** 按节 AI 生成（2026-11-10）：一次只生成一节，生成结果拼进编辑器但不自动保存 */
describe('技术设计文档面板：按节 AI 生成', () => {
  it('选中的节与已打开的文档名一起发给主进程，正文拼进编辑器并标记未保存', async () => {
    const sent: unknown[] = []
    stub = installMbApi({
      overrides: {
        'techDoc.list': () => ({ docs: ['battle'] }),
        'techDoc.read': () => ({ content: '# battle\n\n## 1. 概述与目标\n\n旧正文' }),
        'techDoc.outline': () => ({ content: '' }),
        'techDoc.write': () => ({ ok: true }),
        'techDoc.export': () => ({ path: null }),
        'techDoc.generate': (req: unknown) => {
          sent.push(req)
          return {
            body: '### 目标\n\n把战斗做成回合制。',
            sectionId: 'overview',
            title: '概述与目标',
            model: 'stub-model',
            usage: null
          }
        }
      }
    })
    const view = await renderDom(<TechDocPanel />)
    await view.flush()
    await view.click(view.byTestId('techdoc-item'))
    await view.flush()

    await view.click(view.byTestId('techdoc-gen-run'))
    await view.flush()

    expect(sent).toHaveLength(1)
    expect(sent[0]).toMatchObject({ sectionId: 'overview', name: 'battle' })
    const textarea = view.byTestId('techdoc-textarea') as HTMLTextAreaElement
    expect(textarea.value).toContain('把战斗做成回合制。')
    // 旧节正文被替换掉（大纲标题带「1. 」序号前缀也要认得），别的节不受影响
    expect(textarea.value).not.toContain('旧正文')
    // 不自动写盘：AI 写的节要人看一眼再保存
    expect(stub?.calls).not.toContain('techDoc.write')
    expect(view.byTestId('techdoc-dirty').getAttribute('data-dirty')).toBe('true')
    expect(view.text()).toContain('已生成')
    await view.cleanup()
  })

  it('切换目标节会把本节 id 发过去（不是永远发第一节）', async () => {
    const sent: unknown[] = []
    stub = installMbApi({
      overrides: {
        'techDoc.list': () => ({ docs: ['battle'] }),
        'techDoc.read': () => ({ content: '# battle' }),
        'techDoc.outline': () => ({ content: '' }),
        'techDoc.write': () => ({ ok: true }),
        'techDoc.export': () => ({ path: null }),
        'techDoc.generate': (req: unknown) => {
          sent.push(req)
          return { body: '正文', sectionId: 'architecture', title: '架构总览', model: '', usage: null }
        }
      }
    })
    const view = await renderDom(<TechDocPanel />)
    await view.flush()
    await view.click(view.byTestId('techdoc-item'))
    await view.flush()

    await selectValue(view.byTestId('techdoc-gen-section') as HTMLSelectElement, 'architecture')
    await view.click(view.byTestId('techdoc-gen-run'))
    await view.flush()

    expect(sent[0]).toMatchObject({ sectionId: 'architecture', name: 'battle' })
    // 文档里还没有「架构总览」这一节 ⇒ 追加到文末并补标题
    const textarea = view.byTestId('techdoc-textarea') as HTMLTextAreaElement
    expect(textarea.value).toContain('## 架构总览')
    await view.cleanup()
  })

  it('长素材不再因预估 token 要求确认：一次点击即生成，不出现「确认生成」（2026-11-10）', async () => {
    // 原用例走的是 v0.6 M5 的「云端预估 token 超预算 → 主进程抛确认原因 → 面板切片成确认态，
    // 再点一次才带 confirmed 重发」回路。该门已删除（预算只是提示词长度的粗估、不是账单，
    // 长文档下必然误报），因此这里反转为断言**旧回路不再出现**：一次点击 = 一次请求 = 正文落地。
    const sent: Array<{ confirmed?: boolean }> = []
    stub = installMbApi({
      overrides: {
        'techDoc.list': () => ({ docs: ['battle'] }),
        'techDoc.read': () => ({ content: '# battle' }),
        'techDoc.outline': () => ({ content: '' }),
        'techDoc.write': () => ({ ok: true }),
        'techDoc.export': () => ({ path: null }),
        // 主进程这一侧不再有「未 confirmed 就抛『可能超出预算』」的分支，直接返回正文
        'techDoc.generate': (req: unknown) => {
          sent.push(req as { confirmed?: boolean })
          return { body: '正文', sectionId: 'overview', title: '概述与目标', model: '', usage: null }
        }
      }
    })
    const view = await renderDom(<TechDocPanel />)
    await view.flush()
    await view.click(view.byTestId('techdoc-item'))
    await view.flush()

    await view.click(view.byTestId('techdoc-gen-run'))
    await view.flush()

    // 一次点击只发一次请求，且不带 confirmed（不需要用户再确认一次）
    expect(sent).toHaveLength(1)
    expect(sent[0]?.confirmed).toBeUndefined()
    // 按钮不进入确认态，也没有「再点一次」的确认提示（成功时错误条根本不渲染）
    expect(view.byTestId('techdoc-gen-run').textContent).not.toContain('确认生成')
    expect(view.query('[data-testid="techdoc-error"]')).toBeNull()
    // 正文已经落到编辑器里
    const textarea = view.byTestId('techdoc-textarea') as HTMLTextAreaElement
    expect(textarea.value).toContain('正文')
    await view.cleanup()
  })
})

/** `<select>` 走的是 change 事件，render.tsx 的 change 辅助只针对 input ⇒ 这里单独设值 */
async function selectValue(select: HTMLSelectElement, value: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')?.set
  await act(async () => {
    setter?.call(select, value)
    select.dispatchEvent(new Event('change', { bubbles: true }))
  })
  await flush()
}
