/**
 * 对话状态 store（根级 slot store 的首个真实用户）。
 *
 * 为什么把状态从 `DigitalPanel` 的 `useReducer` 搬出来：面板是**唯一写入者**，
 * 但「当前对话是什么状态」需要被别的插件读到（命令面板要显示运行中/消息数、
 * 未来的会话工具条要按状态禁用动作）。挂在组件里的 `useReducer` 无法跨插件共享，
 * 于是落到宿主根级 store（`host.declareStore('conversation.state', ...)`）。
 *
 * 设计取舍：
 * - **状态形状不变**（仍是 `DigitalPanelState`），归约逻辑仍复用 `panel.ts` 的纯函数，
 *   所以这次是「换存放位置」而非「换状态模型」——面板里的 `state.xxx` 一行都不用改。
 * - store 的 `actions` 只做**归约**，不做副作用（IPC/取消/草稿都在面板里），
 *   这样 actions 可以在 Node 下直接单测，也不会把 store 变成第二个业务层。
 */

import type { SlotStoreDecl } from '../../plugin/types'
import type { BrainEvent } from '../brain'
import type { DigitalAttachment } from '../../util/io'
import {
  hydrateFromSession,
  initialDigitalPanelState,
  reduceBrainEvent,
  resolveApproval,
  resolveInteraction,
  submitUserMessage,
  type DigitalPanelState
} from '../ui'

/** 对话状态的写入口（原 `DigitalPanel` 内的本地 Action，搬到这里以便跨插件复用） */
export type ConversationAction =
  | { kind: 'event'; event: BrainEvent }
  | { kind: 'submit'; text: string; attachments?: DigitalAttachment[] }
  | { kind: 'approval'; approved: boolean }
  | { kind: 'interaction' }
  | { kind: 'hydrate'; history: Array<{ role?: unknown; content?: unknown }> }
  /** 子智能体被用户停止：乐观标记（真实 subagent_done 随后会再覆盖一次，幂等） */
  | { kind: 'subagentStop'; id: string }

/**
 * 对话状态归约（纯函数）：与面板此前的本地 reducer 逐字等价，
 * 只是搬进 shared 以便 store 与单测共用同一实现。
 */
export function reduceConversation(state: DigitalPanelState, action: ConversationAction): DigitalPanelState {
  switch (action.kind) {
    case 'event':
      return reduceBrainEvent(state, action.event)
    case 'submit':
      return submitUserMessage(state, action.text, action.attachments)
    case 'approval':
      return resolveApproval(state, action.approved)
    case 'interaction':
      return resolveInteraction(state)
    case 'hydrate':
      return hydrateFromSession(state, action.history)
    case 'subagentStop':
      // 复用 subagent_done 的归约：立即给出「已停止」反馈，避免按钮点击后无响应
      return reduceBrainEvent(state, { type: 'subagent_done', id: action.id, success: false, text: '已停止' })
    default:
      return state
  }
}

/**
 * 初始状态要**每次新建对象**：`initialDigitalPanelState` 是常量对象，
 * 若 `reset` 直接返回它，uSES 会因为快照引用没变而**不重渲染**（清空对话看起来没生效）。
 * 数组字段同样给新引用，避免与常量共享可变结构。
 */
export function freshConversationState(): DigitalPanelState {
  return { ...initialDigitalPanelState, messages: [], steps: [], subagents: [] }
}

/** 根级 store 的 key（宿主与消费方共用，避免各处硬编码字符串写错） */
export const CONVERSATION_STORE_KEY = 'conversation.state'

/** 对话状态 store 声明：init + 归约型 actions（无副作用） */
export function createConversationStoreDecl(): SlotStoreDecl<DigitalPanelState> {
  return {
    init: freshConversationState,
    actions: {
      dispatch: (state, action) => reduceConversation(state, action as ConversationAction),
      /** 清空对话（新对话）：回到初始态，不触碰面板本地的输入框/草稿 */
      reset: () => freshConversationState(),
      /** 从会话历史播种（恢复草稿/上次会话） */
      hydrate: (state, history) =>
        hydrateFromSession(state, history as Array<{ role?: unknown; content?: unknown }>)
    }
  }
}
