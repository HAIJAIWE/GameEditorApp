/**
 * Agent 语义记忆检索（A1-3）：vectra `LocalIndex` + 确定性 n-gram 嵌入。
 *
 * 选型依据见 `docs/a-tier-plan.md` §2.5：Python 侧是自研 n-gram/TF-IDF（`memory_embedder.py`），
 * TS 侧用 `vectra` 0.15（纯 TS + 文件持久化，无需外部服务）替代；嵌入函数保持确定性，
 * 使「命中/未命中」可在单测里锁死。
 *
 * 路径约定：由调用方注入目录，索引落在 `<dir>/memory-index`。
 */

import { join } from 'node:path'

import { LocalIndex } from 'vectra'

import { embedText } from '../../shared/agent/memory'

export interface MemoryHit {
  id: string
  text: string
  score: number
  metadata: Record<string, unknown>
}

export class AgentMemoryStore {
  private readonly index: LocalIndex

  constructor(dir: string) {
    this.index = new LocalIndex(join(dir, 'memory-index'))
  }

  private async ensureIndex(): Promise<LocalIndex> {
    if (!(await this.index.isIndexCreated())) {
      await this.index.createIndex()
    }
    return this.index
  }

  /** 写入一条记忆（metadata.text 保存原文，检索时直接回读） */
  async add(text: string, metadata: Record<string, unknown> = {}): Promise<void> {
    const index = await this.ensureIndex()
    await index.insertItem({ vector: embedText(text), metadata: { ...metadata, text } })
  }

  /** 语义检索：返回按相似度倒序的前 topK 条 */
  async search(query: string, topK = 5): Promise<MemoryHit[]> {
    const index = await this.ensureIndex()
    const results = await index.queryItems(embedText(query), query, topK)
    return results.map((result) => {
      const metadata = (result.item.metadata ?? {}) as Record<string, unknown>
      return {
        id: result.item.id,
        text: typeof metadata.text === 'string' ? metadata.text : '',
        score: result.score,
        metadata
      }
    })
  }

  /** 当前索引条目数 */
  async count(): Promise<number> {
    const index = await this.ensureIndex()
    return (await index.listItems()).length
  }
}
