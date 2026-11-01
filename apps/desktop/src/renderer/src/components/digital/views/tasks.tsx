import { useT } from '@mobai/client-ui'
import { LucideIcon } from '../../common'
import { summarizeToolTasks } from '@mobai/shared/agent/ui'

/** 工具任务清单（成功 / 失败 + 摘要） */
export function DigitalTaskList({ tasks }: { tasks: ReturnType<typeof summarizeToolTasks> }) {
  const t = useT()
  return (
    <div className="digital-tasks" data-testid="digital-tasks">
      <span className="home-section-label">{t('agent.tasks.title')}</span>
      {tasks.map((task, index) => (
        <div className="digital-task" data-testid="digital-task" key={`${task.tool}-${index}`}>
          <span>{task.success ? <LucideIcon name="check" size={12} /> : <LucideIcon name="x" size={12} />}</span>
          <span className="digital-task-tool">{task.tool}</span>
          <span className="item-meta">{task.summary}</span>
        </div>
      ))}
    </div>
  )
}
