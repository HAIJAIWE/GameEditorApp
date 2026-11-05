// @vitest-environment jsdom
import { describe, expect, it } from 'vitest'

import { JsonTree } from '../../../src/renderer/src/components/digital'
import { renderDom, type RenderResult } from './render'

/**
 * 大 JSON 的树形视图（工具输出 / 审批参数）。
 *
 * 锁三件事：容器按层折叠、节点上限真的阻止 DOM 膨胀、原文仍能切换回来。
 * 这三件都针对旧实现 `<pre>{JSON.stringify(obj, null, 2)}</pre>` 的实际痛点，
 * 不是「能画个树」就算完成。
 */

function toggles(view: RenderResult): HTMLElement[] {
  return view.queryAll('[data-testid="json-tree-toggle"]')
}

function toggleAt(view: RenderResult, path: string): HTMLElement {
  const found = toggles(view).find((el) => el.getAttribute('data-path') === path)
  if (found === undefined) throw new Error(`找不到 path=${path} 的折叠按钮`)
  return found
}

describe('JsonTree（大 JSON 折叠视图）', () => {
  it('根默认展开、子容器默认折叠，点开才显示深层', async () => {
    const view = await renderDom(
      <JsonTree value={{ name: '第一章', nested: { x: 1 } }} rawClassName="raw" />
    )
    expect(view.byTestId('json-tree').textContent).toContain('第一章')
    expect(view.byTestId('json-tree').textContent).not.toContain('$.nested.x')

    await view.click(toggleAt(view, '$.nested'))
    expect(view.byTestId('json-tree').textContent).toContain('1')
    expect(toggleAt(view, '$.nested').getAttribute('aria-expanded')).toBe('true')
    await view.cleanup()
  })

  it('原始值按类型渲染，长字符串限长不撑坏行', async () => {
    const view = await renderDom(
      <JsonTree
        value={{ s: 'ok', n: 42, b: false, nil: null, long: 'x'.repeat(300) }}
        rawClassName="raw"
      />
    )
    const text = view.byTestId('json-tree').textContent ?? ''
    expect(text).toContain('"ok"')
    expect(text).toContain('42')
    expect(text).toContain('false')
    expect(text).toContain('null')
    expect(text).toContain('…')
    expect(view.queryAll('.json-tree-value-string')).toHaveLength(2)
    expect(view.queryAll('.json-tree-value-number')).toHaveLength(1)
    await view.cleanup()
  })

  it('数组按索引渲染', async () => {
    const view = await renderDom(<JsonTree value={[1, 2]} rawClassName="raw" />)
    const text = view.byTestId('json-tree').textContent ?? ''
    expect(text).toContain('0')
    expect(text).toContain('1')
    expect(text).toContain('2')
    await view.cleanup()
  })

  it('节点上限：超限停止渲染且给出提示（DOM 不膨胀）', async () => {
    const big = Object.fromEntries(Array.from({ length: 50 }, (_, i) => [`k${i}`, i]))
    const view = await renderDom(<JsonTree value={big} maxNodes={3} rawClassName="raw" />)
    expect(view.byTestId('json-tree-truncated')).toBeTruthy()
    // 1 个根 + 最多 2 个子节点（第 3 个超出即停止）
    expect(view.queryAll('[data-testid="json-tree-leaf"]')).toHaveLength(2)
    await view.cleanup()
  })

  it('切「原文」看得到完整 JSON，再切回树形', async () => {
    const view = await renderDom(
      <JsonTree value={{ a: { b: 1 } }} rawClassName="raw" />
    )
    await view.click(view.byTestId('json-tree-mode'))
    const pre = view.query('pre.raw')
    expect(pre?.textContent).toContain('"b": 1')
    expect(view.query('[data-testid="json-tree-toggle"]')).toBeNull()

    await view.click(view.byTestId('json-tree-mode'))
    expect(view.query('pre.raw')).toBeNull()
    expect(toggles(view).length).toBeGreaterThan(0)
    await view.cleanup()
  })

  it('空对象 / 非对象值也能渲染', async () => {
    const empty = await renderDom(<JsonTree value={{}} rawClassName="raw" />)
    expect(empty.byTestId('json-tree').textContent).toContain('0 项')
    await empty.cleanup()

    const scalar = await renderDom(<JsonTree value="just text" rawClassName="raw" />)
    expect(scalar.byTestId('json-tree').textContent).toContain('"just text"')
    await scalar.cleanup()
  })
})
