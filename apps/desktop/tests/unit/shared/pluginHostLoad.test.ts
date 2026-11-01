import { describe, expect, it, vi } from 'vitest'

import { PluginHost } from '@mobai/shared/plugin/host'
import { createPluginLoader } from '@mobai/shared/plugin/loader'
import type { PluginLoader, PluginManifest, PluginSource } from '@mobai/shared/plugin/types'

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

  it('marks status error and rejects when load rejects', async () => {
    const host = new PluginHost()
    const loader: PluginLoader = { load: () => Promise.reject(new Error('boom')) }
    // 加载失败：占位标 error（不崩溃宿主），并向上抛出让调用方（插件市场）感知失败
    await expect(host.loadPlugin(loader, 'factory:bad')).rejects.toThrow('boom')
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

  it('rejects (instead of silently no-op) when the real id is already registered', async () => {
    const host = new PluginHost()
    host.register(manifest('dup', () => {}))
    const loader: PluginLoader = { load: () => Promise.resolve(manifest('dup')) }
    // 真实 id 已存在：占位标 error 并向上抛出，让调用方（插件市场）感知失败，而非静默 no-op
    await expect(host.loadPlugin(loader, 'factory:dup')).rejects.toThrow('already registered')
    // 已存在的插件不受影响
    expect(host.get('dup')?.status).toBe('enabled')
    expect(host.get('dup')?.enabled).toBe(true)
  })

  it('integrates with createPluginLoader factory map', async () => {
    const host = new PluginHost()
    const loader = createPluginLoader({ opt: () => manifest('opt') })
    await host.loadPlugin(loader, 'factory:opt')
    expect(host.get('opt')?.status).toBe('enabled')
  })
})
