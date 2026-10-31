/**
 * 会话全文检索索引（#25 对齐 dsh `session-query-sqlite`：SQLite **FTS5**）。
 *
 * 与 dsh 一致：用 SQLite FTS5 建全文索引，供智能体按关键词检索历史会话。
 * 数据源是本库的 `turns.jsonl`（`AgentSessionStore.readTurns()`），**只读**。
 *
 * 设计取舍：
 * - 用**内存库**（`:memory:`）按 `turns.jsonl` 的 mtime 懒重建——会话日志是追加写、量不大，
 *   首次检索时建一次，之后 mtime 不变则复用；避免引入额外的磁盘索引文件与失效逻辑。
 * - 授权：`AgentSessionStore` 是**按库隔离**的（每个 `<库>/agent` 一份），故索引天然只含本库会话，
 *   跨库不可见（对应 dsh 的「target cwd 必须与 caller 一致」的等价约束）。
 * - 检索结果按会话去重（保留最新命中），并排除调用方当前会话。
 */

import Database from 'better-sqlite3'
import { statSync } from 'node:fs'

import {
  deriveMessagesFromTurns,
  groupSessionTurns,
  type SessionTurnSummary
} from '../../../shared/agent/conversation'
import type { AgentSessionStore } from './sessionStore'

/** 单条检索命中（按会话聚合） */
export interface SessionSearchHit {
  sessionId: string
  title: string
  /** FTS5 高亮片段（命中词用 [] 包裹） */
  snippet: string
  lastActivity: number
  messageCount: number
}

/** CJK 字符（汉字/假名/谚文）——FTS5 unicode61 会把连续 CJK 当成**一个 token**，需逐字切开 */
const CJK_CHAR = /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff\uac00-\ud7af\uf900-\ufaff]/

/**
 * CJK 逐字切分：把每个 CJK 字符用空格隔开（ASCII 词保持原样），
 * 使 FTS5 的 unicode61 分词器把汉字拆成单字 token，从而支持中文子串检索。
 * 例：`设计战斗系统` → `设 计 战 斗 系 统`；`hp值` → `hp 值`。
 */
function segment(text: string): string {
  let out = ''
  for (const char of text) {
    out += CJK_CHAR.test(char) ? ` ${char} ` : char
  }
  return out.replace(/\s+/g, ' ').trim()
}

/**
 * 把用户输入切成 FTS5 安全的多词 OR 查询。
 * 每个词先做 CJK 逐字切分，再包成**短语**（相邻 token 连续匹配），实现中文子串检索。
 * 例：`战斗` → `"战 斗"`；`技能 属性` → `"技 能" OR "属 性"`。
 */
function toFtsMatch(query: string): string {
  return query
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word !== '')
    .map((word) => {
      const seg = segment(word)
      return seg === '' ? '' : `"${seg.replace(/"/g, '""')}"`
    })
    .filter((phrase) => phrase !== '')
    .join(' OR ')
}

/** 用**原始文本**生成高亮片段（FTS5 snippet 作用在切分后的文本上会带空格，故自建） */
function buildSnippet(raw: string, query: string): string {
  const words = query
    .split(/\s+/)
    .map((word) => word.trim())
    .filter((word) => word !== '')
  const lower = raw.toLowerCase()
  let hit = -1
  let hitLen = 0
  for (const word of words) {
    const idx = lower.indexOf(word.toLowerCase())
    if (idx !== -1 && (hit === -1 || idx < hit)) {
      hit = idx
      hitLen = word.length
    }
  }
  if (hit === -1) return raw.slice(0, 120)
  const start = Math.max(0, hit - 40)
  const end = Math.min(raw.length, hit + hitLen + 40)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < raw.length ? '…' : ''
  return `${prefix}${raw.slice(start, hit)}[${raw.slice(hit, hit + hitLen)}]${raw.slice(hit + hitLen, end)}${suffix}`
}

/** 文件 mtime（毫秒）；不存在/不可读返回 0（视为空索引） */
function fileMtime(path: string): number {
  try {
    return statSync(path).mtimeMs
  } catch {
    return 0
  }
}

function clampLimit(raw: unknown, fallback: number): number {
  const value = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(value) || value <= 0) return fallback
  return Math.min(Math.trunc(value), 200)
}

export class SessionSearchIndex {
  private db: Database.Database | null = null
  private builtMtime = -1
  /**
   * 按 `builtMtime` 缓存的解析结果：FTS 库已按 mtime 懒重建，
   * 但 `search`/`list`/`readSession` 原本每次都重新 `readTurns()`（读盘+逐行 JSON.parse）+ `groupSessionTurns`。
   * 这里把二者也按同一 mtime 缓存，文件未变则不重读不重算（详见 `ensureFresh`）。
   */
  private turnsCache: Array<Record<string, unknown>> | null = null
  private summariesCache: SessionTurnSummary[] | null = null

  constructor(private readonly store: AgentSessionStore) {}

  /** 按 turns.jsonl 的 mtime 懒重建内存 FTS5 索引 */
  private ensureFresh(): Database.Database {
    const mtime = fileMtime(this.store.turnsFilePath)
    if (this.db !== null && mtime === this.builtMtime) return this.db

    this.db?.close()
    const db = new Database(':memory:')
    // content = CJK 逐字切分后的可检索文本；raw = 原始文本（UNINDEXED，供生成干净片段）
    db.exec('CREATE VIRTUAL TABLE turns_fts USING fts5(session_id UNINDEXED, ts UNINDEXED, raw UNINDEXED, content)')
    const insert = db.prepare('INSERT INTO turns_fts (session_id, ts, raw, content) VALUES (?, ?, ?, ?)')
    const rows = this.store.readTurns()
    const build = db.transaction((items: Array<Record<string, unknown>>) => {
      for (const row of items) {
        const sessionId = typeof row.sessionId === 'string' ? row.sessionId : ''
        if (sessionId === '') continue
        const ts = typeof row.timestamp === 'number' ? row.timestamp : 0
        const messages = Array.isArray(row.messages) ? (row.messages as Array<Record<string, unknown>>) : []
        const raw = messages
          .map((message) => (typeof message.content === 'string' ? `${String(message.role)}: ${message.content}` : ''))
          .filter((text) => text !== '')
          .join('\n')
        if (raw === '') continue
        insert.run(sessionId, ts, raw, segment(raw))
      }
    })
    build(rows)
    this.turnsCache = rows
    this.summariesCache = groupSessionTurns(rows)
    this.db = db
    this.builtMtime = mtime
    return db
  }

  /** 返回按 mtime 缓存的 turns.jsonl 解析结果（文件未变则不重读重解析） */
  private freshTurns(): Array<Record<string, unknown>> {
    this.ensureFresh()
    return this.turnsCache ?? []
  }

  /** 返回按 mtime 缓存的会话摘要（文件未变则不重算 `groupSessionTurns`） */
  private freshSummaries(): SessionTurnSummary[] {
    this.ensureFresh()
    return this.summariesCache ?? []
  }

  /** FTS5 检索：按会话去重（保留最新命中），排除当前会话，按最后活跃倒序 */
  search(query: string, opts: { excludeSession?: string; limit?: number } = {}): SessionSearchHit[] {
    const match = toFtsMatch(query)
    if (match === '') return []
    const db = this.ensureFresh()
    const limit = clampLimit(opts.limit, 20)
    const rows = db
      .prepare(`SELECT session_id AS sid, ts, raw FROM turns_fts WHERE turns_fts MATCH ? ORDER BY ts DESC`)
      .all(match) as Array<{ sid: string; ts: number; raw: string }>

    const summaries = new Map<string, SessionTurnSummary>()
    for (const summary of this.freshSummaries()) summaries.set(summary.sessionId, summary)

    const seen = new Set<string>()
    const hits: SessionSearchHit[] = []
    for (const row of rows) {
      if (row.sid === opts.excludeSession) continue
      if (seen.has(row.sid)) continue
      seen.add(row.sid)
      const info = summaries.get(row.sid)
      hits.push({
        sessionId: row.sid,
        title: info?.title ?? '(会话)',
        snippet: buildSnippet(row.raw, query),
        lastActivity: info?.lastActivity ?? row.ts,
        messageCount: info?.messageCount ?? 0
      })
      if (hits.length >= limit) break
    }
    return hits
  }

  /** 读取指定会话的消息（按轮次顺序重建，取最后 limit 条） */
  readSession(sessionId: string, limit = 50): Array<Record<string, unknown>> {
    const turns = this.freshTurns().filter((turn) => turn.sessionId === sessionId)
    const messages = deriveMessagesFromTurns(turns)
    return messages.slice(-clampLimit(limit, 50))
  }

  /** 列出最近会话摘要（按最后活跃倒序） */
  list(): SessionTurnSummary[] {
    return this.freshSummaries()
  }

  /** 释放内存库（切换库/测试清理用） */
  close(): void {
    this.db?.close()
    this.db = null
    this.builtMtime = -1
    this.turnsCache = null
    this.summariesCache = null
  }
}
