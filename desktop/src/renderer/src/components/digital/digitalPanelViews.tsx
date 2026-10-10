import { summarizeToolTasks, type DigitalPanelState } from '../../../../shared/agent/panel'

/** 危险操作审批模态：展示工具 / 操作 / 参数，回传「允许 / 拒绝」决定 */
export function DigitalApproval({
  approval,
  onApprove
}: {
  approval: NonNullable<DigitalPanelState['approval']>
  onApprove: (approved: boolean) => void
}) {
  return (
    <div className="digital-approval" data-testid="digital-approval">
      <div className="form-label">⚠️ 危险操作确认</div>
      <div className="item-meta">
        工具：{approval.tool} · 操作：{approval.action || '(未指定)'}
      </div>
      <pre className="digital-approval-params">{JSON.stringify(approval.params, null, 2)}</pre>
      <div className="editor-actions">
        <button
          type="button"
          className="btn danger"
          data-testid="digital-approval-approve"
          onClick={() => onApprove(true)}
        >
          允许执行
        </button>
        <button
          type="button"
          className="btn"
          data-testid="digital-approval-reject"
          onClick={() => onApprove(false)}
        >
          拒绝
        </button>
      </div>
    </div>
  )
}

/** 执行步骤列表（可折叠由父组件控制，本组件只渲染列表本体） */
export function DigitalStepList({ steps }: { steps: DigitalPanelState['steps'] }) {
  return (
    <ol className="digital-step-list">
      {steps.map((step, index) => (
        <li
          key={`${step.order}-${step.tool}-${index}`}
          className={`digital-step digital-step-${step.status}`}
          data-testid="digital-step"
          data-status={step.status}
        >
          <span className="digital-step-tool">{step.tool}</span>
          <span className="item-meta">
            {step.status === 'running' ? '执行中…' : null}
            {step.status === 'done' ? '✅' : null}
            {step.status === 'failed' ? '❌' : null}
          </span>
          {step.result !== undefined && step.result !== '' && (
            <div className="digital-step-result">{step.result}</div>
          )}
        </li>
      ))}
    </ol>
  )
}

/** 工具任务清单（成功 / 失败 + 摘要） */
export function DigitalTaskList({ tasks }: { tasks: ReturnType<typeof summarizeToolTasks> }) {
  return (
    <div className="digital-tasks" data-testid="digital-tasks">
      <span className="home-section-label">任务</span>
      {tasks.map((task, index) => (
        <div className="digital-task" data-testid="digital-task" key={`${task.tool}-${index}`}>
          <span>{task.success ? '✅' : '❌'}</span>
          <span className="digital-task-tool">{task.tool}</span>
          <span className="item-meta">{task.summary}</span>
        </div>
      ))}
    </div>
  )
}
