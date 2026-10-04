/**
 * 备份 / 恢复编排（对应 Python `ui/dialogs/backup_manager.py` 的 create/restore 路径）。
 *
 * ## 为什么单独一层（不塞进 backupStore）
 * `backupStore` 只做文件系统（原子写 / 软删 / 路径校验）；本层负责**动数据**，
 * 因而必须显式拿到 `DataService`，并遵守项目的「破坏性操作」铁律。
 *
 * ## 相对 Python 的三处关键修正（逐条对应其缺陷）
 * 1. **恢复前自动生成 pre-restore 快照**：Python 对话框只改内存、不备份当前，
 *    恢复错文件即不可回退（其 AI 工具路径反而有 `snapshot`）。这里在动数据**之前**
 *    先落一份当前全量快照；快照失败则**中止恢复**（宁可不动，也不留无法回退的坑）。
 * 2. **精确还原（含删除多余条目）**：Python 是 `data = backup_data` 整体替换内存字典；
 *    TS 是 SQLite，仅靠 upsert 无法删除「备份里没有、当前却存在」的条目
 *    （这正是 Python AI 工具路径的同类缺陷）。故先按 id 差集 `deleteMany`，再 `importRecords` upsert。
 * 3. **恢复真正落盘**：TS 的数据本就是 SQLite 落盘（无 Python「只改内存不保存 → 假成功」问题），
 *    且 id 由 `importRecords` 保留，**引用关系不会因恢复而错乱**（Python 亦未保 id 之外的东西）。
 *
 * ## 有意不做
 * - 不触发 `CeshuDataSync`（策划书↔数据同步是独立关注点；Python 恢复后也只刷新页签）。
 * - 不做备份轮转/上限（Python 对话框路径也没有；`auto_backup.py` 的 20 份上限属死代码，不迁）。
 */

import { buildBackupName, type BackupEntry, type RestoreOutcome } from '../../shared/backup'
import type { DataTypeDef } from '../../shared/types'
import { parseLegacyData } from '../data/legacyImport'
import { buildLegacyPayload } from '../data/legacyExport'
import type { DataService } from '../data/service'
import { createBackupFile, readBackupFile } from './backupStore'

export interface BackupDeps {
  /** 活跃库的备份目录（`<库>/backups`） */
  backupRoot: string
  dataService: DataService
  types: DataTypeDef[]
}

/** 把当前活跃库的全量数据落成一份备份；返回新备份条目 */
export async function createLibraryBackup(deps: BackupDeps, label?: string): Promise<BackupEntry> {
  const records = deps.dataService.listAllItems()
  const payload = buildLegacyPayload(records, deps.types)
  const name = buildBackupName(new Date(), label)
  return createBackupFile(deps.backupRoot, name, payload)
}

/**
 * 恢复备份到活跃库。
 * - 通过 `confirm: true` 的校验由 IPC 层完成（渲染层确认可被绕过，主进程必须再挡一次）。
 * - 返回显式结果，**不伪装成功**：失败时 `restored: false` 且带中文 `error`。
 */
export async function restoreLibraryBackup(deps: BackupDeps, name: string): Promise<RestoreOutcome> {
  let preBackup: string | null = null
  try {
    // 读取 + 结构校验（readBackupFile 会校验文件名合法性并解析 JSON）
    const raw = await readBackupFile(deps.backupRoot, name)
    const parsed = parseLegacyData(raw, deps.types)

    // 1) 先为「当前状态」留退路：快照失败则不进入破坏性阶段
    const current = deps.dataService.listAllItems()
    preBackup = buildBackupName(new Date(), 'pre-restore')
    await createBackupFile(deps.backupRoot, preBackup, buildLegacyPayload(current, deps.types))

    // 2) 删除「当前有、备份无」的条目 —— 否则 upsert 无法真正回到快照
    const targetIds = new Set(parsed.records.map((record) => record.id))
    const staleIds = current.filter((record) => !targetIds.has(record.id)).map((record) => record.id)
    if (staleIds.length > 0) {
      await deps.dataService.deleteMany(staleIds)
    }

    // 3) upsert 备份内全部条目（保留其 id，引用不受影响）
    await deps.dataService.importRecords(parsed.records)

    return { restored: true, preBackup, totalItems: parsed.records.length }
  } catch (error) {
    return {
      restored: false,
      preBackup,
      totalItems: 0,
      error: error instanceof Error ? error.message : String(error)
    }
  }
}
