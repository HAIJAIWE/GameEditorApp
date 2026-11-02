import { useMemo, useSyncExternalStore } from 'react'

import { useT } from '@mobai/client-ui'
import { CONVERSATION_STORE_KEY, createConversationStoreDecl } from '@mobai/shared/agent/conversation'
import type { DigitalPanelState } from '@mobai/shared/agent/ui'
import type { MessageKey } from '@mobai/shared/i18n'
import type { PluginHost } from '@mobai/shared/plugin/host'
import { getSubagentsSnapshot, stopSubagent, subscribeSubagents } from '../../agent/subagentStore'

/**
 * 「会话」页签的主对话摘要 + 子智能体看板分区（原「团队协作」页签的主体）。
 *
 * 上半读根级 store `conversation.state`（与右栏智能体面板同源、实时），
 * 下半读 `subagentStore`（同一条事件流）。运行中的子智能体可单独停止（不牵连父循环）。
 *
 * 为什么读 store 而不是 `agent.conversation` 服务：本组件与面板同进程、能 import 类型，
 * store 的 uSES 订阅是**实时**的；service 面留给拿不到我们类型的外部 bundle（一次性快照）。
 *
 * 只负责「内容」，页签外壳（标题/状态/同源提示）在 `sessionPlugin` 里——两个分区共用一层壳，
 * 避免「团队协作」与「轨迹」各带一套标题，合并后重复。
 */
export function AgentTeamSection({ host }: { host: PluginHost }) {
  const t = useT()
  const subagents = useSyncExternalStore(subscribeSubagents, getSubagentsSnapshot)
  const running = subagents.filter((sub) => sub.status === 'running')

  // 根级 store：与智能体面板同源；宿主未声明时退回本地实例（页面不至于整块空白）
  const conversationStore = useMemo(
    () =>
      host.slotStore<DigitalPanelState>(CONVERSATION_STORE_KEY) ??
        host.declareStore(CONVERSATION_STORE_KEY, createConversationStoreDecl()),
    [host]
  )
  const conversation = useSyncExternalStore(conversationStore.subscribe, conversationStore.getSnapshot)
  const lastAssistant = [...conversation.messages].reverse().find((message) => message.role === 'assistant')
  const lastText = lastAssistant?.text ?? ''
  const lastTextShort = lastText.length > 120 ? `${lastText.slice(0, 120)}…` : lastText

  return (
    <div className="agent-team">
      <section className="agent-team-conversation" data-testid="agent-team-conversation">
        <h3>{t('agentTeam.mainTitle')}</h3>
        <dl className="agent-team-facts">
          <div>
            <dt>{t('agentTeam.status')}</dt>
            <dd data-testid="agent-team-conversation-status">{t(CONVERSATION_STATUS[conversation.status])}</dd>
          </div>
          <div>
            <dt>{t('agentTeam.messages')}</dt>
            <dd>{t('agentTeam.messagesCount', { n: conversation.messages.length })}</dd>
          </div>
          <div>
            <dt>{t('agentTeam.steps')}</dt>
            <dd>{t('agentTeam.stepsCount', { n: conversation.steps.length })}</dd>
          </div>
        </dl>
        {lastTextShort === '' ? (
          <p className="agent-team-empty">{t('agentTeam.noReply')}</p>
        ) : (
          <p className="agent-team-last" data-testid="agent-team-conversation-last">
            {lastTextShort}
          </p>
        )}
      </section>

      <section className="agent-team-board">
        <h3>
          {t('agentTeam.boardTitle')}
          <span className="agent-team-count">
            {t('agentTeam.count', { running: running.length, total: subagents.length })}
          </span>
        </h3>
        {subagents.length === 0 ? (
          <p className="agent-team-empty">{t('agentTeam.empty')}</p>
        ) : (
          <ul className="agent-team-list">
            {subagents.map((sub) => (
              <li key={sub.id} className={`agent-team-card status-${sub.status}`}>
                <div className="agent-team-card-head">
                  <span className="agent-team-task">{sub.task}</span>
                  <span className={`agent-team-badge badge-${sub.status}`}>{statusLabel(sub.status, t)}</span>
                </div>
                <div className="agent-team-meta">
                  <code className="agent-team-id">{sub.id}</code>
                  {sub.result !== undefined && <span className="agent-team-result">{sub.result}</span>}
                </div>
                {sub.status === 'running' && (
                  <button type="button" className="btn slim" onClick={() => void stopSubagent(sub.id)}>
                    {t('agentTeam.stop')}
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

/** 主对话状态的中文标签（与智能体面板同口径） */
const CONVERSATION_STATUS: Record<DigitalPanelState['status'], MessageKey> = {
  idle: 'agent.status.idle',
  thinking: 'agent.status.thinking',
  waiting_approval: 'agent.status.waitingApproval',
  waiting_input: 'agent.status.waitingInput',
  done: 'agent.status.done',
  error: 'agent.status.error'
}

function statusLabel(status: string, t: (key: MessageKey) => string): string {
  switch (status) {
    case 'running':
      return t('agentTeam.subStatus.running')
    case 'done':
      return t('agentTeam.subStatus.done')
    case 'failed':
      return t('agentTeam.subStatus.failed')
    default:
      return status
  }
}
