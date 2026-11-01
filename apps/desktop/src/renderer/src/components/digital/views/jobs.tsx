import { useEffect, useRef, useState } from 'react'

import { useT } from '@mobai/client-ui'
import { JOB_STATUS_LABELS, type JobRecord } from '@mobai/shared/agent/jobs/jobRegistry'

/** 已运行秒数（保留 1 位） */
function elapsedSeconds(job: JobRecord): string {
  return (((job.finishedAt ?? Date.now()) - job.startedAt) / 1000).toFixed(1)
}

/**
 * 后台任务「取消」按钮（对齐 dsh ui-jobs 的两击停止）。
 *
 * 第一击进入「待确认」态（变红 + 文案改「确认停止」），3s 内再击一次才真正发取消请求；
 * 超时未确认自动退回，避免误触把跑着的任务杀掉。按钮自带局部状态，不牵动整个任务列表重渲染。
 */
function JobCancelButton({
  jobId,
  onCancel
}: {
  jobId: string
  onCancel: (id: string) => void
}) {
  const t = useT()
  const [armed, setArmed] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    return () => {
      if (timer.current !== undefined) clearTimeout(timer.current)
    }
  }, [])

  const handleClick = (): void => {
    if (!armed) {
      setArmed(true)
      timer.current = setTimeout(() => setArmed(false), 3000)
      return
    }
    if (timer.current !== undefined) clearTimeout(timer.current)
    setArmed(false)
    onCancel(jobId)
  }

  return (
    <button
      type="button"
      className={`btn-link${armed ? ' is-armed' : ''}`}
      data-testid="digital-job-cancel"
      data-armed={armed ? 'true' : 'false'}
      onClick={handleClick}
    >
      {armed ? t('agent.jobs.cancelConfirm') : t('agent.jobs.cancel')}
    </button>
  )
}

/**
 * 后台任务列表（对齐 dsh ui-jobs 的读法，但复用既有面板样式）。
 *
 * 纯展示：数据由调用方（右侧面板 `useDigitalJobs` 或会话页签 `jobStore`）拉取（跨轮历史），
 * `onCancel` 触发取消（两击停止）。运行中任务显示进度条（不确定态）+ 取消按钮；
 * 已结算任务显示终态与耗时。
 */
export function DigitalJobList({
  jobs,
  onCancel
}: {
  jobs: JobRecord[]
  onCancel?: (id: string) => void
}) {
  const t = useT()
  if (jobs.length === 0) return null
  const running = jobs.filter((job) => job.status === 'running').length
  const inner = running > 0 ? t('agent.jobs.runningInner', { running, total: jobs.length }) : t('agent.jobs.totalInner', { total: jobs.length })
  return (
    <div className="digital-jobs" data-testid="digital-jobs">
      <div className="home-section-label">
        {t('agent.jobs.title', { inner })}
      </div>
      <ul className="digital-job-list">
        {jobs.map((job) => (
          <li
            key={job.id}
            className={`digital-job digital-job-${job.status}`}
            data-testid="digital-job"
            data-status={job.status}
          >
            <div className="digital-job-head">
              <span className="digital-job-label" title={job.label}>{job.label}</span>
              <span className="item-meta">
                {JOB_STATUS_LABELS[job.status]} · {elapsedSeconds(job)}s
              </span>
              {job.status === 'running' && onCancel !== undefined && (
                <JobCancelButton jobId={job.id} onCancel={onCancel} />
              )}
            </div>
            {job.status === 'running' && (
              <div className="digital-job-progress" data-testid="digital-job-progress">
                <span className="digital-job-progress-bar" />
              </div>
            )}
            {job.progress !== undefined && <div className="item-meta">{job.progress}</div>}
            {job.detail !== undefined && job.detail !== '' && (
              <div className="item-meta digital-job-detail">{job.detail}</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
