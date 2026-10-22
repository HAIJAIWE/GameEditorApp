// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { ValidatePanel } from '../../../src/renderer/src/components/ceshu/CeshuReportPanels'
import { renderDom, type RenderResult } from './render'

let view: RenderResult | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
})

async function mount(messages: string[]): Promise<RenderResult> {
  view = await renderDom(
    <ValidatePanel validateErrors={messages} onExport={() => {}} onClose={() => {}} />
  )
  return view
}

describe('ValidatePanel：校验结果分组展示', () => {
  it('全部通过：显示通过文案，无分组', async () => {
    const rendered = await mount([])
    expect(rendered.text()).toContain('所有校验通过')
    expect(rendered.queryAll('[data-testid="validate-group"]')).toHaveLength(0)
  })

  it('按严重度分组：必须修复在前，标题带计数', async () => {
    const rendered = await mount([
      '术语不一致：「生命值」/「血量」指同一概念（hp）',
      "文档信息：字段 'game_name' 为必填项",
      '内容重复警告：第一章「设计愿景」重复度 80%'
    ])

    const groups = rendered.queryAll('[data-testid="validate-group"]')
    expect(groups.map((group) => group.getAttribute('data-severity'))).toEqual(['error', 'warning', 'warning'])
    expect(groups[0]?.getAttribute('data-kind')).toBe('required')

    const text = rendered.text()
    expect(text).toContain('必须修复 · 必填缺失（1）')
    expect(text).toContain('建议检查 · 术语不一致（1）')
    expect(text).toContain('建议检查 · 内容重复（1）')
    // 标题摘要（保留「个问题」：既有 e2e 以此断言面板已出结果）
    expect(text).toContain('3 个问题：1 个必须修复 · 2 个建议检查')
  })

  it('同类合并到一个分组', async () => {
    const rendered = await mount([
      "文档信息：字段 'a' 为必填项",
      "第一章：字段 'b' 为必填项",
      "第二章：字段 'c' 为必填项"
    ])
    const groups = rendered.queryAll('[data-testid="validate-group"]')
    expect(groups).toHaveLength(1)
    expect(rendered.queryAll('[data-testid="validate-item"]')).toHaveLength(3)
  })
})
