import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'

import { defaultDraftName, type DraftSummary } from '../../../../shared/agent/session'

import ChatMarkdown from './ChatMarkdown'
import FieldActionStrip from './FieldActionStrip'

import LucideIcon from '../LucideIcon'

import {
  DigitalApproval,
  DigitalCommandMenu,
  DigitalReferenceMenu,
  DigitalStepList,
  DigitalSubagentList,
  DigitalTaskList
} from './digitalPanelViews'
import { parseDigitalCommands, type DigitalCommand } from '../../../../shared/agent/commands'
import { parseDigitalReferences, type DigitalReference } from '../../../../shared/agent/references'
import { pluginHost } from '../../plugins/builtins'
import { getToolViewBinding } from '../../plugins/toolViewBindings'

import type { BrainEvent } from '../../../../shared/agent/brain'
import type { AgentRunTier } from '../../../../shared/agent/observability'
import {
  hydrateFromSession,
  initialDigitalPanelState,
  isAnswerComplete,
  isMultiQuestion,
  isRunning,
  reduceBrainEvent,
  resolveApproval,
  resolveInteraction,
  submitUserMessage,
  summarizeToolTasks,
  type DigitalPanelState
} from '../../../../shared/agent/panel'
import { toErrorMessage } from '../../../../shared/util/errors'
import { AGENT_PRESETS, DEFAULT_PRESET_ID, presetLabel } from '../../../../shared/agent/presets'

/**
 * 智能体面板（A1-4）：对话气泡 + 流式文本 + 可折叠步骤 + 任务列表 + 危险操作审批模态。
 *
 * 行为全部在 `shared/agent/panel.ts` 的纯归约里（可单测），本组件只做：
 * 订阅主进程事件流 → dispatch、发送输入、回传审批决定、会话恢复入口。
 */

interface ChatApi {
  /**
   * 发送一段对话。
   * `preset` 为智能体预设 id（借 dsh agent-preset 设计）；主进程 `agent.chat` 当前
   * 读取 `input`/`runId`，`preset` 为 **[PLACEHOLDER]** —— 后端消费预设做角色路由的接线待补，
   * 渲染层先把选择带上，避免后续再改契约形状。
   */
  chat: (req: { input: string; runId?: string; preset?: string }) => Promise<{ text: string }>
  respondApproval: (req: { requestId: string; approved: boolean }) => Promise<{ ok: boolean }>
  respondInteraction: (req: {
    requestId: string
    approved?: boolean
    answer?: string
    answers?: string[]
  }) => Promise<{ ok: boolean }>
  /** 子智能体「继续对话」：对运行中的子智能体插话（Slice 40） */
  subagentSend: (req: { id: string; content: string }) => Promise<{ ok: boolean }>
  /** 单独停止某个运行中的子智能体（不牵连父循环） */
  subagentStop: (req: { id: string }) => Promise<{ ok: boolean }>
  sessionInfo: () => Promise<{ hasSession: boolean; messageCount: number; savedAt: string }>
  sessionRestore: () => Promise<{ messages: Array<{ role?: unknown; content?: unknown }> }>
  sessionClear: () => Promise<{ cleared: boolean }>
  draftSave: (req: { name: string }) => Promise<DraftSummary>
  draftList: () => Promise<DraftSummary[]>
  draftLoad: (req: { path: string }) => Promise<{ name: string; messages: Array<{ role?: unknown; content?: unknown }> }>
  onEvent: (handler: (event: unknown) => void) => () => void
}

type Action =
  | { kind: 'event'; event: BrainEvent }
  | { kind: 'submit'; text: string }
  | { kind: 'approval'; approved: boolean }
  | { kind: 'interaction' }
  | { kind: 'hydrate'; history: Array<{ role?: unknown; content?: unknown }> }
  /** 子智能体被用户停止：乐观标记（真实 subagent_done 随后会再覆盖一次，幂等） */
  | { kind: 'subagentStop'; id: string }

function reducer(state: DigitalPanelState, action: Action): DigitalPanelState {
  switch (action.kind) {
    case 'event':
      return reduceBrainEvent(state, action.event)
    case 'submit':
      return submitUserMessage(state, action.text)
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

const STATUS_LABELS: Record<DigitalPanelState['status'], string> = {
  idle: '待命',
  thinking: '思考中…',
  waiting_approval: '等待确认',
  waiting_input: '等待回答',
  done: '已完成',
  error: '出错'
}

/** M3：档位标识（与 `turn_stats.tier` 同源；让用户一眼看出本轮走云端还是本地） */
const TIER_LABELS: Record<AgentRunTier, string> = {
  cloud: '☁ 云端',
  local: '🖥 本地',
  unconfigured: '⚙ 未配置'
}

/**
 * @param seed 首页 AI 入口卡「投喂」用的引导文案。非空时以 `nonce` 作为一次性触发哨兵：
 * nonce 变化即把 `text` 投入对话（复用 `submitText`），避免受控组件每帧重复提交。
 * 自包含面板不接受持续受控状态，故用 nonce 而非「seed 是否存在」判定是否该发。
 */
export default function DigitalPanel({
  seed,
  onOpenCapabilities
}: {
  seed?: { text: string; nonce: number } | null
  /**
   * 打开「能力清单」（调度器真实注册的工具 + 风险等级）。
   *
   * 能力清单与 AI 对话同属**同一个智能体**（工具就是它能做的事），所以入口收在 dock 头部，
   * 不再单列顶栏按钮——否则用户会以为有两个 AI。
   */
  onOpenCapabilities?: () => void
}) {
  const [state, dispatch] = useReducer(reducer, initialDigitalPanelState)
  const [input, setInput] = useState('')
  /** 斜杠命令 / @ 引用菜单的当前高亮项（两者互斥，共用同一索引；输入变化时重置为 0） */
  const [commandIndex, setCommandIndex] = useState(0)
  /** `@` 引用候选：当前游戏库的数据表类型（首次输入 `@` 时懒加载） */
  const [dataTypes, setDataTypes] = useState<DigitalReference[]>([])
  const dataTypesLoaded = useRef(false)
  const [stepsOpen, setStepsOpen] = useState(true)
  const [sessionHint, setSessionHint] = useState<{ messageCount: number; savedAt: string } | null>(null)
  const [interactionAnswer, setInteractionAnswer] = useState('')
  /** 多问题：自由文本作答（按下标对齐） */
  const [multiText, setMultiText] = useState<string[]>([])
  /** 多问题：点选作答（按下标对齐；多选题为多个 label） */
  const [multiChoice, setMultiChoice] = useState<string[][]>([])
  const [localError, setLocalError] = useState<string | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const inputRef = useRef<HTMLInputElement | null>(null)
  /** 「新建对话」下拉展开状态 */
  const [clearMenuOpen, setClearMenuOpen] = useState(false)
  /** 「草稿管理」下拉展开状态 */
  const [draftMenuOpen, setDraftMenuOpen] = useState(false)
  /** 草稿列表（打开下拉时按需拉取，不常驻轮询） */
  const [drafts, setDrafts] = useState<DraftSummary[]>([])
  /** 草稿名输入框（空串由主进程回落成默认名 `对话草稿_MMDD_HHMM`） */
  const [draftName, setDraftName] = useState('')
  /** 草稿保存进行中（避免重复点击；与「发送中」互不干扰） */
  const [draftBusy, setDraftBusy] = useState(false)
  /** 轻提示（草稿保存/恢复成功后的回执，与 localError 上下呼应） */
  const [notice, setNotice] = useState<string | null>(null)
  /** 当前智能体预设（借 dsh agent-preset 设计）；持久化在 localStorage，重启保留 */
  const [preset, setPreset] = useState<string>(() => {
    try {
      return window.localStorage.getItem('mb.agent.preset') ?? DEFAULT_PRESET_ID
    } catch {
      return DEFAULT_PRESET_ID
    }
  })
  const changePreset = (id: string): void => {
    setPreset(id)
    try {
      window.localStorage.setItem('mb.agent.preset', id)
    } catch {
      /* 忽略：隐私模式等写入失败不打断对话 */
    }
  }
  const clearMenuRef = useRef<HTMLDivElement | null>(null)
  const draftMenuRef = useRef<HTMLDivElement | null>(null)
  /** 当前进行中那一轮的 runId（「停止」按钮据此精确取消） */
  const activeRunId = useRef<string | null>(null)

  const api = useMemo(() => (window.mbApi as unknown as { agent: ChatApi }).agent, [])
  const tasks = useMemo(() => summarizeToolTasks(state.steps), [state.steps])
  const running = isRunning(state)
  /** 是否已有对话（用于区分「开新对话」空态与「运行中/历史」态：预设在空态可选，之后只读） */
  const hasConversation = state.messages.length > 0 || state.streaming !== ''

  /**
   * 工具视图 keyed slot（Slice 46 起从 slot 内核读 `tool.call.toolview`）：
   * `toolView` 能力由宿主桥接进该 keyed slot（entryKey=工具 id、component=能力 id），
   * 这里按工具取胜出条目 → `getToolViewBinding(entry.component)` 取 React 视图。
   * 未命中（无插件为该工具提供视图）返回 undefined，`DigitalStepList` 回退内置 text/code/json。
   */
  const resolveToolViewFromPlugins = useCallback((tool: string) => {
    const entry = pluginHost.slotEntryFor('tool.call.toolview', tool)
    return entry?.component === undefined ? undefined : getToolViewBinding(entry.component)
  }, [])

  const currentInteraction = state.interaction?.interaction ?? null
  const multiAnswers = (currentInteraction?.questions ?? []).map((question, index) =>
    question.options !== undefined && question.options.length > 0
      ? (multiChoice[index] ?? []).join('、')
      : (multiText[index] ?? '').trim()
  )
  const multiReady = currentInteraction !== null && isAnswerComplete(currentInteraction, multiAnswers)

  // 订阅主进程推送的事件流（与 chat 的返回值二选一即可，这里用推送保证流式可见）
  useEffect(() => {
    const unsubscribe = api.onEvent((payload) => {
      dispatch({ kind: 'event', event: payload as BrainEvent })
    })
    return unsubscribe
  }, [api])

  // 询问是否有可恢复会话
  useEffect(() => {
    let cancelled = false
    api
      .sessionInfo()
      .then((info) => {
        if (!cancelled && info.hasSession) {
          setSessionHint({ messageCount: info.messageCount, savedAt: info.savedAt })
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
    }
  }, [api])

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight })
  }, [state.messages.length, state.streaming])

  // `@` 引用候选：首次输入 `@` 时懒加载当前库的数据表类型（失败静默，输入框仍可用）
  useEffect(() => {
    if (!input.startsWith('@') || dataTypesLoaded.current) return
    dataTypesLoaded.current = true
    void window.mbApi.schema
      .list()
      .then((types) => setDataTypes(types.map((type) => ({ id: type.id, name: type.name }))))
      .catch(() => undefined)
  }, [input])

  /** 提交一段文本（输入框发送与外部播种共用；空文本或正在运行则忽略） */
  const submitText = useCallback(
    (raw: string): void => {
      const text = raw.trim()
      if (text === '' || running) return
      setLocalError(null)
      setInput('')
      dispatch({ kind: 'submit', text })
      // 本轮 runId：取消时据此精确定位（主进程也按窗口兜底，双保险）
      const runId = `run_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`
      activeRunId.current = runId
      void api
        .chat({ input: text, runId, preset })
        .catch((error: unknown) => {
          setLocalError(toErrorMessage(error))
        })
        .finally(() => {
          if (activeRunId.current === runId) activeRunId.current = null
        })
    },
    [running, api, preset]
  )

  /** 用户点「停止」：让循环优雅中止并保留已产出的部分结果 */
  const handleStop = (): void => {
    const runId = activeRunId.current
    setLocalError(null)
    // 走通用取消通道（对话循环与单发 AI 共用一条，见 `main/task/taskRegistry.ts`）
    void window.mbApi.task
      .cancel(runId === null ? {} : { taskId: runId })
      .then((result) => {
        if (!result.cancelled) setNotice('本轮已结束，无需停止')
      })
      .catch((error: unknown) => {
        setLocalError(toErrorMessage(error))
      })
  }

  const handleSend = (): void => submitText(input)

  // 首页 AI 入口卡「投喂」：seed.nonce 变化时（且非首次挂载的 null）自动把引导文案投入对话。
  // 用 ref 记上次处理的 nonce，保证幂等 —— submitText 自身也会在 running 时忽略，双重保险。
  const lastSeedNonce = useRef<number | null>(null)
  useEffect(() => {
    if (seed == null) return
    if (seed.nonce === lastSeedNonce.current) return
    lastSeedNonce.current = seed.nonce
    submitText(seed.text)
  }, [seed, submitText])

  /**
   * 对运行中的子智能体「插话」：push 一条消息进它的收件箱（Slice 40）。
   * 子循环在下一轮开始前会把它注入为 user 消息；父循环不受影响。
   */
  const handleSubagentSteer = (id: string, content: string): void => {
    setLocalError(null)
    void api.subagentSend({ id, content }).catch((error: unknown) => {
      setLocalError(toErrorMessage(error))
    })
  }

  /**
   * 单独停止运行中的子智能体（只 abort 它自己，不牵连父循环）。
   * `ok:true` 才乐观标记为「已停止」；`ok:false`（已完成/跨轮）不动状态，等真实事件覆盖。
   */
  const handleSubagentStop = (id: string): void => {
    setLocalError(null)
    void api
      .subagentStop({ id })
      .then((result) => {
        if (result.ok) dispatch({ kind: 'subagentStop', id })
      })
      .catch((error: unknown) => {
        setLocalError(toErrorMessage(error))
      })
  }

  const handleApproval = (approved: boolean): void => {
    const approval = state.approval
    if (approval === null) return
    dispatch({ kind: 'approval', approved })
    void api.respondApproval({ requestId: approval.requestId, approved }).catch((error: unknown) => {
      setLocalError(toErrorMessage(error))
    })
  }

  /** 交互答复（确认破坏性动作 / 回答提问，含多问题） */
  const handleInteraction = (payload: { approved?: boolean; answer?: string; answers?: string[] }): void => {
    const pending = state.interaction
    if (pending === null) return
    setInteractionAnswer('')
    setMultiText([])
    setMultiChoice([])
    dispatch({ kind: 'interaction' })
    void api.respondInteraction({ requestId: pending.requestId, ...payload }).catch((error: unknown) => {
      setLocalError(toErrorMessage(error))
    })
  }

  /** 多问题：按题组装答复（有选项的题取点选结果，其余取文本输入） */
  const submitMultiAnswers = (): void => {
    const questions = state.interaction?.interaction.questions ?? []
    const answers = questions.map((question, index) =>
      question.options !== undefined && question.options.length > 0
        ? (multiChoice[index] ?? []).join('、')
        : (multiText[index] ?? '').trim()
    )
    handleInteraction({ answers })
  }

  /** 点选/取消某题的一个候选 */
  const toggleChoice = (index: number, label: string, multiSelect: boolean): void => {
    setMultiChoice((current) => {
      const next = [...current]
      const picked = next[index] ?? []
      if (!multiSelect) {
        next[index] = picked[0] === label ? [] : [label]
        return next
      }
      next[index] = picked.includes(label) ? picked.filter((item) => item !== label) : [...picked, label]
      return next
    })
  }

  /**
   * 两个下拉的「点击外部 / Esc 关闭」（与工具栏「更多 ▸」同一套交互）。
   * 监听挂在 document 上、命中判定用各自的 ref —— 两个下拉互不影响。
   */
  useEffect(() => {
    if (!clearMenuOpen && !draftMenuOpen) return undefined
    const onDocClick = (event: MouseEvent): void => {
      const target = event.target as Node
      if (clearMenuOpen && clearMenuRef.current && !clearMenuRef.current.contains(target)) {
        setClearMenuOpen(false)
      }
      if (draftMenuOpen && draftMenuRef.current && !draftMenuRef.current.contains(target)) {
        setDraftMenuOpen(false)
      }
    }
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return
      setClearMenuOpen(false)
      setDraftMenuOpen(false)
    }
    document.addEventListener('mousedown', onDocClick)
    document.addEventListener('keydown', onKey)
    return () => {
      document.removeEventListener('mousedown', onDocClick)
      document.removeEventListener('keydown', onKey)
    }
  }, [clearMenuOpen, draftMenuOpen])

  /** 拉草稿列表（打开下拉时触发；失败只提示不打断面板） */
  const loadDrafts = async (): Promise<void> => {
    try {
      setDrafts(await api.draftList())
    } catch (error: unknown) {
      setLocalError(toErrorMessage(error))
    }
  }

  /** 新建对话：清掉主进程活跃会话 + 清空面板消息（TS 只有一份会话，见菜单项注释） */
  const handleNewChat = async (): Promise<void> => {
    setLocalError(null)
    try {
      await api.sessionClear()
      dispatch({ kind: 'hydrate', history: [] })
      setSessionHint(null)
      setInput('')
    } catch (error: unknown) {
      setLocalError(toErrorMessage(error))
    }
  }

  /** 保存当前对话为草稿（主进程从落盘的活跃会话取数据，渲染层不传消息） */
  const handleSaveDraft = async (): Promise<void> => {
    setLocalError(null)
    setDraftBusy(true)
    try {
      const saved = await api.draftSave({ name: draftName.trim() })
      setDraftName('')
      setDrafts(await api.draftList())
      setNotice(`💾 草稿已保存：${saved.name}`)
    } catch (error: unknown) {
      setLocalError(toErrorMessage(error))
    } finally {
      setDraftBusy(false)
    }
  }

  /** 从草稿恢复：只灌历史，不动主进程活跃会话（用户点「恢复上次会话」才落盘） */
  const handleLoadDraft = async (path: string): Promise<void> => {
    setLocalError(null)
    setDraftMenuOpen(false)
    try {
      const draft = await api.draftLoad({ path })
      dispatch({ kind: 'hydrate', history: draft.messages })
      setNotice(`📂 已恢复草稿：${draft.name}`)
    } catch (error: unknown) {
      setLocalError(toErrorMessage(error))
    }
  }

  const handleRestore = (): void => {
    void api
      .sessionRestore()
      .then((result) => {
        dispatch({ kind: 'hydrate', history: result.messages })
        setSessionHint(null)
      })
      .catch((error: unknown) => setLocalError(toErrorMessage(error)))
  }

  /*
   * 斜杠命令（P2）：输入框以 `/` 开头时弹出，键盘上下选择 + Enter 执行。
   * 只放「不需要运行中也能用」的命令——运行中输入框是禁用的，放了也点不到。
   */
  type CommandWithRun = DigitalCommand & { run: () => void }
  const COMMANDS: CommandWithRun[] = [
    { id: 'new', label: '新建对话', hint: '清空当前记录，开始新对话（可重新选择智能体预设）', run: () => void handleNewChat() },
    {
      id: 'drafts',
      label: '草稿管理',
      hint: '保存 / 恢复对话草稿',
      run: () => {
        setDraftMenuOpen(true)
        void loadDrafts()
      }
    },
    {
      id: 'capabilities',
      label: '能力清单',
      hint: '查看工具与风险等级',
      enabled: onOpenCapabilities !== undefined,
      run: () => onOpenCapabilities?.()
    },
    { id: 'clear', label: '清空输入', hint: '只清空输入框，不发送', run: () => setInput('') },
    {
      id: 'help',
      label: '帮助',
      hint: '斜杠命令与发送方式',
      run: () => setNotice('输入 / 打开命令；直接输入文字则发送给智能体。')
    }
  ]
  const { matches: commandMatches } = parseDigitalCommands(COMMANDS, input)
  const commandOpen = commandMatches.length > 0
  const activeCommandIndex =
    commandMatches.length === 0 ? 0 : Math.min(commandIndex, commandMatches.length - 1)
  const runCommand = (id: string): void => {
    const command = COMMANDS.find((candidate) => candidate.id === id)
    if (command === undefined) return
    setInput('')
    setCommandIndex(0)
    command.run()
  }

  // `@` 引用：与 `/` 互斥（输入不可能同时以 / 和 @ 开头）；选中后插入 `@名称 `（空格 ⇒ 菜单收起）
  const { matches: referenceMatches } = parseDigitalReferences(dataTypes, input)
  const referenceOpen = referenceMatches.length > 0
  const activeReferenceIndex =
    referenceMatches.length === 0 ? 0 : Math.min(commandIndex, referenceMatches.length - 1)
  const pickReference = (name: string): void => {
    setInput(`@${name} `)
    setCommandIndex(0)
  }

  return (
    <div className="digital-panel" data-testid="digital-panel">
      <div className="changelog-header">
        <span className="chapter-form-title">🤖 智能体</span>
        {/* 运行中/已有对话：预设只读显示（借 dsh AgentPresetLabel，会话级锁定）；
            改预设请走「新建对话」——空态会重新出现预设选择（借 dsh AgentPresetSeat）。 */}
        {hasConversation && (
          <span
            className="digital-preset-chip"
            data-testid="digital-preset-chip"
            title={`本对话的智能体预设：${presetLabel(preset)}（新建对话可更改）`}
          >
            {presetLabel(preset)}
          </span>
        )}
        <div className="editor-actions">
          <span className="item-meta" data-testid="digital-status">
            {STATUS_LABELS[state.status]}
          </span>

          {/* 「新建对话」。
              旧版 菜单有「新建对话 / 清空当前对话 / 删除全部聊天记录」三项，但它的历史是**按对话分文件**的；
              TS 只有**一份**活跃会话（`agent/sessionStore.ts` 的 `active_session.json`），
              三项在 TS 语义上完全等价 —— 宁缺勿错，只给一项，不摆三个点下去一样的按钮。 */}
          <div className="toolbar-more" ref={clearMenuRef}>
            <button
              type="button"
              className="btn slim"
              data-testid="digital-clear"
              title="新建对话（清空当前记录）"
              aria-label="新建对话（清空当前记录）"
              aria-haspopup="menu"
              aria-expanded={clearMenuOpen}
              onClick={() => setClearMenuOpen((open) => !open)}
            >
              <LucideIcon name="trash" size={14} />
            </button>
            {clearMenuOpen && (
              <div className="toolbar-more-menu" role="menu" data-testid="digital-clear-menu">
                <div className="toolbar-more-group">
                  <button
                    type="button"
                    role="menuitem"
                    className="toolbar-more-item"
                    data-testid="digital-clear-new"
                    onClick={() => {
                      setClearMenuOpen(false)
                      handleNewChat()
                    }}
                  >
                    新建对话（清空当前记录）
                  </button>
                </div>
              </div>
            )}
          </div>

          {/* 草稿管理：
              保存当前对话为草稿 / 从最近草稿恢复（上限 5 条）。 */}
          <div className="toolbar-more" ref={draftMenuRef}>
            <button
              type="button"
              className="btn slim"
              data-testid="digital-draft"
              title="草稿管理（保存 / 恢复对话）"
              aria-label="草稿管理（保存 / 恢复对话）"
              aria-haspopup="menu"
              aria-expanded={draftMenuOpen}
              onClick={() => {
                setDraftMenuOpen((open) => !open)
                setNotice(null)
                if (!draftMenuOpen) void loadDrafts()
              }}
            >
              <LucideIcon name="database" size={14} />
            </button>
            {draftMenuOpen && (
              <div className="toolbar-more-menu" role="menu" data-testid="digital-draft-menu">
                <div className="toolbar-more-group">
                  <div className="digital-draft-save">
                    <input
                      className="form-input"
                      data-testid="digital-draft-name"
                      placeholder={defaultDraftName()}
                      value={draftName}
                      maxLength={80}
                      onChange={(event) => setDraftName(event.target.value)}
                    />
                    <button
                      type="button"
                      className="btn primary slim"
                      data-testid="digital-draft-save"
                      disabled={draftBusy}
                      onClick={() => void handleSaveDraft()}
                    >
                      保存为草稿
                    </button>
                  </div>
                </div>
                <div className="toolbar-more-group">
                  <div className="digital-draft-list-label">最近草稿</div>
                  {drafts.length === 0 ? (
                    <div className="item-meta" data-testid="digital-draft-empty">
                      暂无草稿
                    </div>
                  ) : (
                    drafts.map((draft) => (
                      <button
                        key={draft.path}
                        type="button"
                        role="menuitem"
                        className="toolbar-more-item"
                        data-testid="digital-draft-load"
                        onClick={() => void handleLoadDraft(draft.path)}
                      >
                        {draft.name}（{draft.time} · {draft.messageCount} 条）
                      </button>
                    ))
                  )}
                </div>
              </div>
            )}
          </div>
          {onOpenCapabilities !== undefined && (
            <button
              type="button"
              className="btn slim"
              data-testid="digital-capabilities"
              title="查看智能体能力清单（工具与风险等级）"
              aria-label="查看智能体能力清单（工具与风险等级）"
              onClick={onOpenCapabilities}
            >
              <LucideIcon name="clipboard" size={14} />
            </button>
          )}
        </div>
      </div>

      {(localError !== null || state.error !== null) && (
        <div className="form-error" data-testid="digital-error">
          {localError ?? state.error}
        </div>
      )}

      {notice !== null && (
        <div className="notice-banner inline" data-testid="digital-notice">
          {notice}
        </div>
      )}

      {sessionHint !== null && (
        <div className="notice-banner inline" data-testid="digital-session-prompt">
          检测到上次会话（{sessionHint.messageCount} 条消息，{sessionHint.savedAt}）
          <button type="button" className="btn slim" data-testid="digital-session-restore" onClick={handleRestore}>
            恢复
          </button>
          <button
            type="button"
            className="btn slim"
            data-testid="digital-session-dismiss"
            onClick={() => setSessionHint(null)}
          >
            忽略
          </button>
        </div>
      )}

      {/* 人机协作·右半环：当前选中字段的局部重生成动作条（策划书场景；无选中字段时显示引导） */}
      <FieldActionStrip />

      <div className="digital-messages" ref={scrollRef} data-testid="digital-messages">
        {state.messages
          .filter((message) => message.role === 'user' || message.role === 'assistant')
          .map((message) => (
            <div
              key={message.id}
              className={`digital-bubble digital-bubble-${message.role}`}
              data-testid="digital-message"
              data-role={message.role}
            >
              <ChatMarkdown text={message.text} />
            </div>
          ))}
        {state.streaming !== '' && (
          <div className="digital-bubble digital-bubble-assistant" data-testid="digital-streaming">
            {state.streaming}
          </div>
        )}
        {state.messages.length === 0 && state.streaming === '' && (
          <>
            {/* 开新对话入口（借 dsh AgentPresetSeat）：选预设 → 开聊后锁定为只读 */}
            <div className="digital-preset-seat">
              <label className="home-section-label" htmlFor="digital-preset">
                选择智能体预设
              </label>
              <select
                id="digital-preset"
                className="form-input digital-preset"
                data-testid="digital-preset"
                value={preset}
                title={`智能体预设：${presetLabel(preset)}`}
                onChange={(event) => changePreset(event.target.value)}
              >
                {AGENT_PRESETS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="empty">描述你想做的事，我会调用工具完成（例如「列出所有角色数据」）。</div>
          </>
        )}
      </div>

      <DigitalSubagentList
        subagents={state.subagents}
        onSteer={handleSubagentSteer}
        onStop={handleSubagentStop}
      />

      {state.steps.length > 0 && (
        <div className="digital-steps" data-testid="digital-steps">
          <button
            type="button"
            className="btn-link"
            data-testid="digital-steps-toggle"
            onClick={() => setStepsOpen((open) => !open)}
          >
            {stepsOpen ? '收起执行步骤' : `展开执行步骤（${state.steps.length}）`}
          </button>
          {stepsOpen && <DigitalStepList steps={state.steps} resolveView={resolveToolViewFromPlugins} />}
        </div>
      )}

      {state.runStats.turns > 0 && (
        <div className="digital-run-stats" data-testid="digital-run-stats">
          <span className="home-section-label">本次消耗</span>
          <span className="item-meta">
            {TIER_LABELS[state.runStats.tier]} · {state.runStats.turns} 轮 · {state.runStats.totalTokens}{' '}
            token · {state.runStats.latencyMs} ms
            {state.runStats.toolCalls > 0 ? ` · ${state.runStats.toolCalls} 次工具` : ''}
          </span>
        </div>
      )}

      {/* F7 未配置引导：档位诚实化为 unconfigured 后，明确告知当前走本地 + 给出配置路径 */}
      {state.runStats.tier === 'unconfigured' && (
        <div className="digital-run-stats" data-testid="digital-tier-hint" role="status">
          <span className="home-section-label">提示</span>
          <span className="item-meta">
            未配置云端模型，当前走本地 Ollama。到「设置 → AI 模型服务」选择服务商并填 Key，或保持本地（保密模式）。
          </span>
        </div>
      )}

      {state.terminated !== null && (
        <div className="digital-terminated" data-testid="digital-terminated" role="status">
          <span className="item-meta">⏹ {state.terminated}</span>
        </div>
      )}

      {tasks.length > 0 && <DigitalTaskList tasks={tasks} />}

      {state.interaction !== null && (
        <div className="digital-approval" data-testid="digital-interaction">
          <div className="form-label">
            {state.interaction.interaction.kind === 'confirm' ? '⚠️ 操作确认' : '❓ 需要你澄清'}
          </div>
          <div className="item-meta">
            {state.interaction.tool} · {state.interaction.action || '(未指定)'}
          </div>
          <div className="digital-interaction-prompt" data-testid="digital-interaction-prompt">
            {state.interaction.interaction.prompt}
          </div>

          {state.interaction.interaction.kind === 'confirm' ? (
            <div className="editor-actions">
              <button
                type="button"
                className="btn danger"
                data-testid="digital-interaction-approve"
                onClick={() => handleInteraction({ approved: true })}
              >
                确认执行
              </button>
              <button
                type="button"
                className="btn"
                data-testid="digital-interaction-reject"
                onClick={() => handleInteraction({ approved: false })}
              >
                取消
              </button>
            </div>
          ) : isMultiQuestion(state.interaction.interaction) ? (
            /* 多问题：逐题作答后一次性提交 */
            <div className="digital-multi-form" data-testid="digital-multi-form">
              {(state.interaction.interaction.questions ?? []).map((question, index) => (
                <div
                  className="digital-multi-item"
                  data-testid="digital-multi-question"
                  key={`${index}-${question.prompt}`}
                >
                  <div className="digital-interaction-prompt">
                    {index + 1}. {question.prompt}
                    {question.multiSelect === true ? '（可多选）' : ''}
                  </div>
                  {question.options !== undefined && question.options.length > 0 ? (
                    <div className="editor-actions">
                      {question.options.map((option) => {
                        const picked = (multiChoice[index] ?? []).includes(option.label)
                        return (
                          <button
                            key={option.label}
                            type="button"
                            className={`btn slim${picked ? ' primary' : ''}`}
                            data-testid="digital-multi-option"
                            data-picked={picked ? 'true' : 'false'}
                            title={option.description ?? undefined}
                            onClick={() => toggleChoice(index, option.label, question.multiSelect === true)}
                          >
                            {option.label}
                          </button>
                        )
                      })}
                    </div>
                  ) : (
                    <input
                      className="form-input"
                      data-testid="digital-multi-input"
                      placeholder="输入回答…"
                      value={multiText[index] ?? ''}
                      onChange={(event) =>
                        setMultiText((current) => {
                          const next = [...current]
                          next[index] = event.target.value
                          return next
                        })
                      }
                    />
                  )}
                </div>
              ))}
              <div className="editor-actions">
                <button
                  type="button"
                  className="btn primary"
                  data-testid="digital-multi-submit"
                  disabled={!multiReady}
                  onClick={submitMultiAnswers}
                >
                  提交全部回答
                </button>
              </div>
            </div>
          ) : (
            <>
              <div className="digital-input-row">
                <input
                  className="form-input"
                  data-testid="digital-interaction-input"
                  placeholder="输入你的回答…"
                  value={interactionAnswer}
                  onChange={(event) => setInteractionAnswer(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === 'Enter' && interactionAnswer.trim() !== '') {
                      handleInteraction({ answer: interactionAnswer })
                    }
                  }}
                />
                <button
                  type="button"
                  className="btn primary"
                  data-testid="digital-interaction-submit"
                  disabled={interactionAnswer.trim() === ''}
                  onClick={() => handleInteraction({ answer: interactionAnswer })}
                >
                  提交
                </button>
              </div>
              {(state.interaction.interaction.options ?? []).length > 0 && (
                <div className="editor-actions">
                  {(state.interaction.interaction.options ?? []).map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      className="btn slim"
                      data-testid="digital-interaction-option"
                      title={option.description ?? undefined}
                      onClick={() => handleInteraction({ answer: option.label })}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {state.approval !== null && (
        <DigitalApproval approval={state.approval} onApprove={handleApproval} />
      )}

      {/* 斜杠命令菜单（P2）：输入以 `/` 开头时出现在输入框上方 */}
      {commandOpen && (
        <DigitalCommandMenu commands={commandMatches} activeIndex={activeCommandIndex} onRun={runCommand} />
      )}
      {/* @ 引用菜单（P2）：输入以 `@` 开头且未以空格结束时出现 */}
      {referenceOpen && (
        <DigitalReferenceMenu
          references={referenceMatches}
          activeIndex={activeReferenceIndex}
          onPick={pickReference}
        />
      )}

      <div className="digital-input-row">
        <input
          ref={inputRef}
          className="form-input"
          data-testid="digital-input"
          placeholder="和智能体说点什么…（/ 命令，@ 引用数据表）"
          value={input}
          disabled={running}
          onChange={(event) => {
            setInput(event.target.value)
            setCommandIndex(0)
          }}
          onKeyDown={(event) => {
            if (commandOpen) {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setCommandIndex((index) => (index + 1) % commandMatches.length)
                return
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setCommandIndex((index) => (index - 1 + commandMatches.length) % commandMatches.length)
                return
              }
              if (event.key === 'Enter') {
                event.preventDefault()
                const command = commandMatches[activeCommandIndex]
                if (command !== undefined) runCommand(command.id)
                return
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                setInput('')
                setCommandIndex(0)
                return
              }
            }
            if (referenceOpen) {
              if (event.key === 'ArrowDown') {
                event.preventDefault()
                setCommandIndex((index) => (index + 1) % referenceMatches.length)
                return
              }
              if (event.key === 'ArrowUp') {
                event.preventDefault()
                setCommandIndex((index) => (index - 1 + referenceMatches.length) % referenceMatches.length)
                return
              }
              if (event.key === 'Enter') {
                event.preventDefault()
                const reference = referenceMatches[activeReferenceIndex]
                if (reference !== undefined) pickReference(reference.name)
                return
              }
              if (event.key === 'Escape') {
                event.preventDefault()
                setInput('')
                setCommandIndex(0)
                return
              }
            }
            if (event.key === 'Enter') handleSend()
          }}
        />
        <button
          type="button"
          className="btn primary"
          data-testid="digital-send"
          disabled={running || input.trim() === '' || commandOpen || referenceOpen}
          onClick={handleSend}
        >
          发送
        </button>
        {/* 运行中才出现：取消是「优雅中止」，已产出的部分结果会保留并如实提示 */}
        {running && (
          <button type="button" className="btn" data-testid="digital-stop" onClick={handleStop}>
            停止
          </button>
        )}
      </div>
    </div>
  )
}
