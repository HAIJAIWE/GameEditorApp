import { JOB_STATUS_LABELS, type JobRecord } from '@mobai/shared/agent/jobs/jobRegistry'

/** 已运行秒数（保留 1 位） */
function elapsedSeconds(job: JobRecord): string {
  return (((job.finishedAt ?? Date.now()) - job.startedAt) / 1000).toFixed(1)
}

/**
 * 后台任务列表（对齐 dsh ui-jobs 的读法，但复用既有面板样式）。
 *
 * 纯展示：数据由 `useDigitalJobs` 拉取（跨轮历史），`onCancel` 触发取消。
 * 运行中任务显示进度条（不确定态）+ 取消按钮；已结算任务显示终态与耗时。
 */
export function DigitalJobList({
  jobs,
  onCancel
}: {
  jobs: JobRecord[]
  onCancel?: (id: string) => void
}) {
  if (jobs.length === 0) return null
  const running = jobs.filter((job) => job.status === 'running').length
  return (
    <div className="digital-jobs" data-testid="digital-jobs">
      <div className="home-section-label">
        后台任务（{running > 0 ? `${running} 运行中 / ` : ''}共 {jobs.length}）
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
                <button
                  type="button"
                  className="btn-link"
                  data-testid="digital-job-cancel"
                  onClick={() => onCancel(job.id)}
                >
                  取消
                </button>
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
