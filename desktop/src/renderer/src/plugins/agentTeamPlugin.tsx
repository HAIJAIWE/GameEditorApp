import { useSyncExternalStore } from 'react'

import type { PluginHost } from '../../../shared/plugin/host'
import type { PluginManifest } from '../../../shared/plugin/types'
import { registerReactBinding } from './reactBindings'
import { getSubagentsSnapshot, stopSubagent, subscribeSubagents } from '../agent/subagentStore'

/**
 * 智能体协作（agent-team，Part A 能力③ / dsh agent-team 思路）。
 *
 * 主区页签「团队协作」：实时展示运行中的子智能体（来自 subagentStore，与右侧智能体面板同源），
 * 每张卡片即一个共享任务；运行中可单独停止（不牵连父循环）。无子智能体时给出引导。
 */
export function defineAgentTeamPlugin(_host: PluginHost): PluginManifest {
  // 富 UI 作为可选绑定外置（宿主侧）；CLI / 引擎宿主回退到声明式 ui。
  registerReactBinding('agentTeam.mainView', () => <AgentTeamMainView />)
  return {
    id: 'agent-team',
    name: 'agent-team',
    version: '0.1.0',
    description: '智能体协作：展示运行中的子智能体 + 共享任务看板',
    meta: {
      label: '团队协作',
      icon: '🤝',
      description: '运行中的子智能体与共享任务看板（与智能体面板同源）'
    },
    capabilities: [
      {
        kind: 'mainView',
        id: 'agentTeam.mainView',
        label: '团队协作',
        title: '智能体协作：运行中的子智能体 + 共享任务看板',
        order: 50,
        lazy: true,
        ui: { type: 'text', text: '团队协作' }
      }
    ]
  }
}

function AgentTeamMainView() {
  const subagents = useSyncExternalStore(subscribeSubagents, getSubagentsSnapshot)
  const running = subagents.filter((sub) => sub.status === 'running')

  return (
    <div className="agent-team">
      <header className="agent-team-header">
        <h2>智能体协作</h2>
        <span className="agent-team-count">
          {running.length} 运行中 / 共 {subagents.length}
        </span>
      </header>

      <section className="agent-team-board">
        <h3>共享任务看板</h3>
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

      <p className="agent-team-hint">
        数据与右侧「智能体」面板同源（同一条子智能体事件流），单一数据源，互不冲突。
      </p>
    </div>
  )
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
