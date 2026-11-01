import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'

import type { PluginHost } from '@mobai/shared/plugin/host'
import type { PluginMenuItem } from '@mobai/shared/plugin/types'
import LucideIcon from './LucideIcon'

/**
 * 菜单挂载点（Slice 16）：把插件声明的 `menu` 能力渲染成宿主某位置的**下拉菜单**。
 *
 * 与 App 的 `MenuBar` 同源（都从 `host.menus(mount)` 读、点击派发 command），
 * 但形态是「一个按钮 + 一个下拉」——编辑器工具栏的「更多 ▸」正是这个形态。
 * 契约里用**分隔符**（既无 command 也无 items）表示分组，这里据此切成 `.toolbar-more-group`。
 */
function isSeparator(item: PluginMenuItem): boolean {
  return item.command === undefined && item.items === undefined
}

export function MenuMount({ host, mount, busy = false }: {
  host: PluginHost
  mount: string
  busy?: boolean
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)
  const subscribe = useMemo(() => (onChange: () => void) => host.subscribe(onChange), [host])
  // 菜单集合随插件启停变化：用 id 串当快照
  useSyncExternalStore(subscribe, () =>
    host
      .menus(mount)
      .map((menu) => menu.id)
      .join('|')
  )

  useEffect(() => {
    if (!open) return undefined
    const onDocClick = (event: MouseEvent): void => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false)
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [open])

  // 合并同挂载点下的所有菜单条目，再按分隔符切成组
  const groups: PluginMenuItem[][] = []
  let current: PluginMenuItem[] = []
  for (const menu of host.menus(mount)) {
    for (const item of menu.items) {
      if (isSeparator(item)) {
        if (current.length > 0) groups.push(current)
        current = []
      } else {
        current.push(item)
      }
    }
  }
  if (current.length > 0) groups.push(current)

  /** 点击条目：先收菜单，再派发命令（找不到 = 插件被禁用，静默） */
  const run = (commandId: string): void => {
    setOpen(false)
    const command = host.commands().find((capability) => capability.id === commandId)
    if (command !== undefined) void command.run()
  }

  return (
    <div className="toolbar-more" ref={ref}>
      <button
        type="button"
        className="btn accent-outline"
        data-testid="ceshu-more"
        disabled={busy}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        更多
        <LucideIcon name="chevron-down" size={14} />
      </button>
      {open && (
        <div className="toolbar-more-menu" role="menu" data-testid="ceshu-more-menu">
          {groups.map((group, groupIndex) => (
            <div className="toolbar-more-group" key={groupIndex}>
              {group.map((item) => (
                <button
                  key={item.testid ?? item.label}
                  type="button"
                  role="menuitem"
                  className="toolbar-more-item"
                  data-testid={item.testid}
                  disabled={busy}
                  onClick={() => {
                    if (item.command !== undefined) run(item.command)
                  }}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
