// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import FieldActionStrip from '../../../src/renderer/src/components/digital/FieldActionStrip'
import {
  resetCeshuFieldFocusForTest,
  setActiveCeshuField,
  setCeshuFieldBusy,
  getCeshuFieldFocus
} from '../../../src/renderer/src/ceshuFieldFocus'
import { act } from 'react'
import { renderDom, type RenderResult } from './render'

let view: RenderResult | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  resetCeshuFieldFocusForTest()
})

describe('FieldActionStrip：停靠栏当前字段动作条', () => {
  it('无选中字段：只显示引导文案，不出现动作按钮', async () => {
    view = await renderDom(<FieldActionStrip />)
    expect(view.query('[data-testid="field-action-strip-empty"]')).not.toBeNull()
    expect(view.query('[data-testid="field-action-strip"]')).toBeNull()
    expect(view.query('[data-testid="field-action-rewrite"]')).toBeNull()
  })

  it('有选中字段：显示「章节 · 字段」、状态徽标与四个动作按钮', async () => {
    view = await renderDom(<FieldActionStrip />)
    await act(async () => {
      setActiveCeshuField({
        chapter: 'meta',
        key: 'positioning',
        label: '一句话定位',
        status: 'ai_draft'
      })
    })
    await view.flush()

    const strip = view.byTestId('field-action-strip')
    expect(strip.getAttribute('data-busy')).toBe('false')
    expect(view.byTestId('field-action-strip-name').textContent).toBe('文档信息 · 一句话定位')
    expect(view.byTestId('field-action-strip-status').textContent).toBe('AI 草稿')
    for (const action of ['rewrite', 'expand', 'condense', 'explain']) {
      expect(view.query(`[data-testid="field-action-${action}"]`)).not.toBeNull()
    }
    expect(view.text()).toContain('改写')
    expect(view.text()).toContain('通俗化')
  })

  it('点击动作 → 向桥发起请求（chapter/key/action 齐全）', async () => {
    view = await renderDom(<FieldActionStrip />)
    await act(async () => {
      setActiveCeshuField({ chapter: 'story', key: 'main_plot', label: '主线剧情' })
    })
    await view.flush()

    await view.click(view.byTestId('field-action-expand'))
    expect(getCeshuFieldFocus().request).toMatchObject({
      chapter: 'story',
      key: 'main_plot',
      action: 'expand'
    })
  })

  it('生成进行中：按钮禁用并显示「生成中…」', async () => {
    view = await renderDom(<FieldActionStrip />)
    await act(async () => {
      setActiveCeshuField({ chapter: 'story', key: 'main_plot', label: '主线剧情' })
      setCeshuFieldBusy(true)
    })
    await view.flush()

    expect(view.byTestId('field-action-strip').getAttribute('data-busy')).toBe('true')
    const button = view.byTestId('field-action-rewrite') as HTMLButtonElement
    expect(button.disabled).toBe(true)
    expect(view.text()).toContain('生成中')
  })
})
