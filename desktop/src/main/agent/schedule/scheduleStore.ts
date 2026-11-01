/**
 * 定时提醒存储（对齐 dsh `schedule` 的最小可用子集）。
 *
 * dsh 的 schedule 是 cron 式任务调度器（可触发任意任务）；我们没有调度后端 + 无头 agent 运行，
 * 故做**提醒**这一档：到点弹系统通知（见 `scheduleTicker.ts`），不自动跑 agent。
 *
 * 存储：`<库>/schedule.json`（数组）。**无内存缓存**——每次操作现读现写，
 * 多个实例操作同一文件也安全（技能与 ticker 各持一个实例）。
 */

import { readFileSync, writeFileSync } from 'node:fs'

import { nextCronTime, parseCron } from './cron'

/** 一条定时提醒 */
export interface ScheduleTask {
  id: string
  prompt: string
  /** 下次触发时间（ISO） */
  at: string
  /** 重复间隔（毫秒）；缺省/0 = 一次性 */
  repeatMs?: number
  /** cron 表达式（5 字段）；提供时按 cron 推进，优先于 repeatMs */
  cron?: string
  /** 一次性任务已触发时间（ISO） */
  firedAt?: string
}

interface ScheduleFile {
  tasks: ScheduleTask[]
}

function readTasks(filePath: string): ScheduleTask[] {
  try {
    const parsed: unknown = JSON.parse(readFileSync(filePath, 'utf8'))
    if (parsed !== null && typeof parsed === 'object') {
      const tasks = (parsed as ScheduleFile).tasks
      if (Array.isArray(tasks)) {
        return tasks.filter(
          (task): task is ScheduleTask =>
            task !== null &&
            typeof task === 'object' &&
            typeof (task as ScheduleTask).id === 'string' &&
            typeof (task as ScheduleTask).prompt === 'string' &&
            typeof (task as ScheduleTask).at === 'string'
        )
      }
    }
    return []
  } catch {
    return []
  }
}

function writeTasks(filePath: string, tasks: ScheduleTask[]): void {
  writeFileSync(filePath, `${JSON.stringify({ tasks }, null, 2)}\n`, 'utf8')
}

let seq = 0
function nextId(): string {
  seq += 1
  return `sched_${Date.now()}_${seq}`
}

export class ScheduleStore {
  constructor(private readonly filePath: string) {}

  list(): ScheduleTask[] {
    return readTasks(this.filePath)
  }

  /** 新增一条提醒；`cron`（5 字段）或 `at`（ISO）/ `delayMs`（相对毫秒）三选一 */
  add(input: { prompt: string; at?: string; delayMs?: number; repeatMs?: number; cron?: string }): ScheduleTask {
    const prompt = input.prompt.trim()
    if (prompt === '') throw new Error('prompt 不能为空')

    const cron = input.cron?.trim()
    let at: string
    if (cron !== undefined && cron !== '') {
      const fields = parseCron(cron)
      if (fields === null) throw new Error(`cron 非法：${cron}`)
      const next = nextCronTime(fields, Date.now())
      if (next === null) throw new Error(`cron 一年内无匹配：${cron}`)
      at = new Date(next).toISOString()
    } else if (input.at !== undefined && input.at !== '') {
      const parsed = Date.parse(input.at)
      if (Number.isNaN(parsed)) throw new Error(`at 不是合法时间：${input.at}`)
      at = new Date(parsed).toISOString()
    } else if (input.delayMs !== undefined && Number.isFinite(input.delayMs) && input.delayMs > 0) {
      at = new Date(Date.now() + input.delayMs).toISOString()
    } else {
      throw new Error('需要 cron / at（ISO 时间）/ delay_ms（相对毫秒）')
    }

    const task: ScheduleTask = {
      id: nextId(),
      prompt,
      at,
      ...(cron !== undefined && cron !== '' ? { cron } : {}),
      ...(input.repeatMs !== undefined && input.repeatMs > 0 ? { repeatMs: input.repeatMs } : {})
    }
    const tasks = readTasks(this.filePath)
    tasks.push(task)
    writeTasks(this.filePath, tasks)
    return task
  }

  remove(id: string): boolean {
    const tasks = readTasks(this.filePath)
    const next = tasks.filter((task) => task.id !== id)
    if (next.length === tasks.length) return false
    writeTasks(this.filePath, next)
    return true
  }

  /**
   * 找出到期任务：回调 `notify`，并推进/标记。
   * - 一次性任务：写 `firedAt`（保留记录，不删）；
   * - 重复任务：`at` 推进到 `now + repeatMs`。
   * @returns 本次触发（已通知）的任务
   */
  tick(now: number, notify: (task: ScheduleTask) => void): ScheduleTask[] {
    const tasks = readTasks(this.filePath)
    const fired: ScheduleTask[] = []
    let changed = false
    for (const task of tasks) {
      if (task.firedAt !== undefined) continue
      const due = Date.parse(task.at)
      if (Number.isNaN(due) || due > now) continue
      notify(task)
      fired.push(task)
      changed = true
      if (task.cron !== undefined) {
        const fields = parseCron(task.cron)
        const next = fields === null ? null : nextCronTime(fields, now)
        if (next === null) task.firedAt = new Date(now).toISOString()
        else task.at = new Date(next).toISOString()
      } else if (task.repeatMs !== undefined && task.repeatMs > 0) {
        task.at = new Date(now + task.repeatMs).toISOString()
      } else {
        task.firedAt = new Date(now).toISOString()
      }
    }
    if (changed) writeTasks(this.filePath, tasks)
    return fired
  }
}
