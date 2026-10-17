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

import { fixParams, isSkillInteraction, type SkillExecutionContext, type SkillInteraction } from '../protocol'
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
  DEFAULT_INTERACTION_TIMEOUT_MS,
  DEFAULT_MAX_TOOL_CALLS,
  DEFAULT_MAX_TURNS,
  DEFAULT_WALL_CLOCK_MS,
  type BrainEvent,
  type BrainRunResult,
  type BrainStopReason,
  type RunBrainLoopOptions
} from './types'
import { clipToolResult, maybeResetContext, safeRunEvaluator } from './context'
import { isAbortError } from '../abort'

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
 */
export async function runBrainLoop(options: RunBrainLoopOptions): Promise<BrainRunResult> {
  const { input, systemPrompts, transport, runner, requestApproval, requestInteraction, onEvent } = options
  const maxTurns = options.maxTurns ?? DEFAULT_MAX_TURNS
  const maxToolCalls = options.maxToolCalls ?? DEFAULT_MAX_TOOL_CALLS
  const wallClockMs = options.wallClockMs ?? DEFAULT_WALL_CLOCK_MS
  // M3 档位路由：缺省 local（与既有行为一致）；真实档位由 brainService 经 resolveLlmTier 注入
  const tier: AgentRunTier = options.tier ?? 'local'
  const context: SkillExecutionContext = options.context ?? {}
  let requestSeq = 0
  const newRequestId = options.newRequestId ?? ((): string => `approval_${++requestSeq}`)
  const interactionTimeoutMs = options.interactionTimeoutMs ?? DEFAULT_INTERACTION_TIMEOUT_MS

  /** 等待答复的超时保护：超时按「未答复」回落，避免无人值守时永久挂住 */
  const withAnswerTimeout = async <T>(task: Promise<T>, fallback: T): Promise<T> => {
    if (interactionTimeoutMs <= 0) return task
    let timer: ReturnType<typeof setTimeout> | undefined
    try {
      return await Promise.race([
        task,
        new Promise<T>((resolve) => {
          timer = setTimeout(() => resolve(fallback), interactionTimeoutMs)
        })
      ])
    } finally {
      if (timer !== undefined) clearTimeout(timer)
    }
  }
  const tools = options.tools ?? []

  const events: BrainEvent[] = []
  const emit = (event: BrainEvent): void => {
    events.push(event)
    onEvent?.(event)
  }

  let messages: BrainMessage[] = [
    ...systemPrompts.map((content) => ({ role: 'system' as const, content })),
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
        const retried = await runner.execute(toolId, { ...params, confirm: true }, context)
        if (retried.interaction !== undefined) {
          return { text: `[STOP] 确认后该操作仍要求再次确认: ${toolId}`, success: false }
        }
        return { text: formatToolResult(retried), success: retried.success }
      } catch (error) {
        return {
          text: `执行失败: ${error instanceof Error ? error.message : String(error)}`,
          success: false
        }
      }
    }

    // 多问题形态（对齐 Python `questions` 数组）：按下标取 answers，缺一不可
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
      const text = reply.content.trim()
      emit({ type: 'done', text })
      const verdict = options.evaluator ? safeRunEvaluator(options.evaluator, text) : null
      return { text, events, completed: true, messages, stats: runStats, stopReason: 'final', verdict }
    }

    if (reply.toolCalls.length === 0) {
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
    for (const call of reply.toolCalls) {
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
      results.push(text)
      emit({ type: 'step_done', tool: resolved, result: text, success })
      messages.push(buildToolMessage(call.id, resolved, text))
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
