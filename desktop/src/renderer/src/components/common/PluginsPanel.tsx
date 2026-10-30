import { useEffect, useState, type ComponentType } from 'react'

import type { PluginHost } from '../../../../shared/plugin/host'
import type { PluginServiceCapability } from '../../../../shared/plugin/types'
import { getReactBinding, renderUiNode, uiOf, type PanelBindingProps } from '../../plugins/reactBindings'

/** 模块级稳定组件：把宿主侧 React 绑定（按 panel id 查到的组件）渲染出来。
 *  组件作为 prop 传入，避免在渲染期赋值组件变量触发 react-hooks/static-components。 */
function PluginActiveRenderer({ component: Bound, onClose, close, params }: {
  component: ComponentType<PanelBindingProps>
  onClose: () => void
  close: () => void
  params: unknown
}) {
  return <Bound onClose={onClose} close={close} params={params} />
}

/**
 * 插件中心自己的 panel id。它是自举面板（`shell-panels` 注册的 `plugins.panel`），
 * 一旦被 `host.openPanel` 打开就成了「活动面板」——若不排除，本组件会去预览自己，
 * 形成无限递归（实测 worker 直接 OOM 崩掉）。
 */
const SELF_PANEL_ID = 'plugins.panel'

/** 状态徽标文案（dsh 风格：启用 / 禁用 / 错误 / 加载中） */
function statusLabel(status: 'enabled' | 'disabled' | 'error' | 'loading'): string {
  if (status === 'enabled') return '已启用'
  if (status === 'disabled') return '已禁用'
  if (status === 'loading') return '加载中'
  return '错误'
}

/**
 * 插件中心：列出已注册插件（dsh 风格卡片清单），支持启用/禁用、打开面板、运行命令、调用服务。
 *
 * 设计借 dsh 的 Plugins 页：
 * - 每个插件一张卡片：图标 + 展示名（meta.label） + 版本 + 受保护徽标 + 状态徽标（含错误态）；
 * - 坏插件（status==='error'）显示错误信息且不可启用，宿主不崩（"A broken bundle cannot be enabled"）。
 *
 * 本面板不持有插件逻辑——所有行为委托给传入的 `host`，换宿主实例或测试用空 host 也能直接渲染。
 */
export default function PluginsPanel({ host, onClose }: { host: PluginHost; onClose: () => void }) {
  const [, force] = useState(0)
  const [serviceResults, setServiceResults] = useState<Record<string, string>>({})

  useEffect(() => host.subscribe(() => force((n) => n + 1)), [host])

  const active = host.activePanel()

  const runService = (capability: PluginServiceCapability): void => {
    void Promise.resolve(capability.invoke()).then((result) => {
      setServiceResults((prev) => ({ ...prev, [capability.id]: String(result) }))
    })
  }

  return (
    <div className="plugins-panel" data-testid="plugins-panel">
      <p data-testid="plugins-count">已注册 {host.list().length} 个插件（dsh 风格清单 + 启用/禁用）。</p>

      <ul className="plugins-list">
        {host.list().map((plugin) => {
          const meta = plugin.manifest.meta
          const label = meta?.label ?? plugin.manifest.name
          const desc = meta?.description ?? plugin.manifest.description
          const isError = plugin.status === 'error'
          return (
            <li key={plugin.manifest.id} className="plugin-item" data-testid={`plugin-${plugin.manifest.id}`}>
              <div className="plugin-head">
                {meta?.icon !== undefined && <span className="plugin-icon" aria-hidden>{meta.icon}</span>}
                <strong>{label}</strong> v{plugin.manifest.version}
                {plugin.manifest.protected === true && <span className="plugin-badge">受保护</span>}
                <span className={`plugin-state plugin-state-${plugin.status}`}>{statusLabel(plugin.status)}</span>
              </div>
              {desc !== undefined && <div className="plugin-desc item-meta">{desc}</div>}
              {isError && plugin.error !== undefined && (
                <div className="plugin-error" data-testid={`plugin-error-${plugin.manifest.id}`}>⚠ {plugin.error}</div>
              )}
              <div className="plugin-actions">
                {plugin.status === 'enabled' && (
                  <button
                    type="button"
                    className="btn slim"
                    data-testid={`plugin-disable-${plugin.manifest.id}`}
                    disabled={plugin.manifest.protected === true}
                    onClick={() => host.disable(plugin.manifest.id)}
                  >
                    禁用
                  </button>
                )}
                {plugin.status === 'disabled' && (
                  <button
                    type="button"
                    className="btn slim"
                    data-testid={`plugin-enable-${plugin.manifest.id}`}
                    onClick={() => host.enable(plugin.manifest.id)}
                  >
                    启用
                  </button>
                )}
                {isError && (
                  <span className="plugin-hint" data-testid={`plugin-broken-${plugin.manifest.id}`}>
                    损坏，不可启用
                  </span>
                )}
              </div>
              <ul className="plugin-caps">
                {plugin.manifest.capabilities.map((capability) => (
                  <li key={capability.id} className="plugin-cap" data-testid={`cap-${capability.id}`}>
                    <span className="cap-kind">{capability.kind}</span>:<code>{capability.id}</code>
                    {capability.kind === 'panel' && (
                      <button
                        type="button"
                        className="btn slim"
                        data-testid={`cap-open-${capability.id}`}
                        disabled={plugin.status !== 'enabled'}
                        onClick={() => host.openPanel(capability.id)}
                      >
                        打开
                      </button>
                    )}
                    {capability.kind === 'command' && (
                      <button
                        type="button"
                        className="btn slim"
                        data-testid={`cap-run-${capability.id}`}
                        disabled={plugin.status !== 'enabled'}
                        onClick={() => void capability.run()}
                      >
                        运行
                      </button>
                    )}
                    {capability.kind === 'service' && (
                      <button
                        type="button"
                        className="btn slim"
                        data-testid={`cap-call-${capability.id}`}
                        disabled={plugin.status !== 'enabled'}
                        onClick={() => runService(capability)}
                      >
                        调用
                      </button>
                    )}
                    {capability.kind === 'service' && serviceResults[capability.id] !== undefined && (
                      <span className="cap-result" data-testid={`cap-result-${capability.id}`}>
                        → {serviceResults[capability.id]}
                      </span>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          )
        })}
      </ul>

      {active !== null && active.id !== SELF_PANEL_ID && (
        <div className="plugin-active" data-testid="plugin-active-panel">
          {getReactBinding(active.id) !== undefined ? (
            <PluginActiveRenderer
              component={getReactBinding(active.id)!}
              onClose={() => host.closePanel()}
              close={() => {
                host.setPanelParams(active.id, undefined)
                host.closePanel()
              }}
              params={host.panelParams(active.id)}
            />
          ) : (
            renderUiNode(uiOf(active), (actionId) => {
              const command = host.commands().find((capability) => capability.id === actionId)
              if (command !== undefined) void command.run()
            })
          )}
        </div>
      )}

      <button type="button" className="btn" data-testid="plugins-close" onClick={onClose}>
        关闭
      </button>
    </div>
  )
}
