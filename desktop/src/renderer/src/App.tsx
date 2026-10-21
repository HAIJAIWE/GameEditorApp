import { useCallback, useEffect, useState, type ReactNode } from 'react'

import type { CeshuSummary } from '../../shared/ceshuConstants'
import { loadGameStyle, normalizeGameStyleId, saveGameStyle } from '../../shared/config/gameStyle'
import type { AppInfo, DataTypeDef } from '../../shared/types'
import { applyTheme, loadTheme, saveTheme, type ThemeMode } from '../../shared/config/theme'

import AdvancedSearchPanel from './components/AdvancedSearchPanel'
import AboutPanel from './components/AboutPanel'
import AttrSystemPanel from './components/AttrSystemPanel'
import BackupPanel from './components/BackupPanel'
import BatchEditPanel from './components/BatchEditPanel'
import CeshuHomePanel from './components/CeshuHomePanel'
import ClearAllPanel from './components/ClearAllPanel'
import GameDataPreviewPanel from './components/GameDataPreviewPanel'
import CeshuView from './components/CeshuView'
import { type PreviewJumpTarget } from './components/ceshu/CeshuDataPreview'
import DataDiffPanel from './components/DataDiffPanel'
import DigitalPanel from './components/digital/DigitalPanel'
import ImageGenPanel from './components/ImageGenPanel'
import MenuBar from './components/MenuBar'
import QuickCreatePanel from './components/QuickCreatePanel'
import ReferencesPanel, { type ReferenceTarget } from './components/ReferencesPanel'
import RelationGraphPanel from './components/RelationGraphPanel'
import ShortcutsPanel from './components/ShortcutsPanel'
import CleanupImagesPanel from './components/CleanupImagesPanel'
import KeywordTemplatePanel from './components/KeywordTemplatePanel'
import AgentEditorPanel from './components/AgentEditorPanel'
import AttributeChartPanel from './components/AttributeChartPanel'
import OnboardingPanel from './components/OnboardingPanel'
import SettingsPanel from './components/SettingsPanel'
import StatisticsPanel from './components/StatisticsPanel'
import ToastHost from './components/ToastHost'
import TypeEditorPanel from './components/TypeEditorPanel'
import { useDataTransfer, useUndoRedo } from './hooks/useAppActions'
import { toErrorMessage } from './appUtils'

/**
 * 顶层「面板浮层」的键：这些能力原先挂在下线前的「数据表视图」工具栏上，
 * 现统一由菜单栏唤起，主区内**同时最多只渲染一个**（互斥，对齐 PyQt 的单中央堆栈）。
 */
type OverlayPanel =
  | 'typeEditor'
  | 'attrSystem'
  | 'stats'
  | 'advancedSearch'
  | 'dataDiff'
  | 'backup'
  | 'imageGen'
  | 'quickCreate'
  | 'batch'
  | 'references'
  | 'relationGraph'
  | 'gameDataPreview'
  | 'shortcuts'
  | 'about'
  | 'clearAll'
  | 'settings'
  | 'cleanupImages'
  | 'keywordTemplates'
  | 'agentEditor'
  | 'attributeChart'
  | 'onboarding'

/** 浮层头部标题（与菜单项一致，便于用户确认当前打开的是哪个能力） */
const PANEL_TITLES: Record<OverlayPanel, string> = {
  typeEditor: '字段结构编辑器',
  attrSystem: '属性系统编辑器',
  stats: '游戏数据统计',
  advancedSearch: '高级搜索',
  dataDiff: '数据对比',
  backup: '备份管理',
  imageGen: 'AI 生图',
  quickCreate: '快速创建向导',
  batch: '批量修改数据',
  references: '数据关联预览',
  relationGraph: '关系图',
  gameDataPreview: '游戏数据预览',
  shortcuts: '快捷键参考',
  about: '关于墨白编辑器',
  clearAll: '清空所有数据',
  settings: '设置',
  cleanupImages: '清理未使用图片',
  keywordTemplates: '关键词模板配置',
  agentEditor: '智能体可用能力',
  attributeChart: '属性分布图表',
  onboarding: '快速入门'
}

/**
 * 顶层外壳（Phase B：对齐 PyQt 的信息架构）。
 *
 * 设计要点（对应 PyQt `ui/layout_builder.py::_build_three_column` + `ui/main_window.py`）：
 * - **无左侧栏**：所有能力走顶部菜单栏；库选择与「设置 / 智能体 / AI」按钮挂在菜单栏右侧角部件。
 * - 中央是**单栈**：策划书首页 ↔ 策划书编辑器（编辑器内嵌数据预览面板且常驻），默认落在首页。
 * - 右侧 `.ai-dock` 为常驻数字员工停靠栏（单一实例）。
 * - 底部状态栏（版本 / 类型数 / 数据库路径 / 主题切换）常驻。
 */
export default function App() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [types, setTypes] = useState<DataTypeDef[]>([])
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  /** 撤销/重做（状态 + 三个动作）：内聚单元，见 hooks/useAppActions */
  const { undoUi, refreshUndo, performUndo, performRedo } = useUndoRedo(setNotice, setError)
  /** 主区内当前打开的浮层面板（null = 未打开，渲染策划书首页/编辑器） */
  const [panel, setPanel] = useState<OverlayPanel | null>(null)
  /** 主题（深/浅）：持久化在 localStorage，随会话保留；启动时由 main.tsx 预应用以避免闪屏 */
  const [theme, setTheme] = useState<ThemeMode>(() => loadTheme())

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

  const [ceshuList, setCeshuList] = useState<CeshuSummary[]>([])
  const [activeCeshuId, setActiveCeshuId] = useState<string | null>(null)
  /** 策划书首页卡片视图：默认落在首页（对齐 PyQt `_center_stack.setCurrentWidget(ceshu_home)`） */
  const [ceshuHomeVisible, setCeshuHomeVisible] = useState(true)

  /**
   * 活跃游戏风格 id（术语风格）。用于条目表单的字段标签术语替换
   * （对应 Python `style_manager` 的**全局单例** `_active_style`；TS 无全局可变态，落在 App state）。
   *
   * 触发方式（两条，与 Python 对齐 + 一处有意增强）：
   * - 打开某份策划书时由 `CeshuView` 回填：优先 `doc.style`（用户显式选过），否则由 meta 文本推断（Python 行为）
   * - 工具栏下拉手工切换（**Python 无此入口**；Python 只能靠推断，且推断不出时无从设置）
   * `''` = 原始术语（不替换）。
   */
  const [gameStyle, setGameStyle] = useState<string>(() => loadGameStyle())
  /** 引用面板的目标条目；由「高级搜索 → 点击结果跳转」回填，供菜单「数据关联预览」打开引用面板 */
  const [refTarget, setRefTarget] = useState<ReferenceTarget | null>(null)
  /** 「字段结构编辑器」打开时要预选的类型；由条目表单的「更多 ▸」回填，菜单入口保持默认（第一个类型） */
  const [typeEditorTarget, setTypeEditorTarget] = useState<string | null>(null)
  /**
   * 「快速创建向导」的目标类型：由「快速入门」的快捷操作卡回填（点「创建角色」→ `role`）。
   * 菜单入口保持默认（null → 第一个类型）；每次从菜单打开都会清掉，避免上次的选择粘住。
   */
  const [quickCreateTarget, setQuickCreateTarget] = useState<string | null>(null)
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
   * Esc 关闭当前浮层面板（对齐 PyQt 的 QDialog 默认行为：`Esc` = 取消/关闭）。
   * TS 的浮层是 div 不是 QDialog，不注册这个键就关不掉 —— 属于交互缺失而非风格差异。
   * 已在输入框/下拉里按 Esc 的先由各自处理（事件冒泡到这里时浮层多半也该关，故不额外判断）。
   */
  useEffect(() => {
    if (panel === null) return undefined
    const onKeyDown = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      setPanel(null)
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [panel])

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

  /** 切换主题：翻转深/浅并持久化（functional update 避免闭包取到旧值） */
  const toggleTheme = useCallback((): void => {
    setTheme((prev) => {
      const next: ThemeMode = prev === 'dark' ? 'light' : 'dark'
      saveTheme(next)
      return next
    })
  }, [])

  /**
   * 「清空所有数据」完成后的刷新（对齐 PyQt `clear_all_data` 里的 `_refresh_all_tabs()`）。
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
      setPanel(null)
      refreshUndo()
    },
    [refreshUndo]
  )

  /**
   * 打开浮层面板（菜单入口）。
   * 需要「一个类型」才能工作的面板（快速创建 / 批量）若无可用类型则只给 notice。
   * 「数据关联预览」无目标时不打开空面板，改为引导到「高级搜索」先完成定位（保证入口永不灰死）。
   */
  const openPanel = (kind: OverlayPanel): void => {
    if ((kind === 'quickCreate' || kind === 'batch') && firstType === null) {
      setNotice('当前没有可用的数据类型（schema 为空），请先在「字段结构编辑器」中新增类型')
      return
    }
    if (kind === 'references' && refTarget === null) {
      setNotice('请先在「高级搜索」中搜索并点击一条结果完成定位，随后即可查看其引用关系')
      setPanel('advancedSearch')
      return
    }
    setPanel(kind)
  }

  /**
   * 「快速入门」面板派发的动作 → App 级导航（对齐 Python `HomeWidget.action_triggered`
   * 到各主窗口 handler 的映射）。
   *
   * 有意省略 Python 数据概览头的「⚙ 管理显示类型」：它唯一的消费者 `TypeVisibilityPanel`
   * 在 TS 已随侧栏刻意下线（见下方 renderPanel 注释），PyQt 亦无等价物 —— 宁缺勿错。
   * 「查看关联」对齐 PyQt `main_window.py:1200`（`view_relations` → `_show_relation_graph()`），
   * 打开**关系图**面板（自带类型/主体选择器，无需先定位目标条目）。
   */
  const handleOnboardingAction = (actionId: string, dataType: string): void => {
    switch (actionId) {
      case 'create_role':
      case 'create_monster':
      case 'create_skill':
      case 'create_equip':
        setQuickCreateTarget(dataType)
        setPanel('quickCreate')
        return
      case 'batch_create':
        // 复用 openPanel 对「无类型」的同一 guard 与文案（不另造提示）
        if (firstType === null) {
          setNotice('当前没有可用的数据类型（schema 为空），请先在「字段结构编辑器」中新增类型')
        } else {
          setPanel('batch')
        }
        return
      case 'view_relations':
        // 对齐 Python `main_window.py:1200`：`view_relations` → `_show_relation_graph()`。
        // 关系图面板自带类型/主体选择器，无需先定位目标条目（旧行为弹去高级搜索是偏差，已改正）。
        openPanel('relationGraph')
        return
      case 'onboarding_library':
        setNotice('在界面右上角「当前库」处可切换或新建游戏库')
        return
      case 'onboarding_types':
        setTypeEditorTarget(null)
        setPanel('typeEditor')
        return
      case 'onboarding_data':
        if (activeCeshuId === null) {
          setNotice('请先打开一本策划书…')
          setCeshuHomeVisible(true)
          setPanel(null)
        } else {
          // 对齐 Python `_goto_data_design`：离开浮层、进入策划书编辑器的数据设计区
          setPanel(null)
          setCeshuHomeVisible(false)
        }
        return
      case 'onboarding_ceshu':
        setPanel(null)
        setCeshuHomeVisible(true)
        return
      case 'onboarding_ai':
        setNotice('AI 助手在界面右侧常驻栏，直接输入即可')
        return
      case 'stats':
        openPanel('stats')
        return
      default:
        return
    }
  }

  /**
   * 引用/搜索跳转：切到策划书编辑器并下发跳转目标以定位条目
   * （对齐 PyQt `main_window._goto_data_design` / `preview_panel.focus_first_editor`）。
   * 同时记录 refTarget，使「数据关联预览」可以直接打开该条目的引用关系。
   */
  const handleJump = (type: string, itemId: string, name: string): void => {
    setRefTarget({ type, id: itemId, name })
    setCeshuHomeVisible(false)
    setPanel(null)
    // 跳转成功即清掉此前的引导类 notice（如「请先在「高级搜索」中…完成定位」），
    // 否则用户已定位到条目、顶部却仍挂着要求他去定位的提示。
    // 若目标未命中，预览面板随后会调 onJumpMissed 写入新的提示。
    setNotice(null)
    setJumpTarget((prev) => ({ type, itemId, name, nonce: (prev?.nonce ?? 0) + 1 }))
  }

  /** 跳转已处理（预览面板点击标签页 / 未命中被驳回）：清空 jumpTarget，避免重复触发 */
  const handleJumpHandled = (): void => setJumpTarget(null)

  /** 条目表单「更多 ▸ → 编辑当前类型字段结构」：打开字段结构编辑器并预选该类型 */
  const handleEditType = (typeId: string): void => {
    setTypeEditorTarget(typeId)
    setPanel('typeEditor')
  }

  /**
   * 条目表单「更多 ▸ → 查看此项的引用关系」：先落 `refTarget` 再开面板。
   *
   * ⚠️ **不能走 `openPanel('references')`** —— 那条通道带「无 refTarget 则改跳高级搜索」的守卫，
   * 而同一批次内 `setRefTarget` 尚未生效，守卫会读到旧的 `null`，把用户弹去高级搜索。
   */
  const handleShowReferences = (target: ReferenceTarget): void => {
    setRefTarget(target)
    setPanel('references')
  }

  /** 跳转未命中：目标类型不在当前策划书启用的游戏系统里，给出可理解的提示 */
  const handleJumpMissed = (name: string): void => {
    setNotice(`该条目「${name}」所属的数据类型未在当前策划书启用的游戏系统中，无法定位`)
  }

  /**
   * 注：原先这里有一个 `notImplemented(label)` 轻提示，供「点了只报尚未实现」的菜单占位项复用。
   * E57 删掉最后两个此类占位项（PyQt 侧的「内容关联管理 / 关联可视化」实为死入口，见 `MenuBar.tsx`）
   * 后该函数已无消费者，一并移除 —— 菜单里不再有「点了没反应」的项。
   */

  /** 批量操作完成：提示结果、关闭面板并刷新增撤状态 */
  const handleBatchApplied = (message: string): void => {
    setNotice(message)
    setPanel(null)
    refreshUndo()
  }

  /** 快速创建完成：提示结果、关闭面板并刷新增撤状态 */
  const handleQuickCreated = (message: string): void => {
    setNotice(message)
    setPanel(null)
    refreshUndo()
  }

  /** 数据导入 / 导出（JSON / CSV / Excel / 引擎格式）：内聚单元，见 hooks/useAppActions */
  const { importJson, exportJson, importCsv, exportCsv, importExcel, exportExcel, engineExport, exportSnapshot } =
    useDataTransfer(setNotice, setError, refreshUndo)

  /** 退出：关闭渲染进程窗口（Electron 主窗口关闭即退出） */
  const handleQuit = (): void => {
    try {
      window.close()
    } catch {
      /* 忽略：无主窗口上下文时静默 */
    }
  }

  /** 打开某份策划书（同时离开首页卡片视图） */
  const handleOpenCeshu = (id: string): void => {
    setActiveCeshuId(id)
    setCeshuHomeVisible(false)
  }

  /** 渲染当前打开的浮层面板（互斥；面板 props 里来自已下线数据态的项一律给兜底值） */
  const renderPanel = (): ReactNode => {
    switch (panel) {
      case 'typeEditor':
        return (
          <TypeEditorPanel
            types={types}
            initialTypeId={typeEditorTarget ?? undefined}
            onSaved={(saved) => setTypes(saved)}
            onClose={() => setPanel(null)}
          />
        )
      case 'attrSystem':
        return <AttrSystemPanel onClose={() => setPanel(null)} />
      case 'stats':
        return <StatisticsPanel types={types} onClose={() => setPanel(null)} />
      case 'advancedSearch':
        return <AdvancedSearchPanel types={types} onJump={handleJump} onClose={() => setPanel(null)} />
      case 'dataDiff':
        return <DataDiffPanel onClose={() => setPanel(null)} />
      case 'backup':
        return <BackupPanel onRestored={() => refreshUndo()} onClose={() => setPanel(null)} />
      case 'imageGen':
        return <ImageGenPanel onClose={() => setPanel(null)} />
      case 'gameDataPreview':
        return <GameDataPreviewPanel />
      case 'shortcuts':
        return <ShortcutsPanel />
      case 'about':
        return <AboutPanel version={info?.version ?? null} />
      case 'clearAll':
        return <ClearAllPanel onCleared={handleDataCleared} />
      case 'settings':
        return <SettingsPanel />
      case 'cleanupImages':
        return <CleanupImagesPanel />
      case 'keywordTemplates':
        return <KeywordTemplatePanel />
      case 'agentEditor':
        return <AgentEditorPanel />
      case 'attributeChart':
        return <AttributeChartPanel types={types} />
      case 'onboarding':
        return <OnboardingPanel types={types} onAction={handleOnboardingAction} onClose={() => setPanel(null)} />
      case 'quickCreate':
        return (
          <QuickCreatePanel
            key={`${quickCreateTarget ?? firstType ?? ''}:quick`}
            type={quickCreateTarget ?? firstType ?? ''}
            types={types}
            onCreated={handleQuickCreated}
            onClose={() => setPanel(null)}
          />
        )
      case 'batch':
        return (
          <BatchEditPanel
            key={`${firstType ?? ''}:batch`}
            type={firstType ?? ''}
            typeDef={types.find((def) => def.id === firstType) ?? null}
            types={types}
            onApplied={handleBatchApplied}
            onClose={() => setPanel(null)}
          />
        )
      // 注：原「数据可见类型」面板（TypeVisibilityPanel）不再接线——它唯一的作用是过滤
      // 已随侧栏一并下线的类型列表，且 PyQt 无对应功能。组件文件保留（迁移留痕），但不再有入口。
      case 'references':
        return refTarget ? (
          <ReferencesPanel target={refTarget} types={types} onJump={handleJump} onClose={() => setPanel(null)} />
        ) : null
      case 'relationGraph':
        return <RelationGraphPanel types={types} onJump={handleJump} />
      default:
        return null
    }
  }

  return (
    <div className="app">
      <MenuBar
        canUndo={undoUi.canUndo}
        canRedo={undoUi.canRedo}
        actions={{
          importJson,
          /*
           * 「打开」/「保存」/「批量导入」/「批量导出」四项与 `importJson`/`exportJson`
           * **共用同一对 handler**（`hooks/useAppActions.ts::useDataTransfer` 已完整实现）。
           * 语义澄清：这里的「打开/保存」是**整个数据仓库的 JSON 文件 I/O**
           * （PyQt `main_window.py:710-753`），**不是**编辑器里章节级的「保存本章」。
           * 不抽包装层：抽了只是给同一个函数换两个名字，不产生行为差异（铁律：不过度开发）。
           *
           * ⚠️ 已知的 PyQt 语义差异（详见 `MenuBar.tsx` 的 `MenuActions.open` 注释）：
           * PyQt「打开」是整库替换 + 记忆 `current_file`，「批量导入」会重生成 id；
           * 而 `importLegacy` 是按 id upsert 的合并、每次都问路径。补齐需新增 IPC，不在本轮范围。
           */
          open: importJson,
          save: exportJson,
          batchImport: importJson,
          batchExport: exportJson,
          importCsv,
          importExcel,
          exportJson,
          exportCsv,
          exportExcel,
          batchEdit: () => openPanel('batch'),
          engineExport: (engine) => void engineExport(engine),
          exportSnapshot: (format) => void exportSnapshot(format),
          backup: () => openPanel('backup'),
          undo: () => void performUndo(),
          redo: () => void performRedo(),
          quickCreate: () => {
            // 菜单入口：清掉「快速入门」快捷卡可能留下的目标类型，回到默认（第一个类型）
            setQuickCreateTarget(null)
            openPanel('quickCreate')
          },
          references: () => openPanel('references'),
          relationGraph: () => openPanel('relationGraph'),
          gameDataPreview: () => openPanel('gameDataPreview'),
          dataDiff: () => openPanel('dataDiff'),
          stats: () => openPanel('stats'),
          attrSystem: () => openPanel('attrSystem'),
          fieldEditor: () => {
            // 菜单入口 = 通用字段结构编辑器，清掉条目表单可能留下的预选类型
            setTypeEditorTarget(null)
            openPanel('typeEditor')
          },
          advancedSearch: () => openPanel('advancedSearch'),
          imageGen: () => openPanel('imageGen'),
          clearAll: () => openPanel('clearAll'),
          shortcuts: () => openPanel('shortcuts'),
          about: () => openPanel('about'),
          settings: () => openPanel('settings'),
          cleanupUnusedImages: () => openPanel('cleanupImages'),
          keywordTemplates: () => openPanel('keywordTemplates'),
          agentEditor: () => openPanel('agentEditor'),
          attributeChart: () => openPanel('attributeChart'),
          onboarding: () => openPanel('onboarding'),
          aiPanel: () => setNotice('AI 助手已在右侧常驻'),
          quit: handleQuit
        }}
      />
      <div className="app-body">
        <div className="main">
          <div className="main-body">
            <div className="main-area">
              {error && <div className="error-banner">{error}</div>}
              {notice && <div className="notice-banner">{notice}</div>}
              {panel !== null ? (
                <div className="panel-overlay">
                  <div className="panel-overlay-header">
                    <span className="chapter-form-title">{PANEL_TITLES[panel]}</span>
                    <button type="button" className="btn" data-testid="panel-close" onClick={() => setPanel(null)}>
                      关闭
                    </button>
                  </div>
                  <div className="panel-overlay-body">{renderPanel()}</div>
                </div>
              ) : ceshuHomeVisible ? (
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
                  onShowReferences={handleShowReferences}
                  onJumpHandled={handleJumpHandled}
                  onJumpMissed={handleJumpMissed}
                />
              )}
            </div>
            <aside className="ai-dock" data-testid="ai-dock">
              <DigitalPanel />
            </aside>
          </div>

          {/* Toast 宿主：absolute 浮层，不占布局空间（对齐 PyQt ui/components/toast.py） */}
          <ToastHost />
          <footer className="statusbar">
            {info ? (
              <>
                <span>版本 {info.version}</span>
                <span>类型 {types.length} 种</span>
                <span>数据：SQLite（{info.dbPath}）</span>
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
              快捷键提示（对齐 PyQt `main_window.py:566-569` 的常驻 `shortcut_label`）。
              **只列 TS 真实注册的快捷键**：PyQt 提示含 `Ctrl+S保存`，但 TS 的「保存」是
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
