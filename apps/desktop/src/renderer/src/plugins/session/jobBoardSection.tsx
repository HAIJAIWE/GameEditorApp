import { useSyncExternalStore, type ReactElement } from 'react'

import { useT } from '@mobai/client-ui'
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
 * ## Phase C4：分区外壳与「运行中」标记
 * 迁移前它只返回一个裸列表，和相邻的「定时提醒 / 轨迹」（都有 `.session-block` +
 * `.session-block-title`）视觉层级不一致。现在：
 * - 有任务时包进 `.session-block` 并给标题；
 * - 标题右侧统一用 `.session-running-badge` 显示「N 运行中」；
 * - **没有任务时整段不渲染**（保持「不占版面」的既有行为）。
 */
export function JobBoardSection(_props: { host: PluginHost }): ReactElement | null {
  const t = useT()
  const jobs = useSyncExternalStore(subscribeJobs, getJobsSnapshot)
  if (jobs.length === 0) return null
  const running = jobs.filter((job) => job.status === 'running').length
  return (
    <section className="session-block" data-testid="session-block-jobs">
      <div className="session-block-head">
        <h3 className="session-block-title">{t('session.jobs')}</h3>
        {running > 0 && (
          <span className="session-running-badge" data-testid="session-jobs-running">
            {t('session.runningCount', { n: running })}
          </span>
        )}
      </div>
      <DigitalJobList jobs={jobs} onCancel={(id) => void cancelJob(id)} />
    </section>
  )
}
