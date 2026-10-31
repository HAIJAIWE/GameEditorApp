// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { ReadinessPanel } from '../../../src/renderer/src/components/ceshu'
import type { ChapterKey } from '../../../src/shared/ceshu/reference'
import { createDefaultCeshu } from '../../../src/shared/ceshu/model'
import { computeReadiness } from '../../../src/shared/ceshu/readiness'
import { renderDom, type RenderResult } from './render'

/**
 * 完备度面板的「缺失必填」（2026-10-27）。
 *
 * 面板此前把 `missing_required`（字段 **key**）直接 `join('、')` 印出来 ——
 * 人读到的是 `positioning、core_loop`，得自己去 schema 里翻译一遍；而且只是纯文本，
 * 点了没反应，与 `ceshuReadinessData` 文档里承诺的「每个缺口都能一键跳到对应章节去填」
 * 对不上。这里钉住两件事：
 * 1. 显示**中文标签**（不再漏裸 key）；
 * 2. 点字段名回调 `(章, 字段 key)`，供宿主切章 + 表单聚焦。
 */

let view: RenderResult | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
})

function makeReport(): ReturnType<typeof computeReadiness> {
  // 空文档：立项阶段必填几乎全缺，缺口列表必然非空
  return computeReadiness(createDefaultCeshu({ scope: 'full', name: '测试游戏' }))
}

async function mount(onJumpField?: (chapter: ChapterKey, field: string) => void): Promise<RenderResult> {
  view = await renderDom(
    <ReadinessPanel readiness={makeReport()} onExport={() => {}} onClose={() => {}} onJumpField={onJumpField} />
  )
  return view
}

describe('ReadinessPanel：缺失必填可跳字段', () => {
  it('缺失字段显示中文标签，不露裸 key', async () => {
    const rendered = await mount()
    const text = rendered.text()
    expect(text).toContain('一句话定位') // meta.positioning 的标签
    expect(text).not.toContain('positioning') // 裸 key 不该出现
    expect(text).toContain('逐章缺口')
  })

  it('点字段名：回调收到 (章, 字段 key)', async () => {
    const jumps: Array<[ChapterKey, string]> = []
    const rendered = await mount((chapter, field) => jumps.push([chapter, field]))

    const buttons = rendered.queryAll('[data-testid="readiness-missing-field"]')
    expect(buttons.length).toBeGreaterThan(0)

    // 第一个按钮的 data 属性必须与回调一致（避免「显示 A、跳 B」）
    const first = buttons[0]!
    await rendered.click(first)
    expect(jumps).toEqual([[first.getAttribute('data-chapter') as ChapterKey, first.getAttribute('data-field') as string]])
    expect(jumps[0]![1]).not.toBe('')
  })

  it('不传 onJumpField：退化为纯文本（只读报告），不出按钮', async () => {
    const rendered = await mount()
    expect(rendered.queryAll('[data-testid="readiness-missing-field"]')).toHaveLength(0)
    expect(rendered.text()).toContain('一句话定位')
  })
})
