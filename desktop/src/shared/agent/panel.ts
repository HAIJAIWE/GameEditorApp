/**
 * 数字员工面板的视图模型归约。
 *
 * 面板不直接消费原始事件流，而是消费本模块把 `BrainEvent[]` 归约出的**纯状态**：
 * 对话气泡、流式文本、可折叠步骤、任务列表、待审批请求、整体状态。
 * 这样组件只做渲染，行为可在 Node 环境完整单测。
 *
 * 有意偏离 旧版：旧版 的面板状态是 旧版 widget 树 + `digital_panel_state` 的类型桩，
 * 无法脱离 GUI 测试；TS 侧把「事件 → 状态」提成纯函数（`reduceBrainEvent`），
 * 组件退化为 `useReducer` 的薄壳。
 */

import type { BrainEvent } from './brain'
import { accumulateTurn, emptyAgentRunStats, type AgentRunStats } from './observability'
import type { SkillInteraction } from './protocol'
import type { DigitalAttachment } from '../util/libraryAttachments'

export type DigitalStatus = 'idle' | 'thinking' | 'waiting_approval' | 'waiting_input' | 'done' | 'error'

/** 步骤类型：LLM 思考轮 / 工具批 / 单个工具执行 */
export type DigitalStepKind = 'think' | 'batch' | 'tool'

export interface DigitalStep {
  order: number
  /** 展示名（`llm_think` / `并行N工具` / 工具 id） */
  tool: string
  kind: DigitalStepKind
  status: 'running' | 'done' | 'failed'
  /** 工具执行结果摘要（仅 kind='tool'） */
  result?: string
  success?: boolean
  /** 本次调用的原始参数文本（仅 kind='tool'；事件没带就为空） */
  args?: string
}

export interface DigitalMessage {
  id: string
  role: 'user' | 'assistant'
  text: string
  /** 用户消息附带的文件（对齐 dsh ui-attachment 的诚实子集）；助手消息不带 */
  attachments?: DigitalAttachment[]
}

export interface DigitalApproval {
  requestId: string
  tool: string
  action: string
  params: Record<string, unknown>
}

/** 任务列表条目（由工具步骤派生） */
export interface DigitalTask {
  tool: string
  success: boolean
  summary: string
}

/** 子智能体条目（由 subagent_started / subagent_done 事件派生，Slice 38） */
export interface DigitalSubagent {
  id: string
  task: string
  status: 'running' | 'done' | 'failed'
  result?: string
}

/** 技能提出的交互请求（确认破坏性动作 / 提问澄清参数） */
export interface DigitalInteraction {
  requestId: string
  tool: string
  action: string
  interaction: SkillInteraction
}

export interface DigitalPanelState {
  messages: DigitalMessage[]
  steps: DigitalStep[]
  /** 本轮派出的子智能体及其状态（Slice 38） */
  subagents: DigitalSubagent[]
  /** 正在流式输出的文本（本轮） */
  streaming: string
  /** 待用户审批的危险操作；非空时 status 为 waiting_approval */
  approval: DigitalApproval | null
  /** 待用户答复的技能交互；非空时 status 为 waiting_input */
  interaction: DigitalInteraction | null
  status: DigitalStatus
  error: string | null
  /** 自增序号（生成稳定的消息 id） */
  seq: number
  /** M1 观测：本轮运行的累计消耗（每次新发送时重置） */
  runStats: AgentRunStats
  /** M0.5 终止闸：命中计数闸时的诚实提示文案（每次新发送时重置；null = 未触发） */
  terminated: string | null
}

export const initialDigitalPanelState: DigitalPanelState = {
  messages: [],
  steps: [],
  subagents: [],
  streaming: '',
  approval: null,
  interaction: null,
  status: 'idle',
  error: null,
  seq: 0,
  runStats: emptyAgentRunStats(),
  terminated: null
}

/** 任务列表摘要最大长度（超出截断，避免面板被长结果撑爆） */
export const TASK_SUMMARY_LIMIT = 120

/** 追加用户消息并进入思考态（点击发送时调用） */
export function submitUserMessage(
  state: DigitalPanelState,
  text: string,
  attachments?: DigitalAttachment[]
): DigitalPanelState {
  const seq = state.seq + 1
  return {
    ...state,
    seq,
    messages: [
      ...state.messages,
      {
        id: `m${seq}`,
        role: 'user',
        text,
        ...(attachments !== undefined && attachments.length > 0 ? { attachments } : {})
      }
    ],
    steps: [],
    subagents: [],
    streaming: '',
    approval: null,
    interaction: null,
    status: 'thinking',
    error: null,
    runStats: emptyAgentRunStats(),
    terminated: null
  }
}

/**
 * 本轮结束时把还挂在 `running` 的步骤落定。
 *
 * 事件模型里 `step_start` 压入的是**占位步**（think / batch），真正的完成信息由
 * `step_done` 另起一条 tool 步承载——所以占位步永远不会被自己关闭。不兜这一下，
 * 面板状态已经是「已完成」，进度条徽标却永远停在「进行中」，两处互相打脸。
 */
function settleRunningSteps(steps: DigitalStep[], fallback: 'done' | 'failed'): DigitalStep[] {
  let touched = false
  const next = steps.map((step) => {
    if (step.status !== 'running') return step
    touched = true
    return { ...step, status: fallback }
  })
  return touched ? next : steps
}

/** 归约单个事件；未知事件原样返回（向前兼容后续新增事件类型） */
export function reduceBrainEvent(state: DigitalPanelState, event: BrainEvent): DigitalPanelState {
  switch (event.type) {
    case 'step_start': {
      const kind: DigitalStepKind = event.tool === 'llm_think' ? 'think' : 'batch'
      return {
        ...state,
        status: kind === 'think' ? 'thinking' : state.status,
        steps: [...state.steps, { order: event.order, tool: event.tool, kind, status: 'running' }]
      }
    }
    case 'stream_chunk':
      return { ...state, streaming: state.streaming + event.text }
    case 'stream_done':
      return { ...state, streaming: event.fullText }
    case 'approval_required':
      return {
        ...state,
        approval: {
          requestId: event.requestId,
          tool: event.tool,
          action: event.action,
          params: event.params
        },
        status: 'waiting_approval'
      }
    case 'interaction_required':
      return {
        ...state,
        interaction: {
          requestId: event.requestId,
          tool: event.tool,
          action: event.action,
          interaction: event.interaction
        },
        status: 'waiting_input'
      }
    case 'step_done':
      return {
        ...state,
        steps: [
          ...state.steps,
          {
            order: state.steps.at(-1)?.order ?? 0,
            tool: event.tool,
            kind: 'tool',
            status: event.success ? 'done' : 'failed',
            result: event.result,
            success: event.success,
            args: event.args
          }
        ]
      }
    case 'subagent_started':
      return {
        ...state,
        subagents: [...state.subagents, { id: event.id, task: event.task, status: 'running' }]
      }
    case 'subagent_done':
      return {
        ...state,
        subagents: state.subagents.map((sub) =>
          sub.id === event.id
            ? { ...sub, status: event.success ? 'done' : 'failed', result: event.text }
            : sub
        )
      }
    case 'turn_stats':
      return {
        ...state,
        runStats: accumulateTurn(state.runStats, {
          turn: event.turn,
          model: event.model,
          tier: event.tier,
          usage: event.usage,
          latencyMs: event.latencyMs,
          toolCalls: event.toolCalls
        })
      }
    case 'terminated':
      // M0.5：命中计数闸 → 记住诚实提示（状态仍由随后的 done/error 决定）
      return { ...state, terminated: event.detail }
    case 'done': {
      const text = event.text
      const seq = text.trim() === '' ? state.seq : state.seq + 1
      return {
        ...state,
        seq,
        messages:
          text.trim() === ''
            ? state.messages
            : [...state.messages, { id: `m${seq}`, role: 'assistant', text }],
        streaming: '',
        approval: null,
        interaction: null,
        status: 'done',
        // 收尾：占位步落定为「完成」，否则进度条会永远显示「进行中」
        steps: settleRunningSteps(state.steps, 'done')
      }
    }
    case 'error':
      return {
        ...state,
        error: event.message,
        approval: null,
        interaction: null,
        status: 'error',
        // 出错时把仍挂着的步骤标成失败：它们确实没跑完
        steps: settleRunningSteps(state.steps, 'failed')
      }
    default:
      return state
  }
}

/** 批量归约（E2E/回放时用；等价于逐个 reduceBrainEvent） */
export function applyBrainEvents(state: DigitalPanelState, events: BrainEvent[]): DigitalPanelState {
  return events.reduce(reduceBrainEvent, state)
}

/** 审批完成后清理待办（批准/拒绝都要清，避免模态卡住） */
export function resolveApproval(state: DigitalPanelState, approved: boolean): DigitalPanelState {
  if (state.approval === null) return state
  return {
    ...state,
    approval: null,
    status: approved ? 'thinking' : 'done'
  }
}

/** 交互答复完成（确认/提问都要清，避免模态卡住） */
export function resolveInteraction(state: DigitalPanelState): DigitalPanelState {
  if (state.interaction === null) return state
  return { ...state, interaction: null, status: 'thinking' }
}

/** 是否为多问题交互（决定面板渲染单输入框还是多问题表单） */
export function isMultiQuestion(interaction: SkillInteraction): boolean {
  return interaction.kind === 'question' && interaction.questions !== undefined && interaction.questions.length > 0
}

/** 多问题答复是否完整（供「提交」按钮启用判断；空串按未作答计） */
export function isAnswerComplete(interaction: SkillInteraction, answers: readonly string[]): boolean {
  const questions = interaction.questions ?? []
  if (questions.length === 0) return false
  return questions.every((_, index) => (answers[index] ?? '').trim() !== '')
}

/** 由工具步骤派生任务列表（面板「任务」区展示） */
export function summarizeToolTasks(steps: DigitalStep[]): DigitalTask[] {
  return steps
    .filter((step) => step.kind === 'tool')
    .map((step) => ({
      tool: step.tool,
      success: step.success ?? false,
      summary: (step.result ?? '').slice(0, TASK_SUMMARY_LIMIT)
    }))
}

/** 是否正在运行（用于禁用输入框 / 显示停止按钮） */
export function isRunning(state: DigitalPanelState): boolean {
  return state.status === 'thinking' || state.status === 'waiting_approval' || state.status === 'waiting_input'
}

/** 用历史会话消息初始化面板（会话恢复入口） */
/**
 * 从会话快照的 `attachments` 字段解析附件元数据（恢复会话时重放 chip）。
 * 结构不对/缺必填字段的条目**逐条丢弃**（不因一条坏数据丢掉整段历史）。
 */
function parseAttachments(value: unknown): DigitalAttachment[] | undefined {
  if (!Array.isArray(value)) return undefined
  const out: DigitalAttachment[] = []
  for (const raw of value) {
    if (raw === null || typeof raw !== 'object') continue
    const record = raw as Record<string, unknown>
    // 只认叶子名（对齐 dsh：持久化事件不含路径）；旧数据里的 path 字段忽略即可
    const name = typeof record['name'] === 'string' ? record['name'] : ''
    if (name === '') continue
    out.push({
      name,
      mime: typeof record['mime'] === 'string' ? record['mime'] : 'application/octet-stream',
      bytes: typeof record['bytes'] === 'number' && Number.isFinite(record['bytes']) ? record['bytes'] : 0
    })
  }
  return out.length > 0 ? out : undefined
}

export function hydrateFromSession(
  state: DigitalPanelState,
  history: Array<{ role?: unknown; content?: unknown; attachments?: unknown }>
): DigitalPanelState {
  let seq = state.seq
  const messages: DigitalMessage[] = []
  for (const entry of history) {
    const role = entry.role
    const content = entry.content
    if (typeof content !== 'string' || content === '') continue
    if (role !== 'user' && role !== 'assistant') continue
    seq += 1
    const attachments = parseAttachments(entry.attachments)
    messages.push({
      id: `m${seq}`,
      role,
      text: content,
      ...(attachments !== undefined ? { attachments } : {})
    })
  }
  return {
    ...state,
    seq,
    messages,
    steps: [],
    streaming: '',
    approval: null,
    interaction: null,
    status: 'idle',
    error: null,
    terminated: null
  }
}
