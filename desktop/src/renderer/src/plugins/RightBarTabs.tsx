import {
  useCallback,
  useMemo,
  useState,
  useSyncExternalStore,
  type ComponentType,
  type ReactNode
} from 'react'

import { loadStoredTab, saveStoredTab } from '../../../shared/config/middleTab'
import type { PluginHost } from '../../../shared/plugin/host'
import type { PluginMainViewCapability } from '../../../shared/plugin/types'
import { getReactBinding, renderUiNode, uiOf, type PanelBindingProps } from './reactBindings'
import { SlotOutlet } from './slotOutlet'

/**
 * 右栏页签容器（对齐 dsh `ui-layout` 的右栏轨道 + `ui-sidebar-right` 的 tab 域）。
 *
 * dsh 的右栏是**停靠轨道**：内置的会话界面是一个保留 key（`selectPanel(null)`），
 * 面板才是可选项。这里照搬这个取舍——
 * - 「对话」是**内置**页签，内容仍是 `app.rightPanel` slot（DigitalPanel 占据者不变，
 *   既有 e2e 锚点 `digital-panel` 与「常驻右栏」语义都保留）；
 * - 「会话」等是插件声明的 `mainView`（`host: 'rightbar'`），与主区页签同一套注册/懒挂/顺序。
 *
 * 为什么不让会话继续占主区页签：它和对话读同一份 `conversation.state`，放在右栏
 * 才能在「看对话」时顺手切到「看轨迹」，而不用跨区移动视线。
 */

/** 内置对话页签的 id（dsh 的会话界面是保留 key，不是插件面板） */
export const CONVERSATION_TAB_ID = 'conversation'

/** 右栏页签的持久化键（与主区 `mb.middleTab` 分开，两边各自记忆） */
export const RIGHT_BAR_TAB_KEY = 'mb.rightBar.tab'

const NOOP = (): void => undefined

interface RightTab {
  id: string
  label: string
  title?: string
  order: number
  lazy: boolean
  /** 内置对话页签（渲染 `app.rightPanel` slot，而不是插件绑定） */
  builtin: boolean
  plugin?: PluginMainViewCapability
}

/** 模块级稳定组件：渲染插件右栏视图的 React 绑定（规避 react-hooks/static-components） */
function BoundRightView({ component: Bound }: { component: ComponentType<PanelBindingProps> }) {
  return <Bound onClose={NOOP} close={NOOP} params={undefined} />
}

/**
 * 页签清单 = 内置「对话」+ 插件的 `host: 'rightbar'` mainView（按 order 排）。
 * 纯函数，便于单测；`order` 只对插件页签生效，「对话」恒定在最左。
 */
export function buildRightTabs(views: readonly PluginMainViewCapability[]): RightTab[] {
  const pluginTabs: RightTab[] = views
    .filter((view) => view.host === 'rightbar')
    .map((view) => ({
      id: view.id,
      label: view.label,
      title: view.title,
      order: view.order ?? 0,
      lazy: view.lazy ?? false,
      builtin: false,
      plugin: view
    }))
    .sort((left, right) => left.order - right.order)
  return [
    { id: CONVERSATION_TAB_ID, label: '对话', title: '智能体对话', order: -1, lazy: false, builtin: true },
    ...pluginTabs
  ]
}

export function RightBarTabs({
  host,
  ownerProps
}: {
  host: PluginHost
  /** 透传给 `app.rightPanel` slot 占据者的打开参数（DigitalPanel 需要 onOpenCapabilities） */
  ownerProps?: Record<string, unknown>
}): ReactNode {
  const subscribe = useMemo(() => (onChange: () => void) => host.subscribe(onChange), [host])
  // 订阅版本号（稳定数值快照）；列表在 render 里按最新宿主状态重算，避免数组身份抖动
  useSyncExternalStore(subscribe, () => host.getVersion())

  const tabs = buildRightTabs(host.mainViews())
  const validIds = new Set(tabs.map((tab) => tab.id))
  const [activeId, setActiveId] = useState<string>(() => loadStoredTab(RIGHT_BAR_TAB_KEY, validIds, CONVERSATION_TAB_ID))

  // 持久值可能因插件被禁用而失效 → 回落到内置对话页签
  const effectiveActive = validIds.has(activeId) ? activeId : CONVERSATION_TAB_ID

  const [visited, setVisited] = useState<ReadonlySet<string>>(() => new Set([activeId]))
  const mounted = new Set(visited)
  mounted.add(effectiveActive)

  const switchTo = useCallback((id: string) => {
    setActiveId(id)
    saveStoredTab(id, RIGHT_BAR_TAB_KEY)
    setVisited((prev) => (prev.has(id) ? prev : new Set([...prev, id])))
  }, [])

  return (
    <div className="rightbar" data-testid="rightbar">
      <nav className="rightbar-tabs" data-testid="rightbar-tabs" aria-label="右栏页签">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            className={`rightbar-tab${effectiveActive === tab.id ? ' active' : ''}`}
            title={tab.title}
            aria-current={effectiveActive === tab.id}
            data-testid={`rightbar-tab-${tab.id}`}
            onClick={() => switchTo(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </nav>

      <div className="rightbar-body">
        {tabs.map((tab) => {
          if (tab.lazy && !mounted.has(tab.id)) return null
          const Bound = tab.plugin !== undefined ? getReactBinding(tab.plugin.id) : undefined
          return (
            <div
              key={tab.id}
              className="rightbar-pane"
              hidden={effectiveActive !== tab.id}
              data-testid={`rightbar-pane-${tab.id}`}
            >
              {tab.builtin ? (
                <SlotOutlet host={host} slotKey="app.rightPanel" className="ai-dock-slot" ownerProps={ownerProps} />
              ) : Bound !== undefined ? (
                <BoundRightView component={Bound} />
              ) : tab.plugin !== undefined ? (
                renderUiNode(uiOf(tab.plugin), NOOP)
              ) : null}
            </div>
          )
        })}
      </div>
    </div>
  )
}
