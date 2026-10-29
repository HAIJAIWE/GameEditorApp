import { useCallback, useEffect, useState } from 'react'

import type { CeshuSummary } from '../../../shared/ceshuConstants'
import type { PluginSidebarItem } from '../../../shared/plugin/types'
import { resolveIconName } from '../../../shared/util/lucideIcons'
import LucideIcon from './LucideIcon'

/**
 * 左侧主导航栏（对齐 dsh `ui-sidebar` 的结构与度量）。
 *
 * 结构照 dsh 的三段式：
 * 1. 顶部**主操作**「＋ 新建策划书」（dsh 是「＋ 新会话」）；
 * 2. 中部功能导航（插件 / 插件市场 / …，由插件 `sidebar` 能力供给）；
 * 3. 底部「工作区」段：段标题 + 列表（dsh 是工作区文件夹，我们是**策划书列表**）。
 *
 * 度量取自 dsh 源码：展开 280px / 收起 56px、`padding: 6px 8px`、行高 36px、字号 14px、
 * 图标↔文字 6px、右边界 `border-l3`；<1024px 自动收起；`Mod+B` 切换。
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
  onActivate,
  onNewCeshu,
  ceshuList = [],
  activeCeshuId = null,
  onOpenCeshu
}: {
  items: PluginSidebarItem[]
  activePanel: string | null
  onActivate: (item: PluginSidebarItem) => void
  /** 顶部主操作：新建一份空白策划书 */
  onNewCeshu?: () => void
  /** 「工作区」段：策划书列表 */
  ceshuList?: readonly CeshuSummary[]
  activeCeshuId?: string | null
  onOpenCeshu?: (id: string) => void
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
      <div className="sidebar-head">
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
        {!collapsed && <span className="sidebar-brand">墨白</span>}
      </div>

      {/* 顶部主操作（dsh「＋ 新会话」的位置） */}
      {onNewCeshu !== undefined && (
        <button
          type="button"
          className="sidebar-primary"
          data-testid="sidebar-new-ceshu"
          title="新建策划书"
          onClick={onNewCeshu}
        >
          <LucideIcon name="plus" size={16} />
          {!collapsed && <span>新建策划书</span>}
        </button>
      )}

      <div className="sidebar-nav">
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
      </div>

      {/* 工作区段（dsh 的「工作区」+ 列表；我们列策划书） */}
      {!collapsed && (
        <div className="sidebar-section">
          <div className="sidebar-section-head">
            <span>工作区</span>
            <span className="sidebar-section-count">{ceshuList.length}</span>
          </div>
          {ceshuList.length === 0 ? (
            <p className="sidebar-empty">还没有策划书</p>
          ) : (
            <ul className="sidebar-list">
              {ceshuList.map((doc) => (
                <li key={doc.id}>
                  <button
                    type="button"
                    className={`sidebar-item${doc.id === activeCeshuId ? ' active' : ''}`}
                    data-testid={`sidebar-ceshu-${doc.id}`}
                    title={doc.gameName || '未命名策划书'}
                    aria-current={doc.id === activeCeshuId ? 'page' : undefined}
                    onClick={() => onOpenCeshu?.(doc.id)}
                  >
                    <span className="sidebar-icon" aria-hidden>
                      <LucideIcon name="file-text" size={16} />
                    </span>
                    <span className="sidebar-label">{doc.gameName || '未命名策划书'}</span>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </nav>
  )
}
