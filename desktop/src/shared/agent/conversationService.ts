/**
 * 对话状态的**对外服务面**（插件 `service` 能力 `agent.conversation` 的实现）。
 *
 * 为什么在根级 store 之外还要一层 service：store 是「订阅 + 精细读写」的底层入口
 * （插件知道 key 就能 uSES 订阅）；service 是**可发现、可序列化**的一层——插件清单里
 * 能看到 `agent.conversation` 这个能力，用一句 `invoke({op:'snapshot'})` 就能拿到
 * 面板状态摘要，不必知道 store key、也不必 import 对话内部类型。
 *
 * 请求/响应都走 JSON 形状（`invoke(input)` 的契约是 `unknown`），故这里不抛异常：
 * 失败一律 `{ ok:false, error }`，让调用方按结果分支（跨进程/跨 bundle 的调用方拿不到我们的异常类型）。
 */

import type { DigitalPanelState } from './panel'
import type { SlotStoreInstance } from '../plugin/slotRegistry'

/** 面板状态摘要（对外只暴露「稳定且有用」的字段，不泄露内部结构） */
export interface ConversationSnapshot {
  /** 运行状态（idle/thinking/waiting_approval/waiting_input/done/error） */
  status: DigitalPanelState['status']
  /** 已完成的消息条数（不含流式中文本） */
  messageCount: number
  /** 是否有流式输出在进行 */
  streaming: boolean
  /** 执行步骤数（工具/思考轮） */
  stepCount: number
  /** 运行中的子智能体数 */
  runningSubagents: number
  /** 最近一条助手消息的纯文本（无则空串；截断 200 字，够做摘要/通知） */
  lastAssistantText: string
}

export type ConversationServiceResult =
  | { ok: true; snapshot: ConversationSnapshot }
  | { ok: true; cleared: true }
  | { ok: false; error: string }

/** 从面板状态派生对外摘要（纯函数） */
export function snapshotConversation(state: DigitalPanelState): ConversationSnapshot {
  const lastAssistant = [...state.messages].reverse().find((message) => message.role === 'assistant')
  const text = lastAssistant?.text ?? ''
  return {
    status: state.status,
    messageCount: state.messages.length,
    streaming: state.streaming !== '',
    stepCount: state.steps.length,
    runningSubagents: state.subagents.filter((sub) => sub.status === 'running').length,
    lastAssistantText: text.length > 200 ? `${text.slice(0, 200)}…` : text
  }
}

/**
 * 构造 service 实现。
 *
 * 支持的请求：
 * - `{ op: 'snapshot' }`（缺省）：读摘要；
 * - `{ op: 'clear' }`：清空对话（等价于点「新对话」，只清视图状态，不取消进行中的运行）。
 *
 * 未知 op / 缺 store 都返回 `{ ok:false, error }`——静默成功会让插件误以为生效。
 */
export function createConversationService(
  store: SlotStoreInstance<DigitalPanelState> | null
): (input?: unknown) => ConversationServiceResult {
  return (input?: unknown): ConversationServiceResult => {
    if (store === null) return { ok: false, error: '对话 store 未声明（智能体面板插件未加载）' }
    const op =
      typeof input === 'object' && input !== null && 'op' in input
        ? String((input as { op: unknown }).op)
        : 'snapshot'
    if (op === 'snapshot') return { ok: true, snapshot: snapshotConversation(store.getSnapshot()) }
    if (op === 'clear') {
      store.actions.reset()
      return { ok: true, cleared: true }
    }
    return { ok: false, error: `未知操作：${op}（支持 snapshot / clear）` }
  }
}
