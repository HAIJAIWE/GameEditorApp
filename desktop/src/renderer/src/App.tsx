import { useCallback, useEffect, useRef, useState, useSyncExternalStore, type MouseEvent as ReactMouseEvent } from 'react'

import type { CeshuSummary } from '../../shared/ceshuConstants'
import { loadGameStyle, normalizeGameStyleId, saveGameStyle } from '../../shared/config/gameStyle'
import { loadMiddleTab, MIDDLE_TABS, saveMiddleTab, type MiddleTab } from '../../shared/config/middleTab'
import type { AppInfo, DataTypeDef } from '../../shared/types'
import { applyTheme, loadTheme, saveTheme, type ThemeMode } from '../../shared/config/theme'

import CeshuHomePanel from './components/CeshuHomePanel'
import BrowserPanel from './components/BrowserPanel'
import CeshuView from './components/CeshuView'
import CodePanel from './components/CodePanel'
import DataEditorPanel from './components/DataEditorPanel'
import { type PreviewJumpTarget } from './components/ceshu/CeshuDataPreview'
import DigitalPanel from './components/digital/DigitalPanel'
import MenuBar from './components/MenuBar'
import { type ReferenceTarget } from './components/ReferencesPanel'
import Sidebar, { type SidebarAction, type SidebarItem } from './components/Sidebar'
import ToastHost from './components/ToastHost'
import { useUndoRedo } from './hooks/useAppActions'
import { toErrorMessage } from './appUtils'
import { clampDockWidth, defaultDockWidth, loadAiDockWidth, saveAiDockWidth } from './dockWidth'
import { pluginHost } from './plugins/builtins'
import { setHostUi } from './plugins/hostBridge'
import { setAppIoPort } from './plugins/appActionsIo'
import { setMenuStateProvider } from './plugins/menuState'
import { HostPanel } from './plugins/HostPanel'
import { AppContextProvider } from './plugins/appContext'

/**
 * 这些面板的打开参数是**一次性上下文**（「编辑哪个类型」之类）：从菜单打开时必须先清空，
 * 否则上一次从条目表单进来时选中的类型会粘住。带参数打开（内部入口）则不清。
 */
const CLEARS_PARAMS_ON_OPEN = new Set(['typeEditor.panel', 'quickCreate.panel', 'batch.panel'])

/**
 * 左侧主导航栏条目（dsh Web 侧边栏风格）。
 * home=回策划书首页；agent=聚焦右侧数字员工 dock 输入；其余=打开对应浮层面板（**用 panel 能力 id**）。
 */
const SIDEBAR_ITEMS: SidebarItem[] = [
  { key: 'home', label: '策划书', icon: '📘', action: { type: 'home' } },
  { key: 'plugins', label: '插件中心', icon: '🧩', action: { type: 'panel', panel: 'plugins.panel' } },
  { key: 'relationGraph', label: '关系图', icon: '🕸', action: { type: 'panel', panel: 'relationGraph.panel' } },
  { key: 'advancedSearch', label: '高级搜索', icon: '🔍', action: { type: 'panel', panel: 'advancedSearch.panel' } },
  { key: 'stats', label: '统计', icon: '📊', action: { type: 'panel', panel: 'statistics.panel' } },
  { key: 'settings', label: '设置', icon: '⚙', action: { type: 'panel', panel: 'settings.panel' } },
  { key: 'about', label: '关于', icon: 'ℹ', action: { type: 'panel', panel: 'about.panel' } },
  { key: 'agent', label: '数字员工', icon: '🤖', action: { type: 'agent' } }
]

/**
 * 顶层外壳。
 *
 * **B 方案 Slice 8a 后的关键变化**：浮层的清单不再由本组件持有。
 * 以前是 `type OverlayPanel = 'stats' | …`（23 个 kind）+ 一张 23 项标题表 + 一个 23 case 的
 * `switch`；现在浮层的身份就是 `panel` 能力的 id，标题从能力自带 `title` 读，
 * 渲染塌缩成一个 `<HostPanel panelId={panelId}>`，`panelId` 直接订阅宿主的 `activePanel()`。
 * ⇒ 插件命令调 `host.openPanel()` 与菜单/侧栏走的是同一条路。
 *
 * 设计要点：
 * - **无左侧栏**：所有能力走顶部菜单栏；库选择与「设置 / 智能体 / AI」按钮挂在菜单栏右侧角部件。
 * - 中央是**单栈**：策划书首页 ↔ 策划书编辑器（编辑器内嵌数据预览面板且常驻），默认落在首页。
 * - 右侧 `.ai-dock` 为常驻数字员工停靠面板（单一实例）。
 * - 底部状态栏（版本 / 类型数 / 数据库路径 / 主题切换）常驻。
 */
export default function App() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [types, setTypes] = useState<DataTypeDef[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  /** 撤销/重做（状态 + 三个动作）：内聚单元，见 hooks/useAppActions */
  const { undoUi, refreshUndo, performUndo, performRedo } = useUndoRedo(setNotice, setError)
  /**
   * 主区内当前打开的浮层 = **宿主的活动面板**（单一来源，Slice 8a）。
   *
   * 以前是本组件的一份 `useState`，于是「插件命令调 host.openPanel()」打不开浮层——
   * 命令只改宿主，App 不知道。现在反向：宿主是真相，本组件订阅它，
   * 菜单/侧栏/插件命令三条路走同一个开关。
   */
  const subscribeHost = useCallback((onChange: () => void) => pluginHost.subscribe(onChange), [])
  const panelId = useSyncExternalStore(subscribeHost, () => pluginHost.activePanel()?.id ?? null)

  /**
   * 关闭浮层：宿主是单一来源，关也走宿主。
   * 放在这里（而不是 openPanel 旁边）是因为 Esc 监听的 effect 在下方要用它——
   * 晚声明会触发 react-hooks 的「访问未声明变量」检查。
   */
  const closePanel = (): void => pluginHost.closePanel()
  /**
   * 注：待确认的导入预览**不再是 App 的 state**（B 方案 Slice 7）。
   * 解析结果在主进程暂存，会话 id + 预览数据作为「导入预览面板的打开参数」交给宿主携带
   * （`pluginHost.openPanel('importPreview.panel', payload)`），面板用完调 `close()` 清掉。
   */
  /** 中间窗口页签（编辑器/代码编辑/浏览器）：持久化在 localStorage，重启保留 */
  const [middleTab, setMiddleTab] = useState<MiddleTab>(() => loadMiddleTab())
  /** 已访问过的页签（代码/浏览器首访才挂载面板；编辑器默认已在） */
  const [visitedTabs, setVisitedTabs] = useState<ReadonlySet<MiddleTab>>(() => new Set([loadMiddleTab()]))
  /** 切页签：记 visited + 持久化。常驻挂载的编辑器不重载，切回不丢草稿状态 */
  const switchMiddleTab = useCallback((tab: MiddleTab): void => {
    setMiddleTab(tab)
    saveMiddleTab(tab)
    setVisitedTabs((prev) => (prev.has(tab) ? prev : new Set([...prev, tab])))
  }, [])
  /** 主题（深/浅）：持久化在 localStorage，随会话保留；启动时由 main.tsx 预应用以避免闪屏 */
  const [theme, setTheme] = useState<ThemeMode>(() => loadTheme())

  /*
   * AI 停靠栏宽度（可拖拽）：持久化在 localStorage，启动按当前视口重新 clamp。
   * 用 ref 存「拖拽起点 / 最新宽度」，避免每帧重建监听器、也避免 mouseup 时读到旧值。
   */
  const [aiDockWidth, setAiDockWidth] = useState<number>(() => loadAiDockWidth(window.innerWidth))
  const aiDockWidthRef = useRef(aiDockWidth)
  const dockDragRef = useRef<{ startX: number; startWidth: number } | null>(null)

  useEffect(() => {
    aiDockWidthRef.current = aiDockWidth
  }, [aiDockWidth])

  // 窗口缩放时把右栏宽度重新夹回合法区间（避免小窗下主区被挤没）
  useEffect(() => {
    const onResize = (): void => setAiDockWidth((width) => clampDockWidth(width, window.innerWidth))
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])

  // 拖拽：mousemove 只更新宽度，mouseup 才落盘（减少 localStorage 写）
  useEffect(() => {
    const onMove = (event: MouseEvent): void => {
      const drag = dockDragRef.current
      if (drag === null) return
      const desired = drag.startWidth - (event.clientX - drag.startX)
      setAiDockWidth(clampDockWidth(desired, window.innerWidth))
    }
    const onUp = (): void => {
      if (dockDragRef.current === null) return
      dockDragRef.current = null
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
      saveAiDockWidth(aiDockWidthRef.current)
    }
    window.addEventListener('mousemove', onMove)
    window.addEventListener('mouseup', onUp)
    return () => {
      window.removeEventListener('mousemove', onMove)
      window.removeEventListener('mouseup', onUp)
    }
  }, [])

  const startDockResize = (event: ReactMouseEvent): void => {
    event.preventDefault()
    dockDragRef.current = { startX: event.clientX, startWidth: aiDockWidthRef.current }
    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
  }

  const resetDockWidth = (): void => {
    const next = defaultDockWidth(window.innerWidth)
    setAiDockWidth(next)
    saveAiDockWidth(next)
  }

  // 活跃库切换（A2-2）：主进程已重建全部 store，渲染层直接整页重载——
  // 这样所有视图（策划书/属性系统/数字员工）都从新库重新拉取，无需逐处写刷新逻辑。
  useEffect(() => {
    const library = (window.mbApi as unknown as { library?: { onChanged?: (h: (p: unknown) => void) => () => void } })
      .library
    if (library?.onChanged === undefined) return undefined
    return library.onChanged(() => {
      window.location.reload()
    })
  }, [])

  // 窗口标题随活跃库变化（Electron 会把 document.title 同步到窗口标题栏）。
  // 切换库时 App 会整页重载，本 effect 随之重跑，无需额外订阅。
  useEffect(() => {
    let cancelled = false
    window.mbApi.library
      .list()
      .then((snapshot) => {
        if (cancelled) return
        document.title = snapshot.active ? `${snapshot.active} · 墨白可视化编辑` : '墨白可视化编辑'
      })
      .catch(() => {
        // 标题只是锦上添花，读取失败保持默认
      })
    return () => {
      cancelled = true
    }
  }, [])

  const [ceshuList, setCeshuList] = useState<CeshuSummary[]>([])
  const [activeCeshuId, setActiveCeshuId] = useState<string | null>(null)
  /** 策划书首页卡片视图：默认落在首页 */
  const [ceshuHomeVisible, setCeshuHomeVisible] = useState(true)

  /**
   * 活跃游戏风格 id（术语风格）。用于条目表单的字段标签术语替换
   * 。
   *
   * 触发方式：
   * - 打开某份策划书时由 `CeshuView` 回填：优先 `doc.style`（用户显式选过），否则由 meta 文本推断
   * - 工具栏下拉手工切换
   * `''` = 原始术语（不替换）。
   */
  const [gameStyle, setGameStyle] = useState<string>(() => loadGameStyle())
  /**
   * 注：引用面板的目标条目**不再是 App 的 state**（B 方案 Slice 3）。
   * 它属于「面板打开参数」，由宿主携带：`pluginHost.setPanelParams('references.panel', target)`
   * 预置、`pluginHost.openPanel('references.panel', target)` 打开时替换。
   * 面板经 `HostPanel` 渲染，参数由宿主下发——App 不再为单个面板持有专用状态。
   */
  /**
   * 注：字段结构编辑器 / 快速创建的目标类型**也不是 App 的 state**（Slice 7）。
   * 它们是这两个面板的打开参数，由宿主携带；菜单入口打开前显式清空参数，
   * 于是「菜单 = 默认（第一个类型）、内部入口 = 指定类型」这套语义原样保留。
   */
  /** 跳转定位目标（含递增 nonce 以支持重复跳转同一类型）；命中启用编辑器时在策划书预览面板定位条目 */
  const [jumpTarget, setJumpTarget] = useState<PreviewJumpTarget | null>(null)
  /**
   * 数据纪元：每次「清空所有数据」成功 +1，经 `CeshuView` 透传进内嵌 `DataEditorTab` 的 `key`，
   * 强制重挂载 → 重新 `listItems`（否则条目页签仍列着已被删掉的条目）。
   * 用「重挂载」而非新增一个 refresh 通道：项目既有做法（跳转定位/切库）都是 key 重挂载。
   */
  const [dataEpoch, setDataEpoch] = useState(0)

  /** 浮层面板需要「一个类型」作为载体时使用的兜底：schema 里第一个类型 */
  const firstType = types[0]?.id ?? null

  /** 策划书列表刷新；无选中项时自动选中第一份 */
  const reloadCeshuList = useCallback(async (): Promise<void> => {
    try {
      const list = await window.mbApi.ceshu.list()
      setCeshuList(list)
      setActiveCeshuId((current) => current ?? list[0]?.id ?? null)
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }, [])

  // 应用主题：状态变化即同步到 <html> 的 data-theme（挂载时本 effect 也会执行一次）
  useEffect(() => {
    applyTheme(theme)
  }, [theme])

  // 键盘快捷键：Ctrl/Cmd+Z 撤销；Ctrl/Cmd+Shift+Z 或 Ctrl+Y 重做（输入框内不拦截，保留本地撤销）
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent): void => {
      const target = event.target as HTMLElement | null
      const tag = target?.tagName
      if (tag === 'INPUT' || tag === 'TEXTAREA' || target?.isContentEditable === true) return
      if (!(event.ctrlKey || event.metaKey)) return
      const key = event.key.toLowerCase()
      if (key === 'z' && !event.shiftKey) {
        event.preventDefault()
        void performUndo()
      } else if ((key === 'z' && event.shiftKey) || key === 'y') {
        event.preventDefault()
        void performRedo()
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [performUndo, performRedo])

  /**
   * Esc 关闭当前浮层面板。
   * TS 的浮层是 div 不是 QDialog，不注册这个键就关不掉 —— 属于交互缺失而非风格差异。
   * 已在输入框/下拉里按 Esc 的先由各自处理（事件冒泡到这里时浮层多半也该关，故不额外判断）。
   */
  useEffect(() => {
    if (panelId === null) return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      closePanel()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [panelId])

  useEffect(() => {
    window.mbApi.app
      .info()
      .then(setInfo)
      .catch((err: unknown) => setError(toErrorMessage(err)))
  }, [])

  // 加载数据类型 schema（主进程下发，用户可在「字段结构」中编辑并持久化）
  useEffect(() => {
    let cancelled = false
    window.mbApi.schema
      .list()
      .then((list) => {
        if (!cancelled) setTypes(list)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toErrorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 启动即加载策划书列表（首页卡片视图依赖它；懒加载避免在此之前访问文件系统）
  useEffect(() => {
    let cancelled = false
    window.mbApi.ceshu
      .list()
      .then((list) => {
        if (cancelled) return
        setCeshuList(list)
        setActiveCeshuId((current) => current ?? list[0]?.id ?? null)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toErrorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  /**
   * 切换术语风格：未知 id 归一为 `''`（原始术语），并持久化。
   * `useCallback` 稳定引用——`CeshuView` 的加载 effect 依赖它，否则每次渲染都会重跑 effect。
   */
  const handleGameStyleChange = useCallback((styleId: string): void => {
    const normalized = normalizeGameStyleId(styleId)
    setGameStyle(normalized)
    saveGameStyle(normalized)
  }, [])

  /**
   * 左侧栏导航分发：回首页 / 聚焦数字员工 dock / 打开浮层面板。
   * 与 MenuBar 的 actions 复用同一组底层 handler（openPanel / setNotice），不另造分支。
   */
  const handleSidebar = (action: SidebarAction): void => {
    if (action.type === 'home') {
      setCeshuHomeVisible(true)
      closePanel()
      return
    }
    if (action.type === 'agent') {
      const input = document.querySelector<HTMLInputElement>('[data-testid="digital-input"]')
      if (input !== null && !input.disabled) {
        input.scrollIntoView({ block: 'nearest' })
        input.focus()
        return
      }
      setNotice('AI 助手在右侧常驻；当前对话运行中，输入框暂不可用')
      return
    }
    openPanel(action.panel)
  }

  /** 切换主题：翻转深/浅并持久化（functional update 避免闭包取到旧值） */
  const toggleTheme = useCallback((): void => {
    setTheme((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark'
      saveTheme(next)
      return next
    })
  }, [])

  /**
   * 「清空所有数据」完成后的刷新。
   *
   * 做三件事：
   * 1. `refreshUndo()` —— 清空落了一条 `deleteMany` 撤销记录，菜单项的 disabled/标签要跟上；
   * 2. `setDataEpoch` 递增 —— 经 CeshuView 透传到内嵌数据编辑器的 `key`，
   *    强制重挂载 → 重新拉条目列表（否则条目页签会继续显示已被删掉的条目，
   *    点进去报「数据不存在」）；
   * 3. 提示结果并关面板。
   */
  const handleDataCleared = useCallback(
    (deleted: number): void => {
      setDataEpoch((prev) => prev + 1)
      setNotice(`数据已清空：删除 ${deleted} 条（可按 Ctrl+Z 撤销）`)
      closePanel()
      refreshUndo()
    },
    [refreshUndo]
  )

  /**
   * 打开浮层（**唯一入口**）：参数是 `panel` 能力 id，如 `statistics.panel`。
   *
   * 守卫留在这里（而不是塞进各插件）：它们要读 App 级数据（当前 schema 有没有类型）与提示语。
   * - 需要「一个类型」才能工作的面板（快速创建 / 批量）无类型时只提示，不开空面板；
   * - 「数据关联预览」无目标时改引导去「高级搜索」（保证入口永不灰死）。
   */
  const openPanel = useCallback((panel: string, params?: unknown): void => {
    if ((panel === 'quickCreate.panel' || panel === 'batch.panel') && firstType === null) {
      setNotice('当前没有可用的数据类型（schema 为空），请先在「字段结构编辑器」中新增类型')
      return
    }
    if (
      panel === 'references.panel' &&
      params === undefined &&
      pluginHost.panelParams('references.panel') === undefined
    ) {
      setNotice('请先在「高级搜索」中搜索并点击一条结果完成定位，随后即可查看其引用关系')
      // 高级搜索没有守卫，直接走宿主（不自递归：递归会让 openPanel 无法包成 useCallback）
      pluginHost.openPanel('advancedSearch.panel')
      return
    }
    // 菜单入口（无参数）= 默认上下文：清掉上次内部入口留下的一次性参数，避免「上次选的类型」粘住
    if (params === undefined && CLEARS_PARAMS_ON_OPEN.has(panel)) {
      pluginHost.setPanelParams(panel, undefined)
    }
    try {
      // 「关于」要版本号：无参打开时补上（其余面板不需要额外上下文）
      if (panel === 'about.panel' && params === undefined) {
        pluginHost.openPanel(panel, { version: info?.version ?? null })
      } else {
        pluginHost.openPanel(panel, params)
      }
    } catch {
      // 插件被禁用时 host 会拒绝：给可理解的提示，而不是抛到用户脸上
      setNotice('该面板所属插件未启用，可在「插件中心」重新启用')
    }
  }, [firstType, info, setNotice])

  /**
   * 派发插件命令（Slice 8b）：菜单里「纯导航」类动作不再自己 `setPanel`，改调插件声明的
   * `<x>.open` 命令——面板由插件提供，App 只负责按 id 找命令。
   *
   * 找不到命令 = 该插件被禁用：给可理解的提示，不抛错。
   * 注意：需要守卫或带打开参数的 4 个（字段结构 / 快速创建 / 批量 / 引用）仍走 `openPanel`。
   */
  const runCommand = (commandId: string): void => {
    const command = pluginHost.commands().find((capability) => capability.id === commandId)
    if (command === undefined) {
      setNotice('该命令所属插件未启用，可在「插件中心」重新启用')
      return
    }
    void command.run()
  }

  /**
   * 把界面级能力交给插件桥（`plugins/hostBridge.ts`）：提示 / 打开浮层（含守卫）/ 首页开关 / 当前策划书 id。
   * 插件命令跑在纯模块里拿不到这些；不注入的话，导航类命令只能留在 App 里，等于没插件化。
   * 放在 `openPanel` 之后：它要引用 `openPanel`（含守卫），早声明会被 react-hooks 判「访问未声明变量」。
   */
  useEffect(() => {
    setHostUi({
      notify: setNotice,
      openPanel,
      setHomeVisible: setCeshuHomeVisible,
      getActiveCeshuId: () => activeCeshuId
    })
  }, [openPanel, activeCeshuId])
  useEffect(() => () => setHostUi(null), [])

  /**
   * 菜单禁用态：`undo/redo` 的可用性由这里注入（菜单插件只声明 `disabledWhen: 'undo'`）。
   * 契约保持可序列化——manifest 里不出现任何运行时状态。
   */
  useEffect(() => {
    setMenuStateProvider(() => ({ undo: undoUi.canUndo, redo: undoUi.canRedo }))
    return () => setMenuStateProvider(null)
  }, [undoUi.canUndo, undoUi.canRedo])

  /*
   * 注：原 `handleOnboardingAction`（12 个引导 action 的导航分发）已随 Slice 8d 删除——
   * 它变成了 `onboardingPlugin` 里的 `nav.*` command，App 不再持有这段分发逻辑。
   */

  /**
   * 引用/搜索跳转：切到策划书编辑器并下发跳转目标以定位条目
   * 。
   * 同时把定位到的条目预置为引用面板的打开参数（不打开面板），使菜单「数据关联预览」
   * 可以直接查看该条目的引用关系。
   */
  const handleJump = (type: string, itemId: string, name: string): void => {
    pluginHost.setPanelParams('references.panel', { type, id: itemId, name })
    setCeshuHomeVisible(false)
    closePanel()
    // 跳转成功即清掉此前的引导类 notice（如「请先在「高级搜索」中…完成定位」），
    // 否则用户已定位到条目、顶部却仍挂着要求他去定位的提示。
    // 若目标未命中，预览面板随后会调 onJumpMissed 写入新的提示。
    setNotice(null)
    setJumpTarget((prev) => ({ type, itemId, name, nonce: (prev?.nonce ?? 0) + 1 }))
  }

  /** 跳转已处理（预览面板点击标签页 / 未命中被驳回）：清空 jumpTarget，避免重复触发 */
  const handleJumpHandled = (): void => setJumpTarget(null)

  /** 条目表单「更多 ▸ → 编辑当前类型字段结构」：把该类型作为打开参数交给宿主 */
  const handleEditType = (typeId: string): void => {
    pluginHost.openPanel('typeEditor.panel', { initialTypeId: typeId })
  }

  /**
   * 条目表单「更多 ▸ → 查看此项的引用关系」：把目标作为**打开参数**交给宿主再开面板。
   *
   * Slice 3 之前这里必须绕开 `openPanel('references')`（那条通道的守卫读 App state，
   * 同批次 `setRefTarget` 还没生效会把用户弹去高级搜索）。现在参数直接随打开动作下发，
   * 守卫读的是宿主里已写入的参数，不存在「同一批次读旧值」问题。
   */
  const handleShowReferences = (target: ReferenceTarget): void => {
    pluginHost.openPanel('references.panel', target)
  }

  /** 跳转未命中：目标类型不在当前策划书启用的游戏系统里，给出可理解的提示 */
  const handleJumpMissed = (name: string): void => {
    setNotice(`该条目「${name}」所属的数据类型未在当前策划书启用的游戏系统中，无法定位`)
  }

  /**
   * 注：原先这里有一个 `notImplemented(label)` 轻提示，供「点了只报尚未实现」的菜单占位项复用。
   * E57 删掉最后两个此类占位项
   * 后该函数已无消费者，一并移除 —— 菜单里不再有「点了没反应」的项。
   */

  /**
   * 数据被改过之后的通用收尾：顶部提示 + 刷撤销栈。
   * 快速创建 / 批量编辑 / 导入应用三处原本各有一个同形回调（`setNotice` + `refreshUndo`），
   * 现合并为 context 的 `afterMutation`；关面板由面板自己调 `onClose`/`close`（Slice 7）。
   */
  const afterMutation = useCallback(
    (message: string): void => {
      setNotice(message)
      refreshUndo()
    },
    [refreshUndo]
  )

  /**
   * 文件 I/O 动作（打开/保存/批量导入导出/引擎导出/快照导出）已搬到 `plugins/appActionsIo.ts`
   * 并注册为插件命令（Slice 8e）。这里只负责注入它们需要的**端口**：提示 / 报错 / 刷撤销 / 开预览。
   * 撤销与重做的实现仍由 `useUndoRedo` 持有（撤销态是它的 state），同样经端口转交。
   */
  useEffect(() => {
    setAppIoPort({
      notify: setNotice,
      error: setError,
      refreshUndo,
      openPreview: (payload) => pluginHost.openPanel('importPreview.panel', payload),
      undo: performUndo,
      redo: performRedo
    })
    return () => setAppIoPort(null)
  }, [refreshUndo, performUndo, performRedo])

  /** 打开某份策划书（同时离开首页卡片视图） */
  const handleOpenCeshu = (id: string): void => {
    setActiveCeshuId(id)
    setCeshuHomeVisible(false)
  }

  /**
   * 面板自供给通道（B 方案 Slice 2）：把面板共用的业务状态/动作经 context 注入，
   * 面板用 `useAppContext()` 自行取用，不再由本组件逐个以 props 下发。
   * 刻意不 memo：`handleJump` 为普通函数每次渲染新建，memo 不会命中；面板数量少，重渲染可接受。
   */
  const appContextValue = {
    types,
    setTypes,
    handleJump,
    refreshUndo,
    handleDataCleared,
    afterMutation
  }

  /**
   * 浮层头部标题：由 `panel` 能力自带（插件声明 `title`），App 不再维护 23 项标题表。
   * 插件被禁用时能力列表里查不到，回退到 id 本身（比空白可读）。
   */
  const panelTitle = pluginHost.panels().find((capability) => capability.id === panelId)?.title ?? panelId

  return (
    <div className="app">
      <MenuBar host={pluginHost} />
      <div className="app-body">
        <Sidebar items={SIDEBAR_ITEMS} activePanel={panelId} onNavigate={handleSidebar} />
        <div className="main">
          <div className="main-body">
            <div className="main-area">
              {error && <div className="error-banner">{error}</div>}
              {notice && <div className="notice-banner">{notice}</div>}
              {panelId !== null ? (
                <div className="panel-overlay">
                  <div className="panel-overlay-header">
                    <span className="chapter-form-title">{panelTitle}</span>
                    <button type="button" className="btn" data-testid="panel-close" onClick={() => closePanel()}>
                      关闭
                    </button>
                  </div>
                  <div className="panel-overlay-body">
                    {/* 面板自供给通道：此子树内的面板可经 useAppContext() 取共享状态；
                        渲染只认 panelId —— 23 case 的 switch 已随 Slice 8a 删除 */}
                    <AppContextProvider value={appContextValue}>
                      <HostPanel host={pluginHost} panelId={panelId} onClose={closePanel} />
                    </AppContextProvider>
                  </div>
                </div>
              ) : (
                <>
                  {/*
                   * 中间窗口页签条（编辑器 / 代码编辑 / 浏览器）。
                   * 三个 pane 全部常驻挂载、用 hidden 切换：编辑器带着策疏草稿状态，
                   * 切走再切回不能丢；代码/浏览器首访才挂（visitedTabs），避免启动成本。
                   */}
                  <nav className="middle-tabs" data-testid="middle-tabs" aria-label="中间窗口页签">
                    {MIDDLE_TABS.map((tab) => (
                      <button
                        key={tab.id}
                        type="button"
                        className={`middle-tab${middleTab === tab.id ? ' active' : ''}`}
                        title={tab.title}
                        aria-current={middleTab === tab.id}
                        data-testid={`middle-tab-${tab.id}`}
                        onClick={() => switchMiddleTab(tab.id)}
                      >
                        {tab.label}
                      </button>
                    ))}
                  </nav>
                  <div className="middle-tab-body">
                    <div className="middle-tab-pane" hidden={middleTab !== 'editor'}>
                      {ceshuHomeVisible ? (
                        <CeshuHomePanel
                          summaries={ceshuList}
                          activeId={activeCeshuId}
                          onOpen={handleOpenCeshu}
                          onChanged={() => void reloadCeshuList()}
                          onDeleted={(deletedId) => {
                            setActiveCeshuId((current) => (current === deletedId ? null : current))
                          }}
                        />
                      ) : (
                        <CeshuView
                          ceshuId={activeCeshuId}
                          onChanged={() => void reloadCeshuList()}
                          onSelect={handleOpenCeshu}
                          onGameStyleChange={handleGameStyleChange}
                          types={types}
                          gameStyle={gameStyle}
                          onBack={() => setCeshuHomeVisible(true)}
                          jumpTarget={jumpTarget}
                          dataEpoch={dataEpoch}
                          onEditType={handleEditType}
                          onTypesChanged={setTypes}
                          onShowReferences={handleShowReferences}
                          onJumpHandled={handleJumpHandled}
                          onJumpMissed={handleJumpMissed}
                        />
                      )}
                    </div>
                    {visitedTabs.has('data') && (
                      <div className="middle-tab-pane" hidden={middleTab !== 'data'}>
                        <DataEditorPanel
                          types={types}
                          gameStyle={gameStyle}
                          onEditType={handleEditType}
                          onShowReferences={handleShowReferences}
                        />
                      </div>
                    )}
                    {visitedTabs.has('code') && (
                      <div className="middle-tab-pane" hidden={middleTab !== 'code'}>
                        <CodePanel />
                      </div>
                    )}
                    {visitedTabs.has('browser') && (
                      <div className="middle-tab-pane" hidden={middleTab !== 'browser'}>
                        <BrowserPanel />
                      </div>
                    )}
                  </div>
                </>
              )}
            </div>
            {/* 右栏拖拽分隔条：拖动改宽，双击复位到 25% */}
            <div
              className="ai-dock-resizer"
              role="separator"
              aria-orientation="vertical"
              aria-label="调整 AI 停靠栏宽度"
              title="拖拽调整宽度，双击复位"
              data-testid="ai-dock-resizer"
              onMouseDown={startDockResize}
              onDoubleClick={resetDockWidth}
            />
            <aside className="ai-dock" style={{ width: aiDockWidth }} data-testid="ai-dock">
              <DigitalPanel onOpenCapabilities={() => runCommand('agentEditor.open')} />
            </aside>
          </div>

          {/* Toast 宿主：absolute 浮层，不占布局空间 */}
          <ToastHost />
          <footer className="statusbar">
            {info ? (
              <>
                <span>版本 {info.version}</span>
                <span>类型 {types.length} 种</span>
                <span>数据：SQLite（{info.dbPath}）</span>
                <button
                  type="button"
                  className="btn slim"
                  data-testid="plugins-open"
                  title="插件中心：查看已注册插件（dsh 风格清单 + 启用/禁用）"
                  onClick={() => openPanel('plugins.panel')}
                >
                  插件
                </button>
              </>
            ) : (
              <span>正在读取应用信息…</span>
            )}
            <button
              type="button"
              className="btn slim"
              data-testid="theme-toggle"
              style={{ marginLeft: 'auto' }}
              title="切换深色 / 浅色主题（偏好会自动保存）"
              onClick={() => toggleTheme()}
            >
              {theme === 'dark' ? '☀️ 浅色' : '🌙 深色'}
            </button>
            {/*
              快捷键提示。
              **只列 TS 真实注册的快捷键**：旧版 提示含 `Ctrl+S保存`，但 TS 的「保存」是
              章节草稿级、刻意不做整文档保存（见 roadmap E30 的诚实边界），没有 `Ctrl+S`
              —— 照抄提示文案等于给一个按了没反应的键做广告，故省。
            */}
            <span className="statusbar-hint" data-testid="statusbar-shortcuts">
              Ctrl+Z 撤销 · Ctrl+Y 重做
            </span>
          </footer>
        </div>
      </div>
    </div>
  )
}
