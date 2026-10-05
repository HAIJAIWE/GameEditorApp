import { useCallback, useEffect, useState, type ReactNode } from 'react'

import type { CeshuSummary } from '../../shared/ceshuConstants'
import { loadGameStyle, normalizeGameStyleId, saveGameStyle } from '../../shared/gameStyle'
import type { AppInfo, DataTypeDef, ImportSummary } from '../../shared/types'
import { applyTheme, loadTheme, saveTheme, type ThemeMode } from '../../shared/theme'
import { buildAiSeedPrompt } from '../../shared/aiSeedPrompt'
import type { EngineExportInput } from '../../shared/schemas'

import AdvancedSearchPanel from './components/AdvancedSearchPanel'
import AttrSystemPanel from './components/AttrSystemPanel'
import BackupPanel from './components/BackupPanel'
import BatchEditPanel from './components/BatchEditPanel'
import CeshuHomePanel from './components/CeshuHomePanel'
import CeshuView from './components/CeshuView'
import { type PreviewJumpTarget } from './components/ceshu/CeshuDataPreview'
import DataDiffPanel from './components/DataDiffPanel'
import DigitalPanel from './components/digital/DigitalPanel'
import ImageGenPanel from './components/ImageGenPanel'
import MenuBar from './components/MenuBar'
import QuickCreatePanel from './components/QuickCreatePanel'
import ReferencesPanel, { type ReferenceTarget } from './components/ReferencesPanel'
import StatisticsPanel from './components/StatisticsPanel'
import TypeEditorPanel from './components/TypeEditorPanel'

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function formatImportSummary(summary: ImportSummary): string {
  const unknownKeys = Object.keys(summary.unknownTypes)
  const unknownNote =
    unknownKeys.length > 0
      ? `；另有 ${unknownKeys.length} 个未收录类型键（数据已保留）：${unknownKeys.slice(0, 6).join('、')}`
      : ''
  return `导入完成：新增 ${summary.imported} 条，更新 ${summary.updated} 条，跳过 ${summary.skipped} 条${unknownNote}`
}

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
  references: '数据关联预览'
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
  /** 撤销/重做状态（菜单项 disabled 与 tooltip 标签用） */
  const [undoUi, setUndoUi] = useState<{ canUndo: boolean; canRedo: boolean; nextUndo: string | null; nextRedo: string | null }>({
    canUndo: false,
    canRedo: false,
    nextUndo: null,
    nextRedo: null
  })
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
   * 待投递给右侧 AI 面板的一条播种消息（由策划书首页的 AI 入口卡触发）。
   * App 只负责「组装引导前缀 + 递增 nonce」，真正的发送由 `DigitalPanel` 消费 `seed` 完成
   * （对齐 PyQt `home_view.py::_on_ai_send`：把 guided_text 塞进 digital_panel 输入框并发送）。
   */
  const [aiSeed, setAiSeed] = useState<{ text: string; nonce: number } | null>(null)
  /** 跳转定位目标（含递增 nonce 以支持重复跳转同一类型）；命中启用编辑器时在策划书预览面板定位条目 */
  const [jumpTarget, setJumpTarget] = useState<PreviewJumpTarget | null>(null)

  /** 浮层面板需要「一个类型」作为载体时使用的兜底：schema 里第一个类型 */
  const firstType = types[0]?.id ?? null

  /** 刷新增撤/重做状态（数据变更后调用，保证菜单项 disabled 与标签正确） */
  const refreshUndo = useCallback((): void => {
    void window.mbApi.data
      .undoState()
      .then(setUndoUi)
      .catch(() => undefined)
  }, [])

  /** 撤销：执行后刷新状态与按钮，并用 notice 反馈（对齐 AI 回滚风格） */
  const performUndo = useCallback(async (): Promise<void> => {
    try {
      const result = await window.mbApi.data.undo()
      const state = await window.mbApi.data.undoState()
      setUndoUi(state)
      const parts: string[] = []
      if (result.applied > 0) parts.push(`已撤销 ${result.applied} 项`)
      else if (result.failed.length === 0 && result.skipped.length === 0) parts.push('没有可撤销的操作')
      if (result.failed.length > 0) parts.push(`${result.failed.length} 项失败：${result.failed.map((f) => f.name).join('、')}`)
      if (result.skipped.length > 0)
        parts.push(`${result.skipped.length} 项跳过：${result.skipped.map((s) => `${s.name}（${s.reason}）`).join('、')}`)
      setNotice(parts.join('。') || '已撤销')
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }, [])

  /** 重做：对称于撤销 */
  const performRedo = useCallback(async (): Promise<void> => {
    try {
      const result = await window.mbApi.data.redo()
      const state = await window.mbApi.data.undoState()
      setUndoUi(state)
      const parts: string[] = []
      if (result.applied > 0) parts.push(`已重做 ${result.applied} 项`)
      else if (result.failed.length === 0 && result.skipped.length === 0) parts.push('没有可重做的操作')
      if (result.failed.length > 0) parts.push(`${result.failed.length} 项失败：${result.failed.map((f) => f.name).join('、')}`)
      if (result.skipped.length > 0)
        parts.push(`${result.skipped.length} 项跳过：${result.skipped.map((s) => `${s.name}（${s.reason}）`).join('、')}`)
      setNotice(parts.join('。') || '已重做')
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }, [])

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

  // 初始化撤销/重做状态（启动时填充菜单项 disabled 与标签）
  useEffect(() => {
    void window.mbApi.data.undoState().then(setUndoUi).catch(() => undefined)
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

  /**
   * 首页 AI 入口卡发送：把用户输入包成引导前缀后投给右侧 AI 面板。
   * 空白输入返回 `null` → 直接忽略（对齐 Python `if not text: return`）。
   */
  const handleSendToAi = (text: string): void => {
    const prompt = buildAiSeedPrompt(text)
    if (prompt === null) return
    setAiSeed((prev) => ({ text: prompt, nonce: (prev?.nonce ?? 0) + 1 }))
  }

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

  /** 浮层通知的「尚未实现」轻提示（供菜单项复用） */
  const notImplemented = (label: string): void => setNotice(`「${label}」尚未在 TS 版实现`)

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

  const handleImportLegacy = async (): Promise<void> => {
    try {
      setError(null)
      setNotice(null)
      const chosen = await window.mbApi.dialog.chooseJsonFile()
      if (!chosen.path) return
      const summary = await window.mbApi.data.importLegacy({ path: chosen.path })
      setNotice(formatImportSummary(summary))
      refreshUndo()
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }

  const handleExportLegacy = async (): Promise<void> => {
    try {
      setError(null)
      setNotice(null)
      const chosen = await window.mbApi.dialog.chooseSaveJsonFile()
      if (!chosen.path) return
      const summary = await window.mbApi.data.exportLegacy({ path: chosen.path })
      setNotice(`已导出 ${summary.totalItems} 条数据：${summary.filePath}`)
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }

  const handleImportCsv = async (): Promise<void> => {
    try {
      setError(null)
      setNotice(null)
      const chosen = await window.mbApi.dialog.chooseCsvFile()
      if (!chosen.path) return
      const summary = await window.mbApi.data.importCsv({ path: chosen.path })
      setNotice(formatImportSummary(summary))
      refreshUndo()
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }

  const handleExportCsv = async (): Promise<void> => {
    try {
      setError(null)
      setNotice(null)
      const chosen = await window.mbApi.dialog.chooseExportDir()
      if (!chosen.path) return
      const summary = await window.mbApi.data.exportCsv({ dir: chosen.path })
      setNotice(`已导出 ${summary.files.length} 个 CSV 文件（共 ${summary.totalItems} 条）到 ${summary.dir}`)
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }

  const handleImportExcel = async (): Promise<void> => {
    try {
      setError(null)
      setNotice(null)
      const chosen = await window.mbApi.dialog.chooseExcelFile()
      if (!chosen.path) return
      const summary = await window.mbApi.data.importExcel({ path: chosen.path })
      setNotice(formatImportSummary(summary))
      refreshUndo()
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }

  const handleExportExcel = async (): Promise<void> => {
    try {
      setError(null)
      setNotice(null)
      const chosen = await window.mbApi.dialog.chooseExportDir()
      if (!chosen.path) return
      const summary = await window.mbApi.data.exportExcel({ dir: chosen.path })
      setNotice(`已导出 ${summary.totalItems} 条数据：${summary.filePath}`)
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }

  /**
   * 引擎数据导出：菜单「导出 → 导出为 XX 格式」按目标引擎各走各的渲染器与扩展名
   * （对齐 PyQt `features/engine_export.py` 的四个独立导出器）。
   * 此前四个菜单项全都硬编码 `engine: 'lua'`，点「导出为 Unity 格式」拿到的是 `.lua`。
   */
  const handleEngineExport = async (engine: EngineExportInput['engine']): Promise<void> => {
    try {
      const api = window.mbApi as unknown as {
        dialog: {
          chooseEngineExportFile: (req: {
            defaultName: string
            engine: EngineExportInput['engine']
          }) => Promise<{ path: string | null }>
        }
        engine: {
          exportData: (req: {
            engine: EngineExportInput['engine']
            path: string
          }) => Promise<{ filePath: string; engine: string; bytes: number }>
        }
      }
      const picked = await api.dialog.chooseEngineExportFile({ defaultName: 'GameData', engine })
      if (picked.path === null) return
      const result = await api.engine.exportData({ engine, path: picked.path })
      setNotice(`已导出 ${result.filePath}（${result.bytes} 字节）`)
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }

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
      case 'quickCreate':
        return (
          <QuickCreatePanel
            key={`${firstType ?? ''}:quick`}
            type={firstType ?? ''}
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
          importJson: handleImportLegacy,
          importCsv: handleImportCsv,
          importExcel: handleImportExcel,
          exportJson: handleExportLegacy,
          exportCsv: handleExportCsv,
          exportExcel: handleExportExcel,
          batchEdit: () => openPanel('batch'),
          engineExport: (engine) => void handleEngineExport(engine),
          backup: () => openPanel('backup'),
          undo: () => void performUndo(),
          redo: () => void performRedo(),
          quickCreate: () => openPanel('quickCreate'),
          references: () => openPanel('references'),
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
          settings: () => notImplemented('设置'),
          agentEditor: () => notImplemented('智能体编辑器'),
          aiPanel: () => setNotice('AI 助手已在右侧常驻'),
          notImplemented,
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
                  onSendToAi={handleSendToAi}
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
                  onEditType={handleEditType}
                  onShowReferences={handleShowReferences}
                  onJumpHandled={handleJumpHandled}
                  onJumpMissed={handleJumpMissed}
                />
              )}
            </div>
            <aside className="ai-dock" data-testid="ai-dock">
              <DigitalPanel seed={aiSeed} />
            </aside>
          </div>

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
