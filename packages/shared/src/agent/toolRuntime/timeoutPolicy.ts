/**
 * 协作式工具超时（对齐 dsh `guard/timeout-policy`）。
 *
 * 语义：工具声明 `timeoutMs` 并承诺转发 `exec.signal`；本策略把 signal 换成
 * **带 deadline 的派生 signal**，调用 `next()`，结束后**还原**调用方的 signal。
 *
 * 三个细节（都来自 dsh 的踩坑）：
 * 1. **不 race、不放弃 promise**：超时只是 abort signal，工具自己负责到达静止；
 *    同进程代码无法硬杀，所以"丢弃 promise"只会制造孤儿工作。
 * 2. **只认自己的超时**：用模块级作用域标记区分「我这层超时」与「外层先超时」，
 *    后者按普通上游取消处理，不误报 `TOOL_TIMEOUT`。
 * 3. **恢复 signal**：post-execute 监听器绝不能看到本策略（可能已 abort）的派生 signal。
 *
 * @module agent/tools/timeoutPolicy
 */

import type { ToolDefinition, ToolExecutionFailure, ToolExecutionResult, ToolRunContext } from './contracts'
import type { ToolPolicy } from './pipeline'

/** 本策略拥有的超时错误码（既用于内部判定，也用于结构化错误） */
export const TOOL_TIMEOUT = 'TOOL_TIMEOUT'

/** 超时结果：模型看到的内容 + 可路由的错误码 */
export function toolTimeoutResult(timeoutMs: number): ToolExecutionFailure {
  const message = `tool call timed out after ${timeoutMs}ms`
  return {
    isError: true,
    content: [{ type: 'text', text: `Error: ${message}` }],
    error: { message, info: { name: 'ToolTimeoutError', code: TOOL_TIMEOUT } }
  }
}

/**
 * 生成超时策略。
 * @param getTool - 按名取工具（用于读 `timeoutMs`）
 * @returns 可挂进 `ToolExecutionPipeline` 的环绕策略
 */
export function createTimeoutPolicy(
  getTool: (name: string) => ToolDefinition | undefined
): ToolPolicy {
  return async (exec: ToolRunContext, next: () => Promise<ToolExecutionResult>): Promise<ToolExecutionResult> => {
    const timeoutMs = getTool(exec.name)?.timeoutMs
    // 没声明预算：没有 deadline，原样委托
    if (timeoutMs === undefined) return next()

    const upstream = exec.signal
    const controller = new AbortController()
    let fired = false

    // 上游取消 → 级联到派生 signal（保持调用方的取消语义）
    const onUpstreamAbort = (): void => controller.abort(upstream.reason)
    if (upstream.aborted) controller.abort(upstream.reason)
    else upstream.addEventListener('abort', onUpstreamAbort, { once: true })

    const timer = setTimeout(() => {
      fired = true
      controller.abort(TOOL_TIMEOUT)
    }, timeoutMs)

    // 换 signal 交给工具，结束后一定还原
    exec.signal = controller.signal
    try {
      const result = await next()
      // 只有**本策略的定时器**触发才算超时；外层先超时读作普通上游取消
      return fired ? toolTimeoutResult(timeoutMs) : result
    } finally {
      clearTimeout(timer)
      upstream.removeEventListener('abort', onUpstreamAbort)
      exec.signal = upstream
    }
  }
}
