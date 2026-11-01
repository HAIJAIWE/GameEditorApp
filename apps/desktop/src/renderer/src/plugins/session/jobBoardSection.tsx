import { useSyncExternalStore, type ReactElement } from 'react'

import { DigitalJobList } from '../../components/digital'
import { cancelJob, getJobsSnapshot, subscribeJobs } from '../../agent/jobStore'
import type { PluginHost } from '@mobai/shared/plugin/host'

/**
 * 「会话」页签的后台任务分区（`ui-jobs` 的本土移植，会话侧独立入口）。
 *
 * 与右侧智能体面板共用同一份 `agent:jobList` IPC，但走**模块级** `jobStore`——
 * 不需要面板的 `ChatApi`，所以会话页签（右栏停靠区）也能实时显示跨轮的后台任务。
 *
 * 取消走 `jobStore.cancelJob`（两击停止的 UI 在 `DigitalJobList` 内），不牵连其它分区。
 * `DigitalJobList` 在无任务时返回 `null`，故本分区在没任务时不占版面。
 *
 * 只负责「内容」：页签外壳（标题/状态/同源提示）在 `sessionPlugin` 里。
 */
export function JobBoardSection(_props: { host: PluginHost }): ReactElement | null {
  const jobs = useSyncExternalStore(subscribeJobs, getJobsSnapshot)
  return <DigitalJobList jobs={jobs} onCancel={(id) => void cancelJob(id)} />
}
