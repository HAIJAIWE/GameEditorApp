import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from 'react'

import { ShortcutKeys, useT } from '@mobai/client-ui'
import type { MessageKey } from '@mobai/shared/i18n'
import { APP_SHORTCUTS, shortcutAria } from '@mobai/shared/util/ui'
import type { PluginHost } from '@mobai/shared/plugin/host'
import type { PluginMenuItem } from '@mobai/shared/plugin/types'
import { isMenuDisabled } from '../../plugins/context'
import { LibraryBar } from '../common'
import { LucideIcon } from '../common'

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

/**
 * 顶层菜单的稳定测试锚点：由能力 id 派生（`menu.file` → `menu-title-file`），
 * **与菜单标题文案无关**——标题将来要翻译，testid 不能跟着变（e2e 全指着它）。
 * 不再用「中文标题 → testid」的映射表：那张表把界面语言焊死在测试锚点里。
 */
function menuTestId(menuId: string): string {
  return `menu-title-${menuId.replace(/^menu\./, '')}`
}

/** 分隔符在契约里是「既没有 command 也没有 items」的条目 */
function isSeparator(item: PluginMenuItem): boolean {
  return item.command === undefined && item.items === undefined
}

/**
 * 菜单项命令 → 快捷键条目。全局命令用 `app.<action>` 命名（见 `appActionsPlugin`），
 * 键位事实源是 `APP_SHORTCUTS`——这里只做 id 到条目的映射，不重复写键位。
 */
function shortcutOfCommand(command: string | undefined) {
  if (command === undefined || !command.startsWith('app.')) return undefined
  const action = command.slice('app.'.length)
  return APP_SHORTCUTS.find((entry) => entry.action === action)
}

export default function MenuBar({ host }: MenuBarProps) {
  const t = useT()
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

  /** 顶层菜单：按 order 排序（host.menus() 已排），同标题合并条目；记下首个能力的 id 供 testid 用 */
  type MergedMenu = { id: string; title?: string; menuKey?: MessageKey; items: PluginMenuItem[] }
  const merged = new Map<string, MergedMenu>()
  for (const capability of host.menus()) {
    const mergeKey = capability.menuKey ?? capability.menu ?? capability.id
    const existing = merged.get(mergeKey)
    if (existing === undefined) {
      merged.set(mergeKey, { id: capability.id, title: capability.menu, menuKey: capability.menuKey, items: [...capability.items] })
    } else {
      existing.items.push(...capability.items)
    }
  }
  const menus = [...merged.values()]

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

  const renderItem = (item: PluginMenuItem, key: number) => {
    const shortcut = shortcutOfCommand(item.command)
    return (
      <button
        type="button"
        key={key}
        className="menu-item"
        data-testid={item.testid}
        disabled={isMenuDisabled(item.disabledWhen)}
        // 读屏用规范名（Control/Shift/Meta）；右侧键帽是 aria-hidden 的纯视觉
        aria-keyshortcuts={shortcut === undefined ? undefined : shortcutAria(shortcut.keys)}
        onClick={() => {
          if (item.command !== undefined) runCommand(item.command)
        }}
      >
        <span className="menu-item-label">
          {item.labelKey !== undefined ? t(item.labelKey) : item.label ?? ''}
        </span>
        {shortcut !== undefined && <ShortcutKeys keys={shortcut.keys} />}
      </button>
    )
  }

  return (
    <div className="menubar" ref={barRef}>
      {menus.map((menu, idx) => (
        <div className="menu" key={menu.id}>
          <button
            type="button"
            className={`menu-title${openIndex === idx ? ' open' : ''}`}
            data-testid={menuTestId(menu.id)}
            onClick={() => setOpenIndex(openIndex === idx ? null : idx)}
            onMouseEnter={() => {
              if (openIndex !== null) setOpenIndex(idx)
            }}
          >
            {menu.menuKey !== undefined ? t(menu.menuKey) : menu.title ?? ''}
          </button>
          {openIndex === idx && (
            <div className="menu-dropdown" role="menu">
              {menu.items.map((node, nIdx) => {
                if (isSeparator(node)) return <div className="menu-separator" key={nIdx} />
                if (node.items !== undefined) {
                  return (
                    <div className="menu-submenu" key={nIdx}>
                      <div className="menu-submenu-label">
                        {node.labelKey !== undefined ? t(node.labelKey) : node.label ?? ''}
                      </div>
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
        <span className="menubar-label">{t('layout.currentLibrary')}</span>
        <LibraryBar />
        {/* 库操作与应用级动作分组：一条 1px 细线，避免 7 个控件连成一排 */}
        <span className="menubar-divider" aria-hidden="true" />
        <button
          type="button"
          className="btn slim icon"
          data-testid="menubar-settings"
          aria-label={t('settings.title')}
          title={t('settings.title')}
          onClick={() => runCommand('settings.open')}
        >
          <LucideIcon name="settings" size={16} />
        </button>
        <button
          type="button"
          className="btn slim primary"
          data-testid="menubar-ai"
          title={t('layout.focusAi')}
          onClick={() => runCommand('app.focusAi')}
        >
          <LucideIcon name="bot" size={16} />
          {t('agent.title')}
        </button>
      </div>
    </div>
  )
}
