import { useCallback, useEffect, useMemo, useReducer, useRef, useState } from 'react'

import { defaultDraftName, type DraftSummary } from '../../../../shared/agent/session'

import ChatMarkdown from './ChatMarkdown'

import LucideIcon from '../LucideIcon'

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

/**
 * 数字员工面板（A1-4）：对话气泡 + 流式文本 + 可折叠步骤 + 任务列表 + 危险操作审批模态。
 *
 * 行为全部在 `shared/agent/panel.ts` 的纯归约里（可单测），本组件只做：
 * 订阅主进程事件流 → dispatch、发送输入、回传审批决定、会话恢复入口。
 */

interface ChatApi {
  chat: (req: { input: string }) => Promise<{ text: string }>
  respondApproval: (req: { requestId: string; approved: boolean }) => Promise<{ ok: boolean }>
  respondInteraction: (req: {
    requestId: string
    approved?: boolean
    answer?: string
    answers?: string[]
  }) => Promise<{ ok: boolean }>
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
    default:
      return state
  }
}

function toErrorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
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

export default function DigitalPanel() {
  const [state, dispatch] = useReducer(reducer, initialDigitalPanelState)
  const [input, setInput] = useState('')
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
  const clearMenuRef = useRef<HTMLDivElement | null>(null)
  const draftMenuRef = useRef<HTMLDivElement | null>(null)

  const api = useMemo(() => (window.mbApi as unknown as { agent: ChatApi }).agent, [])
  const tasks = useMemo(() => summarizeToolTasks(state.steps), [state.steps])
  const running = isRunning(state)

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

  /** 提交一段文本（输入框发送与外部播种共用；空文本或正在运行则忽略） */
  const submitText = useCallback(
    (raw: string): void => {
      const text = raw.trim()
      if (text === '' || running) return
      setLocalError(null)
      setInput('')
      dispatch({ kind: 'submit', text })
      void api.chat({ input: text }).catch((error: unknown) => {
        setLocalError(toErrorMessage(error))
      })
    },
    [running, api]
  )

  const handleSend = (): void => submitText(input)

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

  return (
    <div className="digital-panel" data-testid="digital-panel">
      <div className="changelog-header">
        <span className="chapter-form-title">🤖 数字员工</span>
        <div className="editor-actions">
          <span className="item-meta" data-testid="digital-status">
            {STATUS_LABELS[state.status]}
          </span>

          {/* 「新建对话」（对齐 PyQt `digital_panel_ui.py:132-147` 的清空按钮 + `_show_clear_menu`）。
              PyQt 菜单有「新建对话 / 清空当前对话 / 删除全部聊天记录」三项，但它的历史是**按对话分文件**的；
              TS 只有**一份**活跃会话（`agent/sessionStore.ts` 的 `active_session.json`），
              三项在 TS 语义上完全等价 —— 宁缺勿错，只给一项，不摆三个点下去一样的按钮。 */}
          <div className="toolbar-more" ref={clearMenuRef}>
            <button
              type="button"
              className="btn slim"
              data-testid="digital-clear"
              title="新建对话（清空当前记录）"
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

          {/* 草稿管理（对齐 PyQt `digital_panel_ui.py:149-159` + `digital_panel_workspace.py:156-179`）：
              保存当前对话为草稿 / 从最近草稿恢复（上限 5 条）。 */}
          <div className="toolbar-more" ref={draftMenuRef}>
            <button
              type="button"
              className="btn slim"
              data-testid="digital-draft"
              title="草稿管理（保存 / 恢复对话）"
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
          <div className="empty">描述你想做的事，我会调用工具完成（例如「列出所有角色数据」）。</div>
        )}
      </div>

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
          {stepsOpen && (
            <ol className="digital-step-list">
              {state.steps.map((step, index) => (
                <li
                  key={`${step.order}-${step.tool}-${index}`}
                  className={`digital-step digital-step-${step.status}`}
                  data-testid="digital-step"
                  data-status={step.status}
                >
                  <span className="digital-step-tool">{step.tool}</span>
                  <span className="item-meta">
                    {step.status === 'running' ? '执行中…' : null}
                    {step.status === 'done' ? '✅' : null}
                    {step.status === 'failed' ? '❌' : null}
                  </span>
                  {step.result !== undefined && step.result !== '' && (
                    <div className="digital-step-result">{step.result}</div>
                  )}
                </li>
              ))}
            </ol>
          )}
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

      {state.terminated !== null && (
        <div className="digital-terminated" data-testid="digital-terminated" role="status">
          <span className="item-meta">⏹ {state.terminated}</span>
        </div>
      )}

      {tasks.length > 0 && (
        <div className="digital-tasks" data-testid="digital-tasks">
          <span className="home-section-label">任务</span>
          {tasks.map((task, index) => (
            <div className="digital-task" data-testid="digital-task" key={`${task.tool}-${index}`}>
              <span>{task.success ? '✅' : '❌'}</span>
              <span className="digital-task-tool">{task.tool}</span>
              <span className="item-meta">{task.summary}</span>
            </div>
          ))}
        </div>
      )}

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
            /* 多问题（对齐 Python questions 数组）：逐题作答后一次性提交 */
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
        <div className="digital-approval" data-testid="digital-approval">
          <div className="form-label">⚠️ 危险操作确认</div>
          <div className="item-meta">
            工具：{state.approval.tool} · 操作：{state.approval.action || '(未指定)'}
          </div>
          <pre className="digital-approval-params">{JSON.stringify(state.approval.params, null, 2)}</pre>
          <div className="editor-actions">
            <button
              type="button"
              className="btn danger"
              data-testid="digital-approval-approve"
              onClick={() => handleApproval(true)}
            >
              允许执行
            </button>
            <button
              type="button"
              className="btn"
              data-testid="digital-approval-reject"
              onClick={() => handleApproval(false)}
            >
              拒绝
            </button>
          </div>
        </div>
      )}

      <div className="digital-input-row">
        <input
          ref={inputRef}
          className="form-input"
          data-testid="digital-input"
          placeholder="和数字员工说点什么…"
          value={input}
          disabled={running}
          onChange={(event) => setInput(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') handleSend()
          }}
        />
        <button
          type="button"
          className="btn primary"
          data-testid="digital-send"
          disabled={running || input.trim() === ''}
          onClick={handleSend}
        >
          发送
        </button>
      </div>
    </div>
  )
}
