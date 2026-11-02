import { useMemo, useSyncExternalStore, type ReactElement } from 'react'

import { useT } from '@mobai/client-ui'
import { CONVERSATION_STORE_KEY, createConversationStoreDecl } from '@mobai/shared/agent/conversation'
import type { DigitalPanelState } from '@mobai/shared/agent/ui'
import { formatToolArgs, diffRows } from '@mobai/shared/agent/tools'
import {
  buildTrajectory,
  formatLatency,
  type TrajectoryModel,
  type TrajectoryStepRow
} from '@mobai/shared/agent/observability'
import type { MessageKey } from '@mobai/shared/i18n'
import type { PluginHost } from '@mobai/shared/plugin/host'

/**
 * 「会话」页签的轨迹分区（`ui-trajectory` 的本土移植，B 路线）。
 *
 * dsh 的 Trajectory 按轮次摊开 user / assistant / tool / 子工具 / compaction，配 token 与耗时概览。
 * 我们没有 compaction、子智能体也不挂在步骤里，所以只做**能诚实做**的三块：
 * 概览（规模/成本）、按轮次的步骤表、消息序列。
 *
 * 数据源是根级 store `conversation.state`（面板唯一写者）：轨迹与对话面板天然同源，
 * 不需要再抄一份状态，也不会出现「轨迹落后于对话」的错位。
 *
 * 只负责「内容」：页签标题与整体状态在 `sessionPlugin` 的外壳里，避免与主对话分区重复。
 */
export function TrajectorySection({ host }: { host: PluginHost }): ReactElement {
  const conversationStore = useMemo(
    () =>
      host.slotStore<DigitalPanelState>(CONVERSATION_STORE_KEY) ??
        host.declareStore(CONVERSATION_STORE_KEY, createConversationStoreDecl()),
    [host]
  )
  const state = useSyncExternalStore(conversationStore.subscribe, conversationStore.getSnapshot)
  const model: TrajectoryModel = useMemo(() => buildTrajectory(state), [state])
  const { overview, turns, messages } = model
  const latency = formatLatency(overview.latencyMs)
  const t = useT()

  return (
    <div className="trajectory" data-testid="trajectory">
      <section className="trajectory-overview" data-testid="trajectory-overview">
        <Fact label={t('trajectory.fact.turns')} value={String(overview.turnCount)} testId="trajectory-turns" />
        <Fact label={t('trajectory.fact.steps')} value={String(overview.stepCount)} testId="trajectory-steps" />
        <Fact
          label={t('trajectory.fact.failed')}
          value={String(overview.failedCount)}
          tone={overview.failedCount > 0 ? 'error' : undefined}
          testId="trajectory-failed"
        />
        <Fact label={t('trajectory.fact.messages')} value={String(overview.messageCount)} />
        <Fact label={t('trajectory.fact.subagents')} value={String(overview.runningSubagents)} />
        {overview.totalTokens > 0 && <Fact label={t('trajectory.fact.token')} value={String(overview.totalTokens)} />}
        {latency !== '' && <Fact label={t('trajectory.fact.latency')} value={latency} />}
        {overview.model !== '' && <Fact label={t('trajectory.fact.model')} value={overview.model} />}
      </section>

      {turns.length === 0 ? (
        <p className="trajectory-empty" data-testid="trajectory-empty">
          {t('trajectory.empty')}
        </p>
      ) : (
        <section className="trajectory-turns" aria-label={t('trajectory.turnsAria')}>
          {turns.map((turn) => (
            <div className="trajectory-turn" key={turn.order} data-testid="trajectory-turn" data-order={turn.order}>
              <div className="trajectory-turn-head">
                <span className="trajectory-turn-title">{t('trajectory.turnTitle', { n: turn.order + 1 })}</span>
                <span className="trajectory-turn-meta">
                  {t('trajectory.stepsCount', { n: turn.steps.length })}
                  {turn.failed > 0 ? t('trajectory.failedCount', { n: turn.failed }) : ''}
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
        <section className="trajectory-messages" aria-label={t('trajectory.messagesAria')}>
          <h3>{t('trajectory.messagesTitle')}</h3>
          <ul className="trajectory-message-list">
            {messages.map((message, index) => (
              <li
                className={`trajectory-message role-${message.role}`}
                key={`${message.role}-${index}`}
                data-testid="trajectory-message"
                data-role={message.role}
              >
                <span className="trajectory-message-role">{t(ROLE_LABELS[message.role])}</span>
                <span className="trajectory-message-text">{message.text}</span>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  )
}

const KIND_LABELS: Record<'think' | 'batch' | 'tool', MessageKey> = {
  think: 'trajectory.kind.think',
  batch: 'trajectory.kind.batch',
  tool: 'trajectory.kind.tool'
}

const ROLE_LABELS: Record<'user' | 'assistant', MessageKey> = {
  user: 'trajectory.role.user',
  assistant: 'trajectory.role.assistant'
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
  const t = useT()
  return (
    <>
      <span className="trajectory-row-index">{row.index + 1}</span>
      <span className={`trajectory-row-kind kind-${row.kind}`}>{t(KIND_LABELS[row.kind])}</span>
      <span className="trajectory-row-tool">{row.tool}</span>
      {row.summary !== '' && <span className="trajectory-row-summary">{row.summary}</span>}
      <span className={`trajectory-row-status badge-${row.status}`}>
        {row.status === 'running'
          ? t('trajectory.status.running')
          : row.status === 'done'
            ? t('trajectory.status.done')
            : t('trajectory.status.failed')}
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
  const t = useT()
  const args = formatToolArgs(row.args)
  const diff = row.result === '' ? null : diffRows(row.result)
  const output =
    row.result.length > DETAIL_OUTPUT_LIMIT
      ? `${row.result.slice(0, DETAIL_OUTPUT_LIMIT)}\n${t('trajectory.truncated')}`
      : row.result

  return (
    <>
      {args.text !== '' && (
        <div className="trajectory-detail-block">
          <span className="trajectory-detail-label">{t('trajectory.detail.args')}</span>
          <pre className="trajectory-detail-pre">{args.text}</pre>
        </div>
      )}
      {row.result !== '' && (
        <div className="trajectory-detail-block">
          <span className="trajectory-detail-label">{t('trajectory.detail.output')}</span>
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
