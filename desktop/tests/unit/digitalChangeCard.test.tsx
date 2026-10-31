// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'

import { DigitalChangeCard, DigitalChangeList } from '../../src/renderer/src/components/digital'
import type { OperationRecord } from '../../src/shared/agent/observability'
import { renderDom, type RenderResult } from './dom/render'

/**
 * 改动卡：卡头标题随条数切换、行带 `data-op`、超过 4 行折叠。
 *
 * 这几条都是「读起来对不对」的契约 —— 折叠阈值写错会让长列表撑爆对话流，
 * `data-op` 写错则徽标与统计配色会一起错位。
 */

let view: RenderResult | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
})

function change(n: number, opType: OperationRecord['opType'] = 'update'): OperationRecord {
  return {
    opType,
    dataType: 'role',
    itemId: `i${n}`,
    itemName: `名${n}`,
    before: {},
    after: {},
    conversationId: 'c',
    timestamp: 1_700_000_000_000 + n
  }
}

describe('DigitalChangeList', () => {
  it('3 条渲染 3 行，data-op 与操作一致', async () => {
    view = await renderDom(
      <DigitalChangeList changes={[change(1, 'create'), change(2, 'update'), change(3, 'delete')]} />
    )

    const rows = view.queryAll('[data-testid="digital-change-row"]')
    expect(rows).toHaveLength(3)
    expect(rows.map((row) => row.dataset.op)).toEqual(['create', 'update', 'delete'])
    // 统计行只列非零项：新建 1 · 修改 1 · 删除 1
    expect(view.text()).toContain('新建 1')
    expect(view.text()).toContain('删除 1')
  })

  it('单条时标题是「改动「X」」', async () => {
    view = await renderDom(<DigitalChangeList changes={[change(7)]} />)
    expect(view.query('.digital-change-title')?.textContent).toBe('改动「名7」')
  })

  it('5 条默认只渲染 4 行；点「全部 5 项」后展开到 5 行', async () => {
    const changes = [1, 2, 3, 4, 5].map((n) => change(n))
    view = await renderDom(<DigitalChangeList changes={changes} />)

    expect(view.queryAll('[data-testid="digital-change-row"]')).toHaveLength(4)
    const toggle = view.byTestId('digital-change-toggle')
    expect(toggle.textContent).toContain('全部 5 项')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')

    await view.click(toggle)
    expect(view.queryAll('[data-testid="digital-change-row"]')).toHaveLength(5)
    expect(view.byTestId('digital-change-toggle').textContent).toContain('收起')
    expect(view.byTestId('digital-change-toggle').getAttribute('aria-expanded')).toBe('true')
  })

  it('空数组渲染空态文案', async () => {
    view = await renderDom(<DigitalChangeList changes={[]} />)
    expect(view.text()).toContain('暂无改动记录（智能体尚未修改数据）')
    expect(view.queryAll('[data-testid="digital-change-row"]')).toHaveLength(0)
  })
})

describe('DigitalChangeCard', () => {
  it('有改动时带 data-count；空列表不渲染任何 DOM', async () => {
    view = await renderDom(<DigitalChangeCard changes={[change(1), change(2)]} since={1} />)
    expect(view.byTestId('digital-change-card').dataset.count).toBe('2')
    expect(view.text()).toContain('本次改动')
    await view.cleanup()
    view = null

    view = await renderDom(<DigitalChangeCard changes={[]} since={1} />)
    expect(view.query('[data-testid="digital-change-card"]')).toBeNull()
    expect(view.text()).toBe('')
  })
})
