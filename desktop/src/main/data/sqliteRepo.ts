import Database from 'better-sqlite3'

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
    const rows = this.db
      .prepare('SELECT id, type, data, created_at, updated_at FROM items WHERE type = ? ORDER BY created_at DESC')
      .all(type) as ItemRow[]
    return rows.map((row) => ({
      id: row.id,
      type: row.type,
      data: JSON.parse(row.data) as Record<string, unknown>,
      createdAt: row.created_at,
      updatedAt: row.updated_at
    }))
  }

  insertItem(record: ItemRecord): void {
    this.db
      .prepare('INSERT INTO items (id, type, data, created_at, updated_at) VALUES (?, ?, ?, ?, ?)')
      .run(record.id, record.type, JSON.stringify(record.data), record.createdAt, record.updatedAt)
  }

  deleteItem(id: string): boolean {
    return this.db.prepare('DELETE FROM items WHERE id = ?').run(id).changes > 0
  }

  close(): void {
    this.db.close()
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