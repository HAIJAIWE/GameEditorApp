import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { afterEach, describe, expect, it } from 'vitest'

import { listBackups } from '../../src/main/backup/backupStore'
import { createLibraryBackup, restoreLibraryBackup, type BackupDeps } from '../../src/main/backup/restore'
import { DataService } from '../../src/main/data/service'
import { SqliteItemsRepository } from '../../src/main/data/sqliteRepo'
import type { DataTypeDef } from '../../src/shared/types'

/**
 * 备份恢复的**真实存储**验证（真 SQLite + 真文件系统）。
 *
 * 为什么不 mock：恢复是破坏性操作，最重要的两个不变式只能用真实存储证明——
 * ① 「恢复后数据**精确**等于快照」——即备份里没有、当前却有的条目必须被删掉
 *    （只 upsert 会留下多余条目，这正是 旧版 AI 工具路径的同类缺陷）；
 * ② 「恢复前已自动落一份 pre-restore 快照」——否则恢复错文件无法回退。
 */

const TYPES: DataTypeDef[] = [
  {
    id: 'role',
    name: '角色',
    pluralKey: 'roles',
    color: '#888888',
    formFields: [{ name: 'name', label: '名称', type: 'entry', editable: true }]
  }
]

const cleanups: Array<() => void> = []

function makeDeps(): BackupDeps {
  const root = mkdtempSync(join(tmpdir(), 'mb-backup-restore-'))
  const service = new DataService(new SqliteItemsRepository(join(root, 'mb-editor.db')))
  cleanups.push(() => {
    service.dispose()
    rmSync(root, { recursive: true, force: true })
  })
  return { backupRoot: join(root, 'backups'), dataService: service, types: TYPES }
}

afterEach(() => {
  while (cleanups.length > 0) cleanups.pop()?.()
})

describe('备份：创建与列举', () => {
  it('创建后可在列表中看到，且是原子写出的合法 JSON', async () => {
    const deps = makeDeps()
    await deps.dataService.importRecords([
      { type: 'role', id: 'r1', data: { id: 'r1', name: '战士' } },
      { type: 'role', id: 'r2', data: { id: 'r2', name: '法师' } }
    ])

    const entry = await createLibraryBackup(deps)
    expect(entry.name).toMatch(/^backup_\d{8}_\d{6}\.json$/)
    expect(entry.sizeBytes).toBeGreaterThan(0)

    const list = await listBackups(deps.backupRoot)
    expect(list.map((row) => row.name)).toContain(entry.name)
    // 没有残留 .tmp（原子写成功）
    expect(list.some((row) => row.name.endsWith('.tmp'))).toBe(false)
  })

  it('带 label 的备份名可解析出创建时间', async () => {
    const deps = makeDeps()
    const entry = await createLibraryBackup(deps, 'before-balance')
    expect(entry.name).toMatch(/^backup_\d{8}_\d{6}_before-balance\.json$/)
    expect(Number.isNaN(new Date(entry.createdAt).getTime())).toBe(false)
  })
})

describe('备份：恢复是「精确还原」', () => {
  it('删除「备份里没有、当前却有」的条目，并还原被改动的值（id 保留）', async () => {
    const deps = makeDeps()
    await deps.dataService.importRecords([
      { type: 'role', id: 'r1', data: { id: 'r1', name: '战士' } },
      { type: 'role', id: 'r2', data: { id: 'r2', name: '法师' } }
    ])
    const snapshot = await createLibraryBackup(deps)

    // 破坏快照之后的状态：改 r1、加 r3、删 r2
    await deps.dataService.updateItem('r1', { id: 'r1', name: '战士-改' })
    await deps.dataService.createItem({ type: 'role', data: { name: '弓手' } })
    await deps.dataService.deleteItem('r2')
    expect(deps.dataService.listAllItems()).toHaveLength(2)

    const outcome = await restoreLibraryBackup(deps, snapshot.name)
    expect(outcome.restored).toBe(true)
    expect(outcome.error).toBeUndefined()
    expect(outcome.totalItems).toBe(2)

    const after = deps.dataService.listAllItems()
    // ① 精确等于快照：r1/r2 都在，r3（新增的）被删掉
    expect(after.map((item) => item.id).sort()).toEqual(['r1', 'r2'])
    // ② 值被还原（r1 回到「战士」而非「战士-改」）
    expect(after.find((item) => item.id === 'r1')?.data['name']).toBe('战士')
    // ③ id 保留（引用关系不会因恢复而错乱）
    expect(after.find((item) => item.id === 'r2')?.data['name']).toBe('法师')
  })

  it('恢复前自动生成 pre-restore 快照（可回退）', async () => {
    const deps = makeDeps()
    await deps.dataService.importRecords([{ type: 'role', id: 'r1', data: { id: 'r1', name: '战士' } }])
    const snapshot = await createLibraryBackup(deps)

    await deps.dataService.updateItem('r1', { id: 'r1', name: '改过的' })
    const outcome = await restoreLibraryBackup(deps, snapshot.name)

    expect(outcome.restored).toBe(true)
    expect(outcome.preBackup).toMatch(/^backup_\d{8}_\d{6}_pre-restore\.json$/)
    const list = await listBackups(deps.backupRoot)
    expect(list.map((row) => row.name)).toContain(outcome.preBackup)
  })

  it('恢复到空库：备份里的条目带原 id 全部回来', async () => {
    const deps = makeDeps()
    await deps.dataService.importRecords([{ type: 'role', id: 'r9', data: { id: 'r9', name: '召唤师' } }])
    const snapshot = await createLibraryBackup(deps)

    await deps.dataService.deleteItem('r9')
    expect(deps.dataService.listAllItems()).toHaveLength(0)

    const outcome = await restoreLibraryBackup(deps, snapshot.name)
    expect(outcome.restored).toBe(true)
    const after = deps.dataService.listAllItems()
    expect(after).toHaveLength(1)
    expect(after[0]?.id).toBe('r9')
  })
})

describe('备份：失败不伪装成功、不误伤数据', () => {
  it('恢复不存在的备份 → restored:false + 中文错误，且当前数据原样不动', async () => {
    const deps = makeDeps()
    await deps.dataService.importRecords([{ type: 'role', id: 'r1', data: { id: 'r1', name: '战士' } }])

    const outcome = await restoreLibraryBackup(deps, 'backup_20200101_000000.json')
    expect(outcome.restored).toBe(false)
    expect(outcome.error).toContain('不存在')
    expect(outcome.preBackup).toBeNull()
    // 未进入破坏性阶段：数据不变，也没有产生 pre-restore 快照
    expect(deps.dataService.listAllItems().map((item) => item.id)).toEqual(['r1'])
    expect(await listBackups(deps.backupRoot)).toEqual([])
  })

  it('恢复非法文件名（目录穿越）→ 被拒，不触碰数据', async () => {
    const deps = makeDeps()
    await deps.dataService.importRecords([{ type: 'role', id: 'r1', data: { id: 'r1', name: '战士' } }])

    const outcome = await restoreLibraryBackup(deps, '../outside.json')
    expect(outcome.restored).toBe(false)
    expect(outcome.error).toContain('非法')
    expect(deps.dataService.listAllItems()).toHaveLength(1)
  })
})
