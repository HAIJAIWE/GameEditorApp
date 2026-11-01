import type { ItemRecord } from '@mobai/shared/types'

/**
 * 数据存储抽象：DataService 唯一依赖的接口。
 * 单元测试用内存实现替换，原生 SQLite 实现仅在 Electron 运行时使用。
 */
export interface ItemsRepository {
  listItems(type: string): ItemRecord[]
  listAllItems(): ItemRecord[]
  findItem(id: string): ItemRecord | undefined
  insertItem(record: ItemRecord): void
  /** 按 id 插入或更新（旧数据导入用；更新时保留原 createdAt） */
  upsertItem(record: ItemRecord): void
  exists(id: string): boolean
  deleteItem(id: string): boolean
  close(): void
}