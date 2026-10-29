import { Fragment, useSyncExternalStore, type ReactNode } from 'react'

import type { PluginHost } from '../../../shared/plugin/host'
import type { SlotEntry } from '../../../shared/plugin/slotRegistry'
import { isUiNode } from '../../../shared/plugin/types'
import { getSlotComponent, renderUiNode } from './reactBindings'

/**
 * Slot 出口：把宿主 `SlotRegistry` 的渲染读画出来（借 dsh ui-renderer 的 slot 渲染思路）。
 *
 * 用法：宿主在页面某处放 `<SlotOutlet host={pluginHost} slotKey="app.statusbar" />`，
 * 插件用 `slot` 能力往该 key 注册展示体即可出现。订阅走 `useSyncExternalStore`
 * （订阅 slot 版本号、render 里再算列表——与既有 `mainViews()` 的稳定快照口径一致）。
 *
 * 说明：MVP 只画声明式 `UiNode`（富 React 组件后续经绑定扩展）；`chain` 用 `slotChainWinner` 选举。
 */
export interface SlotOutletProps {
  host: PluginHost
  slotKey: string
  /** chain 选举用的 owner props（其他 kind 忽略） */
  ownerProps?: unknown
  className?: string
  /** 无条目 / 未声明时的占位 */
  empty?: ReactNode
}

export function SlotOutlet({ host, slotKey, ownerProps, className, empty }: SlotOutletProps): ReactNode {
  const version = useSyncExternalStore(
    (cb) => host.subscribeSlot(slotKey, cb),
    () => host.slotVersion(slotKey)
  )
  void version

  const spec = host.slotSpec(slotKey)
  if (spec === undefined) return empty ?? null

  if (spec.kind === 'chain') {
    const winner = host.slotChainWinner(slotKey, ownerProps)
    if (winner === null) return empty ?? null
    return <div className={className}>{renderEntry(winner.entry, host, ownerProps)}</div>
  }

  const entries = host.slotEntries(slotKey)
  if (entries.length === 0) return empty ?? null
  return (
    <div className={className}>
      {entries.map((entry) => (
        <Fragment key={entry.id}>{renderEntry(entry, host, ownerProps)}</Fragment>
      ))}
    </div>
  )
}

function renderEntry(entry: SlotEntry, host: PluginHost, ownerProps: unknown): ReactNode {
  // 富 UI：`component` 指向宿主侧注册的 React 组件，ownerProps 原样下发
  if (entry.component !== undefined) {
    const Component = getSlotComponent(entry.component)
    if (Component !== undefined) {
      const props = ownerProps !== null && typeof ownerProps === 'object' ? (ownerProps as Record<string, unknown>) : {}
      return <Component {...props} />
    }
  }
  const payload = typeof entry.payload === 'function' ? (entry.payload as () => unknown)() : entry.payload
  if (!isUiNode(payload)) return null
  return renderUiNode(payload, (commandId) => {
    const command = host.commands().find((capability) => capability.id === commandId)
    if (command !== undefined) void command.run()
  })
}
