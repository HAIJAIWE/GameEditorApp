import { useState, type ReactNode } from 'react'

import {
  summarizeToolTasks,
  type DigitalPanelState,
  type DigitalStep
} from '../../../../shared/agent/panel'

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

/** 步骤图标（按 kind）：让「思考 / 批量 / 工具」一眼可分 */
const STEP_ICONS: Record<DigitalStep['kind'], string> = {
  think: '🧠',
  batch: '🧩',
  tool: '🔧'
}

/**
 * 工具结果视图（对齐 dsh `tool.call.toolview` 的 keyed 分派）：
 * 按工具名把结果交给不同渲染器；未注册的走通用文本。
 */
type ToolView = (step: DigitalStep) => ReactNode

function textView(step: DigitalStep): ReactNode {
  return <div className="digital-step-result">{step.result ?? ''}</div>
}

/** 代码类：等宽块 */
function codeView(step: DigitalStep): ReactNode {
  return <pre className="digital-step-code">{step.result ?? ''}</pre>
}

/** JSON 优先：能解析就美化，否则退回纯文本（MCP 工具常用） */
function jsonView(step: DigitalStep): ReactNode {
  const raw = step.result ?? ''
  try {
    const parsed: unknown = JSON.parse(raw)
    return <pre className="digital-step-code">{JSON.stringify(parsed, null, 2)}</pre>
  } catch {
    return textView(step)
  }
}

const TOOL_VIEWS: Record<string, ToolView> = {
  'system.code': codeView,
  'system.game_data': jsonView
}

function resolveToolView(tool: string): ToolView {
  const exact = TOOL_VIEWS[tool]
  if (exact !== undefined) return exact
  if (tool.startsWith('mcp.')) return jsonView
  return textView
}

/** 单步卡片：默认展开（结果可见），点头部折叠 */
function ToolStepCard({ step }: { step: DigitalStep }) {
  const [expanded, setExpanded] = useState(true)
  const hasBody = step.result !== undefined && step.result !== ''
  return (
    <li
      className={`digital-step digital-step-card digital-step-${step.status}`}
      data-testid="digital-step"
      data-status={step.status}
      data-kind={step.kind}
    >
      <button
        type="button"
        className="digital-step-head"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="digital-step-icon" aria-hidden="true">
          {STEP_ICONS[step.kind]}
        </span>
        <span className="digital-step-tool">{step.tool}</span>
        <span className="item-meta digital-step-status">
          {step.status === 'running' ? '执行中…' : null}
          {step.status === 'done' ? '✅' : null}
          {step.status === 'failed' ? '❌' : null}
        </span>
        {hasBody && (
          <span className="digital-step-chevron" aria-hidden="true">
            {expanded ? '▾' : '▸'}
          </span>
        )}
      </button>
      {expanded && hasBody && (
        <div className="digital-step-body">{resolveToolView(step.tool)(step)}</div>
      )}
    </li>
  )
}

/** 一轮（turn）的过程分组：对齐 dsh ui-chat 的「轮次过程折叠」 */
function TurnGroup({ turn, steps }: { turn: number; steps: DigitalStep[] }) {
  const [expanded, setExpanded] = useState(true)
  const failed = steps.some((step) => step.status === 'failed')
  return (
    <li className="digital-turn" data-testid="digital-turn" data-turn={turn}>
      <button
        type="button"
        className="digital-turn-head"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="digital-turn-label">第 {turn + 1} 轮</span>
        <span className="item-meta">
          {steps.length} 步{failed ? ' · 有失败' : ''}
        </span>
        <span className="digital-step-chevron" aria-hidden="true">
          {expanded ? '▾' : '▸'}
        </span>
      </button>
      {expanded && (
        <ol className="digital-turn-steps">
          {steps.map((step, index) => (
            <ToolStepCard key={`${step.order}-${step.tool}-${index}`} step={step} />
          ))}
        </ol>
      )}
    </li>
  )
}

/** 子智能体列表（Slice 38）：本轮派出的子任务、状态与结果摘要 */
export function DigitalSubagentList({ subagents }: { subagents: DigitalPanelState['subagents'] }) {
  if (subagents.length === 0) return null
  return (
    <div className="digital-subagents" data-testid="digital-subagents">
      <div className="home-section-label">子智能体（{subagents.length}）</div>
      <ul className="digital-subagent-list">
        {subagents.map((sub) => (
          <li
            key={sub.id}
            className={`digital-subagent digital-subagent-${sub.status}`}
            data-testid="digital-subagent"
            data-status={sub.status}
          >
            <span className="digital-subagent-id">{sub.id}</span>
            <span className="digital-subagent-task">{sub.task}</span>
            <span className="item-meta">
              {sub.status === 'running' ? '执行中…' : sub.status === 'done' ? '✅' : '❌'}
            </span>
            {sub.result !== undefined && sub.result !== '' && (
              <div className="digital-subagent-result">{sub.result}</div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/** 执行步骤列表（整体折叠由父组件控制；内部按轮次分组，每轮可再折叠） */
export function DigitalStepList({ steps }: { steps: DigitalPanelState['steps'] }) {
  // 按 order（轮次）分组：order 相同即同一轮
  const groups: Array<{ turn: number; steps: DigitalStep[] }> = []
  for (const step of steps) {
    const last = groups.at(-1)
    if (last !== undefined && last.turn === step.order) last.steps.push(step)
    else groups.push({ turn: step.order, steps: [step] })
  }
  return (
    <ol className="digital-step-list">
      {groups.map((group) => (
        <TurnGroup key={group.turn} turn={group.turn} steps={group.steps} />
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
