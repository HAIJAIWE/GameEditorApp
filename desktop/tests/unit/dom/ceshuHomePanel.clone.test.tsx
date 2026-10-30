// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import CeshuHomePanel from '../../../src/renderer/src/components/ceshuDoc/CeshuHomePanel'
import { installMbApi, renderDom, type RenderResult } from './render'

/**
 * 首页「从想法/复刻」入口：点开表单 → 填参考游戏名 → 调 `ceshu.cloneDecompose`
 * → 用返回的新文档 id 打开编辑器。
 */

let view: RenderResult | null = null
let api: ReturnType<typeof installMbApi> | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  api?.restore()
  api = null
})

/** 受控 input 的输入模拟：走原生 setter + input 事件，绕过 React 的 value 缓存 */
async function typeInto(input: HTMLInputElement, text: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  await act(async () => {
    setter?.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

async function mount(onOpen: (id: string) => void): Promise<void> {
  view = await renderDom(
    <CeshuHomePanel
      summaries={[]}
      activeId={null}
      onOpen={onOpen}
      onChanged={() => undefined}
      onDeleted={() => undefined}
    />
  )
}

describe('CeshuHomePanel：从想法/复刻入口', () => {
  it('点入口出表单；填名提交 → 调 cloneDecompose 并打开新文档', async () => {
    const opened: string[] = []
    api = installMbApi({
      overrides: { 'ceshu.cloneDecompose': () => ({ doc: { ceshu_id: 'new-id' }, model: 'fake' }) }
    })
    await mount((id) => opened.push(id))

    await view!.click(view!.byTestId('home-clone-open'))
    expect(view!.query('[data-testid="home-clone-form"]')).not.toBeNull()

    await typeInto(view!.byTestId('home-clone-name') as HTMLInputElement, '吸血鬼幸存者')
    await view!.click(view!.byTestId('home-clone-confirm'))

    expect(api!.calls).toContain('ceshu.cloneDecompose')
    expect(opened).toEqual(['new-id'])
  })

  it('点取消收起表单', async () => {
    api = installMbApi()
    await mount(() => undefined)
    await view!.click(view!.byTestId('home-clone-open'))
    expect(view!.query('[data-testid="home-clone-form"]')).not.toBeNull()
    await view!.click(view!.byTestId('home-clone-cancel'))
    expect(view!.query('[data-testid="home-clone-form"]')).toBeNull()
  })
})
