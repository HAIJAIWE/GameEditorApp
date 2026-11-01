import { useCallback, useMemo, useSyncExternalStore, type ComponentType } from 'react'

import type { PluginHost } from '@mobai/shared/plugin/host'
import { getReactBinding, renderUiNode, uiOf, type PanelBindingProps } from './reactBindings'

/** 模块级稳定组件：把按 panel id 查到的宿主侧 React 绑定渲染出来。
 *  组件作为 prop 传入，避免在渲染期赋值组件变量触发 react-hooks/static-components。 */
function BoundPanel({ component: Bound, onClose, close, params }: {
  component: ComponentType<PanelBindingProps>
  onClose: () => void
  close: () => void
  params: unknown
}) {
  return <Bound onClose={onClose} close={close} params={params} />
}

/**
 * 在宿主主区渲染一个已注册的面板能力（借 dsh 的 panel 能力即「可挂载视图」）。
 *
 * 优先 React 绑定；缺失则回退声明式 `UiNode`。App 的浮层复用这条渲染链，
 * 让**产品面板与插件面板走同一条路**——这是深层插件化（B 方案）的使能件：
 * 面板不再由 App 的 switch 硬编码，而是经 `PluginHost` 发现与渲染。
 *
 * Slice 3：面板的**打开参数**也由宿主供给（`host.panelParams`）。这里订阅宿主变更，
 * 参数被替换时本组件重渲染——所以「面板已开着、再对另一条数据打开」也能刷新，
 * 不依赖 App 的 state 变化（`setPanel` 同值不会触发重渲染）。
 */
export function HostPanel({ host, panelId, onClose }: {
  host: PluginHost
  panelId: string
  onClose: () => void
}) {
  const subscribe = useMemo(() => (onChange: () => void) => host.subscribe(onChange), [host])
  // 快照即宿主保存的同一引用：换参数→身份变化触发重渲染；未换→身份稳定，不抖动
  const params = useSyncExternalStore(subscribe, () => host.panelParams(panelId))

  /** 关闭并清掉本面板参数（一次性大对象参数用这个收尾，别留在宿主里） */
  const close = useCallback(() => {
    host.setPanelParams(panelId, undefined)
    onClose()
  }, [host, panelId, onClose])

  const panel = host.panels().find((capability) => capability.id === panelId)
  if (panel === undefined) return null
  const Bound = getReactBinding(panel.id)
  if (Bound !== undefined) {
    return <BoundPanel component={Bound} onClose={onClose} close={close} params={params} />
  }
  return renderUiNode(uiOf(panel), () => undefined)
}
