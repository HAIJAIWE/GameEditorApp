/**
 * 左侧主导航栏（dsh Web 侧边栏风格）。
 *
 * 只做导航分发，不持有任何业务状态——所有行为委托给 `onNavigate(action)`。
 * 三类动作：回首页（home）/ 聚焦数字员工 dock（agent）/ 打开浮层面板（panel）。
 * 当前打开的浮层面板高亮对应条目（home/agent 无高亮态）。
 */
export type SidebarAction =
  /** 目标浮层 = `panel` 能力 id（如 `statistics.panel`），不再是一组硬编码 kind */
  | { type: 'panel'; panel: string }
  | { type: 'home' }
  | { type: 'agent' }

export interface SidebarItem {
  key: string
  label: string
  icon: string
  action: SidebarAction
}

export default function Sidebar({ items, activePanel, onNavigate }: {
  items: SidebarItem[]
  activePanel: string | null
  onNavigate: (action: SidebarAction) => void
}) {
  return (
    <nav className="sidebar" data-testid="sidebar" aria-label="主导航">
      {items.map((item) => {
        const isActive = item.action.type === 'panel' && item.action.panel === activePanel
        return (
          <button
            key={item.key}
            type="button"
            className={`sidebar-item${isActive ? ' active' : ''}`}
            data-testid={`sidebar-${item.key}`}
            title={item.label}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onNavigate(item.action)}
          >
            <span className="sidebar-icon" aria-hidden>{item.icon}</span>
            <span className="sidebar-label">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
