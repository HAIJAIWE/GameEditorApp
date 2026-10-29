import { useMemo, useSyncExternalStore, type ReactElement } from 'react'

import { CONVERSATION_STORE_KEY, createConversationStoreDecl } from '../../../shared/agent/conversationStore'
import type { DigitalPanelState } from '../../../shared/agent/panel'
import type { PluginHost } from '../../../shared/plugin/host'
import { createStoreInstance } from '../../../shared/plugin/slotRegistry'
import type { PluginManifest } from '../../../shared/plugin/types'
import { AgentTeamSection } from './agentTeamSection'
import { TrajectorySection } from './trajectorySection'
import { registerReactBinding } from './reactBindings'

/**
 * 会话（session）：主区**一个**只读页签，替代原先并排的「团队协作」+「轨迹」。
 *
 * 三个分区共用一层外壳与同一个 `conversation.state`：
 * - 主对话摘要（状态 / 消息数 / 步骤数 / 最近回复）
 * - 共享任务看板（运行中的子智能体，可单独停止）
 * - 轨迹（概览 + 按轮次步骤表 + 消息序列，行可展开看参数/输出）
 *
 * 为什么合并：三者本质是**同一份会话数据**的三种观察角度，拆成两个页签只会让页签条变长，
 * 且用户要在两个页签之间来回对照「这条工具调用的上下文」。合并后一屏能从上到下读完。
 *
 * 为什么读 store 而不是 `agent.conversation` 服务：本插件与面板同进程、能 import 类型，
 * store 的 uSES 订阅是**实时**的；service 面留给拿不到我们类型的外部 bundle（一次性快照）。
 */
export function defineSessionPlugin(host: PluginHost): PluginManifest {
  // 富 UI 作为可选绑定外置（宿主侧）；CLI / 引擎宿主回退到声明式 ui。
  registerReactBinding('session.mainView', () => <SessionMainView host={host} />)
  return {
    id: 'session',
    name: 'session',
    version: '0.1.0',
    description: '会话：主对话摘要、子智能体看板与会话轨迹（同一份状态）',
    meta: {
      label: '会话',
      icon: '💬',
      description: '主对话摘要 + 子智能体看板 + 轨迹，都读同一份 conversation.state'
    },
    capabilities: [
      {
        kind: 'mainView',
        id: 'session.mainView',
        label: '会话',
        title: '会话：主对话摘要 + 子智能体 + 轨迹',
        order: 50,
        lazy: true,
        ui: { type: 'text', text: '会话' }
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

function SessionMainView({ host }: { host: PluginHost }): ReactElement {
  // 只取顶层状态（标题右侧的总状态）；分区各自订阅同一 store，互不依赖
  const conversationStore = useMemo(
    () =>
      host.slotStore<DigitalPanelState>(CONVERSATION_STORE_KEY) ??
      createStoreInstance(createConversationStoreDecl()),
    [host]
  )
  const state = useSyncExternalStore(conversationStore.subscribe, conversationStore.getSnapshot)

  return (
    <div className="session" data-testid="session">
      <header className="session-header">
        <h2>会话</h2>
        <span className="session-status" data-testid="session-status">
          {STATUS_LABELS[state.status]}
        </span>
      </header>

      <AgentTeamSection host={host} />

      <section className="session-block" data-testid="session-block-trajectory">
        <h3 className="session-block-title">轨迹</h3>
        <TrajectorySection host={host} />
      </section>

      <p className="session-hint">
        三个分区与右侧「智能体」面板同源（同一个 `conversation.state`），这里只读，不发起任何操作。
      </p>
    </div>
  )
}
