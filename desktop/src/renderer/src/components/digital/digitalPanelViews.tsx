import { useState, type ReactNode } from 'react'

import LucideIcon from '../LucideIcon'
import type { LucideIconName } from '../../../../shared/util/ui/lucideIcons'
import { RISK_LEVEL, resolveRiskLevel } from '../../../../shared/agent/config/protocol'
import type { DigitalCommand } from '../../../../shared/agent/tools/commands'
import type { DigitalReference } from '../../../../shared/agent/ui/references'
import { diffRows, diffTotals, errorSummary, formatToolArgs } from '../../../../shared/agent/tools/toolDetail'
import {
  summarizeToolTasks,
  type DigitalPanelState,
  type DigitalStep
} from '../../../../shared/agent/ui/panel'

/** 风险等级 → 中文档位（审批卡展示用） */
const RISK_LABELS: Record<number, string> = {
  [RISK_LEVEL.READ_ONLY]: '只读',
  [RISK_LEVEL.DATA_WRITE]: '写数据',
  [RISK_LEVEL.FILE_SYSTEM]: '文件系统',
  [RISK_LEVEL.NETWORK]: '网络',
  [RISK_LEVEL.SYSTEM]: '系统级'
}

/** 危险操作审批模态：展示工具 / 操作 / 参数，回传「允许 / 拒绝」决定 */
export function DigitalApproval({
  approval,
  onApprove
}: {
  approval: NonNullable<DigitalPanelState['approval']>
  onApprove: (approved: boolean) => void
}) {
  const risk = resolveRiskLevel(approval.tool, approval.action)
  const riskTone =
    risk >= RISK_LEVEL.SYSTEM ? 'danger' : risk >= RISK_LEVEL.NETWORK ? 'warn' : 'muted'
  return (
    <div className="digital-approval" data-testid="digital-approval">
      <div className="digital-approval-head">
        <span className="form-label"><LucideIcon name="alert-triangle" size={14} /> 危险操作确认</span>
        <span className={`digital-risk-badge digital-risk-${riskTone}`} data-testid="digital-approval-risk">
          风险：{RISK_LABELS[risk] ?? '未知'}
        </span>
      </div>
      <div className="item-meta">
        工具：{approval.tool} · 操作：{approval.action || '(未指定)'}
      </div>
      <details className="digital-approval-details" open>
        <summary className="item-meta">参数</summary>
        <pre className="digital-approval-params">{JSON.stringify(approval.params, null, 2)}</pre>
      </details>
      <div className="item-meta">批准后执行；拒绝会把「未确认」回灌给模型，让它换方案。</div>
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

/** 步骤图标（按 kind）：让「思考 / 批量 / 工具」一眼可分（Lucide 单色线稿，零 emoji） */
const STEP_ICONS: Record<DigitalStep['kind'], LucideIconName> = {
  think: 'brain',
  batch: 'package',
  tool: 'wrench'
}

/**
 * 工具结果视图（对齐 dsh `tool.call.toolview` 的 keyed 分派）：
 * 按工具名把结果交给不同渲染器；未注册的走通用文本。
 */
type ToolView = (step: DigitalStep) => ReactNode

/** 外部（插件 keyed slot）提供的工具视图解析器：命中则覆盖内置视图 */
export type ToolViewResolver = (tool: string) => ToolView | undefined

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

/**
 * 工具变体（借 dsh `ui-tool` 的 variant 思路）：决定前导图标与配色。
 * dsh 用 `ui-primitives` 的图标包；我们保持零依赖，用内联线性 SVG。
 */
type ToolVariant = 'search' | 'read' | 'bash' | 'code' | 'data' | 'doc' | 'api' | 'others'

function toolVariant(tool: string): ToolVariant {
  if (tool.includes('session_search') || tool.includes('search')) return 'search'
  if (tool.includes('game_data')) return 'data'
  if (tool.includes('ceshu')) return 'doc'
  if (tool.includes('code')) return 'code'
  if (tool.includes('shell') || tool.includes('terminal')) return 'bash'
  if (tool.startsWith('mcp.')) return 'api'
  return 'others'
}

/** 前导线性图标（15px，随文字色；不引 dsh 图标包） */
function ToolIcon({ variant }: { variant: ToolVariant }) {
  const common = {
    width: 15,
    height: 15,
    viewBox: '0 0 16 16',
    fill: 'none',
    stroke: 'currentColor',
    strokeWidth: 1.5,
    strokeLinecap: 'round' as const,
    strokeLinejoin: 'round' as const,
    'aria-hidden': true
  }
  switch (variant) {
    case 'search':
      return (
        <svg {...common}>
          <circle cx="7" cy="7" r="4.5" />
          <path d="M10.5 10.5 14 14" />
        </svg>
      )
    case 'data':
      return (
        <svg {...common}>
          <rect x="2.5" y="3" width="11" height="10" rx="1.5" />
          <path d="M2.5 6.5h11M6.5 6.5V13" />
        </svg>
      )
    case 'doc':
      return (
        <svg {...common}>
          <path d="M4 2.5h5l3 3v8H4z" />
          <path d="M9 2.5v3h3M6 9h4M6 11h3" />
        </svg>
      )
    case 'code':
      return (
        <svg {...common}>
          <path d="M6 5 3 8l3 3M10 5l3 3-3 3" />
        </svg>
      )
    case 'bash':
      return (
        <svg {...common}>
          <rect x="2" y="3" width="12" height="10" rx="1.5" />
          <path d="M4.5 6.5 6.5 8l-2 1.5M8 10h3" />
        </svg>
      )
    case 'api':
      return (
        <svg {...common}>
          <path d="M6 2.5v3M10 2.5v3M4 5.5h8v3a4 4 0 0 1-8 0z" />
          <path d="M8 12.5v1" />
        </svg>
      )
    default:
      return (
        <svg {...common}>
          <path d="M8 2.5l1.6 3.4 3.4 1.6-3.4 1.6L8 12.5 6.4 9.1 3 7.5l3.4-1.6z" />
        </svg>
      )
  }
}

/** 折叠态摘要：think/batch 给固定文案，tool 取结果首行（失败时取错误行），截断 */
function stepSummary(step: DigitalStep): string {
  if (step.kind === 'think') return step.status === 'running' ? '思考中…' : ''
  if (step.kind === 'batch') return step.status === 'running' ? '并行执行中…' : ''
  // 失败行挑「像错误」的那行（首行常常只是 `Command failed with exit code 1`）
  const first = step.status === 'failed' ? errorSummary(step.result) : ((step.result ?? '').trim().split('\n')[0] ?? '')
  if (first === '') return ''
  return first.length > 56 ? `${first.slice(0, 56)}…` : first
}

/** 参数摘要：美化后的 JSON 多行，摘要必须是单行，故把空白折成一个空格 */
function argsSummary(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim()
  return flat.length > 60 ? `${flat.slice(0, 60)}…` : flat
}

/**
 * 单步卡片：默认展开（结果可见），点头部折叠（借 dsh ui-tool 的 ToolRow 设计）。
 *
 * 展开体按 dsh `ToolDetails` 分段：先「参数」（默认折叠，避免长 JSON 顶掉结果），
 * 再「输出」（diff 输出走行级配色，其余走工具视图）。
 */
function ToolStepCard({ step, resolveView }: { step: DigitalStep; resolveView?: ToolViewResolver }) {
  const [expanded, setExpanded] = useState(true)
  const [argsOpen, setArgsOpen] = useState(false)
  const args = formatToolArgs(step.args)
  const hasResult = step.result !== undefined && step.result !== ''
  const hasBody = hasResult || args.text !== ''
  // 插件 keyed slot 优先，其次内置按工具名分派
  const view = resolveView?.(step.tool) ?? resolveToolView(step.tool)
  const variant = toolVariant(step.tool)
  const summary = stepSummary(step)
  const diff = hasResult ? diffRows(step.result) : null
  // 行头的 `+N −M`（借 dsh ToolRow 的 diffAdded/diffRemoved）：折叠时也能看出改了多少
  const totals = diff !== null ? diffTotals(diff) : null
  return (
    <li
      className={`digital-step digital-step-card digital-step-${step.status}`}
      data-testid="digital-step"
      data-status={step.status}
      data-kind={step.kind}
      data-variant={variant}
    >
      <button
        type="button"
        className="digital-step-head"
        aria-expanded={expanded}
        onClick={() => setExpanded((value) => !value)}
      >
        <span className="digital-step-icon" aria-hidden="true">
          {step.kind === 'tool' ? <ToolIcon variant={variant} /> : <LucideIcon name={STEP_ICONS[step.kind]} size={14} />}
        </span>
        <span className="digital-step-tool">{step.tool}</span>
        {summary !== '' && (
          <span
            className={`digital-step-summary${step.status === 'failed' ? ' is-error' : ''}${
              step.status === 'running' ? ' is-shimmer' : ''
            }`}
          >
            {summary}
          </span>
        )}
        {totals !== null && (totals.added > 0 || totals.removed > 0) && (
          <span className="digital-step-diff-total" data-testid="digital-step-diff-total">
            {totals.added > 0 && <span className="is-add">+{totals.added}</span>}
            {totals.removed > 0 && <span className="is-del">−{totals.removed}</span>}
          </span>
        )}
        <span className={`digital-step-status digital-step-status-${step.status}`}>
          {step.status === 'running' && <span className="digital-step-dot" aria-hidden="true" />}
          {step.status === 'running' ? <span className="is-shimmer">执行中</span> : null}
          {step.status === 'done' ? '完成' : null}
          {step.status === 'failed' ? '失败' : null}
        </span>
        {hasBody && (
          <span className="digital-step-chevron" aria-hidden="true">
            {expanded ? '▾' : '▸'}
          </span>
        )}
      </button>
      {expanded && hasBody && (
        <div className="digital-step-body">
          {args.text !== '' && (
            <div className="digital-step-args" data-testid="digital-step-args">
              <button
                type="button"
                className="digital-step-args-toggle"
                aria-expanded={argsOpen}
                onClick={() => setArgsOpen((value) => !value)}
              >
                <span className="digital-step-body-label">参数</span>
                {!argsOpen && <span className="digital-step-args-summary">{argsSummary(args.text)}</span>}
                <span className="digital-step-chevron" aria-hidden="true">
                  {argsOpen ? '▾' : '▸'}
                </span>
              </button>
              {argsOpen && (
                <pre className="digital-step-args-pre" data-json={args.isJson || undefined}>
                  {args.text}
                </pre>
              )}
            </div>
          )}
          {hasResult && (
            <>
              <span className="digital-step-body-label">输出</span>
              {diff !== null ? (
                <pre className="digital-step-diff" data-testid="digital-step-diff">
                  {diff.map((row, index) => (
                    <span key={index} className={`diff-row diff-${row.kind}`}>
                      {row.text}
                    </span>
                  ))}
                </pre>
              ) : (
                view(step)
              )}
            </>
          )}
        </div>
      )}
    </li>
  )
}

/** 一轮（turn）的过程分组：对齐 dsh ui-chat 的「轮次过程折叠」 */
function TurnGroup({
  turn,
  steps,
  resolveView
}: {
  turn: number
  steps: DigitalStep[]
  resolveView?: ToolViewResolver
}) {
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
            <ToolStepCard key={`${step.order}-${step.tool}-${index}`} step={step} resolveView={resolveView} />
          ))}
        </ol>
      )}
    </li>
  )
}

/**
 * 运行中子智能体的「继续对话」控件（Slice 40）：
 * 输入一条消息「插话」（push 进它的收件箱，子循环下一轮可见），或「停止」它（只停它自己）。
 * 自持输入状态，避免列表级状态与多条子智能体互相干扰。
 */
function SubagentControls({
  id,
  onSteer,
  onStop
}: {
  id: string
  onSteer: (id: string, content: string) => void
  onStop: (id: string) => void
}) {
  const [text, setText] = useState('')
  const submit = (): void => {
    const content = text.trim()
    if (content === '') return
    onSteer(id, content)
    setText('')
  }
  return (
    <div className="digital-subagent-controls" data-testid="digital-subagent-controls">
      <input
        className="form-input digital-subagent-input"
        data-testid="digital-subagent-input"
        placeholder="给子智能体插话…"
        value={text}
        onChange={(event) => setText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Enter') submit()
        }}
      />
      <button
        type="button"
        className="btn slim primary"
        data-testid="digital-subagent-send"
        disabled={text.trim() === ''}
        onClick={submit}
      >
        插话
      </button>
      <button type="button" className="btn slim" data-testid="digital-subagent-stop" onClick={() => onStop(id)}>
        停止
      </button>
    </div>
  )
}

/**
 * 子智能体列表（Slice 38 / 40）：本轮派出的子任务、状态与结果摘要；
 * 运行中的子智能体额外提供「插话 / 停止」（需传入 onSteer / onStop）。
 */
export function DigitalSubagentList({
  subagents,
  onSteer,
  onStop
}: {
  subagents: DigitalPanelState['subagents']
  onSteer?: (id: string, content: string) => void
  onStop?: (id: string) => void
}) {
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
              {sub.status === 'running' ? '执行中…' : sub.status === 'done' ? <LucideIcon name="check" size={12} /> : <LucideIcon name="x" size={12} />}
            </span>
            {sub.result !== undefined && sub.result !== '' && (
              <div className="digital-subagent-result">{sub.result}</div>
            )}
            {sub.status === 'running' && onSteer !== undefined && onStop !== undefined && (
              <SubagentControls id={sub.id} onSteer={onSteer} onStop={onStop} />
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * 执行步骤列表（整体折叠由父组件控制；内部按轮次分组，每轮可再折叠）。
 * `resolveView` 为插件 keyed slot 的工具视图解析器（可选；未命中回退内置）。
 */
export function DigitalStepList({
  steps,
  resolveView
}: {
  steps: DigitalPanelState['steps']
  resolveView?: ToolViewResolver
}) {
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
        <TurnGroup key={group.turn} turn={group.turn} steps={group.steps} resolveView={resolveView} />
      ))}
    </ol>
  )
}

/**
 * 斜杠命令菜单（P2）：输入框以 `/` 开头时出现；键盘上下选择 + Enter 执行，点击亦可。
 * 纯展示组件——匹配逻辑在 `shared/agent/commands.ts`，激活索引由父组件维护。
 */
export function DigitalCommandMenu({
  commands,
  activeIndex,
  onRun
}: {
  commands: DigitalCommand[]
  activeIndex: number
  onRun: (id: string) => void
}) {
  if (commands.length === 0) return null
  return (
    <div className="digital-command-menu" data-testid="digital-command-menu" role="listbox">
      {commands.map((command, index) => (
        <button
          key={command.id}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          className={`digital-command-item${index === activeIndex ? ' active' : ''}`}
          data-testid="digital-command-item"
          data-command={command.id}
          onClick={() => onRun(command.id)}
        >
          <span className="digital-command-label">
            /{command.id} · {command.label}
          </span>
          <span className="item-meta">{command.hint}</span>
        </button>
      ))}
    </div>
  )
}

/**
 * `@` 引用菜单（P2）：输入以 `@` 开头且未以空格结束时出现，列出可引用的数据表；
 * 选中后由父组件插入 `@<name> `（带空格 ⇒ 菜单自动收起）。
 */
export function DigitalReferenceMenu({
  references,
  activeIndex,
  onPick
}: {
  references: DigitalReference[]
  activeIndex: number
  onPick: (name: string) => void
}) {
  if (references.length === 0) return null
  return (
    <div className="digital-command-menu" data-testid="digital-reference-menu" role="listbox">
      {references.map((reference, index) => (
        <button
          key={reference.id}
          type="button"
          role="option"
          aria-selected={index === activeIndex}
          className={`digital-command-item${index === activeIndex ? ' active' : ''}`}
          data-testid="digital-reference-item"
          data-reference={reference.id}
          onClick={() => onPick(reference.name)}
        >
          <span className="digital-command-label">@{reference.name}</span>
          <span className="item-meta">{reference.id}</span>
        </button>
      ))}
    </div>
  )
}

/** 工具任务清单（成功 / 失败 + 摘要） */
export function DigitalTaskList({ tasks }: { tasks: ReturnType<typeof summarizeToolTasks> }) {
  return (
    <div className="digital-tasks" data-testid="digital-tasks">
      <span className="home-section-label">任务</span>
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
