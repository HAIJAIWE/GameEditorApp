import { join } from 'node:path'
import type { IpcHandlerDeps, IpcRegistrar } from '../ipc'
import {
  backupCreateInputSchema,
  backupRestoreInputSchema,
  backupDeleteInputSchema
} from '../../shared/schema/adapters/schemasDataBackup'
import { listBackups, deleteBackupFile } from '../backup/backupStore'
import { createLibraryBackup, restoreLibraryBackup } from '../backup/restore'

export function registerBackupIpc(deps: IpcHandlerDeps, handle: IpcRegistrar): void {
  const { libraryManager, dataService, typeSchemaStore } = deps
  // ---- 数据备份（整库快照，存 <活跃库>/backups）----
  // backupRoot 在**每次注册时**由活跃库目录派生；切换库会 dispose + 重注册 handler，
  // 因此闭包里的路径始终指向当前活跃库，天然做到「备份随库隔离」。
  const backupRoot = join(libraryManager.activeDir(), 'backups')
  const backupDeps = (): Parameters<typeof createLibraryBackup>[0] => ({
    backupRoot,
    dataService,
    types: typeSchemaStore.getTypes()
  })
  handle('backup:list', undefined, () => listBackups(backupRoot))
  handle('backup:create', backupCreateInputSchema, (req) => createLibraryBackup(backupDeps(), req.label))
  // 破坏性：渲染层确认可被绕过，主进程必须再挡一次 confirm
  handle('backup:restore', backupRestoreInputSchema, async (req) => {
    if (req.confirm !== true) throw new Error('恢复备份需要确认')
    return restoreLibraryBackup(backupDeps(), req.name)
  })
  handle('backup:delete', backupDeleteInputSchema, async (req) => {
    if (req.confirm !== true) throw new Error('删除备份需要确认')
    await deleteBackupFile(backupRoot, req.name)
    return { deleted: true }
  })
}
