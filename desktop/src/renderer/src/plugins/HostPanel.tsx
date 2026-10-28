import type { ComponentType } from 'react'

import type { PluginHost } from '../../../shared/plugin/host'
import { getReactBinding, renderUiNode, uiOf } from './reactBindings'

/** 模块级稳定组件：把按 panel id 查到的宿主侧 React 绑定渲染出来。
 *  组件作为 prop 传入，避免在渲染期赋值组件变量触发 react-hooks/static-components。 */
function BoundPanel({ component: Bound, onClose }: {
  component: ComponentType<{ onClose: () => void }>
  onClose: () => void
}) {
  return <Bound onClose={onClose} />
}

/**
 * 在宿主主区渲染一个已注册的面板能力（借 dsh 的 panel 能力即「可挂载视图」）。
 *
 * 优先 React 绑定；缺失则回退声明式 `UiNode`。App 的浮层复用这条渲染链，
 * 让**产品面板与插件面板走同一条路**——这是深层插件化（B 方案）的使能件：
 * 面板不再由 App 的 switch 硬编码，而是经 `PluginHost` 发现与渲染。
 */
export function HostPanel({ host, panelId, onClose }: {
  host: PluginHost
  panelId: string
  onClose: () => void
}) {
  const panel = host.panels().find((capability) => capability.id === panelId)
  if (panel === undefined) return null
  const Bound = getReactBinding(panel.id)
  if (Bound !== undefined) return <BoundPanel component={Bound} onClose={onClose} />
  return renderUiNode(uiOf(panel), () => undefined)
}
