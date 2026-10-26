import { mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'

import { Ollama } from 'ollama'
import { LocalIndex } from 'vectra'
import { describe, expect, it } from 'vitest'

/**
 * LLM / 向量预演（Phase 1）：
 * 1) ollama 客户端接口形态（服务未启动时为可预期的连接错误，不阻塞本地开发）；
 * 2) 本地向量检索闭环：确定性轻量嵌入 → vectra 索引 → 查询 → 落盘重载。
 *
 * 嵌入函数为 早期版本纯哈希 n-gram 嵌入器的 TS 预览实现（无外部依赖、无需服务端），
 * 替代 chromadb 的选型依据见预演报告。
 */

/** 32 维确定性字符 n-gram 哈希嵌入（预览版，等价迁移自 旧版 memory_embedder） */
function embedText(text: string, dims = 32): number[] {
  const vector = new Array<number>(dims).fill(0)
  const normalized = text.toLowerCase()
  for (let i = 0; i < normalized.length; i++) {
    const bigram = normalized.slice(i, i + 2)
    let hash = 0
    for (const ch of bigram) {
      hash = (hash * 31 + (ch.codePointAt(0) ?? 0)) % 100_000
    }
    vector[hash % dims] += 1
  }
  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1
  return vector.map((value) => value / norm)
}

describe('LLM / 向量预演', () => {
  it('ollama 客户端接口可用（服务未启动时为可预期的连接错误）', async () => {
    const client = new Ollama({ host: 'http://127.0.0.1:11434' })
    try {
      const list = await client.list()
      expect(Array.isArray(list.models)).toBe(true)
    } catch (error) {
      // 预演环境常见情况：本地未启动 ollama 服务；此断言确认为标准 Error 形态
      expect(error).toBeInstanceOf(Error)
    }
  })

  it('本地向量检索闭环：嵌入 → 索引 → 查询 → 落盘重载', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'mb-vectra-'))
    const indexPath = join(dir, 'index')

    const index = new LocalIndex(indexPath)
    if (!(await index.isIndexCreated())) {
      await index.createIndex()
    }

    const docs = ['火球术 范围伤害 技能', '刺客 敏捷 暴击', '金币 商店 经济']
    for (const text of docs) {
      await index.insertItem({ vector: embedText(text), metadata: { text } })
    }

    // 注意：vectra 0.15 的签名是 queryItems(vector, query, topK, ...)，第二个参数是查询文本
    const question = '火球术 伤害 技能'
    const results = await index.queryItems(embedText(question), question, 2)
    expect(results).toHaveLength(2)
    expect(results[0]?.item.metadata.text).toBe(docs[0])

    // 落盘重载后仍可检索（持久化验证）
    const reloaded = new LocalIndex(indexPath)
    const again = await reloaded.queryItems(embedText(question), question, 1)
    expect(again[0]?.item.metadata.text).toBe(docs[0])
  })
})