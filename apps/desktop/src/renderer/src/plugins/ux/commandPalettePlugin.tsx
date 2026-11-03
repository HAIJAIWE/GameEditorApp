import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement } from 'react'

import { useT } from '@mobai/client-ui'
import {
  buildPaletteItems,
  filterPaletteItems,
  movePaletteIndex,
  type PaletteItem
} from '@mobai/shared/agent/tools'
import { CONVERSATION_STORE_KEY, createConversationStoreDecl } from '@mobai/shared/agent/conversation'
import type { DigitalPanelState } from '@mobai/shared/agent/ui'
import type { MessageKey } from '@mobai/shared/i18n'
import type { PluginHost } from '@mobai/shared/plugin/host'
import type { PluginManifest } from '@mobai/shared/plugin/types'
import { openPalette, subscribePalette } from '../context'
import { registerSlotComponent } from '../host'

/**
 * 全局命令面板（⌘K / Ctrl+K，借 dsh `ui-commands` 的交互设计、本地重写）。
 *
 * dsh 的 popupSelect 是「挂在输入框上沿的选项卡」；命令面板要的是**全屏居中**的
 * 搜索 + 分组列表，所以只借它的结构取舍：
 * - 输入框常驻焦点、↑↓ 移动虚拟高亮（输入框不失焦）；
 * - 行 = 标签 + 右侧次要信息（dsh 的 `detail`），分组用小标题隔开；
 * - 空态给一句话，不是空白；
 * - 底部提示行常驻（这里顺带显示对话状态——根级 store 的第二个消费者）。
 *
 * 打开通道有两条：⌘K（本组件自己的键盘监听）与 `palette.open` 命令（经 `paletteBus`）。
 * 面板挂在根级 slot `app.overlay` 上，空 slot 时 `SlotOutlet` 渲染 null，不挡鼠标。
 */

/** 对话状态文案键（与 `DigitalPanel` 的 `STATUS_LABELS` 同口径，但那是组件私有，不复用以免耦合） */
const STATUS_LABELS: Record<DigitalPanelState['status'], MessageKey> = {
  idle: 'session.status.idle',
  thinking: 'session.status.thinking',
  waiting_approval: 'session.status.waitingApproval',
  waiting_input: 'session.status.waitingInput',
  done: 'session.status.done',
  error: 'session.status.error'
}

/** 分组标识 → 展示文案键（逻辑层只认符号 id，翻译在渲染层做） */
const GROUP_KEYS: Record<PaletteItem['group'], MessageKey> = {
  command: 'palette.group.command',
  panel: 'palette.group.panel',
  mainView: 'palette.group.mainView',
  conversation: 'palette.group.conversation'
}

export function defineCommandPalettePlugin(host: PluginHost): PluginManifest {
  // 富 UI 绑定外置注册；闭包捕获宿主，避免组件再去 import 单例（那会形成 builtins ↔ 本文件的循环）
  registerSlotComponent('command.palette', () => <CommandPalette host={host} />)
  return {
    id: 'command-palette',
    name: 'command-palette',
    version: '0.1.0',
    description: 'Command palette: search and run commands / open panels with Cmd+K',
    meta: { labelKey: 'palette.metaLabel', icon: '⌘' },
    capabilities: [
      {
        kind: 'command',
        id: 'palette.open',
        label: 'Command palette',
        labelKey: 'palette.title',
        run: () => {
          openPalette()
        }
      },
      {
        kind: 'slot',
        id: 'commandPalette.slot',
        key: 'app.overlay',
        component: 'command.palette',
        ui: { type: 'text', text: 'Command palette' }
      }
    ]
  }
}

/**
 * 条目的真实动作：纯逻辑层只拍平（那里的 `run` 是占位），按 `group` 在这里接回宿主。
 *
 * 「页签」组走 `host.openMainView(id)`（写 `mainView.state` 根级 store）：
 * 页签条与命令面板因此共享同一个真相源，从面板切页与点页签等价。
 */
function runItem(host: PluginHost, item: PaletteItem): void {
  if (item.group === 'command') {
    const command = host.commands().find((capability) => capability.id === item.id)
    if (command !== undefined) void command.run()
    return
  }
  if (item.group === 'panel') {
    host.openPanel(item.id)
    return
  }
  if (item.group === 'mainView') {
    host.openMainView(item.id)
  }
}

export interface CommandPaletteViewProps {
  items: PaletteItem[]
  activeIndex: number
  query: string
  onQuery: (query: string) => void
  onPick: (item: PaletteItem) => void
  onClose: () => void
  /** 底部提示行左侧的状态文案（对话状态） */
  statusText?: string
}

/**
 * 纯展示层：遮罩 + 居中卡片 + 输入框 + 分组列表 + 空态 + 底部提示。
 *
 * 之所以和容器分开：键盘/宿主接线无法在 Node 下测，而「选中态、空态、点击回调」
 * 这些渲染契约可以单独喂 props 断言（`tests/unit/dom/commandPaletteView.test.tsx`）。
 */
export function CommandPaletteView({
  items,
  activeIndex,
  query,
  onQuery,
  onPick,
  onClose,
  statusText
}: CommandPaletteViewProps): ReactElement {
  const t = useT()
  const listRef = useRef<HTMLDivElement | null>(null)

  // 输入框保持焦点时浏览器不会把高亮行滚进视野，这里手动滚一次
  useEffect(() => {
    const active = listRef.current?.querySelector('[aria-selected="true"]')
    // jsdom 未实现 scrollIntoView，运行时再判一次（否则组件测试直接抛错）
    if (active instanceof HTMLElement && typeof active.scrollIntoView === 'function') {
      active.scrollIntoView({ block: 'nearest' })
    }
  }, [activeIndex, items])

  // 分组：按首次出现顺序建桶（条目本身已是「命令 → 面板 → 对话」的顺序）
  const groups = new Map<PaletteItem['group'], Array<{ item: PaletteItem; index: number }>>()
  items.forEach((item, index) => {
    const bucket = groups.get(item.group)
    if (bucket === undefined) groups.set(item.group, [{ item, index }])
    else bucket.push({ item, index })
  })

  return (
    <div className="command-palette-backdrop" onClick={onClose}>
      <div
        className="command-palette"
        data-testid="command-palette"
        role="dialog"
        aria-modal="true"
        aria-label={t('palette.title')}
        onClick={(event) => {
          // 卡片内的点击不该冒到遮罩（否则点条目会把面板一起关掉）
          event.stopPropagation()
        }}
      >
        <input
          className="command-palette-input"
          data-testid="command-palette-input"
          type="text"
          value={query}
          placeholder={t('palette.searchPlaceholder')}
          aria-label={t('palette.searchLabel')}
          autoFocus
          onChange={(event) => {
            onQuery(event.currentTarget.value)
          }}
        />

        <div className="command-palette-list" role="listbox" aria-label={t('palette.listLabel')} ref={listRef}>
          {items.length === 0 ? (
            <div className="command-palette-empty" data-testid="command-palette-empty">
              {t('palette.empty')}
            </div>
          ) : (
            [...groups].map(([group, entries]) => (
              <div key={group} className="command-palette-group-wrap" role="presentation">
                <div className="command-palette-group" role="presentation">
                  {t(GROUP_KEYS[group])}
                </div>
                {entries.map(({ item, index }) => (
                  <div
                    key={item.id}
                    role="option"
                    aria-selected={index === activeIndex}
                    data-testid="command-palette-item"
                    data-id={item.id}
                    className="command-palette-item"
                    onClick={() => {
                      onPick(item)
                    }}
                  >
                    <span className="command-palette-label">{item.label}</span>
                    {item.hint !== undefined && <span className="command-palette-detail">{item.hint}</span>}
                  </div>
                ))}
              </div>
            ))
          )}
        </div>

        <div className="command-palette-hint">
          <span>{statusText}</span>
          <span>{t('palette.hint')}</span>
        </div>
      </div>
    </div>
  )
}

/**
 * 容器：open / query / activeIndex 三个状态 + 键盘接线。
 *
 * 键盘统一挂在 `window` 上（与 App 的 Ctrl+Z 同一口径）：输入框只是卡片里的一员，
 * 焦点一旦被点到别处，卡片上的 onKeyDown 就收不到键了。
 */
export function CommandPalette({ host }: { host: PluginHost }): ReactElement | null {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const t = useT()

  // 能力列表每次调用都是新数组，不能直接当 uSES 快照；订阅宿主版本号，render 里重算
  const subscribeHost = useMemo(() => (onChange: () => void) => host.subscribe(onChange), [host])
  const version = useSyncExternalStore(subscribeHost, () => host.getVersion())

  /**
   * 对话状态：根级 store 的第二个消费者（面板是第一个）。
   * 与 `DigitalPanel` 同样的兜底——宿主未声明时退回一个同声明的本地实例，不因「没人声明」而崩。
   */
  const conversationStore = useMemo(
    () =>
      host.slotStore<DigitalPanelState>(CONVERSATION_STORE_KEY) ??
        host.declareStore(CONVERSATION_STORE_KEY, createConversationStoreDecl()),
    [host]
  )
  const conversation = useSyncExternalStore(conversationStore.subscribe, conversationStore.getSnapshot)

  const items = useMemo<PaletteItem[]>(() => {
    // 显式引用版本号：能力增删后必须重算条目（`host.commands()` 每次都是新数组，不能当快照）
    void version
    const flattened = buildPaletteItems({
      commands: host.commands().map((command) => ({
        id: command.id,
        label: command.labelKey !== undefined ? t(command.labelKey) : command.label
      })),
      panels: host.panels().map((panel) => ({
        id: panel.id,
        title: panel.titleKey !== undefined ? t(panel.titleKey) : panel.title
      })),
      // 页签清单：插件 `mainView` 能力（策划书/数据/代码/浏览器都已迁成 mainView，
      // App 的 `appTabs` 逃生口当前为空；将来有内联页签时再由 App 经 ownerProps 追加）。
      // 右栏页签（`host: 'rightbar'`，如「会话」）不在此列：它不由主区页签条渲染，
      // 列进来会变成一条点了没反应的命令。
      mainViews: host
        .mainViews()
        .filter((view) => view.host !== 'rightbar')
        .map((view) => ({
          id: view.id,
          label: view.labelKey !== undefined ? t(view.labelKey) : view.label ?? ''
        }))
    })
    return [
      ...flattened.map((item) => ({
        ...item,
        run: () => {
          runItem(host, item)
        }
      })),
      {
        id: 'conversation.clear',
        label: t('palette.clearConversation'),
        hint: 'conversation.clear',
        group: 'conversation',
        run: () => {
          conversationStore.actions.reset()
        }
      }
    ]
  }, [host, version, conversationStore, t])

  const filtered = useMemo(() => filterPaletteItems(items, query), [items, query])
  // 条目数可能在打开期间变化（插件被启用/禁用），高亮索引要夹回有效范围
  const active = filtered.length === 0 ? 0 : Math.min(activeIndex, filtered.length - 1)

  const resetAndOpen = useCallback(() => {
    setQuery('')
    setActiveIndex(0)
    setOpen(true)
  }, [])

  // 命令入口（`palette.open`）经模块级事件源打开面板
  useEffect(() => subscribePalette(resetAndOpen), [resetAndOpen])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const withModifier = event.ctrlKey || event.metaKey
      if (withModifier && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (open) setOpen(false)
        else resetAndOpen()
        return
      }
      if (!open) return
      switch (event.key) {
        case 'Escape':
          event.preventDefault()
          setOpen(false)
          return
        case 'ArrowDown':
          event.preventDefault()
          setActiveIndex(movePaletteIndex(active, 1, filtered.length))
          return
        case 'ArrowUp':
          event.preventDefault()
          setActiveIndex(movePaletteIndex(active, -1, filtered.length))
          return
        case 'Enter': {
          event.preventDefault()
          const picked = filtered[active]
          if (picked === undefined) return
          // 先关再执行：动作可能打开面板（替换主区），留着浮层会盖在结果上
          setOpen(false)
          picked.run()
          return
        }
        default:
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [open, active, filtered, resetAndOpen])

  if (!open) return null

  const statusText = t('palette.statusText', {
    status: t(STATUS_LABELS[conversation.status]),
    n: conversation.messages.length
  })
  return (
    <CommandPaletteView
      items={filtered}
      activeIndex={active}
      query={query}
      onQuery={(next) => {
        setQuery(next)
        // 查询变了，旧高亮指向的行已经不在原位
        setActiveIndex(0)
      }}
      onPick={(item) => {
        setOpen(false)
        item.run()
      }}
      onClose={() => {
        setOpen(false)
      }}
      statusText={statusText}
    />
  )
}
