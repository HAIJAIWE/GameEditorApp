// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { TechDocPanel } from '../../../src/renderer/src/components/techDoc/TechDocPanel'
import { installMbApi, renderDom } from './render'

let stub: ReturnType<typeof installMbApi> | null = null

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

  it('无 techDoc 接口时给出提示', async () => {
    // 不安装 mbApi → window.mbApi 为 undefined
    const view = await renderDom(<TechDocPanel />)
    expect(view.text()).toContain('未提供技术设计文档接口')
    await view.cleanup()
  })
})
