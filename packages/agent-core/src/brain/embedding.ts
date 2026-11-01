/**
 * 记忆嵌入提供者（F3 真实 embedding）。
 *
 * ## 为什么 opt-in
 * 本项目环境未必装了 embedding 模型（设计文档 §11 已裁定不强行引入）。故默认仍用
 * `shared/agent/memory.ts` 的确定性 32 维 bigram 哈希；仅当显式设置
 * `MB_MEMORY_EMBED_MODEL`（如 `nomic-embed-text`）时，才走 Ollama `/api/embeddings`。
 *
 * ## 失败策略
 * 真实 provider 不可用（未启动 / 无模型 / 网络错）时，调用方 `memoryStore` 会**优雅跳过**
 * 该次读写（记忆是辅助功能，不阻塞主流程），而不是把不同维度的向量混进同一索引。
 * 索引侧配 `embedding.json` 版本校验：换模型会自动重建索引，避免「维度/语义不一致」。
 */

import { embedText } from '@mobai/shared/agent/conversation'

export interface EmbeddingProvider {
  /** 模型标识（写进索引版本文件；换 id 必重建索引） */
  id: string
  embed: (text: string) => Promise<number[]>
}

const DEFAULT_HOST = 'http://127.0.0.1:11434'

/** 确定性哈希嵌入（无外部依赖、永远可用；也是默认档） */
export const hashEmbeddingProvider: EmbeddingProvider = {
  id: 'bigram-32',
  embed: async (text) => embedText(text)
}

/**
 * 构造 Ollama 真实 embedding provider；未配置 `MB_MEMORY_EMBED_MODEL` 时返回 null
 * （调用方回落到 `hashEmbeddingProvider`）。
 */
export function createOllamaEmbeddingProvider(): EmbeddingProvider | null {
  const model = (process.env['MB_MEMORY_EMBED_MODEL'] ?? '').trim()
  if (model === '') return null
  const host = (process.env['MB_OLLAMA_HOST'] ?? DEFAULT_HOST).replace(/\/+$/, '')
  return {
    id: `ollama:${model}`,
    async embed(text: string): Promise<number[]> {
      const response = await fetch(`${host}/api/embeddings`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ model, prompt: text })
      })
      if (!response.ok) {
        throw new Error(`embedding 调用失败（HTTP ${response.status}）`)
      }
      const payload = (await response.json().catch(() => ({}))) as { embedding?: unknown }
      if (!Array.isArray(payload.embedding) || payload.embedding.length === 0) {
        throw new Error('embedding 响应为空')
      }
      return payload.embedding as number[]
    }
  }
}
