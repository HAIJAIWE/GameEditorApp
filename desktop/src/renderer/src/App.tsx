import { useCallback, useEffect, useMemo, useState } from 'react'

import type { CeshuSummary } from '../../shared/ceshuConstants'
import { filterItemRecords } from '../../shared/dataTableOps'
import { GAME_STYLES, loadGameStyle, normalizeGameStyleId, saveGameStyle } from '../../shared/gameStyle'
import type { AppInfo, DataTypeDef, ImportSummary, ItemRecord } from '../../shared/types'
import { isTypeVisible, loadVisibleTypes, saveVisibleTypes } from '../../shared/visibleTypes'
import { applyTheme, loadTheme, saveTheme, type ThemeMode } from '../../shared/theme'

import AdvancedSearchPanel from './components/AdvancedSearchPanel'
import AttrSystemPanel from './components/AttrSystemPanel'
import BackupPanel from './components/BackupPanel'
import ImageGenPanel from './components/ImageGenPanel'
import MenuBar from './components/MenuBar'
import BatchEditPanel from './components/BatchEditPanel'
import CeshuHomePanel from './components/CeshuHomePanel'
import DataDiffPanel from './components/DataDiffPanel'
import DigitalPanel from './components/digital/DigitalPanel'
import EngineExportButton from './components/EngineExportButton'
import LibraryBar from './components/LibraryBar'
import CeshuView from './components/CeshuView'
import ItemForm from './components/ItemForm'
import QuickCreatePanel from './components/QuickCreatePanel'
import ReferencesPanel, { type ReferenceTarget } from './components/ReferencesPanel'
import StatisticsPanel from './components/StatisticsPanel'
import TypeEditorPanel from './components/TypeEditorPanel'
import TypeVisibilityPanel from './components/TypeVisibilityPanel'

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function itemDisplayName(item: ItemRecord): string {
  const name = item.data['name']
  return typeof name === 'string' && name !== '' ? name : item.id
}

function formatImportSummary(summary: ImportSummary): string {
  const unknownKeys = Object.keys(summary.unknownTypes)
  const unknownNote =
    unknownKeys.length > 0
      ? `；另有 ${unknownKeys.length} 个未收录类型键（数据已保留）：${unknownKeys.slice(0, 6).join('、')}`
      : ''
  return `导入完成：新增 ${summary.imported} 条，更新 ${summary.updated} 条，跳过 ${summary.skipped} 条${unknownNote}`
}

export default function App() {
  const [info, setInfo] = useState<AppInfo | null>(null)
  const [types, setTypes] = useState<DataTypeDef[]>([])
  const [activeType, setActiveType] = useState<string | null>(null)
  const [items, setItems] = useState<ItemRecord[]>([])
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [notice, setNotice] = useState<string | null>(null)
  /** 撤销/重做状态（按钮 disabled 与 tooltip 标签用） */
  const [undoUi, setUndoUi] = useState<{ canUndo: boolean; canRedo: boolean; nextUndo: string | null; nextRedo: string | null }>({
    canUndo: false,
    canRedo: false,
    nextUndo: null,
    nextRedo: null
  })
  const [busy, setBusy] = useState(false)
  const [mode, setMode] = useState<'data' | 'ceshu' | 'digital'>('data')
  /** 主题（深/浅）：持久化在 localStorage，随会话保留；启动时由 main.tsx 预应用以避免闪屏 */
  const [theme, setTheme] = useState<ThemeMode>(() => loadTheme())

  // 窗口状态持久化（迁移 ui/window_state.py 的 last_tab_index）：模式切换时上报主进程，
  // 落进 window-state.json，下次启动恢复。失败静默（不影响功能）。
  useEffect(() => {
    void window.mbApi.app.setWindowMode({ mode }).catch(() => undefined)
  }, [mode])

  // 活跃库切换（A2-2）：主进程已重建全部 store，渲染层直接整页重载——
  // 这样所有视图（数据表/策划书/属性系统/数字员工）都从新库重新拉取，无需逐处写刷新逻辑。
  useEffect(() => {
    const library = (window.mbApi as unknown as { library?: { onChanged?: (h: (p: unknown) => void) => () => void } })
      .library
    if (library?.onChanged === undefined) return undefined
    return library.onChanged(() => {
      window.location.reload()
    })
  }, [])
  const [editorOpen, setEditorOpen] = useState(false)
  const [attrSysOpen, setAttrSysOpen] = useState(false)
  const [ceshuList, setCeshuList] = useState<CeshuSummary[]>([])
  const [activeCeshuId, setActiveCeshuId] = useState<string | null>(null)
  /** 策划书首页卡片视图（显式入口；默认落在编辑器，保持既有单文档优先的落点行为） */
  const [ceshuHomeVisible, setCeshuHomeVisible] = useState(false)

  const fields = activeType ? (types.find((def) => def.id === activeType)?.formFields ?? []) : []
  const selectedItem = items.find((item) => item.id === selectedId) ?? null
  const [query, setQuery] = useState('')
  const [debouncedQuery, setDebouncedQuery] = useState('')
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [batchOpen, setBatchOpen] = useState(false)
  const [quickCreateOpen, setQuickCreateOpen] = useState(false)
  const [statsOpen, setStatsOpen] = useState(false)
  const [advancedSearchOpen, setAdvancedSearchOpen] = useState(false)
  const [dataDiffOpen, setDataDiffOpen] = useState(false)
  const [backupOpen, setBackupOpen] = useState(false)
  const [imageGenOpen, setImageGenOpen] = useState(false)
  const [typeVisibilityOpen, setTypeVisibilityOpen] = useState(false)
  /** 侧栏显示哪些类型（null = 全部）；持久化在 localStorage，随会话保留 */
  const [visibleTypes, setVisibleTypes] = useState<string[] | null>(() => loadVisibleTypes())
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
  const [refTarget, setRefTarget] = useState<ReferenceTarget | null>(null)

  const filteredItems = useMemo(() => filterItemRecords(items, debouncedQuery), [items, debouncedQuery])
  // 仅统计仍然存在的勾选项（重载/删除后失效的 id 不参与批量操作）
  const aliveIds = useMemo(() => new Set(items.map((item) => item.id)), [items])
  const selectedVisibleIds = useMemo(
    () => [...selectedIds].filter((id) => aliveIds.has(id)),
    [selectedIds, aliveIds]
  )
  const allSelected = filteredItems.length > 0 && filteredItems.every((item) => selectedIds.has(item.id))

  /** 事件处理器使用的重新加载（不在 effect 中直接调用，避免级联渲染） */
  const reload = useCallback(async (type: string): Promise<void> => {
    try {
      const list = await window.mbApi.data.listItems({ type })
      setItems(list)
      setError(null)
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }, [])

  /** 刷新增撤/重做状态（数据变更后调用，保证按钮 disabled 与标签正确） */
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
  const reloadCeshuList = useCallback(async (): Promise<void> => {    try {
      const list = await window.mbApi.ceshu.list()
      setCeshuList(list)
      setActiveCeshuId((current) => current ?? list[0]?.id ?? null)
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }, [])

  // 初始化撤销/重做状态（启动时填充按钮 disabled 与标签）
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

  // 加载数据类型 schema（主进程下发，用户可在「字段结构」中编辑并持久化），默认选中第一个类型
  useEffect(() => {
    let cancelled = false
    window.mbApi.schema
      .list()
      .then((list) => {
        if (cancelled) return
        setTypes(list)
        setActiveType((current) => current ?? list[0]?.id ?? null)
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toErrorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [])

  // 切换到策划书模式时加载列表（懒加载，避免启动即访问文件系统）
  useEffect(() => {
    if (mode !== 'ceshu') return
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
  }, [mode])

  // 切换数据类型时加载列表；cancelled 防止快速切换导致的过期响应回写
  useEffect(() => {
    if (!activeType) return
    let cancelled = false
    window.mbApi.data
      .listItems({ type: activeType })
      .then((list) => {
        if (!cancelled) {
          setItems(list)
          setError(null)
        }
      })
      .catch((err: unknown) => {
        if (!cancelled) setError(toErrorMessage(err))
      })
    return () => {
      cancelled = true
    }
  }, [activeType])

  // 搜索防抖：输入停止 150ms 后再过滤列表
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedQuery(query), 150)
    return () => clearTimeout(timer)
  }, [query])

  const selectType = (id: string): void => {
    setSelectedId(null)
    setActiveType(id)
    setQuery('')
    setSelectedIds(new Set())
    setBatchOpen(false)
    setStatsOpen(false)
    setQuickCreateOpen(false)
    setAdvancedSearchOpen(false)
    setDataDiffOpen(false)
    setBackupOpen(false)
    setTypeVisibilityOpen(false)
    setRefTarget(null)
  }

  /** 侧栏显示类型偏好确认：写 localStorage 并即时生效（侧栏过滤在渲染处完成） */
  const handleVisibilityConfirmed = (next: string[] | null): void => {
    setVisibleTypes(next)
    saveVisibleTypes(next)
    setTypeVisibilityOpen(false)
  }

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

  /** 侧栏可见的类型（null = 全部） */
  const visibleTypeDefs = useMemo(
    () => types.filter((def) => isTypeVisible(def.id, visibleTypes)),
    [types, visibleTypes]
  )

  /** 引用跳转：切到目标类型并选中该条目（保留引用面板，便于沿引用链继续查看） */
  const handleJump = (type: string, itemId: string, name: string): void => {
    setRefTarget({ type, id: itemId, name })
    setQuery('')
    setSelectedId(itemId)
    setActiveType(type)
  }

  const toggleSelect = (id: string): void => {
    setSelectedIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  /** 全选/全不选：作用于当前过滤结果（与搜索联动） */
  const toggleSelectAll = (): void => {
    setSelectedIds((current) => {
      const next = new Set(current)
      const allChecked = filteredItems.length > 0 && filteredItems.every((item) => next.has(item.id))
      for (const item of filteredItems) {
        if (allChecked) next.delete(item.id)
        else next.add(item.id)
      }
      return next
    })
  }

  /** 批量操作完成：提示结果、清空勾选、关闭面板并刷新列表 */
  const handleBatchApplied = (message: string): void => {
    setNotice(message)
    setSelectedIds(new Set())
    setBatchOpen(false)
    if (activeType) void reload(activeType)
    refreshUndo()
  }

  const handleQuickCreated = (message: string): void => {
    setNotice(message)
    setQuickCreateOpen(false)
    if (activeType) void reload(activeType)
    refreshUndo()
  }

  const handleCreate = async (): Promise<void> => {
    if (!activeType) return
    setBusy(true)
    try {
      const label = types.find((t) => t.id === activeType)?.name ?? activeType
      const created = await window.mbApi.data.createItem({
        type: activeType,
        data: { name: `${label} ${items.length + 1}` }
      })
      await reload(activeType)
      setSelectedId(created.id)
      refreshUndo()
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const handleDelete = async (id: string): Promise<void> => {
    if (!activeType) return
    try {
      await window.mbApi.data.deleteItem({ id })
      if (selectedId === id) setSelectedId(null)
      await reload(activeType)
      refreshUndo()
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }

  const handleSaved = (updated: ItemRecord): void => {
    setNotice(`已保存：${String(updated.data.name ?? updated.id)}`)
    if (activeType) void reload(activeType)
    refreshUndo()
  }

  const handleImportLegacy = async (): Promise<void> => {
    try {
      setError(null)
      setNotice(null)
      const chosen = await window.mbApi.dialog.chooseJsonFile()
      if (!chosen.path) return
      setBusy(true)
      const summary = await window.mbApi.data.importLegacy({ path: chosen.path })
      setNotice(formatImportSummary(summary))
      if (activeType) await reload(activeType)
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const handleExportLegacy = async (): Promise<void> => {
    try {
      setError(null)
      setNotice(null)
      const chosen = await window.mbApi.dialog.chooseSaveJsonFile()
      if (!chosen.path) return
      setBusy(true)
      const summary = await window.mbApi.data.exportLegacy({ path: chosen.path })
      setNotice(`已导出 ${summary.totalItems} 条数据：${summary.filePath}`)
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const handleImportCsv = async (): Promise<void> => {
    try {
      setError(null)
      setNotice(null)
      const chosen = await window.mbApi.dialog.chooseCsvFile()
      if (!chosen.path) return
      setBusy(true)
      const summary = await window.mbApi.data.importCsv({ path: chosen.path })
      setNotice(formatImportSummary(summary))
      if (activeType) await reload(activeType)
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const handleExportCsv = async (): Promise<void> => {
    try {
      setError(null)
      setNotice(null)
      const chosen = await window.mbApi.dialog.chooseExportDir()
      if (!chosen.path) return
      setBusy(true)
      const summary = await window.mbApi.data.exportCsv({ dir: chosen.path })
      setNotice(`已导出 ${summary.files.length} 个 CSV 文件（共 ${summary.totalItems} 条）到 ${summary.dir}`)
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const handleImportExcel = async (): Promise<void> => {
    try {
      setError(null)
      setNotice(null)
      const chosen = await window.mbApi.dialog.chooseExcelFile()
      if (!chosen.path) return
      setBusy(true)
      const summary = await window.mbApi.data.importExcel({ path: chosen.path })
      setNotice(formatImportSummary(summary))
      if (activeType) await reload(activeType)
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  const handleExportExcel = async (): Promise<void> => {
    try {
      setError(null)
      setNotice(null)
      const chosen = await window.mbApi.dialog.chooseExportDir()
      if (!chosen.path) return
      setBusy(true)
      const summary = await window.mbApi.data.exportExcel({ dir: chosen.path })
      setNotice(`已导出 ${summary.totalItems} 条数据：${summary.filePath}`)
    } catch (err) {
      setError(toErrorMessage(err))
    } finally {
      setBusy(false)
    }
  }

  /** 引擎代码导出（Lua）：菜单「导出 → 导出为 * 格式」共用此逻辑（与 EngineExportButton 等价） */
  const handleEngineExport = async (): Promise<void> => {
    try {
      const api = window.mbApi as unknown as {
        dialog: { chooseEngineExportFile: (req: { defaultName: string }) => Promise<{ path: string | null }> }
        engine: { exportData: (req: { engine: 'lua'; path: string }) => Promise<{ filePath: string; engine: string; bytes: number }> }
      }
      const picked = await api.dialog.chooseEngineExportFile({ defaultName: 'GameData' })
      if (picked.path === null) return
      const result = await api.engine.exportData({ engine: 'lua', path: picked.path })
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

  /** 字段结构保存后：刷新类型列表；当前类型被删除时回退到第一个 */
  const handleSchemaSaved = (saved: DataTypeDef[]): void => {
    setTypes(saved)
    setActiveType((current) => (saved.some((def) => def.id === current) ? current : (saved[0]?.id ?? null)))
  }

  const handleCreateCeshu = async (): Promise<void> => {
    try {
      setError(null)
      setNotice(null)
      const created = await window.mbApi.ceshu.create({ name: '', scope: 'full' })
      await reloadCeshuList()
      handleOpenCeshu(created.ceshu_id)
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }

  /** 打开某份策划书（同时离开首页卡片视图） */
  const handleOpenCeshu = (id: string): void => {
    setActiveCeshuId(id)
    setCeshuHomeVisible(false)
  }

  return (
    <div className="app">
      <MenuBar
        canUndo={undoUi.canUndo}
        canRedo={undoUi.canRedo}
        hasSelection={!!selectedItem}
        actions={{
          importJson: handleImportLegacy,
          importCsv: handleImportCsv,
          importExcel: handleImportExcel,
          exportJson: handleExportLegacy,
          exportCsv: handleExportCsv,
          exportExcel: handleExportExcel,
          batchEdit: () => setBatchOpen(true),
          engineExport: () => void handleEngineExport(),
          backup: () => setBackupOpen(true),
          undo: () => void performUndo(),
          redo: () => void performRedo(),
          quickCreate: () => setQuickCreateOpen(true),
          references: () => {
            if (!selectedItem) return
            setRefTarget({ type: selectedItem.type, id: selectedItem.id, name: itemDisplayName(selectedItem) })
            setBatchOpen(false)
            setStatsOpen(false)
            setQuickCreateOpen(false)
            setAdvancedSearchOpen(false)
            setDataDiffOpen(false)
            setBackupOpen(false)
            setTypeVisibilityOpen(false)
          },
          dataDiff: () => setDataDiffOpen(true),
          stats: () => setStatsOpen(true),
          attrSystem: () => setAttrSysOpen(true),
          notImplemented: (label: string) => setNotice(`「${label}」尚未在 TS 版实现`),
          quit: handleQuit
        }}
      />
      <div className="app-body">
      <aside className="sidebar">
        <div className="brand">
          墨白可视化编辑
          <small>TS 重写版 · Phase 1 数据核心</small>
        </div>
        <LibraryBar />
        <div className="mode-switch">
          <button
            type="button"
            data-testid="mode-data"
            className={`mode-btn${mode === 'data' ? ' active' : ''}`}
            onClick={() => setMode('data')}
          >
            数据表
          </button>
          <button
            type="button"
            data-testid="mode-ceshu"
            className={`mode-btn${mode === 'ceshu' ? ' active' : ''}`}
            onClick={() => setMode('ceshu')}
          >
            策划书
          </button>
          <button
            type="button"
            data-testid="mode-digital"
            className={`mode-btn${mode === 'digital' ? ' active' : ''}`}
            onClick={() => setMode('digital')}
          >
            数字员工
          </button>
        </div>
        {mode === 'data' ? (
          <>
            {visibleTypeDefs.map((t) => (
              <button
                key={t.id}
                type="button"
                className={`type-tab${t.id === activeType ? ' active' : ''}`}
                data-testid="type-tab"
                onClick={() => selectType(t.id)}
              >
                <span className="type-dot" style={{ background: t.color }} />
                {t.name}
              </button>
            ))}
            <button
              type="button"
              className="type-tab"
              data-testid="open-type-visibility"
              title="选择侧栏要显示的数据类型"
              onClick={() => {
                setTypeVisibilityOpen(true)
                setRefTarget(null)
                setBatchOpen(false)
                setStatsOpen(false)
                setQuickCreateOpen(false)
                setAdvancedSearchOpen(false)
                setDataDiffOpen(false)
                setBackupOpen(false)
              }}
            >
              <span className="item-name">⚙ 管理显示类型</span>
            </button>
          </>
        ) : (
          <>
            <button
              type="button"
              data-testid="ceshu-home"
              className={`type-tab${ceshuHomeVisible ? ' active' : ''}`}
              onClick={() => setCeshuHomeVisible(true)}
            >
              <span className="item-name">🗂 全部策划书</span>
            </button>
            <button type="button" className="btn" data-testid="ceshu-create" onClick={() => void handleCreateCeshu()}>
              新建策划书
            </button>
            {ceshuList.map((item) => (
              <button
                key={item.id}
                type="button"
                data-testid="ceshu-row"
                className={`type-tab${!ceshuHomeVisible && item.id === activeCeshuId ? ' active' : ''}`}
                onClick={() => handleOpenCeshu(item.id)}
              >
                <span className="item-name">{item.gameName || '未命名策划书'}</span>
                <span className="item-meta">
                  {item.versionLabel}
                  {item.isActive ? ' ★' : ''} · {Math.round(item.progress * 100)}%
                </span>
              </button>
            ))}
            {ceshuList.length === 0 && <div className="sidebar-hint">暂无策划书，点击上方新建</div>}
          </>
        )}
        {mode === 'digital' && <div className="sidebar-hint">数字员工对话在右侧主区域</div>}
      </aside>

      <div className={`main mode-${mode}`}>
        <div className="main-body">
          <div className="main-area">
        {mode === 'data' ? (
          <>
            <header className="toolbar">
              <h1>数据表预览</h1>
              <label className="toolbar-field">
                <span className="form-label">术语风格</span>
                <select
                  className="form-select game-style-select"
                  data-testid="game-style"
                  title="按游戏风格替换条目表单的字段标签术语（如 生命 → 气血）"
                  value={gameStyle}
                  onChange={(event) => handleGameStyleChange(event.target.value)}
                >
                  <option value="">原始术语</option>
                  {GAME_STYLES.map((style) => (
                    <option key={style.id} value={style.id}>
                      {style.name}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="btn" disabled={busy} onClick={() => void handleImportLegacy()}>
                导入旧数据
              </button>
              <button type="button" className="btn" disabled={busy} onClick={() => void handleExportLegacy()}>
                导出为 JSON
              </button>
              <button
                type="button"
                className="btn"
                data-testid="export-csv"
                disabled={busy}
                onClick={() => void handleExportCsv()}
              >
                导出 CSV
              </button>
              <button
                type="button"
                className="btn"
                data-testid="import-csv"
                disabled={busy}
                onClick={() => void handleImportCsv()}
              >
                导入 CSV
              </button>
              <button
                type="button"
                className="btn"
                data-testid="export-excel"
                disabled={busy}
                onClick={() => void handleExportExcel()}
              >
                导出 Excel
              </button>
              <button
                type="button"
                className="btn"
                data-testid="import-excel"
                disabled={busy}
                onClick={() => void handleImportExcel()}
              >
                导入 Excel
              </button>
              <EngineExportButton />
              <button
                type="button"
                className="btn"
                data-testid="open-type-editor"
                disabled={busy}
                onClick={() => setEditorOpen(true)}
              >
                字段结构
              </button>
              <button
                type="button"
                className="btn"
                data-testid="open-attr-system"
                disabled={busy}
                onClick={() => setAttrSysOpen(true)}
              >
                属性系统
              </button>
              <button
                type="button"
                className="btn"
                data-testid="open-references"
                disabled={busy || !selectedItem}
                onClick={() => {
                  if (!selectedItem) return
                  setRefTarget({ type: selectedItem.type, id: selectedItem.id, name: itemDisplayName(selectedItem) })
                  setBatchOpen(false)
                  setStatsOpen(false)
                  setQuickCreateOpen(false)
                  setAdvancedSearchOpen(false)
                  setDataDiffOpen(false)
                  setBackupOpen(false)
                  setTypeVisibilityOpen(false)
                }}
              >
                引用关系
              </button>
              <button
                type="button"
                className="btn"
                data-testid="open-image-gen"
                disabled={busy}
                onClick={() => {
                  setRefTarget(null)
                  setBatchOpen(false)
                  setStatsOpen(false)
                  setQuickCreateOpen(false)
                  setAdvancedSearchOpen(false)
                  setDataDiffOpen(false)
                  setBackupOpen(false)
                  setTypeVisibilityOpen(false)
                  setImageGenOpen(true)
                }}
              >
                AI 生图
              </button>
              <button
                type="button"
                className="btn primary"
                disabled={busy || !activeType}
                onClick={() => void handleCreate()}
              >
                新增测试条目
              </button>
            </header>

            {error && <div className="error-banner">{error}</div>}
            {notice && <div className="notice-banner">{notice}</div>}

            <div className="content">
              {editorOpen ? (
                <TypeEditorPanel types={types} onSaved={handleSchemaSaved} onClose={() => setEditorOpen(false)} />
              ) : attrSysOpen ? (
                <AttrSystemPanel onClose={() => setAttrSysOpen(false)} />
              ) : (
                <>
                  <div className="list-column">
                    <div className="list-toolbar">
                      <input
                        className="form-input search-input"
                        data-testid="search-input"
                        value={query}
                        placeholder="搜索 名称 / 描述 / ID（空格分词）"
                        onChange={(event) => setQuery(event.target.value)}
                      />
                      {query !== '' && (
                        <button type="button" className="btn slim" data-testid="search-clear" onClick={() => setQuery('')}>
                          清除
                        </button>
                      )}
                      <label className="ai-gen-check">
                        <input
                          type="checkbox"
                          data-testid="select-all"
                          checked={allSelected}
                          disabled={filteredItems.length === 0}
                          onChange={toggleSelectAll}
                        />
                        全选
                      </label>
                      <span className="item-meta" data-testid="list-count">
                        显示 {filteredItems.length} / {items.length} 条
                      </span>
                      <button
                        type="button"
                        className="btn"
                        data-testid="undo"
                        disabled={!undoUi.canUndo}
                        title={undoUi.nextUndo ?? '撤销'}
                        onClick={() => void performUndo()}
                      >
                        撤销
                      </button>
                      <button
                        type="button"
                        className="btn"
                        data-testid="redo"
                        disabled={!undoUi.canRedo}
                        title={undoUi.nextRedo ?? '重做'}
                        onClick={() => void performRedo()}
                      >
                        重做
                      </button>
                      <button
                        type="button"
                        className="btn"
                        data-testid="open-batch-edit"
                        disabled={selectedVisibleIds.length === 0}
                        onClick={() => {
                          setBatchOpen(true)
                          setRefTarget(null)
                          setAdvancedSearchOpen(false)
                          setDataDiffOpen(false)
                          setBackupOpen(false)
                          setTypeVisibilityOpen(false)
                        }}
                      >
                        批量操作（{selectedVisibleIds.length}）
                      </button>
                      <button
                        type="button"
                        className="btn"
                        data-testid="open-quick-create"
                        onClick={() => {
                          setQuickCreateOpen(true)
                          setRefTarget(null)
                          setBatchOpen(false)
                          setAdvancedSearchOpen(false)
                          setDataDiffOpen(false)
                          setBackupOpen(false)
                          setTypeVisibilityOpen(false)
                        }}
                      >
                        快速创建
                      </button>
                      <button
                        type="button"
                        className="btn"
                        data-testid="open-stats"
                        onClick={() => {
                          setStatsOpen(true)
                          setRefTarget(null)
                          setBatchOpen(false)
                          setQuickCreateOpen(false)
                          setAdvancedSearchOpen(false)
                          setDataDiffOpen(false)
                          setBackupOpen(false)
                          setTypeVisibilityOpen(false)
                        }}
                      >
                        统计
                      </button>
                      <button
                        type="button"
                        className="btn"
                        data-testid="open-advanced-search"
                        onClick={() => {
                          setAdvancedSearchOpen(true)
                          setRefTarget(null)
                          setBatchOpen(false)
                          setQuickCreateOpen(false)
                          setStatsOpen(false)
                          setDataDiffOpen(false)
                          setBackupOpen(false)
                          setTypeVisibilityOpen(false)
                        }}
                      >
                        高级搜索
                      </button>
                      <button
                        type="button"
                        className="btn"
                        data-testid="open-data-diff"
                        onClick={() => {
                          setDataDiffOpen(true)
                          setRefTarget(null)
                          setBatchOpen(false)
                          setQuickCreateOpen(false)
                          setStatsOpen(false)
                          setAdvancedSearchOpen(false)
                          setBackupOpen(false)
                          setTypeVisibilityOpen(false)
                        }}
                      >
                        数据对比
                      </button>
                      <button
                        type="button"
                        className="btn"
                        data-testid="open-backup"
                        onClick={() => {
                          setBackupOpen(true)
                          setRefTarget(null)
                          setBatchOpen(false)
                          setQuickCreateOpen(false)
                          setStatsOpen(false)
                          setAdvancedSearchOpen(false)
                          setDataDiffOpen(false)
                          setTypeVisibilityOpen(false)
                        }}
                      >
                        备份
                      </button>
                    </div>

                    <div className="list">
                      {!activeType ? (
                        <div className="empty">正在加载数据类型…</div>
                      ) : items.length === 0 ? (
                        <div className="empty">暂无数据，点击「新增测试条目」或「导入旧数据」</div>
                      ) : filteredItems.length === 0 ? (
                        <div className="empty" data-testid="search-empty">
                          没有匹配「{debouncedQuery}」的数据
                        </div>
                      ) : (
                        filteredItems.map((item) => (
                          <div
                            key={item.id}
                            className={`item-row${item.id === selectedId ? ' selected' : ''}`}
                            data-testid="item-row"
                            onClick={() => {
                              setSelectedId(item.id)
                              setBatchOpen(false)
                              setQuickCreateOpen(false)
                              setStatsOpen(false)
                              setAdvancedSearchOpen(false)
                              setDataDiffOpen(false)
                              setBackupOpen(false)
                              setTypeVisibilityOpen(false)
                              setRefTarget(null)
                            }}
                          >
                            <input
                              type="checkbox"
                              className="item-check"
                              data-testid="item-check"
                              checked={selectedIds.has(item.id)}
                              onClick={(event) => event.stopPropagation()}
                              onChange={() => toggleSelect(item.id)}
                            />
                            <span className="item-name">{String(item.data.name ?? item.id)}</span>
                            <span className="item-meta">{item.id.slice(0, 8)}</span>
                            <button
                              type="button"
                              className="btn danger"
                              onClick={(event) => {
                                event.stopPropagation()
                                void handleDelete(item.id)
                              }}
                            >
                              删除
                            </button>
                          </div>
                        ))
                      )}
                    </div>
                  </div>

                  {refTarget ? (
                    <ReferencesPanel
                      target={refTarget}
                      types={types}
                      onJump={handleJump}
                      onClose={() => setRefTarget(null)}
                    />
                  ) : statsOpen ? (
                    <StatisticsPanel types={types} onClose={() => setStatsOpen(false)} />
                  ) : advancedSearchOpen ? (
                    <AdvancedSearchPanel types={types} onJump={handleJump} onClose={() => setAdvancedSearchOpen(false)} />
                  ) : dataDiffOpen ? (
                    <DataDiffPanel onClose={() => setDataDiffOpen(false)} />
                  ) : backupOpen ? (
                    <BackupPanel
                      onRestored={() => {
                        if (activeType) void reload(activeType)
                      }}
                      onClose={() => setBackupOpen(false)}
                    />
                  ) : typeVisibilityOpen ? (
                    <TypeVisibilityPanel
                      types={types}
                      value={visibleTypes}
                      onConfirm={handleVisibilityConfirmed}
                      onClose={() => setTypeVisibilityOpen(false)}
                    />
                  ) : imageGenOpen ? (
                    <ImageGenPanel onClose={() => setImageGenOpen(false)} />
                  ) : quickCreateOpen ? (
                    <QuickCreatePanel
                      key={`${activeType ?? ''}:quick`}
                      type={activeType ?? ''}
                      types={types}
                      onCreated={handleQuickCreated}
                      onClose={() => setQuickCreateOpen(false)}
                    />
                  ) : batchOpen ? (
                    <BatchEditPanel
                      key={`${activeType ?? ''}:batch`}
                      type={activeType ?? ''}
                      typeDef={types.find((def) => def.id === activeType) ?? null}
                      selectedIds={selectedVisibleIds}
                      onApplied={handleBatchApplied}
                      onClose={() => setBatchOpen(false)}
                    />
                  ) : (
                    selectedItem && (
                      <ItemForm
                        key={`${selectedItem.id}:${selectedItem.updatedAt}`}
                        item={selectedItem}
                        fields={fields}
                        types={types}
                        gameStyle={gameStyle}
                        onSaved={handleSaved}
                      />
                    )
                  )}
                </>
              )}
            </div>
          </>
        ) : mode === 'ceshu' ? (
          ceshuHomeVisible || !activeCeshuId ? (
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
            />
          )
        ) : null}
          </div>
          <aside className="ai-dock" data-testid="ai-dock">
            <DigitalPanel />
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
        </footer>
      </div>
      </div>
    </div>
  )
}