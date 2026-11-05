// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'

import { parseHeadings, TechDocPanel } from '../../../src/renderer/src/components/techDoc/TechDocPanel'
import { installMbApi, renderDom } from './render'

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
