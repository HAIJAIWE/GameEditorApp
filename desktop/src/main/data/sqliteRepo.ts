import Database from 'better-sqlite3'

import { safeJsonParse } from '../../shared/util/safeJson'
import type { ItemRecord } from '../../shared/types'
import type { ItemsRepository } from './repository'

interface ItemRow {
  id: string
  type: string
  data: string
  created_at: string
  updated_at: string
}

/** 基于 SQLite 的存储实现（WAL 模式；句柄仅被 DataService 持有） */
export class SqliteItemsRepository implements ItemsRepository {
  private readonly db: Database.Database

  constructor(dbPath: string) {
    this.db = new Database(dbPath)
    this.db.pragma('journal_mode = WAL')
    this.migrate()
  }

  listItems(type: string): ItemRecord[] {
    // 按创建顺序**升序**（新条目沉底，对齐 PyQt 列表的插入序展示——PyQt data_tab 是
    // list_widget 按 items 数组顺序 addItem，新建即追加到末尾）。
    // rowid 兜底：同一秒内批量创建/导入的条目 created_at 相同，用插入序保证稳定不抖动。
    // 此前误写 DESC「最新在前」，用户实测反馈「顺序搞反了，新建的应该在底部」——2026-10-13 修正。
    const rows = this.db
      .prepare(
        'SELECT id, type, data, created_at, updated_at FROM items WHERE type = ? ORDER BY created_at ASC, rowid ASC'
      )
      .all(type) as ItemRow[]
    return rows.map((row) => this.rowToRecord(row))
  }

  findItem(id: string): ItemRecord | undefined {
    const row = this.db
      .prepare('SELECT id, type, data, created_at, updated_at FROM items WHERE id = ?')
      .get(id) as ItemRow | undefined
    return row ? this.rowToRecord(row) : undefined
  }

  listAllItems(): ItemRecord[] {
    const rows = this.db
      .prepare('SELECT id, type, data, created_at, updated_at FROM items ORDER BY type, created_at ASC')
      .all() as ItemRow[]
    return rows.map((row) => this.rowToRecord(row))
  }

  insertItem(record: ItemRecord): void {
    this.db
      .prepare('INSERT INTO items (id, type, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(record.id, record.type, JSON.stringify(record.data), record.createdAt, record.updatedAt)
  }

  /**
   * ⚠️ 冲突时**刻意不更新 `created_at`**（SET 列表里没有它）——这是「导入已存在 id 时
   * 保留原创建时间」的落点（见 `DataService.importRecords` 的注释）。
   * 改这条 SQL 前请先读那边的契约说明，否则会静默改掉导入语义。
   */
  upsertItem(record: ItemRecord): void {
    this.db
      .prepare(
        `INSERT INTO items (id, type, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET type = excluded.type, data = excluded.data, updated_at = excluded.updated_at`
      )
      .run(record.id, record.type, JSON.stringify(record.data), record.createdAt, record.updatedAt)
  }

  exists(id: string): boolean {
    return this.db.prepare('SELECT 1 FROM items WHERE id = ?').get(id) !== undefined
  }

  deleteItem(id: string): boolean {
    return this.db.prepare('DELETE FROM items WHERE id = ?').run(id).changes > 0
  }

  close(): void {
    this.db.close()
  }

  private rowToRecord(row: ItemRow): ItemRecord {
    return {
      id: row.id,
      type: row.type,
      // 容错：行数据损坏时返回空对象，不让单条坏记录把整个列表读崩
      data: safeJsonParse(row.data, {}) as Record<string, unknown>,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }
  }

  /** 迁移：以 PRAGMA user_version 记录 schema 版本，版本只增不改 */
  private migrate(): void {
    const version = this.db.pragma('user_version', { simple: true }) as number
    if (version < 1) {
      this.db.exec(`
        CREATE TABLE IF NOT EXISTS items (
          id TEXT PRIMARY KEY,
          type TEXT NOT NULL,
          data TEXT NOT NULL,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_items_type ON items(type);
        PRAGMA user_version = 1;
      `)
    }
  }
}