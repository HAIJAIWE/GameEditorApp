/**
 * 后台任务注册表（对齐 dsh `jobs` 的**注册表 seam**，但大幅简化）。
 *
 * dsh 的 jobs 是完整子系统：输出环（offset/lossy）、owner 隔离、事件流、spill 文件、
 * 生产者 `JobSpec.run` + `JobHandle`。我们产品**没有** bash/workflow 这类外部生产者，
 * 唯一真实的后台执行者是**子智能体**（已异步 activation）。故本模块只做一件事：
 * 把「后台子智能体」提升为**可查询/可取消/带进度与输出尾部**的一等任务。
 *
 * 设计取舍：
 * - 纯内存 `Map<id, JobRecord>`，进程内单例（随服务生命周期）。
 * - 输出用**有界尾部**（`JOB_OUTPUT_TAIL_CHARS`），不做 offset/环——我们只给模型看「最近输出」。
 * - 不做 owner 隔离（单进程单用户桌面应用，会话隔离由 sessionId 承载但 v1 不强制过滤）。
 * - 事件流不在这里做：服务把 `subagent_started`/`subagent_done` 直接喂进来。
 */

/** 任务状态（对齐 dsh `JobStatus` 的可用子集） */
export type JobStatus = 'running' | 'completed' | 'failed' | 'killed'

/** 一条后台任务的可读快照 */
export interface JobRecord {
  id: string
  /** 生产者种类（当前只有 `subagent`） */
  kind: string
  /** 模型/用户可读的一行标签（子智能体的任务描述） */
  label: string
  status: JobStatus
  /** 最近一次进度行（可选，生产者主动更新） */
  progress?: string
  /** 输出尾部（有界；只保留最近 `JOB_OUTPUT_TAIL_CHARS` 个字符） */
  output: string
  startedAt: number
  finishedAt?: number
  /** 终态说明（失败原因 / 取消原因） */
  detail?: string
}

/** 输出尾部上限（字符） */
export const JOB_OUTPUT_TAIL_CHARS = 4000
/** 注册表最多保留的记录数（超出时丢弃最旧的已结算任务） */
export const JOB_MAX_RECORDS = 50

/** 状态标签（中文展示） */
export const JOB_STATUS_LABELS: Readonly<Record<JobStatus, string>> = {
  running: '运行中',
  completed: '已完成',
  failed: '失败',
  killed: '已取消'
}

function isTerminal(status: JobStatus): boolean {
  return status !== 'running'
}

/**
 * 进程内任务注册表。所有方法同步、幂等友好；未知 id 的操作静默忽略
 * （避免生产者收尾与注册表销毁竞态抛错）。
 */
export class JobRegistry {
  private readonly jobs = new Map<string, JobRecord>()

  /** 注册一个运行中的任务（重复 id 覆盖，便于测试与重连） */
  register(input: { id: string; kind: string; label: string; now?: number }): JobRecord {
    const record: JobRecord = {
      id: input.id,
      kind: input.kind,
      label: input.label,
      status: 'running',
      output: '',
      startedAt: input.now ?? Date.now()
    }
    this.jobs.set(input.id, record)
    this.trim()
    return record
  }

  /** 更新进度行（非运行中忽略） */
  setProgress(id: string, line: string): void {
    const record = this.jobs.get(id)
    if (record === undefined || isTerminal(record.status)) return
    record.progress = line
  }

  /** 追加输出（有界尾部；非运行中仍可追加收尾文本，但不无限增长） */
  append(id: string, text: string): void {
    const record = this.jobs.get(id)
    if (record === undefined || text === '') return
    const next = record.output + text
    record.output = next.length > JOB_OUTPUT_TAIL_CHARS ? next.slice(-JOB_OUTPUT_TAIL_CHARS) : next
  }

  /** 结算任务（completed/failed/killed）；终态说明写入 detail */
  settle(id: string, status: Exclude<JobStatus, 'running'>, detail?: string, now?: number): void {
    const record = this.jobs.get(id)
    if (record === undefined || isTerminal(record.status)) return
    record.status = status
    record.finishedAt = now ?? Date.now()
    if (detail !== undefined && detail !== '') record.detail = detail
  }

  /** 取单个任务快照（返回副本，防外部改写内部状态） */
  get(id: string): JobRecord | null {
    const record = this.jobs.get(id)
    return record === undefined ? null : { ...record }
  }

  /** 列出任务：运行中优先，其余按开始时间倒序；总数不超过 `JOB_MAX_RECORDS` */
  list(): JobRecord[] {
    const all = [...this.jobs.values()].map((record) => ({ ...record }))
    const running = all.filter((record) => record.status === 'running')
    const settled = all
      .filter((record) => record.status !== 'running')
      .sort((a, b) => b.startedAt - a.startedAt)
    return [...running, ...settled].slice(0, JOB_MAX_RECORDS)
  }

  /** 运行中任务数 */
  runningCount(): number {
    let count = 0
    for (const record of this.jobs.values()) if (record.status === 'running') count += 1
    return count
  }

  /** 清空（测试/会话切换用） */
  clear(): void {
    this.jobs.clear()
  }

  /** 超出上限时，丢弃最旧的已结算记录（运行中的永不丢弃） */
  private trim(): void {
    if (this.jobs.size <= JOB_MAX_RECORDS) return
    const settled = [...this.jobs.values()]
      .filter((record) => isTerminal(record.status))
      .sort((a, b) => a.startedAt - b.startedAt)
    let excess = this.jobs.size - JOB_MAX_RECORDS
    for (const record of settled) {
      if (excess <= 0) break
      this.jobs.delete(record.id)
      excess -= 1
    }
  }
}

/** 把一条任务渲染成模型/用户可读的一行 */
export function formatJobLine(job: JobRecord): string {
  const elapsed = ((job.finishedAt ?? Date.now()) - job.startedAt) / 1000
  const progress = job.progress !== undefined ? ` · ${job.progress}` : ''
  return `${job.id} [${JOB_STATUS_LABELS[job.status]}] ${job.label}${progress}（${elapsed.toFixed(1)}s）`
}
