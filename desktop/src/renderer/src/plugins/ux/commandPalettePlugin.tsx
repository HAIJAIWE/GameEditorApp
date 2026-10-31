import { useCallback, useEffect, useMemo, useRef, useState, useSyncExternalStore, type ReactElement } from 'react'

import {
  buildPaletteItems,
  filterPaletteItems,
  movePaletteIndex,
  type PaletteItem
} from '../../../../shared/agent/tools'
import { CONVERSATION_STORE_KEY, createConversationStoreDecl } from '../../../../shared/agent/conversation'
import type { DigitalPanelState } from '../../../../shared/agent/ui'
import type { PluginHost } from '../../../../shared/plugin/host'
import type { PluginManifest } from '../../../../shared/plugin/types'
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

/** 对话状态的中文标签（与 `DigitalPanel` 的 `STATUS_LABELS` 同口径，但那是组件私有，不复用以免耦合） */
const STATUS_LABELS: Record<DigitalPanelState['status'], string> = {
  idle: '待命',
  thinking: '思考中…',
  waiting_approval: '等待确认',
  waiting_input: '等待回答',
  done: '已完成',
  error: '出错'
}

export function defineCommandPalettePlugin(host: PluginHost): PluginManifest {
  // 富 UI 绑定外置注册；闭包捕获宿主，避免组件再去 import 单例（那会形成 builtins ↔ 本文件的循环）
  registerSlotComponent('command.palette', () => <CommandPalette host={host} />)
  return {
    id: 'command-palette',
    name: 'command-palette',
    version: '0.1.0',
    description: '命令面板：⌘K 搜索并执行命令 / 打开面板',
    meta: { label: '命令面板', icon: '⌘' },
    capabilities: [
      {
        kind: 'command',
        id: 'palette.open',
        label: '命令面板',
        run: () => {
          openPalette()
        }
      },
      {
        kind: 'slot',
        id: 'commandPalette.slot',
        key: 'app.overlay',
        component: 'command.palette',
        ui: { type: 'text', text: '命令面板' }
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
  if (item.group === '命令') {
    const command = host.commands().find((capability) => capability.id === item.id)
    if (command !== undefined) void command.run()
    return
  }
  if (item.group === '面板') {
    host.openPanel(item.id)
    return
  }
  if (item.group === '页签') {
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
  const groups = new Map<string, Array<{ item: PaletteItem; index: number }>>()
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
        aria-label="命令面板"
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
          placeholder="搜索命令或面板…"
          aria-label="搜索命令"
          autoFocus
          onChange={(event) => {
            onQuery(event.currentTarget.value)
          }}
        />

        <div className="command-palette-list" role="listbox" aria-label="命令列表" ref={listRef}>
          {items.length === 0 ? (
            <div className="command-palette-empty" data-testid="command-palette-empty">
              没有匹配的命令
            </div>
          ) : (
            [...groups].map(([group, entries]) => (
              <div key={group} className="command-palette-group-wrap" role="presentation">
                <div className="command-palette-group" role="presentation">
                  {group}
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
          <span>↑↓ 选择 · Enter 执行 · Esc 关闭</span>
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
      commands: host.commands(),
      panels: host.panels(),
      // 页签清单：插件 `mainView` 能力（策划书/数据/代码/浏览器都已迁成 mainView，
      // App 的 `appTabs` 逃生口当前为空；将来有内联页签时再由 App 经 ownerProps 追加）。
      // 右栏页签（`host: 'rightbar'`，如「会话」）不在此列：它不由主区页签条渲染，
      // 列进来会变成一条点了没反应的命令。
      mainViews: host
        .mainViews()
        .filter((view) => view.host !== 'rightbar')
        .map((view) => ({ id: view.id, label: view.label }))
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
        label: '清空对话',
        hint: 'conversation.clear',
        group: '对话',
        run: () => {
          conversationStore.actions.reset()
        }
      }
    ]
  }, [host, version, conversationStore])

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

  const statusText = `对话：${STATUS_LABELS[conversation.status]} · ${conversation.messages.length} 条消息`
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
