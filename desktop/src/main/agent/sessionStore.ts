/**
 * Agent 会话持久化。
 *
 * 与项目既有存储纪律一致：**唯一写者串行队列 + 临时文件 rename 原子写**；
 * 读取分两档——`readActive()` 严格（损坏抛中文错误，便于排障），
 * `tryRestore()` 容错。
 *
 * 路径约定：由调用方注入目录（`main/index.ts` 传 `userData/agent`）。
 * **A2-1 引入多库后只需改注入点**，本模块不感知库结构。
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, readdirSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  buildDraftFile,
  buildSessionSnapshot,
  draftSummaryOf,
  isDraftFile,
  isSessionSnapshot,
  safeDraftFileName,
  sessionInfoFromSnapshot,
  DRAFT_LIST_LIMIT,
  type DraftFile,
  type DraftSummary,
  type SessionInfo,
  type SessionSnapshot
} from '../../shared/agent/session'
import type { AgentRunStats } from '../../shared/agent/observability'

const SESSION_FILE = 'active_session.json'
const METRICS_FILE = 'metrics.jsonl'
const RUNSTATS_FILE = 'runstats.jsonl'
const EVENTS_FILE = 'events.jsonl'
const DRAFTS_DIR = 'drafts'

export class AgentSessionStore {
  /** 写操作串行队列（唯一写者） */
  private writeChain: Promise<unknown> = Promise.resolve()

  constructor(private readonly dir: string) {}

  /** 会话文件绝对路径（排障用） */
  get sessionFilePath(): string {
    return join(this.dir, SESSION_FILE)
  }

  /** 保存会话快照（超长内容截断 + 只留最近 N 条，见 `shared/agent/session.ts`） */
  save(messages: Array<Record<string, unknown>>): Promise<void> {
    return this.enqueue(() => {
      const snapshot = buildSessionSnapshot(messages)
      mkdirSync(this.dir, { recursive: true })
      const path = this.sessionFilePath
      const tmpPath = `${path}.tmp`
      writeFileSync(tmpPath, JSON.stringify(snapshot, null, 2), 'utf-8')
      renameSync(tmpPath, path)
    })
  }

  /** 严格读取：文件不存在返回 null；内容损坏抛中文错误 */
  readActive(): SessionSnapshot | null {
    const path = this.sessionFilePath
    if (!existsSync(path)) return null
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(path, 'utf-8'))
    } catch {
      throw new Error('会话文件损坏（JSON 解析失败）')
    }
    if (!isSessionSnapshot(raw)) {
      throw new Error('会话文件格式不正确：期望 { meta, messages }')
    }
    return raw
  }

  /** 容错读取：任何异常都视为无会话，不抛错 */
  tryRestore(): SessionSnapshot | null {
    try {
      const snapshot = this.readActive()
      if (snapshot === null || snapshot.messages.length === 0) return null
      return snapshot
    } catch {
      return null
    }
  }

  /** 会话摘要（供 UI 询问「是否恢复上次会话」） */
  info(): SessionInfo {
    return sessionInfoFromSnapshot(this.tryRestore())
  }

  /** 清理会话文件；文件本就不存在时返回 false */
  clear(): Promise<boolean> {
    return this.enqueue(() => {
      const path = this.sessionFilePath
      if (!existsSync(path)) return false
      rmSync(path)
      return true
    })
  }

  /** 追加一条部署/会话指标 */
  recordMetric(type: string, payload: Record<string, unknown> = {}): Promise<void> {
    return this.enqueue(() => {
      mkdirSync(this.dir, { recursive: true })
      const entry = { type, timestamp: Math.floor(Date.now() / 1000), ...payload }
      appendFileSync(join(this.dir, METRICS_FILE), `${JSON.stringify(entry)}\n`, 'utf-8')
    })
  }

  /**
   * 落盘一次 `chat()` 的运行统计（F11 观测闭环）：累计 token / 轮数 / 工具数 / 档位 / 成本。
   * 供后续「跨会话成本汇总 / 超预算自动降级（DD-5b 真降级）」消费；写入串行队列，失败不阻塞。
   */
  recordRunStats(stats: AgentRunStats): Promise<void> {
    return this.enqueue(() => {
      mkdirSync(this.dir, { recursive: true })
      const entry = { type: 'run_stats', timestamp: Math.floor(Date.now() / 1000), ...stats }
      appendFileSync(join(this.dir, RUNSTATS_FILE), `${JSON.stringify(entry)}\n`, 'utf-8')
    })
  }

  /**
   * 追加一轮的**事件日志**（append-only，审计/回放用，Slice 29）。
   *
   * 与 `save()` 的区别：
   * - `save()` = 可恢复**快照**（覆盖写、只留最近 N 条消息）；
   * - `recordEvents()` = 不可变**追加日志**（每轮一行，只追加不覆盖）——
   *   提供「这一轮到底发生了什么」的完整轨迹（step/审批/工具结果/turn_stats）。
   *
   * 最小版只做审计，不从日志派生历史（那需要改会话模型，风险高，留待后续）。
   */
  recordEvents(events: readonly unknown[], meta: { sessionId?: string } = {}): Promise<void> {
    return this.enqueue(() => {
      if (events.length === 0) return
      mkdirSync(this.dir, { recursive: true })
      const timestamp = Math.floor(Date.now() / 1000)
      const line = JSON.stringify({ type: 'run_events', timestamp, ...meta, events })
      appendFileSync(join(this.dir, EVENTS_FILE), `${line}\n`, 'utf-8')
    })
  }

  /** 事件日志文件绝对路径（排障/回放用） */
  get eventsFilePath(): string {
    return join(this.dir, EVENTS_FILE)
  }

  /**
   * 保存当前会话为草稿。
   *
   * **从磁盘上的活跃会话快照取数据**，不从渲染层传消息 ——
   * 少一次跨进程传输，也避免「渲染层 state 与落盘不一致时存出旧草稿」。
   * 落盘纪律与 `save()` 一致：临时文件 + rename 原子写。
   *
   * @param name 用户填写的草稿名；空名/全非法字符时回落 `defaultDraftName`
   * @returns 草稿摘要（含 `path`，UI 不构造路径）
   */
  saveDraft(name: string): Promise<DraftSummary> {
    return this.enqueue(() => {
      const fileName = safeDraftFileName(name)
      const snapshot = this.readActive()
      if (snapshot === null || snapshot.messages.length === 0) {
        throw new Error('当前没有可保存的对话（会话为空）')
      }
      const draft = buildDraftFile(fileName, snapshot.messages)
      const dir = this.draftsDir
      mkdirSync(dir, { recursive: true })
      const path = join(dir, `${fileName}.json`)
      const tmpPath = `${path}.tmp`
      writeFileSync(tmpPath, JSON.stringify(draft, null, 2), 'utf-8')
      renameSync(tmpPath, path)
      return draftSummaryOf(draft, path)
    })
  }

  /**
   * 列出最近草稿。
   * 单个草稿损坏时**跳过**而不是整体失败 —— 草稿是辅助功能，不该因为一个坏文件就用不了。
   */
  listDrafts(): DraftSummary[] {
    const dir = this.draftsDir
    if (!existsSync(dir)) return []
    const summaries: DraftSummary[] = []
    for (const entry of readdirSync(dir)) {
      if (!entry.endsWith('.json')) continue
      const path = join(dir, entry)
      try {
        const raw: unknown = JSON.parse(readFileSync(path, 'utf-8'))
        if (!isDraftFile(raw)) continue
        summaries.push(draftSummaryOf(raw, path))
      } catch {
        continue // 坏草稿跳过，不影响其余
      }
    }
    summaries.sort((a, b) => (a.time < b.time ? 1 : a.time > b.time ? -1 : a.path < b.path ? -1 : 1))
    return summaries.slice(0, DRAFT_LIST_LIMIT)
  }

  /** 读指定草稿（**不**写入活跃会话 —— 由调用方决定是否恢复） */
  readDraft(path: string): DraftFile {
    if (!existsSync(path)) throw new Error('草稿文件不存在')
    let raw: unknown
    try {
      raw = JSON.parse(readFileSync(path, 'utf-8'))
    } catch {
      throw new Error('草稿文件损坏（JSON 解析失败）')
    }
    if (!isDraftFile(raw)) throw new Error('草稿文件格式不正确：期望 { name, time, messages }')
    return raw
  }

  /** 草稿目录绝对路径 */
  private get draftsDir(): string {
    return join(this.dir, DRAFTS_DIR)
  }

  /** 写操作串行队列：前一个写完成才执行下一个；失败不阻塞后续任务 */
  private enqueue<T>(op: () => T): Promise<T> {
    const run = this.writeChain.then(op)
    this.writeChain = run.catch(() => undefined)
    return run
  }
}
