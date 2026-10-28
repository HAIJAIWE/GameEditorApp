import { describe, expect, it, vi } from 'vitest'

import { PluginHost } from '../../../src/shared/plugin/host'
import { createPluginLoader } from '../../../src/shared/plugin/loader'
import type { PluginLoader, PluginManifest, PluginSource } from '../../../src/shared/plugin/types'

function manifest(id: string, activate?: () => void): PluginManifest {
  return { id, name: id, version: '0.1.0', capabilities: [], ...(activate ? { activate } : {}) }
}

describe('PluginHost.loadPlugin', () => {
  it('shows a loading placeholder then resolves to enabled', async () => {
    const host = new PluginHost()
    const loader: PluginLoader = { load: (_s: PluginSource) => Promise.resolve(manifest('opt')) }
    const promise = host.loadPlugin(loader, 'factory:opt')
    // 加载中：占位存在且状态为 loading
    const loading = host.list().find((p) => p.manifest.id === 'factory:opt')
    expect(loading?.status).toBe('loading')
    await promise
    const resolved = host.get('opt')
    expect(resolved?.status).toBe('enabled')
    expect(resolved?.enabled).toBe(true)
    // 占位 id 已被真实 id 置换
    expect(host.get('factory:opt')).toBeUndefined()
  })

  it('marks status error and does not crash when load rejects', async () => {
    const host = new PluginHost()
    const loader: PluginLoader = { load: () => Promise.reject(new Error('boom')) }
    await host.loadPlugin(loader, 'factory:bad')
    const failed = host.get('factory:bad')
    expect(failed?.status).toBe('error')
    expect(failed?.error).toContain('boom')
    expect(failed?.enabled).toBe(false)
  })

  it('runs activate and isolates failure as error status', async () => {
    const host = new PluginHost()
    const activate = vi.fn(() => {
      throw new Error('activate failed')
    })
    const loader: PluginLoader = { load: () => Promise.resolve(manifest('boom', activate)) }
    await host.loadPlugin(loader, 'factory:boom')
    expect(activate).toHaveBeenCalledOnce()
    expect(host.get('boom')?.status).toBe('error')
  })

  it('ignores an already-registered id (no throw, existing plugin untouched)', async () => {
    const host = new PluginHost()
    host.register(manifest('dup', () => {}))
    const loader: PluginLoader = { load: () => Promise.resolve(manifest('dup')) }
    // 加载真实 id 已存在：占位被清理、原插件不受影响（loadPlugin 永不 reject，错误走 status）
    await host.loadPlugin(loader, 'factory:dup')
    expect(host.get('dup')?.status).toBe('enabled')
    expect(host.get('factory:dup')).toBeUndefined()
  })

  it('integrates with createPluginLoader factory map', async () => {
    const host = new PluginHost()
    const loader = createPluginLoader({ opt: () => manifest('opt') })
    await host.loadPlugin(loader, 'factory:opt')
    expect(host.get('opt')?.status).toBe('enabled')
  })
})
