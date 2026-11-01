import { useCallback, useEffect, useState } from 'react'

import type { CeshuSummary } from '@mobai/shared/ceshu/reference'
import type { PluginSidebarItem } from '@mobai/shared/plugin/types'
import { resolveIconName } from '@mobai/shared/util/ui'
import { LucideIcon } from '../common'
import './sidebar-nav.css'

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
/**
 * 展开态只平铺前 4 项，第 5 项起收进「更多」——dsh 侧栏就是只露 4 项。
 * 不按「能不能放下」动态算：侧栏高度随窗口变化，动态阈值会让同一份界面
 * 在不同屏幕上「哪些项在更多里」不一致，用户记不住位置。
 */
const VISIBLE_ITEM_COUNT = 4

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
  /**
   * 「更多」默认收起：默认状态下界面上只有 4 项，视觉与 dsh 一致；
   * 展开态**不持久化**——一次性查看，下次进来仍回到干净的 4 项。
   */
  const [moreOpen, setMoreOpen] = useState(false)

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

  // 收起成 56px 图标轨时不做「更多」：图标轨本身只占 20px，藏文字已经够省地方，
  // 再折叠一次反而要点两下才能到目标项。所以「更多」只在展开态（280px）出现。
  const showMore = !collapsed && items.length > VISIBLE_ITEM_COUNT
  const primaryItems = showMore ? items.slice(0, VISIBLE_ITEM_COUNT) : items
  const moreItems = showMore ? items.slice(VISIBLE_ITEM_COUNT) : []

  /**
   * 平铺区与「更多」子列表共用同一套渲染：`data-testid` 不会因为搬家而变，
   * 测试（`sidebar-<key>` / 插件自带 testid）在折叠前后都能定位到同一个元素。
   */
  const renderNavItem = (item: PluginSidebarItem) => {
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
  }

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
        {primaryItems.map(renderNavItem)}

        {/* 「更多」：就地展开/收起（不做浮层）——溢出的项仍属于同一列导航，
            弹菜单会丢掉「侧栏里就这几项」的空间感，还要多一次点击外部的关闭动作。 */}
        {showMore && (
          <>
            <button
              type="button"
              className="sidebar-item sidebar-more"
              data-testid="sidebar-more"
              aria-expanded={moreOpen}
              aria-controls={moreOpen ? 'sidebar-more-items' : undefined}
              title={moreOpen ? '收起更多' : '更多'}
              onClick={() => setMoreOpen((open) => !open)}
            >
              <span className="sidebar-icon" aria-hidden>
                {moreOpen ? <LucideIcon name="chevron-down" size={16} /> : <LucideIcon name="chevron-right" size={16} />}
              </span>
              <span className="sidebar-label">更多</span>
            </button>
            {/* 收起时不渲染，避免隐藏项还能被 Tab 聚焦到（display:none 的按钮在部分
                浏览器里仍会被读屏枚举），也让测试只在展开后才找得到溢出项。 */}
            {moreOpen && (
              <div className="sidebar-more-list" id="sidebar-more-items">
                {moreItems.map(renderNavItem)}
              </div>
            )}
          </>
        )}
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
