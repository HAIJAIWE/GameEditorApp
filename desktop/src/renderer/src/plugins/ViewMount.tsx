import { useCallback, useMemo, useSyncExternalStore, type ComponentType } from 'react'

import type { CeshuDocument } from '../../../shared/ceshuConstants'
import type { PluginHost } from '../../../shared/plugin/host'
import { CeshuViewProvider } from './ceshuViewContext'
import { getReactBinding, renderUiNode, uiOf, type PanelBindingProps } from './reactBindings'

/** 模块级稳定组件：把按 view id 查到的 React 绑定渲染出来（规避 react-hooks/static-components） */
function BoundView({ component: Bound, onClose, close, params }: {
  component: ComponentType<PanelBindingProps>
  onClose: () => void
  close: () => void
  params: unknown
}) {
  return <Bound onClose={onClose} close={close} params={params} />
}

/**
 * 视图挂载点：在宿主（这里是 `CeshuView`）的**内部**渲染当前激活的 view。
 *
 * 与 `HostPanel` 的关键差异（Slice 11）：
 * - `HostPanel` 挂在 App 主区，打开时**替换主区**（编辑器被卸载）；
 * - `ViewMount` 挂在编辑器自己的 DOM 里，只叠加一层浮层，**编辑器保持挂载**——
 *   草稿、滚动、选中态都不丢。编辑器内的只读浮层（路线/体检/影响面）因此必须走这里。
 *
 * 数据来源：
 * - 当前激活视图与打开参数都订阅宿主（`activeView(mount)` / `viewParams(id)`）；
 * - 当前文档 `doc` 由宿主组件作为 prop 传入，经 `CeshuViewProvider` 下发给绑定组件。
 *
 * 关闭：`onClose` 只关视图；`close` 关视图并清掉打开参数（一次性参数用后者）。
 */
export function ViewMount({ host, mount, doc }: {
  host: PluginHost
  mount: string
  doc: CeshuDocument
}) {
  const subscribe = useMemo(() => (onChange: () => void) => host.subscribe(onChange), [host])
  // 当前激活视图 id：变化触发重渲染（切到另一个视图）
  const activeId = useSyncExternalStore(subscribe, () => host.activeView(mount)?.id ?? null)
  // 打开参数：返回宿主保存的同一引用；换参数时身份变化触发重渲染
  const params = useSyncExternalStore(subscribe, () => {
    const active = host.activeView(mount)
    return active === null ? null : (host.viewParams(active.id) ?? null)
  })

  const onClose = useCallback(() => host.closeView(mount), [host, mount])
  const close = useCallback(() => {
    if (activeId !== null) host.setViewParams(activeId, undefined)
    host.closeView(mount)
  }, [host, activeId, mount])

  if (activeId === null) return null
  const view = host.activeView(mount)
  if (view === null) return null

  const Bound = getReactBinding(view.id)
  return (
    <CeshuViewProvider value={{ doc }}>
      {Bound !== undefined ? (
        <BoundView component={Bound} onClose={onClose} close={close} params={params} />
      ) : (
        renderUiNode(uiOf(view), () => undefined)
      )}
    </CeshuViewProvider>
  )
}
