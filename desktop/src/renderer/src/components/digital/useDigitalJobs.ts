import { useCallback, useEffect, useState } from 'react'

import type { JobRecord } from '../../../../shared/agent/jobs/jobRegistry'
import type { ChatApi } from './digitalPanelApi'

/** 后台任务轮询间隔（ms）：跨轮历史 + 运行中状态，2s 足够且不吵 */
const JOB_POLL_MS = 2000

/**
 * 后台任务数据 hook（对齐 dsh ui-jobs 的读法）。
 *
 * 面板挂载即拉取一次，此后每 2s 轮询（任务状态/耗时会变），卸载即停。
 * `cancel(id)` 经 `agent:jobCancel` 取消后立即刷新。测试/无 IPC 环境（api 缺方法）时静默跳过。
 */
export function useDigitalJobs(api: ChatApi): {
  jobs: JobRecord[]
  cancel: (id: string) => void
} {
  const [jobs, setJobs] = useState<JobRecord[]>([])

  useEffect(() => {
    let cancelled = false
    const tick = async (): Promise<void> => {
      if (typeof api.jobList !== 'function') return
      try {
        const result = await api.jobList()
        if (!cancelled) setJobs(result.jobs)
      } catch {
        // 读取失败不打扰用户（下一轮再试）
      }
    }
    void tick()
    if (typeof api.jobList !== 'function') {
      return () => {
        cancelled = true
      }
    }
    const timer = setInterval(() => void tick(), JOB_POLL_MS)
    return () => {
      cancelled = true
      clearInterval(timer)
    }
  }, [api])

  const cancel = useCallback(
    (id: string): void => {
      if (typeof api.jobCancel !== 'function') return
      void api
        .jobCancel({ id })
        .then(async () => {
          try {
            const result = await api.jobList()
            setJobs(result.jobs)
          } catch {
            // ignore
          }
        })
        .catch(() => undefined)
    },
    [api]
  )

  return { jobs, cancel }
}
