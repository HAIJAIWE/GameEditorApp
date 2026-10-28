import { describe, expect, it } from 'vitest'

import { HOST_VERSION, PluginHost } from '../../src/shared/plugin/host'
import type { PluginManifest } from '../../src/shared/plugin/types'

function manifest(partial: Partial<PluginManifest> & Pick<PluginManifest, 'id'>): PluginManifest {
  return { name: partial.id, version: '1.0.0', capabilities: [], ...partial }
}

describe('PluginHost', () => {
  it('register 后进入清单，list 含该插件', () => {
    const host = new PluginHost()
    host.register(manifest({ id: 'a' }))
    expect(host.list()).toHaveLength(1)
    expect(host.get('a')?.manifest.name).toBe('a')
  })

  it('重复 id 注册抛错（install 幂等由调用方保证，宿主拒绝重复）', () => {
    const host = new PluginHost()
    host.register(manifest({ id: 'a' }))
    expect(() => host.register(manifest({ id: 'a' }))).toThrow(/already registered/)
  })

  it('engines.host 要求更高主版本时拒绝注册（类比 dsh 兼容性门禁）', () => {
    const host = new PluginHost()
    expect(() => host.register(manifest({ id: 'future', engines: { host: '99.0.0' } }))).toThrow(
      /requires host/
    )
    expect(HOST_VERSION).toBe('0.1.0')
  })

  it('禁用受保护插件抛错（类比 dsh PROTECTED_PLUGINS）', () => {
    const host = new PluginHost()
    host.register(manifest({ id: 'core', protected: true }))
    expect(() => host.disable('core')).toThrow(/protected/)
    expect(host.get('core')?.enabled).toBe(true)
  })

  it('禁用/启用普通插件翻转 enabled 与 activatedAt', () => {
    const host = new PluginHost()
    host.register(manifest({ id: 'p' }))
    host.disable('p')
    expect(host.get('p')?.enabled).toBe(false)
    expect(host.get('p')?.activatedAt).toBeNull()
    host.enable('p')
    expect(host.get('p')?.enabled).toBe(true)
    expect(host.get('p')?.activatedAt).not.toBeNull()
  })

  it('command/panel/service 仅从启用插件分发，且按 kind 过滤（manifest 零框架依赖）', () => {
    const host = new PluginHost()
    host.register(
      manifest({
        id: 'p',
        capabilities: [
          { kind: 'command', id: 'c.run', label: '运行', run: () => undefined },
          { kind: 'panel', id: 'c.view', title: '视图', ui: { type: 'text', text: 'x' } },
          { kind: 'service', id: 'c.ping', invoke: () => 'pong' }
        ]
      })
    )
    expect(host.commands()).toHaveLength(1)
    expect(host.panels()).toHaveLength(1)
    expect(host.services()).toHaveLength(1)
    host.disable('p')
    expect(host.commands()).toHaveLength(0)
    expect(host.panels()).toHaveLength(0)
    expect(host.services()).toHaveLength(0)
  })

  it('openPanel 仅接受已启用的 panel（ui 声明式，宿主无关），关闭后 activePanel 为 null', () => {
    const host = new PluginHost()
    host.register(
      manifest({ id: 'p', capabilities: [{ kind: 'panel', id: 'c.view', title: 'v', ui: { type: 'text', text: 'x' } }] })
    )
    expect(() => host.openPanel('nope')).toThrow(/no enabled panel/)
    host.openPanel('c.view')
    expect(host.activePanel()?.id).toBe('c.view')
    host.closePanel()
    expect(host.activePanel()).toBeNull()
  })

  it('subscribe 在 register/disable 时收到通知', () => {
    const host = new PluginHost()
    let ticks = 0
    const unsub = host.subscribe(() => {
      ticks += 1
    })
    host.register(manifest({ id: 'x' }))
    host.disable('x')
    expect(ticks).toBe(2)
    unsub()
    host.enable('x')
    expect(ticks).toBe(2)
  })

  it('activate 抛错只标 error，宿主不崩，能力不参与分发且不可启用（dsh 非致命激活）', () => {
    const host = new PluginHost()
    host.register(
      manifest({
        id: 'broken',
        capabilities: [{ kind: 'service', id: 'broken.ping', invoke: () => 'pong' }],
        activate: () => {
          throw new Error('boom')
        }
      })
    )
    expect(host.get('broken')?.status).toBe('error')
    expect(host.get('broken')?.error).toBe('boom')
    expect(host.get('broken')?.enabled).toBe(false)
    expect(host.list()).toHaveLength(1) // 宿主不崩，坏插件仍在清单
    expect(host.services()).toHaveLength(0) // 坏插件能力不参与分发
    expect(() => host.enable('broken')).toThrow(/broken/)
  })

  it('持久化覆写：初始禁用从 persistence 载入，启用/禁用落盘', () => {
    const store: Record<string, boolean> = {}
    const persistence = {
      load: (): Record<string, boolean> => ({ x: true }),
      save: (map: Record<string, boolean>) => {
        for (const key of Object.keys(store)) delete store[key]
        Object.assign(store, map)
      }
    }
    const host = new PluginHost({ persistence })
    host.register(manifest({ id: 'x' }))
    expect(host.get('x')?.status).toBe('disabled')
    host.enable('x')
    expect(store['x']).toBeUndefined() // 启用后覆写清空
    host.disable('x')
    expect(store['x']).toBe(true) // 禁用后覆写记录
  })

  it('disable 只关闭归属自己的面板，不动其它插件浮层', () => {
    const host = new PluginHost()
    host.register(manifest({ id: 'a', capabilities: [{ kind: 'panel', id: 'a.panel', title: 'A', ui: { type: 'text', text: 'a' } }] }))
    host.register(manifest({ id: 'b', capabilities: [{ kind: 'panel', id: 'b.panel', title: 'B', ui: { type: 'text', text: 'b' } }] }))
    host.openPanel('a.panel')
    host.disable('b')
    expect(host.activePanel()?.id).toBe('a.panel') // 关的是 b，a 面板不受影响
    host.disable('a')
    expect(host.activePanel()).toBeNull()
  })
})
