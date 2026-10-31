import { useCallback, useEffect, useMemo, useState, useSyncExternalStore, type ComponentType, type ReactNode } from 'react'

import { MIDDLE_TAB_KEY, loadStoredTab, saveStoredTab } from '../../../../shared/config/settings'
import type { PluginHost } from '../../../../shared/plugin/host'
import { MAIN_VIEW_STORE_KEY, createMainViewStoreDecl, type MainViewState } from '../../../../shared/plugin/mainViewStore'
import { createStoreInstance } from '../../../../shared/plugin/slotRegistry'
import type { PluginMainViewCapability } from '../../../../shared/plugin/types'
import {
  EMPTY_MAIN_VIEW_CONTEXT,
  MainViewProvider,
  type MainViewContextValue
} from './mainViewContext'
import { getReactBinding, renderUiNode, uiOf, type PanelBindingProps } from './reactBindings'

/**
 * App 主区页签挂载器（Slice 22）。
 *
 * 把「中间窗口」的页签条 + 常驻挂载语义从 App 抽到这里：
 * - 页签来源 = 内联页签（`appTabs`，尚未插件化的编辑器/数据）+ 插件 `mainView` 能力；
 * - **常驻挂载、hidden 切换**：切走不卸载，编辑器草稿 / 滚动 / 选中态不丢；
 * - `lazy` 页签首访才挂载（代码 / 浏览器等重视图，避免启动成本）。
 *
 * 与 `ViewMount`（编辑器**内部**挂载点）的分工：这里是**主区本身**，不是主区里的子视图。
 */

/** 内联页签（尚未插件化的主区视图）；`render` 与插件 `mainView` 二选一 */
export interface AppMainTab {
  id: string
  label: string
  title?: string
  order?: number
  /** 首访才挂载；缺省 false = 常驻 */
  lazy?: boolean
  render: () => ReactNode
}

interface MergedTab {
  id: string
  label: string
  title?: string
  order: number
  lazy: boolean
  render?: () => ReactNode
  plugin?: PluginMainViewCapability
}

/** 主区视图无关闭/参数语义：绑定统一收到空实现（保持 `PanelBindingProps` 形状一致） */
const NOOP = (): void => undefined

/** 模块级稳定组件：渲染插件主区视图的 React 绑定（规避 react-hooks/static-components） */
function BoundMainView({ component: Bound }: { component: ComponentType<PanelBindingProps> }) {
  return <Bound onClose={NOOP} close={NOOP} params={undefined} />
}

function buildMerged(appTabs: AppMainTab[], pluginViews: PluginMainViewCapability[]): MergedTab[] {
  const out: MergedTab[] = []
  for (const tab of appTabs) {
    out.push({
      id: tab.id,
      label: tab.label,
      title: tab.title,
      order: tab.order ?? 0,
      lazy: tab.lazy ?? false,
      render: tab.render
    })
  }
  for (const view of pluginViews) {
    out.push({
      id: view.id,
      label: view.label,
      title: view.title,
      order: view.order ?? 0,
      lazy: view.lazy ?? false,
      plugin: view
    })
  }
  return out.sort((left, right) => left.order - right.order)
}

export function MainViewMount({
  host,
  appTabs,
  context = EMPTY_MAIN_VIEW_CONTEXT,
  actions
}: {
  host: PluginHost
  appTabs: AppMainTab[]
  /** 主区视图共享状态（独立于面板 appContext，见 mainViewContext 注释） */
  context?: MainViewContextValue
  /** 页签条右端的附加动作（如停靠区全屏开关）；不传则无 */
  actions?: ReactNode
}) {
  const subscribe = useMemo(() => (onChange: () => void) => host.subscribe(onChange), [host])
  // 订阅版本号（稳定数值快照）以在插件增删/禁用后重渲染；列表在下方按最新宿主状态重算。
  // 不能直接拿 `host.mainViews()` 当快照：它每次返回新数组，身份抖动会导致无限重渲染。
  useSyncExternalStore(subscribe, () => host.getVersion())

  // 只认领 `host: 'main'`（缺省）——`rightbar` 的 mainView 由 `RightBarTabs` 渲染，
  // 否则「会话」会同时出现在主区页签条和右栏，出现两个入口。
  const merged = buildMerged(
    appTabs,
    host.mainViews().filter((view) => view.host !== 'rightbar')
  )
  const validIds = new Set(merged.map((tab) => tab.id))
  const firstId = merged[0]?.id ?? ''
  const initialId = loadStoredTab(MIDDLE_TAB_KEY, validIds, firstId)

  /**
   * 激活态来自根级 store（`mainView.state`），不再是本组件的 `useState`：
   * 命令面板 / 快捷键要能「从外面切页」，局部 state 没有对外写入口。
   * 宿主未声明 store 时退回同声明的本地实例，挂载器不会因为「没人声明」而崩。
   */
  const mainViewStore = useMemo(
    () => host.slotStore<MainViewState>(MAIN_VIEW_STORE_KEY) ?? createStoreInstance(createMainViewStoreDecl()),
    [host]
  )
  const activeId = useSyncExternalStore(mainViewStore.subscribe, mainViewStore.getSnapshot).activeId

  // 首帧把「持久化 / 首个页签」写进 store（store 的初始值是空串 = 未初始化）。
  // 只在空串时写，之后用户切页 / 外部切页都以 store 为准，不会被这段初始化覆盖。
  useEffect(() => {
    if (activeId === '' && initialId !== '') mainViewStore.actions.activate(initialId)
  }, [activeId, initialId, mainViewStore])

  const [visited, setVisited] = useState<ReadonlySet<string>>(() => new Set([initialId]))

  // 持久/激活的 id 可能因插件被禁用而失效 → 回落到第一个
  const effectiveActive = validIds.has(activeId) ? activeId : firstId
  // 当前激活页签一定已挂载（回落时它可能还没进 visited）
  const mounted = new Set(visited)
  if (effectiveActive !== '') mounted.add(effectiveActive)

  const switchTo = useCallback(
    (id: string) => {
      mainViewStore.actions.activate(id)
      saveStoredTab(id, MIDDLE_TAB_KEY)
      setVisited((prev) => (prev.has(id) ? prev : new Set([...prev, id])))
    },
    [mainViewStore]
  )

  return (
    <MainViewProvider value={context}>
      <nav className="middle-tabs" data-testid="middle-tabs" aria-label="中间窗口页签">
        {merged.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`middle-tab${effectiveActive === tab.id ? ' active' : ''}`}
            title={tab.title}
            aria-current={effectiveActive === tab.id}
            data-testid={`middle-tab-${tab.id}`}
            onClick={() => switchTo(tab.id)}
          >
            {tab.label}
          </button>
        ))}
        {actions !== undefined && <div className="middle-tabs-actions">{actions}</div>}
      </nav>
      <div className="middle-tab-body">
        {merged.map((tab) => {
          if (tab.lazy && !mounted.has(tab.id)) return null
          const Bound = tab.plugin !== undefined ? getReactBinding(tab.plugin.id) : undefined
          return (
            <div key={tab.id} className="middle-tab-pane" hidden={effectiveActive !== tab.id}>
              {tab.render !== undefined ? (
                tab.render()
              ) : Bound !== undefined ? (
                <BoundMainView component={Bound} />
              ) : tab.plugin !== undefined ? (
                renderUiNode(uiOf(tab.plugin), NOOP)
              ) : null}
            </div>
          )
        })}
      </div>
    </MainViewProvider>
  )
}
