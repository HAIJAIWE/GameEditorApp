// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { CeshuAgentPanel } from '../../../src/renderer/src/components/ceshuDoc'
import { createDefaultCeshu } from '../../../src/shared/ceshu/model'
import { installMbApi, renderDom, type ApiStub, type RenderResult } from './render'

/**
 * 右栏智能体：发送问题 → 带上文档上下文调 `llm.generate` → 显示助手回复。
 */

let view: RenderResult | null = null
let api: ApiStub | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  api?.restore()
  api = null
})

async function typeInto(input: HTMLInputElement, text: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  await act(async () => {
    setter?.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

describe('CeshuAgentPanel', () => {
  it('发送问题 → 调 llm.generate，显示助手回复', async () => {
    api = installMbApi({
      overrides: { 'llm.generate': () => ({ model: 'fake', content: '建议：先做最小闭环。' }) }
    })
    const doc = createDefaultCeshu({ scope: 'full', name: '星海计划' })
    view = await renderDom(<CeshuAgentPanel doc={doc} />)

    expect(view!.byTestId('agent-messages').textContent).toContain('和智能体对话')

    await typeInto(view!.byTestId('agent-input') as HTMLInputElement, '这玩法有什么风险？')
    await view!.click(view!.byTestId('agent-send'))

    expect(api!.calls).toContain('llm.generate')
    expect(view!.byTestId('agent-messages').textContent).toContain('建议：先做最小闭环。')
  })

  it('改文档模式：AI 出 JSON 补丁 → 点应用回调 items', async () => {
    api = installMbApi({
      overrides: { 'llm.generate': () => ({ model: 'fake', content: '{"gameplay":{"core_loop":"新循环"}}' }) }
    })
    const doc = createDefaultCeshu({ scope: 'full', name: '星海计划' })
    const applied: unknown[] = []
    view = await renderDom(
      <CeshuAgentPanel
        doc={doc}
        onApplyPatch={async (items) => {
          applied.push(items)
        }}
      />
    )

    await view!.click(view!.byTestId('agent-patch-mode'))
    await typeInto(view!.byTestId('agent-input') as HTMLInputElement, '把核心循环改成新循环')
    await view!.click(view!.byTestId('agent-send'))

    const applyButton = view!.byTestId('agent-apply-patch')
    expect(applyButton.textContent).toContain('1 项')
    await view!.click(applyButton)
    expect(applied).toHaveLength(1)
  })
})
