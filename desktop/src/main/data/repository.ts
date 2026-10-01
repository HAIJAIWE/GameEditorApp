import type { ItemRecord } from '../../shared/types'

/**
 * 数据存储抽象：DataService 唯一依赖的接口。
 * 单元测试用内存实现替换，原生 SQLite 实现仅在 Electron 运行时使用。
 */
export interface ItemsRepository {
  listItems(type: string): ItemRecord[]
  insertItem(record: ItemRecord): void
  deleteItem(id: string): boolean
  close(): void
}