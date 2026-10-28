/**
 * Brain 循环实现（从 `brain.ts` 拆出，行为逐行保持）。
 *
 * 设计：**把循环写成纯逻辑**——LLM 传输层（`BrainLlmTransport`）与工具执行器
 * （`BrainToolRunner`）都是注入的接口，故可在 Node 环境用脚本化传输层完整单测
 * 「思考 → 工具 → 结果 → 终稿」的事件序列。
 *
 * 事件流：step_start → stream_chunk* → stream_done →（tool 批）step_start →
 * approval_required? → step_done* → … → done
 */

import { fixParams, isSkillInteraction, resolveRiskLevel, type SkillExecutionContext, type SkillInteraction } from '../protocol'
import {
  buildAssistantMessage,
  buildToolMessage,
  fallbackAnswer,
  formatToolResult,
  terminationDetail,
  type BrainLlmReply,
  type BrainMessage
} from '../brainMessages'
import {
  accumulateTurn,
  emptyAgentRunStats,
  turnStatFromReply,
  type AgentRunStats,
  type AgentRunTier
} from '../observability'
import {
  CLOUD_MAX_TURNS,
  CLOUD_TOOL_CONCURRENCY,
  CLOUD_WALL_CLOCK_MS,
  DEFAULT_INTERACTION_TIMEOUT_MS,
  DEFAULT_MAX_TOOL_CALLS,
  DEFAULT_MAX_TURNS,
  DEFAULT_TOOL_CONCURRENCY,
  DEFAULT_WALL_CLOCK_MS,
  type BrainEvent,
  type BrainInbox,
  type BrainRunResult,
  type BrainStopReason,
  type PreExecReviewVerdict,
  type RunBrainLoopOptions,
  type SubAgentProvider
} from './types'
import { clipToolResult, maybeResetContext, safeRunEvaluator } from './context'
import { isAbortError } from '../../abort'

/**
 * 运行 Brain 循环：推理 → 决策 → 执行 → 反思（最多 `maxTurns` 轮，另受三道计数闸约束）。
 *
 * 终止条件：
 *  1. `finishReason === 'stop'` 且无工具调用 → 以该轮文本为终稿（`stopReason: 'final'`）；
 *  2. 无工具调用（但 finishReason 不是 stop）→ 退出循环，走兜底答复（`no_tools`）；
 *  3. 工具全部无法解析 → 退出循环（`unresolvable_tools`）；
 *  4. LLM 传输失败 → 发 error 事件后中断（`completed: false`，`transport_error`）；
 *  5. 三道计数闸（DD-5）任一命中 → **带部分产出 finalize**（`completed: true`）并发 `terminated` 事件：
 *     轮数用尽（`max_turns`）/ 工具调用累计超限（`max_tool_calls`）/ 墙钟超时（`wall_clock`）；
 *  6. 用户取消（`options.signal`）→ 与计数闸同款优雅中止（`cancelled`，`completed: true`）。
 *     ⚠️ 墙钟与取消都会 **abort 在途 HTTP 请求**，而不只是「下一轮再说」——
 *     改前 `wallClockMs` 只在轮次间检查，单次调用挂住时循环无法脱身。
 *     ⚠️ 取消还要能打断**等待用户答复**（危险确认 / 提问）：那条 promise 不经过 fetch，
 *     不参与竞速就要等交互超时（120s）才生效，面板上的「停止」在这两分钟里形同无效。
 */
/** 子智能体并发上限（对齐 dsh `maxActiveSubagents` 默认 8） */
const MAX_ACTIVE_SUBAGENTS = 8

/** 进程内收件箱（简单队列；dsh inbox 的最小实现） */
function createInbox(): BrainInbox {
  const queue: string[] = []
  return {
    push: (content: string): void => {
      queue.push(content)
    },
    drain: (): string[] => queue.splice(0, queue.length)
  }
}

export async function runBrainLoop(options: RunBrainLoopOptions): Promise<BrainRunResult> {
  const { input, systemPrompts, transport, runner, requestApproval, requestInteraction, onEvent, preExecReview } =
    options
  // M3 档位路由：缺省 local；真实档位由 brainService 经 resolveLlmTier 注入。
  // 云端优先（2026-10-28）：预算/并发**按档位分**——云端取 dsh 同款激进值，本地才保守。
  // （之前把「本地 4B 并发高会乱」当成全局约束是错的：本地只是降级档，不是设计基准。）
  const tier: AgentRunTier = options.tier ?? 'local'
  const isCloud = tier === 'cloud'
  const maxTurns = options.maxTurns ?? (isCloud ? CLOUD_MAX_TURNS : DEFAULT_MAX_TURNS)
  const maxToolCalls = options.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS
  const wallClockMs = options.wallClockMs ?? (isCloud ? CLOUD_WALL_CLOCK_MS : DEFAULT_WALL_CLOCK_MS)
  // Slice 19/25：并行工具执行——云端**默认开**（并发 10），本地默认关（并发 4）；
  // 仅对非审批工具并发，审批/交互仍串行（独占屏障）。显式传 `parallelToolCalls` 可覆盖。
  const parallelToolCalls = options.parallelToolCalls ?? isCloud
  const maxToolConcurrency = Math.max(
    1,
    options.maxToolConcurrency ?? (isCloud ? CLOUD_TOOL_CONCURRENCY : DEFAULT_TOOL_CONCURRENCY)
  )
  // Slice 19：子智能体（默认工具名 `tool.spawn_subagent`；depth 防无限递归，最多 1 层）
  const subAgentTool = options.subAgentTool ?? 'tool.spawn_subagent'
  const depth = options.depth ?? 0
  const context: SkillExecutionContext = options.context ?? {}
  let requestSeq = 0
  const newRequestId = options.newRequestId ?? ((): string => `approval_${++requestSeq}`)
  const interactionTimeoutMs = options.interactionTimeoutMs ?? DEFAULT_INTERACTION_TIMEOUT_MS
  // 审批策略（对齐 dsh）：ask=询问（无通道则拒绝）；never=确定性拒绝（无头模式）
  const approvalPolicy = options.approvalPolicy ?? 'ask'
  // 运行中收件箱（dsh inbox / Steer）：每轮开始前 drain 并注入为 user 消息
  const inbox = options.inbox ?? createInbox()
  // 沙箱策略（对齐 dsh）：缺省 workspace-write（本项目 agent 本来就要写策划书/数据）
  const sandboxPolicy = options.sandboxPolicy ?? 'workspace-write'
  const tools = options.tools ?? []

  const events: BrainEvent[] = []
  const emit = (event: BrainEvent): void => {
    events.push(event)
    onEvent?.(event)
  }

  let messages: BrainMessage[] = [
    ...systemPrompts.map((content) => ({ role: 'system' as const, content })),
    // Slice 34：从事件日志恢复的历史（系统提示词之后、本次输入之前）
    ...(options.initialMessages ?? []),
    { role: 'user', content: input }
  ]
  const results: string[] = []
  /** F10 per-tool 重试预算：按 `工具/动作` 累计连续失败次数，达阈值强制换方案 */
  const failCount = new Map<string, number>()
  // M1 观测：本轮运行的累计消耗（每轮 LLM 调用后并入；档位来自 M3 注入的 `tier`）
  let runStats: AgentRunStats = emptyAgentRunStats(tier)
  // M0.5 终止闸（DD-5）：轮次 / 工具调用累计 / 墙钟 三道**计数式**硬闸。
  // 任一命中 ⇒ 带部分产出 finalize（`completed: true`），并让 `stopReason` 与 `terminated` 事件如实说明原因。
  const startedAt = Date.now()
  let toolCallCount = 0
  let stopReason: BrainStopReason = 'max_turns'

  /*
   * 取消 / 墙钟共用一个**内部** controller，外部 signal 只做转发。
   *
   * 为什么不让调用方直接传 controller：墙钟超时也必须能中断「一次挂住的 HTTP 调用」。
   * 改前 `wallClockMs` 只在轮次之间检查 —— 单次 LLM 调用卡死时循环无法脱身，
   * 这与「三道计数闸是硬闸」的说法不符（用户看到的是永久转圈）。
   *
   * 生命周期：每次 `runBrainLoop` 新建一个，随本轮结束丢弃；`once` 监听不摘除
   * （IPC 侧每轮都传新 signal，不会累积）。
   */
  const controller = new AbortController()
  const externalSignal = options.signal
  if (externalSignal !== undefined) {
    if (externalSignal.aborted) controller.abort()
    else externalSignal.addEventListener('abort', () => controller.abort(), { once: true })
  }
  /** 剩余墙钟预算（毫秒）；≤0 表示不限制 */
  const remainingBudget = (): number => (wallClockMs > 0 ? wallClockMs - (Date.now() - startedAt) : 0)

  /**
   * 等待用户答复（危险确认 / 提问）的保护：**超时与取消都按「未答复」回落**。
   *
   * ⚠️ 取消必须也参与竞速。`controller.signal` 只能 abort `fetch`，管不到「等用户点批准」
   * 这条 promise —— 改前用户在「等待确认」态点「停止」是**无效**的：循环仍 block 在答复上，
   * 要等 `DEFAULT_INTERACTION_TIMEOUT_MS`（120 秒）到点后，下一轮开头的取消闸才会发现。
   * 面板在这两分钟里一直显示「等待确认」，而那个「停止」按钮按了没反应。
   *
   * 回落语义与既有取向一致：**不做隐式放行**（危险操作按未批准处理）。
   */
  const withAnswerTimeout = async <T>(task: Promise<T>, fallback: T): Promise<T> => {
    const signal = controller.signal
    if (signal.aborted) return fallback
    let timer: ReturnType<typeof setTimeout> | undefined
    let onAbort: (() => void) | undefined
    const racers: Array<Promise<T>> = [
      task,
      new Promise<T>((resolve) => {
        onAbort = () => resolve(fallback)
        signal.addEventListener('abort', onAbort, { once: true })
      })
    ]
    // 超时 0/负数 = 不设超时（但取消仍然生效）
    if (interactionTimeoutMs > 0) {
      racers.push(
        new Promise<T>((resolve) => {
          timer = setTimeout(() => resolve(fallback), interactionTimeoutMs)
        })
      )
    }
    try {
      return await Promise.race(racers)
    } finally {
      if (timer !== undefined) clearTimeout(timer)
      if (onAbort !== undefined) signal.removeEventListener('abort', onAbort)
    }
  }

  /**
   * 处理技能提出的交互请求：
   *  - confirm：批准后带 `confirm: true` **重执行一次**（不做多次重试，避免自旋）；拒绝则记 `[STOP]`
   *  - question：把用户答复作为工具结果回灌（不重执行）
   * 未提供答复通道 / 用户未答复 → 一律按未确认处理（与危险确认门同一取向：不做隐式放行）
   */
  const settleInteraction = async (
    interaction: SkillInteraction,
    toolId: string,
    action: string,
    params: Record<string, unknown>
  ): Promise<{ text: string; success: boolean }> => {
    const requestId = newRequestId()
    emit({ type: 'interaction_required', requestId, tool: toolId, action, interaction })
    const answer = requestInteraction
      ? await withAnswerTimeout(
          Promise.resolve(requestInteraction({ requestId, tool: toolId, action, interaction })),
          {}
        )
      : {}

    if (interaction.kind === 'confirm') {
      if (answer.approved !== true) {
        return { text: `[STOP] 用户未确认该操作: ${toolId}`, success: false }
      }
      try {
        // 用**可信令牌**而非模型可见的 params.confirm：dispatcher 会丢弃模型自带的 confirm，
        // 只认 ctx.dangerConfirmed（用户在 Brain 侧批准后写入）。这样模型即使写 confirm:true
        // 也跳不过询问。令牌由 dispatcher 消费（置 null）；finally 兜底不残留。
        context.dangerConfirmed = { tool: toolId, action }
        const retried = await runner.execute(toolId, params, context)
        if (retried.interaction !== undefined) {
          return { text: `[STOP] 确认后该操作仍要求再次确认: ${toolId}`, success: false }
        }
        return { text: formatToolResult(retried), success: retried.success }
      } catch (error) {
        return {
          text: `执行失败: ${error instanceof Error ? error.message : String(error)}`,
          success: false
        }
      } finally {
        context.dangerConfirmed = null
      }
    }

    // 多问题形态：按下标取 answers，缺一不可
    if (interaction.questions !== undefined && interaction.questions.length > 0) {
      const questions = interaction.questions
      const raw = Array.isArray(answer.answers) ? answer.answers : []
      const normalized = questions.map((_, index) => {
        const value = raw[index]
        return typeof value === 'string' ? value.trim() : ''
      })
      const missing = normalized.filter((text) => text === '').length
      if (missing > 0) {
        return {
          text: `[STOP] 用户未解答全部提问（缺 ${missing}/${questions.length}）`,
          success: false
        }
      }
      const lines = questions.map((question, index) => `${index + 1}. ${question.prompt} → ${normalized[index]}`)
      return { text: `用户回答：\n${lines.join('\n')}`, success: true }
    }

    // 单问题形态
    const answerText = typeof answer.answer === 'string' ? answer.answer.trim() : ''
    if (answerText === '') {
      return { text: `[STOP] 用户未解答提问: ${interaction.prompt}`, success: false }
    }
    return { text: `用户回答：${answerText}`, success: true }
  }

  /**
   * 执行单个工具（已 resolve + 已过审批）：执行 → 交互结算 → 裁剪 → 失败计数。
   *
   * 只返回结果，**不 emit / 不 push 消息**——由调用方按顺序落事件与消息（保证 `step_done`
   * 与 tool 消息的顺序稳定）。顺序路径与并行路径共用它，避免两份执行逻辑漂移。
   */
  /**
   * 子智能体（Slice 19/26）：**异步启动**（对齐 dsh 的 activation 模型）。
   *
   * - 立即返回 `started subagent <id>`，**不阻塞父循环**；子任务在后台跑。
   * - 父循环在「要 finalize / 无工具可调」时由 `drainSubAgents()` 收量，把结果作为
   *   **完成通知**注入父对话（`user` 消息），父级据此继续下一轮。
   * - `depth` 限制最多 1 层（防无限递归）；并发上限 `MAX_ACTIVE_SUBAGENTS`（dsh 默认 8）。
   */
  const pendingSubagents = new Map<string, Promise<{ text: string; success: boolean }>>()
  let subAgentSeq = 0

  /** 默认 provider：进程内 spawn（递归 runBrainLoop）；外部后端可经 `subAgentProvider` 替换 */
  const defaultSubAgentProvider: SubAgentProvider = {
    id: 'spawn',
    run: async ({ task, depth: childDepth, signal, inbox: childInbox }) => {
      const sub = await runBrainLoop({
        input: task,
        systemPrompts,
        transport,
        runner,
        tools,
        tier,
        depth: childDepth,
        maxTurns: 3,
        maxToolCalls: 4,
        wallClockMs: Math.min(wallClockMs > 0 ? wallClockMs : 60000, 60000),
        signal,
        parallelToolCalls,
        inbox: childInbox
      })
      return { text: `子智能体结果：${sub.text}`, success: sub.completed }
    }
  }
  const subAgentProvider = options.subAgentProvider ?? defaultSubAgentProvider

  const spawnSubAgent = (call: { arguments: Record<string, unknown> }): { text: string; success: boolean } => {
    if (depth >= 1) {
      return { text: '[STOP] 子智能体嵌套已达上限（最多 1 层）', success: false }
    }
    if (pendingSubagents.size >= MAX_ACTIVE_SUBAGENTS) {
      return {
        text: `[STOP] 子智能体并发已达上限（${MAX_ACTIVE_SUBAGENTS}），请等现有子智能体完成`,
        success: false
      }
    }
    const task = typeof call.arguments.task === 'string' ? call.arguments.task.trim() : ''
    if (task === '') {
      return { text: '[STOP] 子智能体缺少 task 参数', success: false }
    }
    const childId = `sub_${++subAgentSeq}`
    // 每个子智能体有自己的收件箱：外部可经 onSubAgentSpawned 拿到它并 push 消息（sendMessage / 插话）
    const childInbox = createInbox()
    // 每个子智能体有**独立**的取消控制器：这样「停止子智能体」只 abort 它自己，
    // 不会误伤父循环（改前直接把父级 controller 传下去，一停子智能体就把父循环一起 abort）。
    // 父级取消时通过监听器**级联** abort 子级（父停则子必停）。
    const childAbort = new AbortController()
    const onParentAbort = (): void => childAbort.abort()
    controller.signal.addEventListener('abort', onParentAbort, { once: true })
    // 交给 provider 执行（默认进程内 spawn；外部后端只需实现 SubAgentProvider）
    const promise = subAgentProvider
      .run({ task, depth: depth + 1, signal: childAbort.signal, inbox: childInbox, sandboxPolicy })
      .catch((error: unknown) => ({
        text: `子智能体执行失败：${error instanceof Error ? error.message : String(error)}`,
        success: false
      }))
      // 子任务结束即摘除父级 abort 监听器：长回合里反复 spawn 不会让 `controller.signal`
      // 累积监听器（Node 默认 >10 会告警）。
      .finally(() => {
        controller.signal.removeEventListener('abort', onParentAbort)
      })
    pendingSubagents.set(childId, promise)
    emit({ type: 'subagent_started', id: childId, task })
    // 暴露 handle 给调用方：拿到 childId + inbox 即可对运行中的子智能体「插话」，
    // 拿到 stopChild 即可「单独停止」它（父级继续跑，不被牵连）。
    options.onSubAgentSpawned?.(childId, childInbox, () => childAbort.abort())
    return { text: `started subagent ${childId}`, success: true }
  }

  /**
   * 收量子智能体：等所有在跑的子任务完成，把结果作为**完成通知**注入父对话。
   * 返回是否确实有子任务被收量（有则调用方应 `continue` 而非 finalize）。
   */
  const drainSubAgents = async (): Promise<boolean> => {
    if (pendingSubagents.size === 0) return false
    const entries = [...pendingSubagents.entries()]
    pendingSubagents.clear()
    const settled = await Promise.allSettled(entries.map(([, promise]) => promise))
    for (let index = 0; index < entries.length; index += 1) {
      const entry = entries[index]
      const outcome = settled[index]
      if (entry === undefined) continue
      const childId = entry[0]
      const text =
        outcome !== undefined && outcome.status === 'fulfilled'
          ? outcome.value.text
          : `子智能体执行失败：${outcome?.status === 'rejected' ? String(outcome.reason) : '未知错误'}`
      const success = outcome !== undefined && outcome.status === 'fulfilled' ? outcome.value.success : false
      results.push(text)
      emit({ type: 'subagent_done', id: childId, success, text })
      messages.push({ role: 'user', content: `子智能体 ${childId} 完成通知：${text}` })
    }
    return true
  }

  const runTool = async (
    call: { id: string; name: string; arguments: Record<string, unknown> },
    resolved: string,
    action: string
  ): Promise<{ text: string; success: boolean }> => {
    // 子智能体工具：不执行技能，改为**异步启动**子循环（立即返回 started subagent <id>）
    if (subAgentTool !== '' && resolved === subAgentTool) {
      return spawnSubAgent(call)
    }
    let text: string
    let success: boolean
    try {
      const result = await runner.execute(resolved, call.arguments, context)
      success = result.success
      text = formatToolResult(result)
      // 技能要求交互（确认破坏性动作 / 提问澄清）→ 暂停并等用户回答
      if (isSkillInteraction(result.interaction)) {
        const settled = await settleInteraction(result.interaction, resolved, action, call.arguments)
        text = settled.text
        success = settled.success
      }
    } catch (error) {
      success = false
      text = `执行失败: ${error instanceof Error ? error.message : String(error)}`
    }
    // F6 工具结果尺寸闸（本地档窄上下文，超长输出截断）+ F10 per-tool 重试预算
    text = clipToolResult(text, tier === 'local' ? 1500 : 4000)
    const fKey = `${resolved}/${action}`
    if (!success) {
      const fc = (failCount.get(fKey) ?? 0) + 1
      failCount.set(fKey, fc)
      if (fc >= 3) {
        text = `[STOP] 工具 ${fKey} 已连续失败 ${fc} 次，请换方案或检查参数`
      }
    } else {
      failCount.set(fKey, 0)
    }
    return { text, success }
  }

  for (let iteration = 0; iteration < maxTurns; iteration++) {
    // 用户取消：契约上与计数闸同款 —— 优雅中止并返回部分产出（不是 reject / 不是 error）
    if (externalSignal?.aborted === true || controller.signal.aborted) {
      stopReason = 'cancelled'
      break
    }
    // 墙钟闸：在再花一次 LLM 调用之前检查（单个工具很慢时也能止住）
    if (wallClockMs > 0 && remainingBudget() < 0) {
      stopReason = 'wall_clock'
      break
    }
    // 收件箱（dsh inbox / Steer）：把运行中收到的消息注入为 user 消息（本轮 LLM 即可见）
    for (const content of inbox.drain()) {
      messages.push({ role: 'user', content })
    }
    // F5 上下文重置（DD-8）：历史过长时压缩续跑，防本地 4B context rot / 目标漂移
    messages = maybeResetContext(messages, tier)
    emit({ type: 'step_start', order: iteration, tool: 'llm_think' })

    let reply: BrainLlmReply
    const turnStartedAt = Date.now()
    /*
     * 把剩余预算挂成定时器：到点 abort 在途请求 ⇒ 真正打断挂死的 HTTP 调用。
     * 这正是改前缺失的一环 —— `wallClockMs` 只在轮次间检查，单次调用卡住就永远出不来。
     *
     * `wallClockTripped` 只在**本轮**有意义（用于区分 `wall_clock` 与 `cancelled`），
     * 故声明在循环体内、每轮重置；声明在循环外会让初值成为无用赋值（eslint no-useless-assignment）。
     */
    let wallClockTripped = false
    const budget = remainingBudget()
    const budgetTimer =
      budget > 0
        ? setTimeout(() => {
            wallClockTripped = true
            controller.abort()
          }, budget)
        : undefined
    try {
      reply = await transport.complete({
        messages: [...messages],
        tools,
        signal: controller.signal,
        onChunk: (text) => emit({ type: 'stream_chunk', text })
      })
    } catch (error) {
      // 取消 / 墙钟：走 finalize（带部分产出），不能报成 transport_error
      if (isAbortError(error) || controller.signal.aborted) {
        stopReason = wallClockTripped ? 'wall_clock' : 'cancelled'
        break
      }
      emit({ type: 'error', message: error instanceof Error ? error.message : String(error) })
      return {
        text: fallbackAnswer(results),
        events,
        completed: false,
        messages,
        stats: runStats,
        stopReason: 'transport_error',
        verdict: null
      }
    } finally {
      if (budgetTimer !== undefined) clearTimeout(budgetTimer)
    }

    // M1 观测：本论消耗点（token 用量来自响应；本地档 Ollama 经传输层取 prompt_eval_count/eval_count）
    const turnLatencyMs = Date.now() - turnStartedAt
    const turnUsage = reply.usage
    const turnToolCalls = reply.toolCalls.length
    const turnModel = reply.model ?? ''
    runStats = accumulateTurn(
      runStats,
      turnStatFromReply(iteration, turnModel, tier, turnUsage, turnLatencyMs, turnToolCalls)
    )
    emit({
      type: 'turn_stats',
      turn: iteration,
      model: turnModel,
      tier,
      usage: turnUsage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 },
      latencyMs: turnLatencyMs,
      toolCalls: turnToolCalls
    })

    emit({ type: 'stream_done', fullText: reply.content })
    messages.push(buildAssistantMessage(reply))

    if (reply.finishReason === 'stop' && reply.toolCalls.length === 0) {
      // 还有子智能体在跑：先收量（完成通知注入），再继续下一轮 —— 不 finalize。
      if (await drainSubAgents()) continue
      const text = reply.content.trim()
      emit({ type: 'done', text })
      const verdict = options.evaluator ? safeRunEvaluator(options.evaluator, text) : null
      return { text, events, completed: true, messages, stats: runStats, stopReason: 'final', verdict }
    }

    if (reply.toolCalls.length === 0) {
      // 同上：子智能体未收量前不结束。
      if (await drainSubAgents()) continue
      stopReason = 'no_tools'
      break
    }

    emit({ type: 'step_start', order: iteration, tool: `并行${reply.toolCalls.length}工具` })

    /*
     * 取消闸（在批次开跑前）：用户可能在 LLM 思考期间点了停止，此时不应再执行工具。
     * ⚠️ 与工具调用上限闸同样，必须为每个 tool_call 补一条 [STOP] tool 消息 ——
     * assistant.tool_calls 与 tool 结果必须一一对应，否则后续会话续跑会直接报协议错。
     */
    if (controller.signal.aborted) {
      const text = '[STOP] 已按要求停止，本批工具未执行'
      for (const call of reply.toolCalls) {
        results.push(text)
        emit({ type: 'step_done', tool: call.name, result: text, success: false })
        messages.push(buildToolMessage(call.id, call.name, text))
      }
      stopReason = wallClockTripped ? 'wall_clock' : 'cancelled'
      break
    }

    // 工具调用闸（DD-5）：累计（含本批）超上限 ⇒ 不再执行本批，直接 finalize。
    // ⚠️ 仍为每个 tool_call 补一条 [STOP] tool 消息：保持「assistant.tool_calls ⟷ tool 结果」一一对应
    // （本文件头注明的有意偏离——协议不合法会让后续会话续跑直接报错）。
    toolCallCount += reply.toolCalls.length
    if (maxToolCalls > 0 && toolCallCount > maxToolCalls) {
      const text = `[STOP] 已达工具调用上限（${maxToolCalls} 次），本批未执行`
      for (const call of reply.toolCalls) {
        results.push(text)
        emit({ type: 'step_done', tool: call.name, result: text, success: false })
        messages.push(buildToolMessage(call.id, call.name, text))
      }
      stopReason = 'max_tool_calls'
      break
    }

    // 「能解析」而非「已执行」：用户拒绝 / 审批超时都不算「工具不可用」，
    // 应当继续循环把 [STOP] 结果回灌给 LLM，让它改提案（见下方 F3 注释）。
    let resolvedAny = false
    let abortedDuringBatch = false

    /*
     * Slice 19 并行执行（opt-in）：**先**把「能解析、且不需要审批」的工具**预启动**为并发 promise，
     * 随后仍按原顺序逐个 await。这样：① 非审批工具真正并发；② 审批/交互仍串行（交互式不能并发，
     * 且 `dangerConfirmed` 是单令牌，并发会互相覆盖）；③ `step_done` / tool 消息顺序完全不变。
     * 预启动发生在取消/上限闸**之后**，故闸命中时不会白跑工具。
     */
    const prelaunched = new Map<
      number,
      { resolved: string; action: string; promise: Promise<{ text: string; success: boolean }> }
    >()
    if (parallelToolCalls) {
      // 简单信号量：最多 maxToolConcurrency 个并发，避免一次拉爆外部工具（MCP/网络）
      let active = 0
      const waiting: Array<() => void> = []
      const acquire = (): Promise<void> => {
        if (active < maxToolConcurrency) {
          active += 1
          return Promise.resolve()
        }
        return new Promise<void>((resolve) => {
          waiting.push(() => {
            active += 1
            resolve()
          })
        })
      }
      const release = (): void => {
        active -= 1
        const next = waiting.shift()
        if (next !== undefined) next()
      }
      for (let index = 0; index < reply.toolCalls.length; index += 1) {
        const call = reply.toolCalls[index]
        if (call === undefined) continue
        const resolved = runner.resolve(call.name)
        if (resolved === null) continue
        const normalizedAction = fixParams(resolved, call.arguments).action
        const action = typeof normalizedAction === 'string' ? normalizedAction : ''
        if (runner.needsConfirmation(resolved, action)) continue
        prelaunched.set(index, {
          resolved,
          action,
          promise: (async () => {
            await acquire()
            try {
              return await runTool(call, resolved, action)
            } finally {
              release()
            }
          })()
        })
      }
    }

    for (let index = 0; index < reply.toolCalls.length; index += 1) {
      const call = reply.toolCalls[index]
      if (call === undefined) break
      /*
       * 取消（可能在**本批内**发生）：用户不只会在「模型思考」时点停止，也会在
       * 「等待确认 / 等待回答」时点 —— 那一步的等待已被 `withAnswerTimeout` 的 abort 竞速打断，
       * 回到这里就必须停手。剩余工具不再执行，但**必须逐个补齐 tool 消息**：
       * `assistant.tool_calls` 与 tool 结果一一对应是会话协议硬要求（同工具上限闸）。
       */
      if (controller.signal.aborted) {
        const stopText = '[STOP] 已按要求停止，本批剩余工具未执行'
        for (const rest of reply.toolCalls.slice(index)) {
          results.push(stopText)
          emit({ type: 'step_done', tool: rest.name, result: stopText, success: false })
          messages.push(buildToolMessage(rest.id, rest.name, stopText))
        }
        abortedDuringBatch = true
        break
      }

      // 并行路径：该工具已预启动，直接 await（事件/消息仍按原顺序落）
      const pre = prelaunched.get(index)
      if (pre !== undefined) {
        resolvedAny = true
        const { text, success } = await pre.promise
        results.push(text)
        emit({ type: 'step_done', tool: pre.resolved, result: text, success })
        messages.push(buildToolMessage(call.id, pre.resolved, text))
        continue
      }

      const resolved = runner.resolve(call.name)
      if (resolved === null) {
        const text = `未知工具: ${call.name}`
        results.push(text)
        emit({ type: 'step_done', tool: call.name, result: text, success: false })
        messages.push(buildToolMessage(call.id, call.name, text))
        continue
      }

      // 能解析即成立（即使用户随后拒绝，也要让 LLM 看到 [STOP] 并可改提案）
      resolvedAny = true

      // ⚠️ 审批判定与一次性令牌必须用**与 dispatcher 同口径**的 action：
      // dispatcher 执行前会 `fixParams`（action 别名归一 + 缺失推断），若这里用原始 action，
      // 模型输出别名时（`system.code` 的 `run`/`exec`/`执行` → 归一为 `execute`），
      // 用户即使批准，令牌仍会被 dispatcher 的 `confirmed.action === action` 比对拒绝。
      const normalizedAction = fixParams(resolved, call.arguments).action
      const action = typeof normalizedAction === 'string' ? normalizedAction : ''
      if (runner.needsConfirmation(resolved, action)) {
        // 审批策略 `never`（无头模式）：确定性拒绝，不发审批事件（对齐 dsh user-approval）。
        if (approvalPolicy === 'never') {
          const text = `[STOP] 审批策略为 never，已拒绝危险操作: ${resolved}`
          results.push(text)
          emit({ type: 'step_done', tool: resolved, result: text, success: false })
          messages.push(buildToolMessage(call.id, resolved, text))
          continue
        }
        // 执行预审（#27）：在**人工审批之前**由模型/规则先拦一道。
        // 只收紧不放开——approve:false 直接 [STOP]，不再走人工；异常回落放行至人工。
        if (preExecReview) {
          const riskLevel = resolveRiskLevel(resolved, action)
          let verdict: PreExecReviewVerdict
          try {
            verdict = await preExecReview({ tool: resolved, action, params: call.arguments, risk: riskLevel })
          } catch {
            // 预审实现异常 ⇒ 回落放行至人工审批（绝不因预审故障误杀正常工具）
            verdict = { approve: true, reason: '预审异常，回落至人工审批' }
          }
          if (verdict.approve !== true) {
            const text = `[STOP] 执行预审拒绝危险操作: ${resolved}（${verdict.reason || '未提供原因'}）`
            results.push(text)
            emit({ type: 'step_done', tool: resolved, result: text, success: false })
            messages.push(buildToolMessage(call.id, resolved, text))
            continue
          }
        }
        const requestId = newRequestId()
        emit({ type: 'approval_required', requestId, tool: resolved, action, params: call.arguments })
        let approved = false
        if (requestApproval) {
          try {
            approved = await withAnswerTimeout(
              Promise.resolve(requestApproval({ requestId, tool: resolved, action, params: call.arguments })),
              false
            )
          } catch {
            // 审批通道异常（通道断开 / 实现抛错）一律按「未批准」处理——与本循环
            // 「无确认即拒绝」同一取向。不能让它冒泡：否则整轮 run 会变成 reject
            // （IPC 报错），而 transport 与 interaction 两条同类路径均已等价保护。
            approved = false
          }
        }
        if (approved !== true) {
          const text = `[STOP] 用户未确认危险操作: ${resolved}`
          results.push(text)
          emit({ type: 'step_done', tool: resolved, result: text, success: false })
          messages.push(buildToolMessage(call.id, resolved, text))
          continue
        }
        context.dangerConfirmed = { tool: resolved, action }
      }

      const { text, success } = await runTool(call, resolved, action)
      results.push(text)
      emit({ type: 'step_done', tool: resolved, result: text, success })
      messages.push(buildToolMessage(call.id, resolved, text))
    }

    // 本批因取消而中止 → 立刻收敛，不再进入下一轮（也不会再花一次 LLM 调用）
    if (abortedDuringBatch) {
      stopReason = wallClockTripped ? 'wall_clock' : 'cancelled'
      break
    }

    if (!resolvedAny && reply.toolCalls.length > 0) {
      // 全部工具均**无法解析** → 退出循环，避免无意义空转。
      // （「全部被用户拒绝」属正常流程：已回灌 [STOP]，继续循环让 LLM 改提案。）
      stopReason = 'unresolvable_tools'
      break
    }
  }

  // 终止闸命中 → 如实告知（面板据此「诚实显示」本次为部分结果）
  if (
    stopReason === 'max_turns' ||
    stopReason === 'max_tool_calls' ||
    stopReason === 'wall_clock' ||
    stopReason === 'cancelled'
  ) {
    emit({
      type: 'terminated',
      reason: stopReason,
      detail: terminationDetail(stopReason, { maxTurns, maxToolCalls, wallClockMs })
    })
  }
  const text = fallbackAnswer(results)
  emit({ type: 'done', text })
  const verdict = options.evaluator ? safeRunEvaluator(options.evaluator, text) : null
  return { text, events, completed: true, messages, stats: runStats, stopReason, verdict }
}
