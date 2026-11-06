// @vitest-environment jsdom
import { act } from 'react'
import { describe, expect, it } from 'vitest'

import { renderDom } from './render'
import {
  CommandPalette,
  CommandPaletteView,
  type CommandPaletteViewProps
} from '../../../src/renderer/src/plugins/ux'
import type { PaletteItem } from '@mobai/shared/agent/tools'
import { PluginHost } from '@mobai/shared/plugin/host'
import { getHiddenMainViewIds, setHiddenMainViewIds } from '../../../src/renderer/src/plugins/context'

/**
 * 命令面板的**展示层**契约（容器负责键盘/宿主接线，无法在 Node 下测）。
 * 这里只喂 props：条目数、选中态、空态、点击回调。
 */

function item(id: string, label: string, group: PaletteItem['group'] = 'command'): PaletteItem {
  return { id, label, group, run: () => undefined }
}

const items: PaletteItem[] = [
  item('app.save', '保存'),
  item('statistics.open', '数据统计'),
  item('statistics.panel', '数据统计', 'panel')
]

function viewProps(overrides: Partial<CommandPaletteViewProps> = {}): CommandPaletteViewProps {
  return {
    items,
    activeIndex: 0,
    query: '',
    onQuery: () => undefined,
    onPick: () => undefined,
    onClose: () => undefined,
    statusText: '对话：待命 · 0 条消息',
    ...overrides
  }
}

describe('CommandPaletteView', () => {
  it('渲染全部条目（含 data-id），并在底部显示对话状态', async () => {
    const result = await renderDom(<CommandPaletteView {...viewProps()} />)

    const rows = result.queryAll('[data-testid="command-palette-item"]')
    expect(rows).toHaveLength(3)
    expect(rows.map((row) => row.getAttribute('data-id'))).toEqual([
      'app.save',
      'statistics.open',
      'statistics.panel'
    ])
    expect(result.text()).toContain('对话：待命 · 0 条消息')
    expect(result.queryAll('[role="option"]')).toHaveLength(3)
    await result.cleanup()
  })

  it('activeIndex 决定 aria-selected（只有第 2 项选中）', async () => {
    const result = await renderDom(<CommandPaletteView {...viewProps({ activeIndex: 1 })} />)

    const rows = result.queryAll('[data-testid="command-palette-item"]')
    expect(rows.map((row) => row.getAttribute('aria-selected'))).toEqual(['false', 'true', 'false'])
    await result.cleanup()
  })

  it('没有条目时显示空态', async () => {
    const result = await renderDom(<CommandPaletteView {...viewProps({ items: [] })} />)

    expect(result.byTestId('command-palette-empty').textContent).toContain('没有匹配的命令')
    expect(result.queryAll('[data-testid="command-palette-item"]')).toHaveLength(0)
    await result.cleanup()
  })

  it('点击条目回调 onPick（带上被点的条目）', async () => {
    const picked: string[] = []
    const result = await renderDom(
      <CommandPaletteView
        {...viewProps({
          onPick: (pickedItem) => {
            picked.push(pickedItem.id)
          }
        })}
      />
    )

    const rows = result.queryAll('[data-testid="command-palette-item"]')
    await result.click(rows[1]!)
    expect(picked).toEqual(['statistics.open'])
    await result.cleanup()
  })
})

describe('CommandPalette（容器）', () => {
  it('Ctrl+K 打开、Enter 执行首条命令并关闭', async () => {
    const host = new PluginHost()
    let ran = 0
    host.register({
      id: 'test-palette',
      name: 'test-palette',
      version: '0.1.0',
      capabilities: [
        {
          kind: 'command',
          id: 'test.run',
          label: '测试命令',
          run: () => {
            ran += 1
          }
        }
      ]
    })

    const result = await renderDom(<CommandPalette host={host} />)
    expect(result.query('[data-testid="command-palette"]')).toBeNull()

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))
    })
    await result.flush()
    expect(result.byTestId('command-palette')).toBeTruthy()
    // 首条是命令、末尾多一条「清空对话」
    expect(result.queryAll('[data-testid="command-palette-item"]')).toHaveLength(2)

    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }))
    })
    await result.flush()
    expect(ran).toBe(1)
    expect(result.query('[data-testid="command-palette"]')).toBeNull()

    await result.cleanup()
  })

  it('应用档隐藏清单生效：命令面板不列「数据编辑」（不留点了跳不过去的假入口）', async () => {
    const previous = getHiddenMainViewIds()
    const host = new PluginHost()
    host.register({
      id: 'test-views',
      name: 'test-views',
      version: '0.1.0',
      capabilities: [
        { kind: 'mainView', id: 'editor.mainView', label: '策划书', order: 0, ui: { type: 'text', text: '策划书' } },
        { kind: 'mainView', id: 'data.mainView', label: '数据编辑', order: 10, ui: { type: 'text', text: '数据编辑' } }
      ]
    })

    setHiddenMainViewIds(['data.mainView'])
    const result = await renderDom(<CommandPalette host={host} />)
    await act(async () => {
      window.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: true, bubbles: true }))
    })
    await result.flush()

    const ids = result
      .queryAll('[data-testid="command-palette-item"]')
      .map((row) => row.getAttribute('data-id'))
    expect(ids).toContain('editor.mainView')
    expect(ids).not.toContain('data.mainView')

    await result.cleanup()
    setHiddenMainViewIds([...previous])
  })
})
