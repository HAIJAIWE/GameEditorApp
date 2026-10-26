import Database from 'better-sqlite3'

import { planShortIdBackfill } from '../../shared/util/itemId'
import { safeJsonParse } from '../../shared/util/safeJson'
import type { ItemRecord } from '../../shared/types'
import type { ItemsRepository } from './repository'

interface ItemRow {
  id: string
  type: string
  data: string
  created_at: string
  updated_at: string
  /** 「AI 生成、待核对」时间戳；NULL = 人工创建或已核对（迁移 v3 新增列，旧库读出来是 NULL） */
  ai_generated_at: string | null
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
    // 按创建顺序**升序**（新条目沉底，对齐 旧版 列表的插入序展示——旧版 data_tab 是
    // list_widget 按 items 数组顺序 addItem，新建即追加到末尾）。
    // rowid 兜底：同一秒内批量创建/导入的条目 created_at 相同，用插入序保证稳定不抖动。
    // 此前误写 DESC「最新在前」，用户实测反馈「顺序搞反了，新建的应该在底部」——2026-10-13 修正。
    const rows = this.db
      .prepare(
        'SELECT id, type, data, created_at, updated_at, ai_generated_at FROM items WHERE type = ? ORDER BY created_at ASC, rowid ASC'
      )
      .all(type) as ItemRow[]
    return rows.map((row) => this.rowToRecord(row))
  }

  findItem(id: string): ItemRecord | undefined {
    const row = this.db
      .prepare('SELECT id, type, data, created_at, updated_at, ai_generated_at FROM items WHERE id = ?')
      .get(id) as ItemRow | undefined
    return row ? this.rowToRecord(row) : undefined
  }

  listAllItems(): ItemRecord[] {
    const rows = this.db
      .prepare('SELECT id, type, data, created_at, updated_at, ai_generated_at FROM items ORDER BY type, created_at ASC')
      .all() as ItemRow[]
    return rows.map((row) => this.rowToRecord(row))
  }

  insertItem(record: ItemRecord): void {
    this.db
      .prepare(
        'INSERT INTO items (id, type, data, created_at, updated_at, ai_generated_at) VALUES (?, ?, ?, ?, ?, ?)'
      )
      .run(
        record.id,
        record.type,
        JSON.stringify(record.data),
        record.createdAt,
        record.updatedAt,
        record.aiGeneratedAt ?? null
      )
  }

  /**
   * ⚠️ 冲突时**刻意不更新 `created_at`**（SET 列表里没有它）——这是「导入已存在 id 时
   * 保留原创建时间」的落点（见 `DataService.importRecords` 的注释）。
   * 改这条 SQL 前请先读那边的契约说明，否则会静默改掉导入语义。
   */
  upsertItem(record: ItemRecord): void {
    this.db
      .prepare(
        `INSERT INTO items (id, type, data, created_at, updated_at, ai_generated_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET type = excluded.type, data = excluded.data, updated_at = excluded.updated_at`
      )
      /*
       * 冲突分支**刻意不带 ai_generated_at**：与 `created_at` 同理，导入已存在条目时
       * 保留原标记状态 —— 导入是数据搬运，不该把「待核对」洗掉，也不该凭空打上。
       */
      .run(
        record.id,
        record.type,
        JSON.stringify(record.data),
        record.createdAt,
        record.updatedAt,
        record.aiGeneratedAt ?? null
      )
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
      updatedAt: row.updated_at,
      aiGeneratedAt: row.ai_generated_at ?? undefined
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
    if (version < 2) {
      this.backfillShortItemIds()
      this.db.pragma('user_version = 2')
    }
    if (version < 3) {
      this.addAiGeneratedColumn()
      this.db.pragma('user_version = 3')
    }
  }

  /**
   * user_version 3：给条目加「AI 生成、待核对」时间戳列。
   *
   * 为什么用独立列而不是塞进 `data` JSON：塞进去会漏进条目表单（多出一个字段）、
   * 也会被 CSV/Excel/Lua 导出带出去。列是**元数据**，与 `created_at`/`updated_at` 同性质。
   *
   * `ADD COLUMN` 幂等由 `user_version` 保证（只跑一次）；旧库加列后该列为 NULL，
   * 读出来即 `undefined`（人工条目），不需要回填。
   */
  private addAiGeneratedColumn(): void {
    this.db.exec('ALTER TABLE items ADD COLUMN ai_generated_at TEXT')
  }

  /**
   * user_version 2（2026-10-13）：回填条目业务短 id `data.id`。
   *
   * 背景：TS 迁移期把 `data.id` 强制对齐记录 uuid（36 位），列表/表单外显
   * `ID:1a2b3c4d`，与 旧版 参考（`ID:0 | 火球术 | 攻击`，`generate_id` 短序号）
   * 相反——用户反馈「Id不对」，其真实库 40 条 data.id 全缺失。现按 旧版 语义
   * 回填：每类型独立、created_at 升序（rowid 兜底同秒）、从现有数值 id 的
   * max+1 起分配。**只补缺失/空/uuid 形态**，用户自设的非数值 id 不动。
   * 幂等：回填后所有条目均有合法短 id，再跑返回空规划。
   */
  private backfillShortItemIds(): void {
    const rows = this.db
      .prepare('SELECT id, type, data, created_at FROM items ORDER BY type, created_at ASC, rowid ASC')
      .all() as ItemRow[]

    const byType = new Map<string, ItemRecord[]>()
    for (const row of rows) {
      const group = byType.get(row.type)
      if (group) {
        group.push(this.rowToRecord(row))
      } else {
        byType.set(row.type, [this.rowToRecord(row)])
      }
    }

    const update = this.db.prepare('UPDATE items SET data = ? WHERE id = ?')
    const applyAssignments = this.db.transaction(
      (assignments: Array<{ id: string; data: Record<string, unknown> }>) => {
        for (const assignment of assignments) {
          update.run(JSON.stringify(assignment.data), assignment.id)
        }
      }
    )

    for (const group of byType.values()) {
      const plan = planShortIdBackfill(group)
      if (plan.size === 0) continue
      applyAssignments(
        group
          .filter((item) => plan.has(item.id))
          .map((item) => ({ id: item.id, data: { ...item.data, id: plan.get(item.id) } }))
      )
    }
  }
}