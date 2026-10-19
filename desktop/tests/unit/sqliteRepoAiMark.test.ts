import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import { SqliteItemsRepository } from '../../src/main/data/sqliteRepo'

/**
 * 存储层迁移 user_version 2 → 3：`ai_generated_at` 列（「AI 生成、待核对」标记）。
 *
 * 与 `sqliteRepoMigration.test.ts`（v1→v2）区分：那份测短 id 回填，
 * 这份测**新增列**的语义 —— 旧库读出来应为 `undefined`（人工条目、无标记），
 * 且新列的读写不能影响既有 `data` JSON。
 *
 * ⚠️ 超时 20s：与 v1→v2 同一理由（vitest 全量并行 + 火绒扫描临时 .db 的 I/O 毛刺）。
 */
const SQLITE_IO_TIMEOUT = 20_000

/** v2 的库结构（含短 id 回填后的形态）：无 ai_generated_at 列 */
const V2_SCHEMA = `
  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
`

let tempDir: string | null = null

function makeTempDbPath(): string {
  tempDir = mkdtempSync(join(tmpdir(), 'mb-repo-aimark-'))
  return join(tempDir, 'mb-editor.db')
}

afterEach(() => {
  if (tempDir !== null) {
    rmSync(tempDir, { recursive: true, force: true })
    tempDir = null
  }
})

/** 造一个 v2 库并灌入两行：一行人工、一行已带 v3 列不存在的旧数据 */
function seedV2(dbPath: string): void {
  const db = new Database(dbPath)
  db.exec(V2_SCHEMA)
  db.pragma('user_version = 2')
  const insert = db.prepare('INSERT INTO items (id, type, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
  insert.run('k1', 'battle', JSON.stringify({ id: '0', name: '人工建的' }), '2026-10-01T00:00:01.000Z', '2026-10-01T00:00:01.000Z')
  insert.run('k2', 'battle', JSON.stringify({ id: '1', name: '也是人工的' }), '2026-10-01T00:00:02.000Z', '2026-10-01T00:00:02.000Z')
  db.close()
}

function userVersion(dbPath: string): number {
  const db = new Database(dbPath, { readonly: true })
  const version = db.pragma('user_version', { simple: true }) as number
  db.close()
  return version
}

describe('SqliteItemsRepository 迁移（user_version 3：ai_generated_at 列）', () => {
  it('v2 旧库升级后版本为 3，存量行读作 undefined（无标记）', () => {
    const dbPath = makeTempDbPath()
    seedV2(dbPath)

    const repo = new SqliteItemsRepository(dbPath)

    const list = repo.listItems('battle')
    expect(list).toHaveLength(2)
    for (const item of list) {
      expect(item.aiGeneratedAt).toBeUndefined()
    }
    expect(userVersion(dbPath)).toBe(3)
    repo.close()
  }, SQLITE_IO_TIMEOUT)

  it('带标记写入后可读回，且不污染 data JSON', () => {
    const dbPath = makeTempDbPath()
    seedV2(dbPath)
    const repo = new SqliteItemsRepository(dbPath)

    const now = '2026-10-20T01:00:00.000Z'
    repo.insertItem({ id: 'k3', type: 'battle', data: { name: 'AI 生成的' }, createdAt: now, updatedAt: now, aiGeneratedAt: now })

    const created = repo.findItem('k3')
    expect(created?.aiGeneratedAt).toBe(now)
    // 标记走独立列，绝不能漏进用户数据（否则会出现在表单与导出里）
    expect(created?.data).toEqual({ name: 'AI 生成的' })
    repo.close()
  }, SQLITE_IO_TIMEOUT)

  it('upsert 不覆盖已存在的标记（导入是数据搬运，不该改写核对状态）', () => {
    const dbPath = makeTempDbPath()
    seedV2(dbPath)
    const repo = new SqliteItemsRepository(dbPath)

    const now = '2026-10-20T01:00:00.000Z'
    repo.insertItem({ id: 'k3', type: 'battle', data: { name: 'AI' }, createdAt: now, updatedAt: now, aiGeneratedAt: now })
    repo.upsertItem({ id: 'k3', type: 'battle', data: { name: '导入改了名' }, createdAt: now, updatedAt: now })

    expect(repo.findItem('k3')?.aiGeneratedAt).toBe(now)
    repo.close()
  }, SQLITE_IO_TIMEOUT)

  it('幂等：二次打开不重复加列、标记不丢', () => {
    const dbPath = makeTempDbPath()
    seedV2(dbPath)
    const now = '2026-10-20T01:00:00.000Z'

    const first = new SqliteItemsRepository(dbPath)
    first.insertItem({ id: 'k3', type: 'battle', data: { name: 'AI' }, createdAt: now, updatedAt: now, aiGeneratedAt: now })
    first.close()

    const second = new SqliteItemsRepository(dbPath)
    expect(userVersion(dbPath)).toBe(3)
    expect(second.findItem('k3')?.aiGeneratedAt).toBe(now)
    expect(second.listItems('battle')).toHaveLength(3)
    second.close()
  }, SQLITE_IO_TIMEOUT)
})
