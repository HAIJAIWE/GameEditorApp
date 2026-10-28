import { describe, expect, it } from 'vitest'

import { PluginHost } from '../../../src/shared/plugin/host'
import type { PluginCapability, PluginManifest, UiNode } from '../../../src/shared/plugin/types'

const ui = (text: string): UiNode => ({ type: 'text', text })

function manifest(id: string, capabilities: PluginCapability[]): PluginManifest {
  return { id, name: id, version: '0.1.0', capabilities }
}

const statusSlot = (id: string, text: string, priority = 0): PluginCapability => ({
  kind: 'slot',
  id,
  key: 'app.statusbar',
  entryId: id,
  priority,
  ui: ui(text)
})

describe('PluginHost slot 集成', () => {
  it('注册 slot 能力 → slotEntries 可见；禁用移除；再启用恢复', () => {
    const host = new PluginHost()
    host.register(manifest('p1', [statusSlot('p1.status', 'hi')]))
    expect(host.slotEntries('app.statusbar')).toHaveLength(1)

    host.disable('p1')
    expect(host.slotEntries('app.statusbar')).toHaveLength(0)

    host.enable('p1')
    expect(host.slotEntries('app.statusbar')).toHaveLength(1)
  })

  it('注册进未声明 slot → 插件标 error（非致命，宿主不崩）', () => {
    const host = new PluginHost()
    host.register(manifest('bad', [{ kind: 'slot', id: 'bad.x', key: 'nope.slot', ui: ui('x') }]))
    const record = host.get('bad')
    expect(record?.status).toBe('error')
    expect(record?.enabled).toBe(false)
  })

  it('slotVersion/subscribeSlot 随安装变化', () => {
    const host = new PluginHost()
    let hits = 0
    const unsubscribe = host.subscribeSlot('app.statusbar', () => {
      hits += 1
    })
    const before = host.slotVersion('app.statusbar')
    host.register(manifest('p1', [statusSlot('p1.status', 'hi')]))
    expect(host.slotVersion('app.statusbar')).toBeGreaterThan(before)
    expect(hits).toBeGreaterThan(0)
    unsubscribe()
  })

  it('children 声明即认领：子 slot 可被其它插件注册', () => {
    const host = new PluginHost()
    host.register(
      manifest('p1', [
        {
          kind: 'slot',
          id: 'p1.main',
          key: 'app.main',
          ui: ui('main'),
          children: { 'p1.inside': { kind: 'single' } }
        }
      ])
    )
    expect(host.slotSpec('p1.inside')?.kind).toBe('single')

    host.register(manifest('p2', [{ kind: 'slot', id: 'p2.inside', key: 'p1.inside', ui: ui('inside') }]))
    expect(host.slotEntries('p1.inside')).toHaveLength(1)
  })

  it('遮蔽：同 cell 低优先级胜出（经宿主读）', () => {
    const host = new PluginHost()
    host.register(manifest('p1', [statusSlot('p1.status', 'hi', 5)]))
    host.register(manifest('p2', [statusSlot('p2.status', 'lo', 1)]))
    // 注意：list slot 的 cell 是 entryId，两个不同 id 都渲染
    expect(host.slotEntries('app.statusbar')).toHaveLength(2)
    // 同 id 才遮蔽
    host.register(manifest('p3', [statusSlot('p1.status', 'shadow', -1)]))
    const entries = host.slotEntries('app.statusbar')
    const cell = entries.filter((entry) => entry.entryKey === 'p1.status')
    expect(cell).toHaveLength(1)
    expect(cell[0]?.payload).toEqual(ui('shadow'))
  })

  it('sidebar 能力双写进 app.sidebar：slotSidebarItems 与旧 sidebarItems 一致，禁用后清空', () => {
    const host = new PluginHost()
    host.register(
      manifest('nav', [
        {
          kind: 'sidebar',
          id: 'nav.sidebar',
          order: 100,
          items: [
            { key: 'home', label: '首页', icon: '🏠', command: 'nav.home' },
            { key: 'data', label: '数据', icon: '📊', panel: 'data.panel' }
          ]
        }
      ])
    )
    expect(host.slotSidebarItems().map((item) => item.key)).toEqual(['home', 'data'])
    expect(host.sidebarItems().map((item) => item.key)).toEqual(['home', 'data'])

    host.disable('nav')
    expect(host.slotSidebarItems()).toHaveLength(0)
    expect(host.sidebarItems()).toHaveLength(0)

    host.enable('nav')
    expect(host.slotSidebarItems().map((item) => item.key)).toEqual(['home', 'data'])
  })

  it('sidebar 跨能力按 order 排序（slot 与旧路径一致）', () => {
    const host = new PluginHost()
    host.register(
      manifest('late', [
        { kind: 'sidebar', id: 'late.sidebar', order: 20, items: [{ key: 'a1', label: 'A1', icon: '1' }] }
      ])
    )
    host.register(
      manifest('early', [
        { kind: 'sidebar', id: 'early.sidebar', order: 5, items: [{ key: 'b1', label: 'B1', icon: '2' }] }
      ])
    )
    expect(host.slotSidebarItems().map((item) => item.key)).toEqual(['b1', 'a1'])
    expect(host.sidebarItems().map((item) => item.key)).toEqual(['b1', 'a1'])
  })
})
