import { randomUUID } from 'node:crypto'

import type { CreateItemInput } from '../../shared/schemas'
import type { ItemRecord } from '../../shared/types'
import type { ItemsRepository } from './repository'

/**
 * 数据服务：全应用唯一的数据写入者。
 * - 写操作经内部串行队列执行，从结构上消除并发写竞态；
 * - 其余模块（UI、Agent 等）只能经此服务访问数据，不得直接触达存储。
 */
export class DataService {
  private writeChain: Promise<unknown> = Promise.resolve()

  constructor(private readonly repo: ItemsRepository) {}

  listItems(type: string): ItemRecord[] {
    return this.repo.listItems(type)
  }

  createItem(input: CreateItemInput): Promise<ItemRecord> {
    return this.enqueueWrite(() => {
      const now = new Date().toISOString()
      const record: ItemRecord = {
        id: randomUUID(),
        type: input.type,
        data: input.data,
        createdAt: now,
        updatedAt: now
      }
      this.repo.insertItem(record)
      return record
    })
  }

  deleteItem(id: string): Promise<boolean> {
    return this.enqueueWrite(() => this.repo.deleteItem(id))
  }

  dispose(): void {
    this.repo.close()
  }

  /** 写操作串行队列：前一个写完成才执行下一个；失败不阻塞后续任务 */
  private enqueueWrite<T>(op: () => T): Promise<T> {
    const run = this.writeChain.then(op)
    this.writeChain = run.catch(() => undefined)
    return run
  }
}