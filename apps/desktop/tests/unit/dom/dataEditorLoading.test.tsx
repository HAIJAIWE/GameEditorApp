// @vitest-environment jsdom
import { afterEach, describe, expect, it } from 'vitest'
import { act } from 'react'

import { LocaleProvider } from '@mobai/client-ui'

import { DataEditorTab } from '../../../src/renderer/src/components/data'
import { installMbApi, renderDom, type RenderResult } from './render'

/**
 * Phase C1：数据编辑器的「加载态」与「键盘导航」。
 *
 * 两个真实问题：
 * 1. `items` 初始是 `[]`，原先加载中会显示「暂无数据」——把「正在读」伪装成「没有」。
 * 2. 列表只有 F2 重命名，没有 ↑/↓；条目一多只能鼠标点。
 */

const TYPES = [{ id: 'role', name: '角色', pluralKey: 'roles', color: '#c00', formFields: [] }]

const ITEMS = [
  { id: 'r1', type: 'role', data: { name: '战士' }, createdAt: '', updatedAt: '' },
  { id: 'r2', type: 'role', data: { name: '法师' }, createdAt: '', updatedAt: '' }
]

let view: RenderResult | null = null
let api: ReturnType<typeof installMbApi> | null = null

afterEach(async () => {
  await view?.cleanup()
  view = null
  api?.restore()
  api = null
})

function tree() {
  return (
    <LocaleProvider locale="zh">
      <DataEditorTab type="role" types={TYPES} />
    </LocaleProvider>
  )
}

describe('DataEditorTab 加载态与键盘导航（Phase C1）', () => {
  it('加载中显示「加载中」而不是「暂无数据」', async () => {
    let resolveList: (value: unknown) => void = () => undefined
    const pending = new Promise((resolve) => {
      resolveList = resolve
    })
    api = installMbApi({ overrides: { 'data.listItems': () => pending } })
    view = await renderDom(tree())

    // 请求还没回来：必须是加载态，不能是空态
    expect(view.text()).toContain('加载中')
    expect(view.query('[data-testid="ceshu-data-empty"]')).toBeNull()

    resolveList(ITEMS)
    await view.flush()

    expect(view.query('[data-testid="ceshu-data-empty"]')).toBeNull()
    expect(view.queryAll('[data-testid="ceshu-data-item-row"]').length).toBe(2)
  })

  it('↑/↓ 在列表中移动选中项', async () => {
    api = installMbApi({ overrides: { 'data.listItems': () => Promise.resolve(ITEMS) } })
    view = await renderDom(tree())
    await view.flush()

    const rows = view.queryAll('[data-testid="ceshu-data-item-row"]')
    expect(rows.length).toBe(2)

    // 点第一行选中
    await view.click(rows[0]!)
    expect(rows[0]!.className).toContain('selected')

    // ArrowDown → 第二行（直接派发到列表容器，触发它的 onKeyDown）
    const list = view.byTestId('ceshu-data-list')
    await act(async () => {
      list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true }))
    })
    await view.flush()
    expect(view.queryAll('[data-testid="ceshu-data-item-row"]')[1]!.className).toContain('selected')

    // ArrowUp → 回到第一行
    await act(async () => {
      list.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', bubbles: true }))
    })
    await view.flush()
    expect(view.queryAll('[data-testid="ceshu-data-item-row"]')[0]!.className).toContain('selected')
  })
})
