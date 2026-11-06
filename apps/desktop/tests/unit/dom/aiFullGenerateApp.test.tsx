// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { AiFullGeneratePanel } from '../../../src/renderer/src/components/agent'
import { createDefaultCeshu } from '@mobai/shared/ceshu/model'
import { APP_CHAPTER_KEYS } from '@mobai/shared/appSchema'
import { renderDom, type RenderResult } from './render'
import type { CeshuDocument } from '@mobai/shared/ceshu/reference'

/**
 * 一键生成面板的档位分派守卫（路线 A 第 4 步收尾）。
 * 只测表单结构：不触发生成，也不需要 LLM / IPC 桩。
 */
let view: RenderResult | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
})

function doc(kind: 'game' | 'application'): CeshuDocument {
  return createDefaultCeshu({ scope: 'full', docKind: kind, name: '示例项目' })
}

async function mount(target: CeshuDocument): Promise<RenderResult> {
  view = await renderDom(
    <AiFullGeneratePanel ceshuId="c1" doc={target} onApplied={() => {}} onClose={() => {}} />
  )
  return view
}

describe('AiFullGeneratePanel 按档位渲染', () => {
  it('应用档隐藏游戏专属项，进度列表是 SDD 全章', async () => {
    const rendered = await mount(doc('application'))
    for (const testId of ['ai-full-type', 'ai-full-style', 'ai-full-biz', 'ai-full-market', 'ai-full-risk', 'ai-full-scope-full']) {
      expect(rendered.query(`[data-testid="${testId}"]`), testId).toBeNull()
    }
    expect(rendered.query('[data-testid="ai-full-name"]')).not.toBeNull()
    const rows = rendered.container.querySelectorAll('[data-testid^="ai-full-status-"]')
    expect(rows).toHaveLength(APP_CHAPTER_KEYS.length)
  })

  it('应用档表单文案是项目口径', async () => {
    const rendered = await mount(doc('application'))
    expect(rendered.text()).toContain('AI 一键生成完整软件设计文档')
    expect(rendered.text()).not.toContain('游戏类型')
    expect(rendered.text()).not.toContain('商业模式')
  })

  it('游戏档保留全部游戏专属项（零回归）', async () => {
    const rendered = await mount(doc('game'))
    for (const testId of ['ai-full-type', 'ai-full-style', 'ai-full-biz', 'ai-full-market', 'ai-full-risk', 'ai-full-scope-full']) {
      expect(rendered.query(`[data-testid="${testId}"]`), testId).not.toBeNull()
    }
    expect(rendered.text()).toContain('AI 一键生成完整策划书')
  })
})
