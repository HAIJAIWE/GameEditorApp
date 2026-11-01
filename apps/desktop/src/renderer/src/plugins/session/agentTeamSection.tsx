import { useMemo, useSyncExternalStore } from 'react'

import { CONVERSATION_STORE_KEY, createConversationStoreDecl } from '@mobai/shared/agent/conversation'
import type { DigitalPanelState } from '@mobai/shared/agent/ui'
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
        <h3>主对话</h3>
        <dl className="agent-team-facts">
          <div>
            <dt>状态</dt>
            <dd data-testid="agent-team-conversation-status">{CONVERSATION_STATUS[conversation.status]}</dd>
          </div>
          <div>
            <dt>消息</dt>
            <dd>{conversation.messages.length} 条</dd>
          </div>
          <div>
            <dt>执行步骤</dt>
            <dd>{conversation.steps.length} 步</dd>
          </div>
        </dl>
        {lastTextShort === '' ? (
          <p className="agent-team-empty">主对话还没有助手回复。</p>
        ) : (
          <p className="agent-team-last" data-testid="agent-team-conversation-last">
            {lastTextShort}
          </p>
        )}
      </section>

      <section className="agent-team-board">
        <h3>
          共享任务看板
          <span className="agent-team-count">
            {running.length} 运行中 / 共 {subagents.length}
          </span>
        </h3>
        {subagents.length === 0 ? (
          <p className="agent-team-empty">
            当前没有运行中的子智能体。在智能体对话里触发并行 / 派生子任务（如多智能体协作、批量生成）时，
            这里会实时显示每个子智能体的任务与状态。
          </p>
        ) : (
          <ul className="agent-team-list">
            {subagents.map((sub) => (
              <li key={sub.id} className={`agent-team-card status-${sub.status}`}>
                <div className="agent-team-card-head">
                  <span className="agent-team-task">{sub.task}</span>
                  <span className={`agent-team-badge badge-${sub.status}`}>{statusLabel(sub.status)}</span>
                </div>
                <div className="agent-team-meta">
                  <code className="agent-team-id">{sub.id}</code>
                  {sub.result !== undefined && <span className="agent-team-result">{sub.result}</span>}
                </div>
                {sub.status === 'running' && (
                  <button type="button" className="btn slim" onClick={() => void stopSubagent(sub.id)}>
                    停止
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
const CONVERSATION_STATUS: Record<DigitalPanelState['status'], string> = {
  idle: '待命',
  thinking: '思考中…',
  waiting_approval: '等待确认',
  waiting_input: '等待回答',
  done: '已完成',
  error: '出错'
}

function statusLabel(status: string): string {
  switch (status) {
    case 'running':
      return '运行中'
    case 'done':
      return '已完成'
    case 'failed':
      return '已失败'
    default:
      return status
  }
}
