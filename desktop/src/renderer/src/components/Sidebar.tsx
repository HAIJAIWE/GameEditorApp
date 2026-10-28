import type { PluginSidebarItem } from '../../../shared/plugin/types'

/**
 * 左侧主导航栏（dsh Web 侧边栏风格）。
 *
 * **B 方案 Slice 10 后**：条目不再由本组件或 `App` 硬编码，改由插件声明的 `sidebar` 能力供给
 * （见 `plugins/navigationPlugin.tsx`）。本组件只做纯渲染：
 * - 接收 `items: PluginSidebarItem[]`（宿主合并后的全部侧栏条目）；
 * - 点击某条目 → 调 `onActivate(item)`，由 `App` 统一派发（command→执行 / panel→带守卫打开）；
 * - 当前打开的浮层若等于某条目的 `panel`，则该条目高亮（home/agent 等 command 条目无高亮态）。
 *
 * 这样侧栏结构随插件启停变化，且和顶部菜单走同一套「能力 id」语义。
 */
export default function Sidebar({ items, activePanel, onActivate }: {
  items: PluginSidebarItem[]
  activePanel: string | null
  onActivate: (item: PluginSidebarItem) => void
}) {
  return (
    <nav className="sidebar" data-testid="sidebar" aria-label="主导航">
      {items.map((item) => {
        const isActive = item.panel !== undefined && item.panel === activePanel
        const testid = item.testid ?? `sidebar-${item.key}`
        return (
          <button
            key={item.key}
            type="button"
            className={`sidebar-item${isActive ? ' active' : ''}`}
            data-testid={testid}
            title={item.label}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onActivate(item)}
          >
            <span className="sidebar-icon" aria-hidden>{item.icon}</span>
            <span className="sidebar-label">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
