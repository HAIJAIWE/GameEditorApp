import { useCallback, useEffect, useState } from 'react'

import { resolveIconName } from '../../../shared/util/lucideIcons'
import type { PluginSidebarItem } from '../../../shared/plugin/types'
import LucideIcon from './LucideIcon'

/**
 * 左侧主导航栏（对齐 dsh `ui-sidebar` 的度量）。
 *
 * 度量取自 dsh 源码，不是估的：
 * - 展开：`padding: 6px 8px`、行内边距 12px、图标与文字间隙 6px、字号 **14px**、行高 36px；
 * - 收起：56px 轨道，`padding: 18px 10px 6px`（36×36 控件居中在 56px 轨道里）；
 * - 宽度 280px（dsh 默认），`border-right: 0.5px solid rgba(0,0,0,0.12)`（其 `border-l3`）；
 * - 窗口 < 1024px 自动收起；`Mod+B` 切换（dsh 的桌面快捷键）。
 *
 * **条目不硬编码**：由插件 `sidebar` 能力供给（见 `plugins/navigationPlugin.tsx`），本组件只渲染。
 */
const COLLAPSED_KEY = 'mb.sidebar.collapsed'
/** dsh：窗口低于 1024px 自动收起侧栏 */
const AUTO_COLLAPSE_WIDTH = 1024

function loadCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === '1'
  } catch {
    return false
  }
}

function saveCollapsed(collapsed: boolean): void {
  try {
    localStorage.setItem(COLLAPSED_KEY, collapsed ? '1' : '0')
  } catch {
    // 隐私模式/配额不足不影响使用
  }
}

export default function Sidebar({
  items,
  activePanel,
  onActivate
}: {
  items: PluginSidebarItem[]
  activePanel: string | null
  onActivate: (item: PluginSidebarItem) => void
}) {
  const [collapsed, setCollapsed] = useState<boolean>(() => loadCollapsed())

  const toggle = useCallback(() => {
    setCollapsed((value) => {
      saveCollapsed(!value)
      return !value
    })
  }, [])

  // Mod+B（macOS ⌘B / Windows Ctrl+B）切换，与 dsh 同一手势
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'b') {
        event.preventDefault()
        toggle()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggle])

  // 窄窗自动收起；变宽**不**强行展开（用户手动展开才算数，同 dsh）
  useEffect(() => {
    const onResize = (): void => {
      if (window.innerWidth < AUTO_COLLAPSE_WIDTH) setCollapsed(true)
    }
    onResize()
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  return (
    <nav
      className={`sidebar${collapsed ? ' collapsed' : ''}`}
      data-testid="sidebar"
      data-collapsed={collapsed}
      aria-label="主导航"
    >
      <button
        type="button"
        className="sidebar-toggle"
        data-testid="sidebar-toggle"
        aria-expanded={!collapsed}
        title={collapsed ? '展开侧栏（Ctrl+B）' : '收起侧栏（Ctrl+B）'}
        onClick={toggle}
      >
        <span className="sidebar-icon" aria-hidden>
          {collapsed ? <LucideIcon name="chevron-right" size={16} /> : <LucideIcon name="chevron-left" size={16} />}
        </span>
      </button>

      {items.map((item) => {
        const isActive = item.panel !== undefined && item.panel === activePanel
        const testid = item.testid ?? `sidebar-${item.key}`
        // 图标优先当**线性图标名**解析（dsh 的语言：统一 16px 单色）；
        // 解析不到才回退成原字符串（插件可能仍传 emoji，不让它瞎掉）。
        const iconName = resolveIconName(item.icon)
        return (
          <button
            key={item.key}
            type="button"
            className={`sidebar-item${isActive ? ' active' : ''}`}
            data-testid={testid}
            // 收起时只剩图标，标题（悬浮提示）就是唯一说明
            title={item.label}
            aria-current={isActive ? 'page' : undefined}
            onClick={() => onActivate(item)}
          >
            <span className="sidebar-icon" aria-hidden>
              {iconName !== null ? <LucideIcon name={iconName} size={16} /> : item.icon}
            </span>
            <span className="sidebar-label">{item.label}</span>
          </button>
        )
      })}
    </nav>
  )
}
