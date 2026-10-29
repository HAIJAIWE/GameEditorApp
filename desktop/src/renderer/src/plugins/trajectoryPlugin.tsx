import { useMemo, useSyncExternalStore, type ReactElement } from 'react'

import { CONVERSATION_STORE_KEY, createConversationStoreDecl } from '../../../shared/agent/conversationStore'
import type { DigitalPanelState } from '../../../shared/agent/panel'
import { formatToolArgs, diffRows } from '../../../shared/agent/toolDetail'
import {
  buildTrajectory,
  formatLatency,
  type TrajectoryModel,
  type TrajectoryStepRow
} from '../../../shared/agent/trajectory'
import type { PluginHost } from '../../../shared/plugin/host'
import { createStoreInstance } from '../../../shared/plugin/slotRegistry'
import type { PluginManifest } from '../../../shared/plugin/types'
import { registerReactBinding } from './reactBindings'

/**
 * 会话轨迹（`ui-trajectory` 的本土移植，B 路线）。
 *
 * dsh 的 Trajectory 是主区页签：按轮次摊开 user / assistant / tool / 子工具 / compaction，
 * 配 token 与耗时概览，点行看详情。我们没有 compaction、子智能体也不挂在步骤里，
 * 所以只做**能诚实做**的三块：概览（状态/规模/成本）、按轮次的步骤表、消息序列。
 *
 * 数据源是根级 store `conversation.state`（面板唯一写者）：轨迹页与对话面板天然同源，
 * 不需要再抄一份状态，也不会出现「轨迹落后于对话」的错位。
 */
export function defineTrajectoryPlugin(host: PluginHost): PluginManifest {
  registerReactBinding('trajectory.mainView', () => <TrajectoryMainView host={host} />)
  return {
    id: 'trajectory',
    name: 'trajectory',
    version: '0.1.0',
    description: '会话轨迹：按轮次查看执行步骤、消息与运行成本',
    meta: {
      label: '轨迹',
      icon: '🧭',
      description: '按轮次摊开执行步骤与消息，附 token / 耗时概览（与对话面板同源）'
    },
    capabilities: [
      {
        kind: 'mainView',
        id: 'trajectory.mainView',
        label: '轨迹',
        title: '会话轨迹：按轮次的执行步骤 + 消息 + 运行成本',
        order: 55,
        lazy: true,
        ui: { type: 'text', text: '轨迹' }
      }
    ]
  }
}

const STATUS_LABELS: Record<DigitalPanelState['status'], string> = {
  idle: '待命',
  thinking: '思考中…',
  waiting_approval: '等待确认',
  waiting_input: '等待回答',
  done: '已完成',
  error: '出错'
}

const KIND_LABELS: Record<'think' | 'batch' | 'tool', string> = {
  think: '思考',
  batch: '并行',
  tool: '工具'
}

const ROLE_LABELS: Record<'user' | 'assistant', string> = {
  user: '你',
  assistant: '智能体'
}

function TrajectoryMainView({ host }: { host: PluginHost }): ReactElement {
  const conversationStore = useMemo(
    () =>
      host.slotStore<DigitalPanelState>(CONVERSATION_STORE_KEY) ??
      createStoreInstance(createConversationStoreDecl()),
    [host]
  )
  const state = useSyncExternalStore(conversationStore.subscribe, conversationStore.getSnapshot)
  const model: TrajectoryModel = useMemo(() => buildTrajectory(state), [state])
  const { overview, turns, messages } = model
  const latency = formatLatency(overview.latencyMs)

  return (
    <div className="trajectory" data-testid="trajectory">
      <header className="trajectory-header">
        <h2>会话轨迹</h2>
        <span className="trajectory-status" data-testid="trajectory-status">
          {STATUS_LABELS[overview.status]}
        </span>
      </header>

      <section className="trajectory-overview" data-testid="trajectory-overview">
        <Fact label="轮次" value={String(overview.turnCount)} testId="trajectory-turns" />
        <Fact label="步骤" value={String(overview.stepCount)} testId="trajectory-steps" />
        <Fact
          label="失败"
          value={String(overview.failedCount)}
          tone={overview.failedCount > 0 ? 'error' : undefined}
          testId="trajectory-failed"
        />
        <Fact label="消息" value={String(overview.messageCount)} />
        <Fact label="子智能体" value={String(overview.runningSubagents)} />
        {overview.totalTokens > 0 && <Fact label="Token" value={String(overview.totalTokens)} />}
        {latency !== '' && <Fact label="耗时" value={latency} />}
        {overview.model !== '' && <Fact label="模型" value={overview.model} />}
      </section>

      {turns.length === 0 ? (
        <p className="trajectory-empty" data-testid="trajectory-empty">
          还没有执行记录。在智能体对话里发起一次任务后，这里会按轮次列出每一步。
        </p>
      ) : (
        <section className="trajectory-turns" aria-label="按轮次的执行步骤">
          {turns.map((turn) => (
            <div className="trajectory-turn" key={turn.order} data-testid="trajectory-turn" data-order={turn.order}>
              <div className="trajectory-turn-head">
                <span className="trajectory-turn-title">第 {turn.order + 1} 轮</span>
                <span className="trajectory-turn-meta">
                  {turn.steps.length} 步
                  {turn.failed > 0 ? ` · ${turn.failed} 失败` : ''}
                </span>
              </div>
              <ol className="trajectory-rows">
                {turn.steps.map((row) => (
                  <li className="trajectory-row-item" key={row.index}>
                    {hasDetail(row) ? (
                      // 有参数或输出时用原生 <details>：无需自管展开状态，键盘/读屏都直接可用
                      <details className="trajectory-row-details">
                        <summary
                          className={`trajectory-row status-${row.status}`}
                          data-testid="trajectory-row"
                          data-status={row.status}
                          data-kind={row.kind}
                        >
                          <TrajectoryRowCells row={row} />
                        </summary>
                        <div className="trajectory-row-detail" data-testid="trajectory-row-detail">
                          <TrajectoryRowDetail row={row} />
                        </div>
                      </details>
                    ) : (
                      <div
                        className={`trajectory-row status-${row.status}`}
                        data-testid="trajectory-row"
                        data-status={row.status}
                        data-kind={row.kind}
                      >
                        <TrajectoryRowCells row={row} />
                      </div>
                    )}
                  </li>
                ))}
              </ol>
            </div>
          ))}
        </section>
      )}

      {messages.length > 0 && (
        <section className="trajectory-messages" aria-label="消息序列">
          <h3>消息</h3>
          <ul className="trajectory-message-list">
            {messages.map((message, index) => (
              <li
                className={`trajectory-message role-${message.role}`}
                key={`${message.role}-${index}`}
                data-testid="trajectory-message"
                data-role={message.role}
              >
                <span className="trajectory-message-role">{ROLE_LABELS[message.role]}</span>
                <span className="trajectory-message-text">{message.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="trajectory-hint">
        轨迹与右侧「智能体」面板同源（同一个 `conversation.state`），这里只读，不发起任何操作。
      </p>
    </div>
  )
}

function Fact({
  label,
  value,
  tone,
  testId
}: {
  label: string
  value: string
  tone?: 'error'
  testId?: string
}): ReactElement {
  return (
    <div className="trajectory-fact" {...(testId !== undefined ? { 'data-testid': testId } : {})}>
      <span className="trajectory-fact-label">{label}</span>
      <span className={`trajectory-fact-value${tone === 'error' ? ' is-error' : ''}`}>{value}</span>
    </div>
  )
}

/** 输出上限：轨迹详情是「够看清发生了什么」，整段几万字的输出留给对话面板 */
const DETAIL_OUTPUT_LIMIT = 4000

/** 有参数或输出才值得展开（思考轮既没参数也没输出，展开只会看到空面板） */
function hasDetail(row: TrajectoryStepRow): boolean {
  return row.args !== '' || row.result !== ''
}

/** 行内单元格：序号 / 类型 / 工具名 / 摘要 / 状态（行本身既可能是 `div` 也可能是 `<summary>`） */
function TrajectoryRowCells({ row }: { row: TrajectoryStepRow }): ReactElement {
  return (
    <>
      <span className="trajectory-row-index">{row.index + 1}</span>
      <span className={`trajectory-row-kind kind-${row.kind}`}>{KIND_LABELS[row.kind]}</span>
      <span className="trajectory-row-tool">{row.tool}</span>
      {row.summary !== '' && <span className="trajectory-row-summary">{row.summary}</span>}
      <span className={`trajectory-row-status badge-${row.status}`}>
        {row.status === 'running' ? '执行中' : row.status === 'done' ? '完成' : '失败'}
      </span>
    </>
  )
}

/**
 * 展开后的详情：参数（美化 JSON）+ 输出（diff 走行级配色，其余纯文本）。
 *
 * 复用 `toolDetail.ts` 的 `formatToolArgs` / `diffRows`，与对话面板的工具卡同一套判据——
 * 同一条工具调用在两个视图里不该有不同的「是不是 diff」判断。
 */
function TrajectoryRowDetail({ row }: { row: TrajectoryStepRow }): ReactElement {
  const args = formatToolArgs(row.args)
  const diff = row.result === '' ? null : diffRows(row.result)
  const output =
    row.result.length > DETAIL_OUTPUT_LIMIT
      ? `${row.result.slice(0, DETAIL_OUTPUT_LIMIT)}\n…（已截断）`
      : row.result

  return (
    <>
      {args.text !== '' && (
        <div className="trajectory-detail-block">
          <span className="trajectory-detail-label">参数</span>
          <pre className="trajectory-detail-pre">{args.text}</pre>
        </div>
      )}
      {row.result !== '' && (
        <div className="trajectory-detail-block">
          <span className="trajectory-detail-label">输出</span>
          {diff !== null ? (
            <pre className="trajectory-detail-pre trajectory-detail-diff">
              {diff.map((line, index) => (
                <span key={index} className={`diff-row diff-${line.kind}`}>
                  {line.text}
                </span>
              ))}
            </pre>
          ) : (
            <pre className="trajectory-detail-pre">{output}</pre>
          )}
        </div>
      )}
    </>
  )
}
