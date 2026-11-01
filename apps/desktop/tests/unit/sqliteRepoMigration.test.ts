import { mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import Database from 'better-sqlite3'
import { afterEach, describe, expect, it } from 'vitest'

import { SqliteItemsRepository } from '../../src/main/data/sqliteRepo'

/**
 * 存储层数据迁移（user_version 1 → 2）：data.id 业务短 id 回填。
 * 用真实 SQLite 临时库验证——迁移逻辑跑在 SqliteItemsRepository 构造期，
 * 只有端到端打开库才能覆盖（纯函数部分由 itemId.test.ts 负责）。
 *
 * ⚠️ 超时给到 20s：vitest 全量并行（百余 worker）+ 火绒实时扫描临时 .db 文件时，
 * SQLite 文件 I/O 偶发远超默认 5s 预算（单跑本文件 <1s）——非逻辑慢，是环境毛刺。
 */
const SQLITE_IO_TIMEOUT = 20_000

const V1_SCHEMA = `
  CREATE TABLE IF NOT EXISTS items (
    id TEXT PRIMARY KEY,
    type TEXT NOT NULL,
    data TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
`

const UUID_A = 'aaaaaaaa-1111-4222-8333-444444444444'
const UUID_B = 'bbbbbbbb-1111-4222-8333-444444444444'

let tempDir: string | null = null

function makeTempDbPath(): string {
  tempDir = mkdtempSync(join(tmpdir(), 'mb-repo-migrate-'))
  return join(tempDir, 'mb-editor.db')
}

afterEach(() => {
  if (tempDir !== null) {
    rmSync(tempDir, { recursive: true, force: true })
    tempDir = null
  }
})

/** 造一个 v1 库（user_version=1）并灌入指定行，模拟迁移前的存量数据 */
function seedV1(
  dbPath: string,
  rows: Array<{ id: string; type: string; data: unknown; createdAt: string }>
): void {
  const db = new Database(dbPath)
  db.exec(V1_SCHEMA)
  db.pragma('user_version = 1')
  const insert = db.prepare('INSERT INTO items (id, type, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
  for (const row of rows) {
    insert.run(row.id, row.type, JSON.stringify(row.data), row.createdAt, row.createdAt)
  }
  db.close()
}

describe('SqliteItemsRepository 数据迁移（user_version 2：短 id 回填）', () => {
  it('全量缺 id：按 created_at 次序每类型从 0 起分配，user_version 升到 2', () => {
    const dbPath = makeTempDbPath()
    seedV1(dbPath, [
      { id: UUID_A, type: 'battle', data: { name: 'battle 1' }, createdAt: '2026-10-01T00:00:01.000Z' },
      { id: UUID_B, type: 'battle', data: { name: '战斗 2' }, createdAt: '2026-10-01T00:00:02.000Z' },
      { id: 'uuid-c', type: 'character', data: { name: '角色A' }, createdAt: '2026-10-01T00:00:03.000Z' }
    ])

    const repo = new SqliteItemsRepository(dbPath)

    const battles = repo.listItems('battle')
    expect(battles.map((item) => item.data['id'])).toEqual(['0', '1'])
    // 每类型独立计数
    expect(repo.listItems('character').map((item) => item.data['id'])).toEqual(['0'])
    // 记录 id（内部键）不被改写
    expect(battles[0]?.id).toBe(UUID_A)

    const versionDb = new Database(dbPath, { readonly: true })
    const version = versionDb.pragma('user_version', { simple: true }) as number
    versionDb.close()
    // 2026-10-20 起短 id 回填之后还会跑 v3（ai_generated_at 加列），故终值是 3
    expect(version).toBe(3)
    repo.close()
  }, SQLITE_IO_TIMEOUT)

  it('混合形态：uuid/缺失补发、存量短 id 与用户自设 id 不动、断档接 max+1', () => {
    const dbPath = makeTempDbPath()
    seedV1(dbPath, [
      { id: 'k1', type: 'skill', data: { id: '5', name: '存量5' }, createdAt: '2026-10-01T00:00:01.000Z' },
      { id: 'k2', type: 'skill', data: { name: '缺id' }, createdAt: '2026-10-01T00:00:02.000Z' },
      { id: 'k3', type: 'skill', data: { id: UUID_A, name: 'uuid产物' }, createdAt: '2026-10-01T00:00:03.000Z' },
      { id: 'k4', type: 'skill', data: { id: 'boss-01', name: '用户自设' }, createdAt: '2026-10-01T00:00:04.000Z' }
    ])

    const repo = new SqliteItemsRepository(dbPath)

    const list = repo.listItems('skill')
    expect(list.find((item) => item.id === 'k1')?.data['id']).toBe('5')
    expect(list.find((item) => item.id === 'k2')?.data['id']).toBe('6')
    expect(list.find((item) => item.id === 'k3')?.data['id']).toBe('7')
    expect(list.find((item) => item.id === 'k4')?.data['id']).toBe('boss-01')
    repo.close()
  }, SQLITE_IO_TIMEOUT)

  it('幂等：二次打开不改变任何 id', () => {
    const dbPath = makeTempDbPath()
    seedV1(dbPath, [
      { id: UUID_A, type: 'role', data: { name: '甲' }, createdAt: '2026-10-01T00:00:01.000Z' },
      { id: UUID_B, type: 'role', data: { name: '乙' }, createdAt: '2026-10-01T00:00:02.000Z' }
    ])

    const first = new SqliteItemsRepository(dbPath)
    const idsAfterFirst = first.listItems('role').map((item) => item.data['id'])
    first.close()

    const second = new SqliteItemsRepository(dbPath)
    expect(second.listItems('role').map((item) => item.data['id'])).toEqual(idsAfterFirst)
    second.close()
  }, SQLITE_IO_TIMEOUT)
})
