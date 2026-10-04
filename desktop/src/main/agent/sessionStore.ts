/**
 * Agent 会话持久化（自 Python `core/agent/brain_session.py` 的会话存取匹平迁移，A1-3）。
 *
 * 与项目既有存储纪律一致：**唯一写者串行队列 + 临时文件 rename 原子写**；
 * 读取分两档——`readActive()` 严格（损坏抛中文错误，便于排障），
 * `tryRestore()` 容错（任何异常都视为「无会话」，对齐 Python `_try_restore_session`）。
 *
 * 路径约定：由调用方注入目录（`main/index.ts` 传 `userData/agent`）。
 * **A2-1 引入多库后只需改注入点**，本模块不感知库结构。
 */

import { appendFileSync, existsSync, mkdirSync, readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

import {
  buildSessionSnapshot,
  isSessionSnapshot,
  sessionInfoFromSnapshot,
  type SessionInfo,
  type SessionSnapshot
} from '../../shared/agent/session'

const SESSION_FILE = 'active_session.json'
const METRICS_FILE = 'metrics.jsonl'

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

  /** 容错读取（对齐 Python `_try_restore_session`）：任何异常都视为无会话，不抛错 */
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

  /** 追加一条部署/会话指标（对齐 Python `_record_deploy_metric` 的 metrics.jsonl） */
  recordMetric(type: string, payload: Record<string, unknown> = {}): Promise<void> {
    return this.enqueue(() => {
      mkdirSync(this.dir, { recursive: true })
      const entry = { type, timestamp: Math.floor(Date.now() / 1000), ...payload }
      appendFileSync(join(this.dir, METRICS_FILE), `${JSON.stringify(entry)}\n`, 'utf-8')
    })
  }

  /** 写操作串行队列：前一个写完成才执行下一个；失败不阻塞后续任务 */
  private enqueue<T>(op: () => T): Promise<T> {
    const run = this.writeChain.then(op)
    this.writeChain = run.catch(() => undefined)
    return run
  }
}
