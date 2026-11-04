/**
 * 子智能体账本 —— 跨轮冷恢复的**数据层**。
 *
 * ## 为什么需要
 * 子智能体是**异步后台**跑的：`spawn_subagent` 立即返回 `started subagent <id>`，
 * 结果稍后由 `drainSubAgents()` 注入父对话。运行态只存在 `loop.ts` 的内存
 * `pendingSubagents` 里 —— 应用退出/崩溃后这些记录全丢，重启后用户既看不到
 * 「刚才派出去的子任务」，也分不清它们是跑完了还是被中断了。
 *
 * 这里只定义两件事，**不碰 IO**（shared 包零宿主依赖）：
 * 1. `SubagentLedgerPort`：`loop.ts` 的埋点接口，落盘由宿主（agent-core）实现；
 * 2. `reconcileInterrupted()`：冷启动对账 —— 进程内 `running` 的记录在新进程里
 *    不可能还活着，一律标记 `interrupted`，保留 `task` 与 `startedAt`，
 *    便于 UI 提示「上次这个子任务被中断」并允许重新派发。
 *
 * ## 不做自动重连
 * 远程 / CLI provider 的子任务在外部进程里可能还活着，理论上可以查询状态续上。
 * 但那需要 provider 各自的协议支持（dsh 也没有统一抽象），本轮只保证
 * **「不静默丢失」**：记录留档 + 明确标为中断。自动续跑等有了 provider 侧
 * 的 resume 契约再做，不假称已支持。
 */
export type SubagentStatus = 'running' | 'done' | 'failed' | 'interrupted'

export interface SubagentRecord {
  id: string
  /** 派发时的子任务描述（重新派发时原样再交一次） */
  task: string
  status: SubagentStatus
  startedAt: number
  /** 终态时间；`running` 时没有 */
  endedAt?: number
  /** 完成/失败的结果摘要；`running` / `interrupted` 时没有 */
  text?: string
}

/** `loop.ts` 的埋点接口。宿主实现负责落盘（agent-core 的 ledgerStore）。 */
export interface SubagentLedgerPort {
  recordStart(record: { id: string; task: string; startedAt: number }): void
  recordEnd(id: string, outcome: { success: boolean; text: string; endedAt: number }): void
}

export interface ReconcileResult {
  records: SubagentRecord[]
  /** 本次被标记为中断的记录（UI 可据此提示 / 提供「重新派发」） */
  interrupted: SubagentRecord[]
}

/**
 * 冷启动对账：把所有 `running` 记录标为 `interrupted`。
 *
 * 纯函数，`now` 由调用方传入（便于测试固定时间）。
 * 幂等：已经中断/完成的记录不受影响，重复调用不会改变结果。
 */
export function reconcileInterrupted(
  records: readonly SubagentRecord[],
  now: number
): ReconcileResult {
  const interrupted: SubagentRecord[] = []
  const next = records.map((record) => {
    if (record.status !== 'running') return record
    const marked: SubagentRecord = { ...record, status: 'interrupted', endedAt: now }
    interrupted.push(marked)
    return marked
  })
  return { records: next, interrupted }
}

/** 账本保留上限：只留最近 N 条，防长期使用后 json 无限膨胀。 */
export const SUBAGENT_LEDGER_LIMIT = 50

/** 裁剪到最近 `limit` 条（按 startedAt 倒序保留新的）。纯函数。 */
export function trimLedger(
  records: readonly SubagentRecord[],
  limit: number = SUBAGENT_LEDGER_LIMIT
): SubagentRecord[] {
  if (records.length <= limit) return [...records]
  return [...records].sort((a, b) => b.startedAt - a.startedAt).slice(0, limit)
}
