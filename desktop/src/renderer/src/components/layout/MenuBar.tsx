import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

import type { PluginHost } from '../../../../shared/plugin/host'
import type { PluginMenuItem } from '../../../../shared/plugin/types'
import { isMenuDisabled } from '../../plugins/menuState'
import LibraryBar from '../common/LibraryBar'
import LucideIcon from '../common/LucideIcon'

/**
 * 顶部菜单栏。
 *
 * **B 方案 Slice 9 后**：菜单结构不再写在本组件里，而是由插件声明的 `menu` 能力供给
 * （见 `plugins/menusPlugin.ts`）。本组件只做三件事：
 * 1. 从 `host.menus()` 取条目、按 `order` 排顶层菜单、同标题合并；
 * 2. 点击条目 → 按 `command` id 找 command 能力并执行；
 * 3. 用 `disabledWhen` 经 `menuState` 通道问宿主「这项现在能不能点」。
 *
 * 于是 App 里那张 35 项的动作映射表（`MenuActions`）被彻底删除——加菜单项只需改插件。
 *
 * 设计取舍（保留）：菜单栏是整个应用**唯一的能力入口**；菜单里**不存在**「点了只报尚未实现」
 * 的占位项（要么接线、要么不进菜单）。右侧角部件承载库选择与「设置 / AI」两个强调按钮。
 */

interface MenuBarProps {
  host: PluginHost
}

/** 顶层菜单标题 → 稳定测试锚点（E2E 依赖；未列出的标题回落到 `menu-title-<title>`） */
const MENU_TITLE_TESTIDS: Record<string, string> = {
  文件: 'menu-title-file',
  编辑: 'menu-title-edit',
  工具: 'menu-title-tools',
  视图: 'menu-title-view',
  设置: 'menu-title-settings',
  帮助: 'menu-title-help'
}

/** 分隔符在契约里是「既没有 command 也没有 items」的条目 */
function isSeparator(item: PluginMenuItem): boolean {
  return item.command === undefined && item.items === undefined
}

export default function MenuBar({ host }: MenuBarProps) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const barRef = useRef<HTMLDivElement>(null)

  // 菜单集合会随插件启停变化：用「id 串」当快照（字符串身份稳定，不会每渲染都判变）
  const subscribe = useCallback((onChange: () => void) => host.subscribe(onChange), [host])
  useSyncExternalStore(subscribe, () =>
    host
      .menus()
      .map((menu) => menu.id)
      .join('|')
  )

  /** 顶层菜单：按 order 排序（host.menus() 已排），同标题合并条目 */
  const merged = new Map<string, PluginMenuItem[]>()
  for (const capability of host.menus()) {
    const existing = merged.get(capability.menu)
    if (existing === undefined) merged.set(capability.menu, [...capability.items])
    else existing.push(...capability.items)
  }
  const menus = [...merged.entries()].map(([title, items]) => ({ title, items }))

  useEffect(() => {
    if (openIndex === null) return undefined
    const onDocClick = (event: MouseEvent): void => {
      if (barRef.current && !barRef.current.contains(event.target as Node)) {
        setOpenIndex(null)
      }
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpenIndex(null)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [openIndex])

  /** 执行某条命令（找不到 = 该插件被禁用；静默，菜单项本身已因能力缺失而消失） */
  const runCommand = (commandId: string): void => {
    const command = host.commands().find((capability) => capability.id === commandId)
    if (command !== undefined) void command.run()
    setOpenIndex(null)
  }

  const renderItem = (item: PluginMenuItem, key: number) => (
    <button
      type="button"
      key={key}
      className="menu-item"
      data-testid={item.testid}
      disabled={isMenuDisabled(item.disabledWhen)}
      onClick={() => {
        if (item.command !== undefined) runCommand(item.command)
      }}
    >
      {item.label}
    </button>
  )

  return (
    <div className="menubar" ref={barRef}>
      {menus.map((menu, idx) => (
        <div className="menu" key={menu.title}>
          <button
            type="button"
            className={`menu-title${openIndex === idx ? ' open' : ''}`}
            data-testid={MENU_TITLE_TESTIDS[menu.title] ?? `menu-title-${menu.title}`}
            onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
            onMouseEnter={() => {
              if (openIndex !== null) setOpenIndex(idx)
            }}
          >
            {menu.title}
          </button>
          {openIndex === idx && (
            <div className="menu-dropdown" role="menu">
              {menu.items.map((node, nIdx) => {
                if (isSeparator(node)) return <div className="menu-separator" key={nIdx} />
                if (node.items !== undefined) {
                  return (
                    <div className="menu-submenu" key={nIdx}>
                      <div className="menu-submenu-label">{node.label}</div>
                      <div className="menu-submenu-items">
                        {node.items.map((sub, sIdx) =>
                          isSeparator(sub) ? (
                            <div className="menu-separator" key={sIdx} />
                          ) : (
                            renderItem(sub, sIdx)
                          )
                        )}
                      </div>
                    </div>
                  )
                }
                return renderItem(node, nIdx)
              })}
            </div>
          )}
        </div>
      ))}

      {/* 右侧角部件：库标签 + 库条 + 设置/智能体/AI */}
      <div className="menubar-right">
        <span className="menubar-label">当前库</span>
        <LibraryBar />
        {/* 库操作与应用级动作分组：一条 1px 细线，避免 7 个控件连成一排 */}
        <span className="menubar-divider" aria-hidden="true" />
        <button
          type="button"
          className="btn slim icon"
          data-testid="menubar-settings"
          aria-label="设置"
          title="设置"
          onClick={() => runCommand('settings.open')}
        >
          <LucideIcon name="settings" size={16} />
        </button>
        <button
          type="button"
          className="btn slim primary"
          data-testid="menubar-ai"
          title="聚焦右侧智能体对话输入框"
          onClick={() => runCommand('app.focusAi')}
        >
          <LucideIcon name="bot" size={16} />
          智能体
        </button>
      </div>
    </div>
  )
}
