import { useCallback, useEffect, useState } from 'react'

import { formatImportSummary, toErrorMessage } from '../appUtils'
import type { DataSnapshotFormat, EngineExportInput } from '../../../shared/schemas'
import { engineExportNotice } from '../../../shared/util/engineExportNotice'
import { loadBlockExportMissingImages } from '../../../shared/config/settingsPreferences'

/** 按引擎维度记住上次导出路径（localStorage），下次导出直接回填到游戏文件上，免得每次重选 */
const ENGINE_EXPORT_LAST_PATH_PREFIX = 'mb.engineExport.lastPath.'

function readLastEngineExportPath(engine: string): string | null {
  try {
    return localStorage.getItem(`${ENGINE_EXPORT_LAST_PATH_PREFIX}${engine}`)
  } catch {
    return null
  }
}

function writeLastEngineExportPath(engine: string, path: string): void {
  try {
    localStorage.setItem(`${ENGINE_EXPORT_LAST_PATH_PREFIX}${engine}`, path)
  } catch {
    // localStorage 不可用（隐私模式等）时静默跳过，不影响导出本身
  }
}

/**
 * 撤销 / 重做（对齐 PyQt `main_window` 的 undo/redo 动作 + 菜单项 disabled/标签）。
 *
 * 从 `App.tsx` 原样抽出：撤销态（`undoUi`）只服务于菜单项的 disabled 与 tooltip 标签，
 * 以及三个动作（`performUndo` / `performRedo` / `refreshUndo`）。它们构成一个内聚单元，
 * 与 App 的其余编排（面板浮层、策划书导航）无关，独立成 hook 让 App 回到「编排」角色。
 *
 * ⚠️ 撤销/重做的文案与计数语义（applied / failed / skipped）逐字保留 —— 既有 E2E 与
 * 用户可见反馈都依赖它，重构不改行为。
 */

export interface UndoUiState {
  canUndo: boolean
  canRedo: boolean
  nextUndo: string | null
  nextRedo: string | null
}

export interface UseUndoRedo {
  /** 撤销/重做状态（菜单项 disabled 与 tooltip 标签用） */
  undoUi: UndoUiState
  /** 刷新增撤/重做状态（数据变更后调用，保证菜单项 disabled 与标签正确） */
  refreshUndo: () => void
  /** 执行撤销并用 notice 反馈（对齐 AI 回滚风格） */
  performUndo: () => Promise<void>
  /** 执行重做并对称反馈 */
  performRedo: () => Promise<void>
}

export function useUndoRedo(setNotice: (msg: string | null) => void, setError: (msg: string | null) => void): UseUndoRedo {
  const [undoUi, setUndoUi] = useState<UndoUiState>({
    canUndo: false,
    canRedo: false,
    nextUndo: null,
    nextRedo: null
  })

  // 初始化撤销/重做状态（启动时填充菜单项 disabled 与标签）
  useEffect(() => {
    void window.mbApi.data.undoState().then(setUndoUi).catch(() => undefined)
  }, [])

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
  }, [setNotice, setError])

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
  }, [setNotice, setError])

  return { undoUi, refreshUndo, performUndo, performRedo }
}

/**
 * 数据导入 / 导出（JSON / CSV / Excel / 引擎格式）—— 菜单「文件」组的动作集合。
 *
 * 从 `App.tsx` 原样抽出：7 个 handler 都是同一形状——「先清 error/notice → 选路径 →
 * 调主进程 → 写 notice」，彼此无依赖、也��� App 的面板/导航状态无关，独立成 hook。
 *
 * ⚠️ 每个 handler 的选择器、文案与「刷新撤销」时机逐字保留（含「打开/保存」与
 * `importJson`/`exportJson` 共用同一对 handler 的既有语义，见 `MenuBar.tsx` 注释）。
 */

export interface UseDataTransfer {
  importJson: () => Promise<void>
  exportJson: () => Promise<void>
  importCsv: () => Promise<void>
  exportCsv: () => Promise<void>
  importExcel: () => Promise<void>
  exportExcel: () => Promise<void>
  /** 引擎数据导出：菜单「导出 → 导出为 XX 格式」按目标引擎各走各的渲染器与扩展名 */
  engineExport: (engine: EngineExportInput['engine']) => Promise<void>
  /** 数据快照导出（审查件）：JSON = 确定性可 diff 的全量数据；CSV = 单表宽表 */
  exportSnapshot: (format: DataSnapshotFormat) => Promise<void>
}

export function useDataTransfer(
  setNotice: (msg: string | null) => void,
  setError: (msg: string | null) => void,
  refreshUndo: () => void
): UseDataTransfer {
  const importJson = async (): Promise<void> => {
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

  const exportJson = async (): Promise<void> => {
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

  const importCsv = async (): Promise<void> => {
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

  const exportCsv = async (): Promise<void> => {
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

  const importExcel = async (): Promise<void> => {
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

  const exportExcel = async (): Promise<void> => {
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
  const engineExport = async (engine: EngineExportInput['engine']): Promise<void> => {
    try {
      const api = window.mbApi as unknown as {
        dialog: {
          chooseEngineExportFile: (req: {
            defaultName?: string
            engine: EngineExportInput['engine']
            defaultPath?: string
          }) => Promise<{ path: string | null }>
        }
        engine: {
          exportData: (req: {
            engine: EngineExportInput['engine']
            path: string
            blockOnMissingImages: boolean
          }) => Promise<{
            filePath: string
            engine: string
            bytes: number
            copiedImages?: number
            missingImages?: string[]
            backupPath?: string
            manifestPath?: string
            version?: number
          }>
        }
      }
      // 记得上次导出路径就回填（直接落在游戏文件上，一键确认）；否则用默认名。
      const lastPath = readLastEngineExportPath(engine)
      const picked = await api.dialog.chooseEngineExportFile(
        lastPath ? { engine, defaultPath: lastPath } : { engine, defaultName: 'GameData' }
      )
      if (picked.path === null) return
      const result = await api.engine.exportData({
        engine,
        path: picked.path,
        blockOnMissingImages: loadBlockExportMissingImages()
      })
      writeLastEngineExportPath(engine, result.filePath)
      setNotice(engineExportNotice(result))
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }

  /**
   * 数据快照导出（给人 / 给 git 审）：把全量数据渲染成确定性 JSON 或单表 CSV，
   * 策划可在 PR 里逐行 review 每次改了哪些属性/掉落（SQLite 真相源本身 diff 不了）。
   * 与 `engineExport`（给游戏运行态的产物）定位不同，这里是审查件。
   */
  const exportSnapshot = async (format: DataSnapshotFormat): Promise<void> => {
    try {
      setError(null)
      setNotice(null)
      const picked = await window.mbApi.dialog.chooseDataSnapshotFile({
        format,
        defaultName: 'GameData.snapshot'
      })
      if (picked.path === null) return
      const result = await window.mbApi.data.exportSnapshot({ path: picked.path, format })
      const label = format === 'csv' ? 'CSV' : 'JSON'
      setNotice(
        `已导出数据快照（${label}）：${result.filePath}（${result.itemCount} 条数据 / ${result.typeCount} 种类型 / ${result.bytes} 字节）`
      )
    } catch (err) {
      setError(toErrorMessage(err))
    }
  }

  return { importJson, exportJson, importCsv, exportCsv, importExcel, exportExcel, engineExport, exportSnapshot }
}
