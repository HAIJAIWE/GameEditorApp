// @vitest-environment jsdom
import { act } from 'react'
import { afterEach, describe, expect, it } from 'vitest'

import { ChapterForm } from '../../../src/renderer/src/components/ceshuField'
import type { ChapterData, ChapterKey } from '../../../src/shared/ceshu/reference'
import { CESHU_CHAPTER_FIELDS } from '../../../src/shared/ceshu/fields'
import { createDefaultCeshu } from '../../../src/shared/ceshu/model'
import { installMbApi, renderDom, type RenderResult } from './render'

/**
 * 章节表单的**字段搜索**（2026-10-27）。
 *
 * 解决的实际问题：`combat` 三十多个字段，靠滚动找「伤害公式」要翻很久；
 * 而字段标签/键是 schema 里现成的，加一层纯前端过滤就够了。
 *
 * 钉住三件事：
 * 1. 长章出搜索框、短章不出（8 个字段一眼看完，多个输入框只是噪音）；
 * 2. 过滤只影响**渲染**——被过滤掉的字段值仍参与保存（否则搜索一下再保存就丢数据）；
 * 3. 搜不到时给明确出口（清空按钮），而不是空白一片让人以为这章没字段。
 */

let view: RenderResult | null = null
let api: ReturnType<typeof installMbApi> | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  api?.restore()
  api = null
})

async function mount(chapter: ChapterKey, onSave?: (data: ChapterData) => void): Promise<void> {
  api = installMbApi()
  const doc = createDefaultCeshu({ scope: 'full', name: '测试游戏' })
  view = await renderDom(
    <ChapterForm
      chapter={chapter}
      data={doc[chapter]}
      busy={false}
      gameName=""
      onSave={async (_chapter, data) => onSave?.(data)}
      onAiGenerate={async () => ({ model: '', fields: {}, rawText: '' })}
      onAiGenerateField={async () => ({ model: '', fields: {}, rawText: '' })}
    />
  )
}

/** 受控 input 的输入模拟：绕过 React 的 value 缓存，走原生 setter + input 事件 */
async function typeInto(input: HTMLInputElement, text: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')?.set
  await act(async () => {
    setter?.call(input, text)
    input.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

/** 受控 textarea 的输入模拟（同上，原型不同） */
async function typeIntoTextarea(textarea: HTMLTextAreaElement, text: string): Promise<void> {
  const setter = Object.getOwnPropertyDescriptor(window.HTMLTextAreaElement.prototype, 'value')?.set
  await act(async () => {
    setter?.call(textarea, text)
    textarea.dispatchEvent(new Event('input', { bubbles: true }))
  })
}

const blockCount = (rendered: RenderResult): number => rendered.queryAll('.field-block').length

describe('ChapterForm：字段搜索', () => {
  it('长章（combat 三十多个字段）出搜索框，初始渲染全部字段', async () => {
    await mount('combat')
    const total = CESHU_CHAPTER_FIELDS.combat.length
    // 前提：本章确实是「靠滚动找字段」的量级；具体数字从 schema 派生，别写死
    expect(total).toBeGreaterThanOrEqual(30)
    expect(view!.byTestId('field-search-row')).toBeTruthy()
    expect(blockCount(view!)).toBe(total)
    // 未输入时不显示计数与清空按钮（不占版面）
    expect(view!.query('[data-testid="field-search-count"]')).toBeNull()
  })

  it('短章（vision 8 个字段）不出搜索框', async () => {
    await mount('vision')
    expect(view!.query('[data-testid="field-search-row"]')).toBeNull()
    expect(blockCount(view!)).toBe(CESHU_CHAPTER_FIELDS.vision.length)
  })

  it('按中文标签过滤：只剩匹配的字段块，并显示「匹配 N/总数」', async () => {
    await mount('combat')
    await typeInto(view!.byTestId('field-search') as HTMLInputElement, '伤害')

    // combat 里带「伤害」的三个字段：伤害公式 / ·要点 / ·补充
    expect(blockCount(view!)).toBe(3)
    const text = view!.text()
    expect(text).toContain('伤害公式')
    expect(text).not.toContain('Boss 战机制')
    expect(view!.byTestId('field-search-count').textContent).toBe(
      `匹配 3/${CESHU_CHAPTER_FIELDS.combat.length}`
    )
  })

  it('按字段 key 与英文标签过滤（大小写不敏感）', async () => {
    await mount('combat')
    await typeInto(view!.byTestId('field-search') as HTMLInputElement, 'BOSS')
    expect(blockCount(view!)).toBe(3)
    expect(view!.text()).toContain('Boss 战机制')

    await typeInto(view!.byTestId('field-search') as HTMLInputElement, 'balance_strategy')
    expect(blockCount(view!)).toBe(3)
  })

  it('搜不到：给空态与清空按钮，清空后恢复全部字段', async () => {
    await mount('combat')
    await typeInto(view!.byTestId('field-search') as HTMLInputElement, '不存在的字段名')

    expect(blockCount(view!)).toBe(0)
    expect(view!.byTestId('field-search-empty').textContent).toContain('没有匹配')
    expect(view!.query('[data-testid="machine-data-group"]')).toBeNull()

    await view!.click(view!.byTestId('field-search-empty-clear'))
    expect(blockCount(view!)).toBe(CESHU_CHAPTER_FIELDS.combat.length)
    expect((view!.byTestId('field-search') as HTMLInputElement).value).toBe('')
  })

  it('过滤只影响渲染：被过滤掉的字段值仍会随保存写回', async () => {
    let saved: ChapterData | null = null
    await mount('combat', (data) => {
      saved = data
    })

    // 1) 在「伤害公式」里写一段内容
    await typeIntoTextarea(view!.byTestId('ceshu-field-damage_formula') as HTMLTextAreaElement, '伤害 = 攻击 × 系数')
    // 2) 搜一个把它过滤掉的词（此时该字段块不在 DOM 里）
    await typeInto(view!.byTestId('field-search') as HTMLInputElement, 'boss')
    expect(view!.query('[data-testid="ceshu-field-damage_formula"]')).toBeNull()
    // 3) 保存：过滤只是渲染层，值必须还在
    await view!.click(view!.byTestId('chapter-save'))

    expect(saved).not.toBeNull()
    expect((saved as ChapterData | null)?.damage_formula).toBe('伤害 = 攻击 × 系数')
  })

  it('搜索词只匹配机读字段时，正文为空、机读分组照常出现', async () => {
    await mount('economy')
    // economy 的机读字段只有 ledger（经济账本）
    await typeInto(view!.byTestId('field-search') as HTMLInputElement, '账本')
    expect(blockCount(view!)).toBe(1)
    expect(view!.byTestId('machine-data-group').textContent).toContain('验收 / 机读数据')
  })
})
