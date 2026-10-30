// @vitest-environment jsdom
import { act, type ReactElement } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import ChapterForm from '../../../src/renderer/src/components/ChapterForm'
import type { ChapterKey } from '../../../src/shared/ceshu/reference/ceshuConstants'
import { createDefaultCeshu } from '../../../src/shared/ceshu/model/ceshuModel'
import { installMbApi, renderDom, type RenderResult } from './render'

/**
 * 「跳到字段」的落地端（2026-10-27）。
 *
 * 校验面板的必填缺失、完备度面板的逐章缺口、审阅队列的「查看」都指向**单个字段**；
 * 只切章等于让人在 32 个字段里再翻一遍。这里钉住 `focusField` 的契约：
 * 1. 挂载/变化时把目标字段块高亮（`data-flash="true"`），供人一眼看到落点；
 * 2. 处理完立刻回调 `onFocusConsumed`，让宿主清空目标（否则同字段第二次点击不再触发）；
 * 3. 目标字段不存在时安静地什么都不做（校验文案里的配置键可能不在表单 schema 里）；
 * 4. 目标被搜索过滤藏起来时，先清空搜索再高亮（否则表现为「点了没反应」）。
 */

let view: RenderResult | null = null
let api: ReturnType<typeof installMbApi> | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  api?.restore()
  api = null
})

interface MountOptions {
  focusField?: string
  onFocusConsumed?: () => void
}

function element(chapter: ChapterKey, options: MountOptions = {}): ReactElement {
  const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
  return (
    <ChapterForm
      chapter={chapter}
      data={doc[chapter]}
      busy={false}
      gameName=""
      onSave={async () => undefined}
      onAiGenerate={async () => ({ model: '', fields: {}, rawText: '' })}
      onAiGenerateField={async () => ({ model: '', fields: {}, rawText: '' })}
      focusField={options.focusField}
      onFocusConsumed={options.onFocusConsumed}
    />
  )
}

async function mount(chapter: ChapterKey, options: MountOptions = {}): Promise<void> {
  api = installMbApi()
  view = await renderDom(element(chapter, options))
}

/** 受控 input 的输入模拟：绕过 React 的 value 缓存，走原生 setter + input 事件 */
async function typeInto(input: HTMLInputElement, text: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  await act(async () => {
    setter?.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** 当前处于高亮态的字段块（`focusFieldBlock` 会同时置 class 与 data-flash） */
function flashedBlocks(rendered: RenderResult): HTMLElement[] {
  return rendered.queryAll('.field-block[data-flash="true"]')
}

describe('ChapterForm：外部「跳到字段」', () => {
  it('指定字段：该字段块高亮，其余不高亮', async () => {
    await mount('combat', { focusField: 'damage_formula' })
    const flashed = flashedBlocks(view!)
    expect(flashed).toHaveLength(1)
    expect(flashed[0]!.textContent).toContain('伤害公式')
    expect(flashed[0]!.classList.contains('field-block-flash')).toBe(true)
  })

  it('处理完立刻回调 onFocusConsumed（宿主据此清空目标）', async () => {
    let consumed = 0
    await mount('combat', { focusField: 'boss_mechanics', onFocusConsumed: () => (consumed += 1) })
    expect(consumed).toBe(1)
  })

  it('不传 focusField：不高亮任何字段，也不回调', async () => {
    let consumed = 0
    await mount('combat', { onFocusConsumed: () => (consumed += 1) })
    expect(flashedBlocks(view!)).toHaveLength(0)
    expect(consumed).toBe(0)
  })

  it('目标字段不在本章 schema（如配置键）：安静跳过，不抛错', async () => {
    let consumed = 0
    await mount('combat', { focusField: 'battle.config.turn_mode', onFocusConsumed: () => (consumed += 1) })
    expect(flashedBlocks(view!)).toHaveLength(0)
    // 仍然回调：宿主必须清掉目标，否则这个无效目标会一直挂着
    expect(consumed).toBe(1)
  })

  it('目标被搜索过滤藏起来：先清空搜索，再高亮目标字段', async () => {
    await mount('combat')
    // 搜一个不含「伤害公式」的词 ⇒ 目标字段块此刻不在 DOM 里
    await typeInto(view!.byTestId('field-search') as HTMLInputElement, 'boss')
    expect(view!.query('[data-testid="ceshu-field-damage_formula"]')).toBeNull()

    let consumed = 0
    await view!.rerender(element('combat', { focusField: 'damage_formula', onFocusConsumed: () => (consumed += 1) }))

    // 搜索被清空（字段块回来了），且目标被高亮
    expect((view!.byTestId('field-search') as HTMLInputElement).value).toBe('')
    expect(view!.query('[data-testid="ceshu-field-damage_formula"]')).not.toBeNull()
    const flashed = flashedBlocks(view!)
    expect(flashed).toHaveLength(1)
    expect(flashed[0]!.textContent).toContain('伤害公式')
    expect(consumed).toBe(1)
  })
})
