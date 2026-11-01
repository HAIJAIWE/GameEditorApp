/**
 * Agent 语义记忆检索（A1-3 + F3）：vectra `LocalIndex` + 可插拔嵌入。
 *
 * 默认嵌入 = `shared/agent/memory.ts` 的确定性 32 维 bigram 哈希（无需外部服务、可单测锁死）；
 * 若显式配置 `MB_MEMORY_EMBED_MODEL`，则用 Ollama 真实 embedding（见 `embedding.ts`）。
 *
 * 路径约定：由调用方注入目录，索引落在 `<dir>/memory-index`；同目录下还存放：
 *  - `MEMORY.md`：项目级长期记忆（F2，循环会读取并注入提示词）
 *  - `learnings.jsonl`：从成功对话轮次萃取的可沉淀知识（F3）
 *  - `embedding.json`：索引版本（嵌入模型 id）。换模型 ⇒ 自动重建索引，避免维度/语义不一致
 *
 * ## 失败策略（记忆是辅助功能）
 * - 真实 embedding 不可用 ⇒ 本次读写**优雅跳过**（不把异维度向量混入索引，也不阻塞主流程）；
 * - 检索在相似度基础上叠加**近因加权**（F3），避免陈旧记忆永远压顶。
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import { LocalIndex } from 'vectra'

import { hashEmbeddingProvider, type EmbeddingProvider } from '../brain/embedding'

export interface MemoryHit {
  id: string
  text: string
  score: number
  metadata: Record<string, unknown>
}

export interface AgentMemoryStoreOptions {
  /** 嵌入提供者；缺省/`null` ⇒ 确定性哈希（默认档） */
  embedder?: EmbeddingProvider | null
}

const LONG_TERM_FILE = 'MEMORY.md'
const LEARNINGS_FILE = 'learnings.jsonl'
const VERSION_FILE = 'embedding.json'
/** 近因半衰期（7 天）：越新的记忆评分越略升，避免陈旧条目恒压顶 */
const RECENCY_HALF_LIFE_MS = 1000 * 60 * 60 * 24 * 7
/** 检索时多取一些再做近因重排，保证重排后有足够 topK */
const RERANK_FETCH_MULTIPLIER = 3

export class AgentMemoryStore {
  private readonly index: LocalIndex
  private readonly embedder: EmbeddingProvider

  constructor(private readonly dir: string, options: AgentMemoryStoreOptions = {}) {
    this.index = new LocalIndex(join(dir, 'memory-index'))
    this.embedder = options.embedder ?? hashEmbeddingProvider
  }

  /**
   * 确保索引存在且与当前嵌入模型匹配。
   * 换 embedding 模型（id 变化）⇒ 旧向量维度/语义都失效，必须重建。
   * 老索引无版本文件且当前是默认哈希 ⇒ 视为匹配（不误删用户既有记忆）。
   */
  private async ensureIndex(): Promise<LocalIndex> {
    const exists = await this.index.isIndexCreated()
    if (!exists) {
      await this.index.createIndex()
      this.writeVersion()
      return this.index
    }
    const stored = this.readVersion()
    const needsRebuild =
      stored === null ? this.embedder.id !== hashEmbeddingProvider.id : stored !== this.embedder.id
    if (needsRebuild) {
      await this.index.deleteIndex()
      await this.index.createIndex()
      this.writeVersion()
    }
    return this.index
  }

  private versionPath(): string {
    return join(this.dir, VERSION_FILE)
  }

  private readVersion(): string | null {
    const path = this.versionPath()
    if (!existsSync(path)) return null
    try {
      const raw = JSON.parse(readFileSync(path, 'utf-8')) as { id?: unknown }
      return typeof raw.id === 'string' ? raw.id : null
    } catch {
      return null
    }
  }

  private writeVersion(): void {
    try {
      mkdirSync(this.dir, { recursive: true })
      writeFileSync(this.versionPath(), JSON.stringify({ id: this.embedder.id }), 'utf-8')
    } catch {
      // 版本文件写失败不阻塞（下次会重试重建判定）
    }
  }

  /** 安全嵌入：provider 失败返回 null（调用方跳过本次读写，绝不混入异维度向量） */
  private async embedSafely(text: string): Promise<number[] | null> {
    try {
      return await this.embedder.embed(text)
    } catch {
      return null
    }
  }

  /** 写入一条记忆（metadata.text 保存原文、ts 记录写入时间供近因重排） */
  async add(text: string, metadata: Record<string, unknown> = {}): Promise<void> {
    const index = await this.ensureIndex()
    const vector = await this.embedSafely(text)
    if (vector === null) return
    await index.insertItem({ vector, metadata: { ...metadata, text, ts: Date.now() } })
  }

  /**
   * 语义检索：相似度为主、近因加权重排（F3）。
   * 先多取一批，按 `score × 近因因子` 重排后返回前 topK 条。
   */
  async search(query: string, topK = 5): Promise<MemoryHit[]> {
    const index = await this.ensureIndex()
    const vector = await this.embedSafely(query)
    if (vector === null) return []
    const fetchK = Math.max(topK, 1) * RERANK_FETCH_MULTIPLIER
    let results: Awaited<ReturnType<LocalIndex['queryItems']>>
    try {
      results = await index.queryItems(vector, query, fetchK)
    } catch {
      // 维度不一致等索引异常 ⇒ 记忆检索降级为空，不阻塞主流程
      return []
    }
    if (results.length === 0) return []
    const now = Date.now()
    const reranked = results
      .map((result) => {
        const meta = (result.item.metadata ?? {}) as Record<string, unknown>
        const ts = typeof meta.ts === 'number' ? meta.ts : 0
        const recency = ts > 0 ? 1 + 0.15 * Math.exp(-(now - ts) / RECENCY_HALF_LIFE_MS) : 1
        return { result, score: result.score * recency }
      })
      .sort((a, b) => b.score - a.score)
    return reranked.slice(0, topK).map(({ result }) => {
      const metadata = (result.item.metadata ?? {}) as Record<string, unknown>
      return {
        id: result.item.id,
        text: typeof metadata.text === 'string' ? metadata.text : '',
        score: result.score,
        metadata
      }
    })
  }

  /** 当前索引条目数（索引异常时返回 0，不抛错） */
  async count(): Promise<number> {
    try {
      const index = await this.ensureIndex()
      return (await index.listItems()).length
    } catch {
      return 0
    }
  }

  /** 读取项目级长期记忆 `MEMORY.md`（F2）；不存在/为空返回 null（不阻塞主流程） */
  async loadLongTerm(): Promise<string | null> {
    const path = join(this.dir, LONG_TERM_FILE)
    if (!existsSync(path)) return null
    try {
      const text = readFileSync(path, 'utf-8').trim()
      return text.length > 0 ? text : null
    } catch {
      return null
    }
  }

  /** 读取已萃取的可沉淀知识（F3），返回最近 limit 条 */
  async loadLearnings(limit = 20): Promise<string[]> {
    const path = join(this.dir, LEARNINGS_FILE)
    if (!existsSync(path)) return []
    try {
      return readFileSync(path, 'utf-8')
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line !== '')
        .slice(-limit)
    } catch {
      return []
    }
  }

  /** 追加一条可沉淀知识到 `learnings.jsonl`（F3） */
  async recordLearning(text: string): Promise<void> {
    if (text.trim() === '') return
    mkdirSync(this.dir, { recursive: true })
    appendFileSync(join(this.dir, LEARNINGS_FILE), `${text.trim()}\n`, 'utf-8')
  }
}

/**
 * 从一段对话轮次文本中**启发式萃取**可沉淀知识（F3 雏形）。
 * 极简规则：抽取以「记住/以后/约定/规则/注意/务必/不要/别」等开头的陈述句，
 * 作为长期 learnings 候选。后续可升级为 LLM 萃取，但先以确定性规则兜底。
 */
export function extractLearnings(turnText: string): string[] {
  return turnText
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => /^(记住|以后|约定|规则|注意|务必|不要|别|约定)/.test(line) && line.length <= 200)
}
