import { formatImportSummary, toErrorMessage } from '../../appUtils'
import type { EngineExportInput } from '@mobai/shared/schema/adapters'
import type { DataSnapshotFormat } from '@mobai/shared/schema/adapters'
import type { ImportPreview } from '@mobai/shared/types'
import { engineExportNotice } from '@mobai/shared/util/system'
import { loadBlockExportMissingImages } from '@mobai/shared/config/settings'

/**
 * 文件 I/O 动作（打开 / 保存 / 批量导入导出 / 引擎导出 / 快照导出）——从 `useDataTransfer` 搬出来。
 *
 * 为什么要搬：这些动作要成为**插件命令**（`command.run()` 不带参数、跑在纯模块里），
 * 而 hook 只存在于 React 组件树内。搬出来后它们只依赖两样东西：
 * `window.mbApi`（随时可用）与一个注入的**端口**（提示 / 报错 / 刷撤销 / 开导入预览）。
 *
 * 端口与 `hostBridge` 同一路数（注入式单例，App 每次渲染注入最新实现）；缺端口时静默降级，
 * 不抛错——动作本身的副作用（落盘）已经发生，提示丢了也不该把界面炸掉。
 *
 * ⚠️ 每个动作的选择器、文案与「刷新撤销」时机**逐字保留**（既有 e2e 与用户可见反馈依赖它们）。
 */

export interface AppIoPort {
  /** 顶部提示（`null` = 清除） */
  notify: (message: string | null) => void
  /** 错误条（`null` = 清除） */
  error: (message: string | null) => void
  /** 刷新增撤可用性（导入成功后数据变了） */
  refreshUndo: () => void
  /** 选完文件先出预览（宿主负责开面板）；确认后才落库 */
  openPreview: (payload: { previewId: string; preview: ImportPreview }) => void
  /** 撤销 / 重做（实现仍由 App 的 `useUndoRedo` 持有，因为撤销态是它的 state） */
  undo: () => Promise<void>
  redo: () => Promise<void>
}

let port: AppIoPort | null = null

export function setAppIoPort(next: AppIoPort | null): void {
  port = next
}

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

export async function importJson(): Promise<void> {
  try {
    port?.error(null)
    port?.notify(null)
    const chosen = await window.mbApi.dialog.chooseJsonFile()
    if (!chosen.path) return
    const summary = await window.mbApi.data.importLegacy({ path: chosen.path })
    port?.notify(formatImportSummary(summary))
    port?.refreshUndo()
  } catch (err) {
    port?.error(toErrorMessage(err))
  }
}

export async function exportJson(): Promise<void> {
  try {
    port?.error(null)
    port?.notify(null)
    const chosen = await window.mbApi.dialog.chooseSaveJsonFile()
    if (!chosen.path) return
    const summary = await window.mbApi.data.exportLegacy({ path: chosen.path })
    port?.notify(`已导出 ${summary.totalItems} 条数据：${summary.filePath}`)
  } catch (err) {
    port?.error(toErrorMessage(err))
  }
}

/*
 * 导入 = 选文件 → 预览 → 确认。
 * 不再「选完就写库」：导入是不可撤销的批量写，先让用户看清改了什么。
 */
export async function importCsv(): Promise<void> {
  try {
    port?.error(null)
    port?.notify(null)
    const chosen = await window.mbApi.dialog.chooseCsvFile()
    if (!chosen.path) return
    port?.openPreview(await window.mbApi.data.previewImport({ path: chosen.path, kind: 'csv' }))
  } catch (err) {
    port?.error(toErrorMessage(err))
  }
}

export async function exportCsv(): Promise<void> {
  try {
    port?.error(null)
    port?.notify(null)
    const chosen = await window.mbApi.dialog.chooseExportDir()
    if (!chosen.path) return
    const summary = await window.mbApi.data.exportCsv({ dir: chosen.path })
    port?.notify(`已导出 ${summary.files.length} 个 CSV 文件（共 ${summary.totalItems} 条）到 ${summary.dir}`)
  } catch (err) {
    port?.error(toErrorMessage(err))
  }
}

export async function importExcel(): Promise<void> {
  try {
    port?.error(null)
    port?.notify(null)
    const chosen = await window.mbApi.dialog.chooseExcelFile()
    if (!chosen.path) return
    port?.openPreview(await window.mbApi.data.previewImport({ path: chosen.path, kind: 'excel' }))
  } catch (err) {
    port?.error(toErrorMessage(err))
  }
}

export async function exportExcel(): Promise<void> {
  try {
    port?.error(null)
    port?.notify(null)
    const chosen = await window.mbApi.dialog.chooseExportDir()
    if (!chosen.path) return
    const summary = await window.mbApi.data.exportExcel({ dir: chosen.path })
    port?.notify(`已导出 ${summary.totalItems} 条数据：${summary.filePath}`)
  } catch (err) {
    port?.error(toErrorMessage(err))
  }
}

/**
 * 引擎数据导出：菜单「导出 → 导出为 XX 格式」按目标引擎各走各的渲染器与扩展名。
 * 此前四个菜单项全都硬编码 `engine: 'lua'`，点「导出为 Unity 格式」拿到的是 `.lua`。
 */
export async function engineExport(engine: EngineExportInput['engine']): Promise<void> {
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
    port?.notify(engineExportNotice(result))
  } catch (err) {
    port?.error(toErrorMessage(err))
  }
}

/**
 * 数据快照导出（给人 / 给 git 审）：把全量数据渲染成确定性 JSON 或单表 CSV，
 * 策划可在 PR 里逐行 review 每次改了哪些属性/掉落（SQLite 真相源本身 diff 不了）。
 * 与 `engineExport`（给游戏运行态的产物）定位不同，这里是审查件。
 */
export async function exportSnapshot(format: DataSnapshotFormat): Promise<void> {
  try {
    port?.error(null)
    port?.notify(null)
    const picked = await window.mbApi.dialog.chooseDataSnapshotFile({
      format,
      defaultName: 'GameData.snapshot'
    })
    if (picked.path === null) return
    const result = await window.mbApi.data.exportSnapshot({ path: picked.path, format })
    const label = format === 'csv' ? 'CSV' : 'JSON'
    port?.notify(
      `已导出数据快照（${label}）：${result.filePath}（${result.itemCount} 条数据 / ${result.typeCount} 种类型 / ${result.bytes} 字节）`
    )
  } catch (err) {
    port?.error(toErrorMessage(err))
  }
}

export async function undo(): Promise<void> {
  await port?.undo()
}

export async function redo(): Promise<void> {
  await port?.redo()
}
