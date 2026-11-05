import { useMemo, useSyncExternalStore, type ReactElement } from 'react'

import { useT } from '@mobai/client-ui'
import { CONVERSATION_STORE_KEY, createConversationStoreDecl } from '@mobai/shared/agent/conversation'
import type { DigitalPanelState } from '@mobai/shared/agent/ui'
import type { MessageKey } from '@mobai/shared/i18n'
import type { PluginHost } from '@mobai/shared/plugin/host'
import type { PluginManifest } from '@mobai/shared/plugin/types'
import { AgentTeamSection } from './agentTeamSection'
import { TrajectorySection } from './trajectorySection'
import { JobBoardSection } from './jobBoardSection'
import { ScheduleSection } from './scheduleSection'
import { registerReactBinding } from '../host'

/**
 * 会话（session）：**右栏停靠面板**里的一个页签（对齐 dsh 三栏：中间对话、右栏工具）。
 *
 * 会话与对话读**同一份** `conversation.state`——对话在中间，会话在右侧停靠区，
 * 一边看对话一边切到轨迹，不用跨区移动视线。
 *
 * 三个分区共用一层外壳与同一个 `conversation.state`：
 * - 主对话摘要（状态 / 消息数 / 步骤数 / 最近回复）
 * - 共享任务看板（运行中的子智能体，可单独停止）
 * - 轨迹（概览 + 按轮次步骤表 + 消息序列，行可展开看参数/输出）
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
    description: 'Session: main conversation summary, sub-agent board and trajectory (one shared state)',
    meta: {
      labelKey: 'view.session',
      icon: 'book-open',
      descriptionKey: 'session.metaDescription'
    },
    capabilities: [
      {
        kind: 'mainView',
        id: 'session.mainView',
        labelKey: 'view.session',
        titleKey: 'view.session.title',
        order: 50,
        lazy: true,
        ui: { type: 'text', text: 'Session' }
      }
    ]
  }
}

const STATUS_LABELS: Record<DigitalPanelState['status'], MessageKey> = {
  idle: 'session.status.idle',
  thinking: 'session.status.thinking',
  waiting_approval: 'session.status.waitingApproval',
  waiting_input: 'session.status.waitingInput',
  done: 'session.status.done',
  error: 'session.status.error'
}

function SessionMainView({ host }: { host: PluginHost }): ReactElement {
  const t = useT()
  // 只取顶层状态（标题右侧的总状态）；分区各自订阅同一 store，互不依赖
  const conversationStore = useMemo(
    () =>
      host.slotStore<DigitalPanelState>(CONVERSATION_STORE_KEY) ??
        host.declareStore(CONVERSATION_STORE_KEY, createConversationStoreDecl()),
    [host]
  )
  const state = useSyncExternalStore(conversationStore.subscribe, conversationStore.getSnapshot)

  return (
    <div className="session" data-testid="session">
      <header className="session-header">
        <h2>{t('view.session')}</h2>
        <span className="session-status" data-testid="session-status">
          {t(STATUS_LABELS[state.status])}
        </span>
      </header>

      <section className="session-block" data-testid="session-block-agent-team">
        <h3 className="session-block-title">{t('session.agentTeam')}</h3>
        <AgentTeamSection host={host} />
      </section>

      <JobBoardSection host={host} />

      {/* seq 每轮对话自增：session 页签是 lazy 挂载后常驻的，靠它触发提醒列表重拉 */}
      <ScheduleSection host={host} refreshKey={state.seq} />

      <section className="session-block" data-testid="session-block-trajectory">
        <h3 className="session-block-title">{t('session.trajectory')}</h3>
        <TrajectorySection host={host} />
      </section>

      <p className="session-hint">{t('session.hint')}</p>
    </div>
  )
}
