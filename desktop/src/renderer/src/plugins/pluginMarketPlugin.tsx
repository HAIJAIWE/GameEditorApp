import { useSyncExternalStore, useState, type ReactElement } from 'react'

import type { PluginHost } from '../../../shared/plugin/host'
import type { PluginLoader, PluginManifest, PluginMarketEntry, PluginSource } from '../../../shared/plugin/types'
import { registerReactBinding, type PanelBindingProps } from './reactBindings'
import { marketRegistry } from './optionalPlugins'
import type { InstalledPluginStore } from './installedPluginStore'

/**
 * 插件市场（Part A 探路 + Part B 市场 UI 种子，Slice 44）。
 *
 * 全程在渲染进程、零新 IPC：直接读 `pluginHost.list()` 展示已注册插件并启停；
 * 可选/实验能力来自 `marketRegistry` 元数据；"安装并启用"经 `PluginLoader` 运行时加载
 * （cordis 式），安装过的 source 记入 `InstalledPluginStore` 以便重启自动加载。
 */
export function definePluginMarketPlugin(
  host: PluginHost,
  loader: PluginLoader,
  installedStore: InstalledPluginStore
): PluginManifest {
  // 富 UI 作为可选绑定外置（宿主侧）；CLI / 引擎宿主回退到声明式 ui。
  registerReactBinding('pluginMarket.panel', (props: PanelBindingProps) => (
    <PluginMarketPanel host={host} loader={loader} installedStore={installedStore} {...props} />
  ))
  return {
    id: 'plugin-market',
    name: 'plugin-market',
    version: '0.1.0',
    description: '插件市场：浏览、启用/禁用、按需安装可选能力',
    meta: {
      label: '插件市场',
      icon: '🧩',
      description: '浏览与启停插件，按需安装可选能力（cordis 式运行时加载）'
    },
    capabilities: [
      {
        kind: 'command',
        id: 'pluginMarket.open',
        label: '插件市场',
        run: () => host.openPanel('pluginMarket.panel')
      },
      {
        kind: 'sidebar',
        id: 'pluginMarket.sidebar',
        order: 900,
        items: [{ key: 'plugin-market', label: '插件市场', icon: '🧩', command: 'pluginMarket.open' }]
      },
      {
        kind: 'panel',
        id: 'pluginMarket.panel',
        title: '插件市场',
        ui: { type: 'text', text: '插件市场' }
      }
    ]
  }
}

interface PluginMarketProps extends PanelBindingProps {
  host: PluginHost
  loader: PluginLoader
  installedStore: InstalledPluginStore
}

function PluginMarketPanel(props: PluginMarketProps): ReactElement {
  const { host, loader, installedStore, onClose } = props
  const [installing, setInstalling] = useState<Set<string>>(new Set())

  // 订阅宿主版本号（稳定快照），变更即重渲染
  const version = useSyncExternalStore(
    (cb) => host.subscribe(cb),
    () => host.getVersion()
  )
  void version

  const registered = host.list()
  const byId = new Map(registered.map((record) => [record.manifest.id, record]))

  const toggle = (id: string, enabled: boolean): void => {
    try {
      if (enabled) host.disable(id)
      else host.enable(id)
    } catch {
      // 受保护插件不可禁用等，静默
    }
  }

  const markInstalling = (id: string, on: boolean): void => {
    setInstalling((prev) => {
      const next = new Set(prev)
      if (on) next.add(id)
      else next.delete(id)
      return next
    })
  }

  const install = async (entry: PluginMarketEntry): Promise<void> => {
    markInstalling(entry.id, true)
    try {
      await host.loadPlugin(loader, entry.source as PluginSource)
      const current = installedStore.load()
      if (!current.includes(entry.source)) installedStore.save([...current, entry.source])
    } catch {
      // 安装失败由面板状态呈现（loading→error），不弹错
    } finally {
      markInstalling(entry.id, false)
    }
  }

  return (
    <div className="panel plugin-market">
      <div className="panel-header">
        <h3>插件市场</h3>
        <button type="button" className="btn" onClick={onClose}>
          关闭
        </button>
      </div>

      <section>
        <h4>已注册（{registered.length}）</h4>
        <ul className="plugin-market-list">
          {registered.map((record) => (
            <li key={record.manifest.id} className="plugin-market-item">
              <span className="plugin-market-name">
                {record.manifest.meta?.icon ?? '🔌'} {record.manifest.meta?.label ?? record.manifest.name}
              </span>
              <span className="plugin-market-desc">
                {record.manifest.meta?.description ?? record.manifest.description ?? ''}
              </span>
              <span className={`plugin-market-status status-${record.status}`}>{statusLabel(record.status)}</span>
              <button
                type="button"
                className="btn"
                disabled={record.manifest.protected === true}
                onClick={() => toggle(record.manifest.id, record.enabled)}
              >
                {record.enabled ? '禁用' : '启用'}
              </button>
            </li>
          ))}
        </ul>
      </section>

      <section>
        <h4>可选 / 实验能力</h4>
        <ul className="plugin-market-list">
          {marketRegistry
            .filter((entry) => entry.id !== 'plugin-market')
            .map((entry) => {
              const existing = byId.get(entry.id)
              return (
                <li key={entry.id} className="plugin-market-item">
                  <span className="plugin-market-name">
                    {entry.icon ?? '🔌'} {entry.name}
                  </span>
                  <span className="plugin-market-desc">{entry.description ?? ''}</span>
                  {existing ? (
                    <span className={`plugin-market-status status-${existing.status}`}>{statusLabel(existing.status)}</span>
                  ) : entry.ready ? (
                    <button
                      type="button"
                      className="btn"
                      disabled={installing.has(entry.id)}
                      onClick={() => void install(entry)}
                    >
                      {installing.has(entry.id) ? '安装中…' : '安装并启用'}
                    </button>
                  ) : (
                    <span className="plugin-market-status status-soon">即将推出</span>
                  )}
                </li>
              )
            })}
        </ul>
      </section>

      <p className="plugin-market-hint">
        核心插件受保护，不可禁用。可选能力经 PluginLoader 运行时加载（cordis 式动态加载）。
      </p>
    </div>
  )
}

function statusLabel(status: string): string {
  switch (status) {
    case 'enabled':
      return '已启用'
    case 'disabled':
      return '已禁用'
    case 'error':
      return '加载失败'
    case 'loading':
      return '加载中'
    default:
      return status
  }
}
