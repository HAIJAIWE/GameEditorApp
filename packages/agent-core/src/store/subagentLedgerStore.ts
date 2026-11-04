import { mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'

import {
  reconcileInterrupted,
  trimLedger,
  type SubagentLedgerPort,
  type SubagentRecord,
  type SubagentStatus
} from '@mobai/shared/agent/brain'

/**
 * 子智能体账本的落盘实现（跨轮冷恢复）。
 *
 * 分工：`shared/agent/brain/loop.ts` 只管埋点（`SubagentLedgerPort`），
 * 落盘与冷启动对账在这里。文件是 userData 下的 `subagents.json`。
 *
 * ## 三条设计约束
 * 1. **不阻塞主流程**：读写异常一律吞掉并打日志。账本是可观测性设施，
 *    不能因为它写不进去就让一次 AI 答复失败。
 * 2. **保留上限**：只留最近 `SUBAGENT_LEDGER_LIMIT` 条，防长期使用后 json 膨胀。
 * 3. **冷启动对账**：`reconcile()` 把所有 `running` 标为 `interrupted` ——
 *    新进程里不可能还有上一条命运行中的子任务；保留 task 便于 UI 提示与重新派发。
 */
export interface SubagentLedgerStore {
  /** 传给 `runBrainLoop` 的埋点口 */
  port: SubagentLedgerPort
  /** 冷启动对账；返回本次被标为中断的记录（无变化时为空数组） */
  reconcile(now?: number): SubagentRecord[]
  /** 全部记录，按 `startedAt` 倒序（新→旧） */
  list(): SubagentRecord[]
}

const STATUSES: readonly SubagentStatus[] = ['running', 'done', 'failed', 'interrupted']

/** 文件可能来自旧版本或被手改：逐条校验，坏记录直接丢弃而不是让整个账本失效。 */
function isRecord(value: unknown): value is SubagentRecord {
  if (typeof value !== 'object' || value === null) return false
  const record = value as Record<string, unknown>
  return (
    typeof record.id === 'string' &&
    typeof record.task === 'string' &&
    typeof record.startedAt === 'number' &&
    typeof record.status === 'string' &&
    STATUSES.includes(record.status as SubagentStatus)
  )
}

export function createSubagentLedgerStore(filePath: string): SubagentLedgerStore {
  const load = (): SubagentRecord[] => {
    try {
      const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'))
      return Array.isArray(parsed) ? parsed.filter(isRecord) : []
    } catch {
      // 首次运行（ENOENT）或文件损坏：当作空账本，不阻塞启动
      return []
    }
  }

  const save = (records: SubagentRecord[]): void => {
    try {
      mkdirSync(dirname(filePath), { recursive: true })
      writeFileSync(filePath, JSON.stringify(trimLedger(records), null, 2), 'utf8')
    } catch (error) {
      console.error('[subagent-ledger] 账本落盘失败（不阻塞主流程）:', error)
    }
  }

  let cache = load()

  const port: SubagentLedgerPort = {
    recordStart: (record) => {
      cache = [...cache, { ...record, status: 'running' }]
      save(cache)
    },
    recordEnd: (id, outcome) => {
      cache = cache.map((record) =>
        record.id === id
          ? {
              ...record,
              status: outcome.success ? 'done' : 'failed',
              text: outcome.text,
              endedAt: outcome.endedAt
            }
          : record
      )
      save(cache)
    }
  }

  return {
    port,
    reconcile: (now = Date.now()) => {
      const { records, interrupted } = reconcileInterrupted(cache, now)
      if (interrupted.length > 0) {
        cache = records
        save(cache)
      }
      return interrupted
    },
    list: () => [...cache].sort((a, b) => b.startedAt - a.startedAt)
  }
}
