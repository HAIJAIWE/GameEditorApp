import type { JobRecord } from '@mobai/shared/agent/jobs/jobRegistry'

/**
 * 后台任务共享 store（「会话」页签的后台任务分区 / 后续可复用）。
 *
 * 单一数据源：轮询 `window.mbApi.agent.jobList`（跨轮历史 + 运行中状态），
 * 自己维护一份 `JobRecord[]`。与右侧智能体面板的 `useDigitalJobs` 走的是同一份 IPC，
 * 但本 store 是**模块级**的——不依赖 `ChatApi`，因此会话页签（拿不到面板 ChatApi）也能用。
 *
 * 为什么是轮询而不是订阅事件：后台任务由 `JobRegistry` 维护，没有逐条的 `job_*` 事件流，
 * 2s 轮询足够且不吵（对齐 dsh ui-jobs 的读法）。读取/取消失败都静默吞掉，不打扰用户。
 */

interface JobEventApi {
  jobList(): Promise<{ jobs: JobRecord[] }>
  jobCancel(req: { id: string }): Promise<{ ok: boolean }>
}

function getJobApi(): JobEventApi | undefined {
  const mbApi = (window as unknown as { mbApi?: { agent?: JobEventApi } }).mbApi
  return mbApi?.agent
}

/** 后台任务轮询间隔（ms）：跨轮历史 + 运行中状态，2s 足够且不吵 */
const JOB_POLL_MS = 2000

let jobs: JobRecord[] = []
const listeners = new Set<() => void>()
let timer: ReturnType<typeof setInterval> | undefined

function emit(): void {
  for (const listener of listeners) listener()
}

async function refresh(): Promise<void> {
  const api = getJobApi()
  if (api === undefined) return
  try {
    const result = await api.jobList()
    jobs = result.jobs
    emit()
  } catch {
    // 读取失败不打扰用户（下一轮再试）
  }
}

function ensureStarted(): void {
  if (timer !== undefined) return
  const api = getJobApi()
  if (api === undefined) return
  void refresh()
  timer = setInterval(() => void refresh(), JOB_POLL_MS)
}

/** 订阅后台任务列表变化（自动启动底层轮询，幂等）。返回取消订阅函数。 */
export function subscribeJobs(callback: () => void): () => void {
  ensureStarted()
  listeners.add(callback)
  // 所有订阅者都走了，停掉轮询（再订阅会重新拉起）
  return () => {
    listeners.delete(callback)
    if (listeners.size === 0 && timer !== undefined) {
      clearInterval(timer)
      timer = undefined
    }
  }
}

/** `useSyncExternalStore` 的快照读取：引用仅在变化时更新。 */
export function getJobsSnapshot(): JobRecord[] {
  return jobs
}

/** 取消某个后台任务（经 `agent:jobCancel` IPC），取消后立即刷新一次。 */
export async function cancelJob(id: string): Promise<void> {
  await getJobApi()?.jobCancel({ id })
  await refresh()
}
