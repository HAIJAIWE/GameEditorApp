/**
 * `system.ptc` 内置技能（对齐 dsh `ptc-runtime` 的可用子集）：**程序化工具调用**。
 *
 * 模型写一段 JS，脚本里用 `callTool(name, params)` 以编程方式调工具（循环/条件/聚合），
 * 一次执行多步。底层用 quickjs-emscripten 的 **Asyncify 异步运行时**——
 * `newAsyncifiedFunction` 让宿主异步函数在 QuickJS 里表现得像同步函数，从而 `await` 工具调用。
 *
 * **安全**：
 * - 沙箱默认零宿主能力（无 require/fs/网络），只暴露一个 `callTool`；
 * - 每次 `callTool` 都走 `executeGated` ⇒ **风险 ≥ SYSTEM 的子工具仍会再问审批**，不会绕过门；
 * - 禁止嵌套 `system.ptc`（防递归）；工具调用次数上限；CPU 超时 + 内存上限。
 *
 * 与 `system.code` 的区别：`system.code` 纯计算、无宿主能力；`system.ptc` 多了「调工具」。
 */

import { newAsyncContext } from 'quickjs-emscripten'

import { SKILL_ERRORS } from '@mobai/shared/agent/config'
import type { SkillExecutionContext, SkillProtocol, SkillResult } from '@mobai/shared/agent/config'

/** 默认超时（毫秒） */
export const PTC_DEFAULT_TIMEOUT_MS = 20_000
/** 超时上限（毫秒） */
export const PTC_MAX_TIMEOUT_MS = 60_000
/** 默认工具调用次数上限 */
export const PTC_DEFAULT_MAX_CALLS = 20
/** 工具调用次数上限的最大值 */
export const PTC_MAX_CALLS = 50
/** 输出上限（字符） */
export const PTC_MAX_CHARS = 200_000
/** 内存上限（MB） */
export const PTC_MEMORY_MB = 64

export interface PtcSkillOptions {
  /** 带审批的子工具执行（由 dispatcher.executeGated 提供） */
  executeGated: (
    tool: string,
    params: Record<string, unknown>,
    ctx: SkillExecutionContext
  ) => Promise<SkillResult>
}

function clamp(raw: unknown, fallback: number, max: number): number {
  const value = typeof raw === 'number' ? raw : Number.parseInt(String(raw ?? ''), 10)
  if (!Number.isFinite(value) || value <= 0) return fallback
  return Math.min(Math.trunc(value), max)
}

function fail(message: string, error: string): SkillResult {
  return { success: false, message: `ptc 失败：${message}`, error }
}

/**
 * 包一层脚本：暴露 `callTool`（**同步**——asyncify 让宿主异步函数在 QuickJS 里表现为同步），
 * 执行用户代码并返回 JSON 字符串。
 *
 * 注意：不能用 async IIFE + await——`evalCodeAsync` 对顶层 promise 不会自动解析
 * （实测 `resolvePromise` 在 asyncify 上下文里挂起）。故 `callTool` 是同步调用。
 * 模型习惯写 `await callTool(...)`，这里预先把这种 `await` 剥掉（只剥紧跟 callTool 的）。
 */
function wrapScript(code: string): string {
  const sanitized = code.replace(/\bawait\s+(?=callTool\s*\()/g, '')
  return `(() => {
  const callTool = (name, params) => JSON.parse(__callToolRaw(String(name), JSON.stringify(params ?? {})));
  const __v = (() => { ${sanitized} })();
  try {
    return JSON.stringify(__v === undefined ? null : __v);
  } catch (err) {
    return JSON.stringify({ error: String(err) });
  }
})()`
}

export function createPtcSkill(options: PtcSkillOptions): SkillProtocol {
  async function run(params: Record<string, unknown>, ctx: SkillExecutionContext): Promise<SkillResult> {
    const action = typeof params.action === 'string' ? params.action : ''
    if (action !== 'run') return fail(`未知 action: ${action}（当前仅支持 run）`, SKILL_ERRORS.BAD_ACTION)
    const code = typeof params.code === 'string' ? params.code : ''
    if (code.trim() === '') return fail('缺少 code', SKILL_ERRORS.BAD_ARG)

    const timeoutMs = clamp(params.timeout_ms, PTC_DEFAULT_TIMEOUT_MS, PTC_MAX_TIMEOUT_MS)
    const maxCalls = clamp(params.max_calls, PTC_DEFAULT_MAX_CALLS, PTC_MAX_CALLS)

    const context = await newAsyncContext()
    context.runtime.setMemoryLimit(PTC_MEMORY_MB * 1024 * 1024)
    const deadline = Date.now() + timeoutMs
    let timedOut = false
    context.runtime.setInterruptHandler(() => {
      if (Date.now() > deadline) {
        timedOut = true
        return true
      }
      return false
    })

    let callCount = 0
    try {
      const rawFn = context.newAsyncifiedFunction('__callToolRaw', async (nameHandle, paramsJsonHandle) => {
        callCount += 1
        if (callCount > maxCalls) {
          return context.newString(
            JSON.stringify({ success: false, error: SKILL_ERRORS.TOO_MANY_CALLS, message: `超过 ${maxCalls} 次工具调用` })
          )
        }
        const name = context.getString(nameHandle)
        if (name === 'system.ptc') {
          return context.newString(JSON.stringify({ success: false, error: SKILL_ERRORS.NESTED_PTC, message: '禁止嵌套 ptc' }))
        }
        let callParams: Record<string, unknown> = {}
        try {
          const parsed: unknown = JSON.parse(context.getString(paramsJsonHandle))
          if (parsed !== null && typeof parsed === 'object') callParams = parsed as Record<string, unknown>
        } catch {
          // 参数不是合法 JSON：按空对象处理
        }
        const result = await options.executeGated(name, callParams, ctx)
        return context.newString(JSON.stringify(result))
      })
      context.setProp(context.global, '__callToolRaw', rawFn)
      rawFn.dispose()

      // 同步脚本：evalCodeAsync 直接返回结果 handle（asyncify 在内部挂起/恢复）
      const evalResult = await context.evalCodeAsync(wrapScript(code))
      const handle = context.unwrapResult(evalResult)
      const json = context.getString(handle)
      handle.dispose()

      const capped = json.length > PTC_MAX_CHARS ? `${json.slice(0, PTC_MAX_CHARS)}\n…（截断）` : json
      return { success: true, message: capped, data: { calls: callCount } }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error)
      return fail(timedOut ? `执行超时（${timeoutMs}ms）` : message, SKILL_ERRORS.PTC)
    } finally {
      context.dispose()
    }
  }

  return {
    id: 'system.ptc',
    description:
      '程序化工具调用：写一段 JS，用 `callTool(name, params)` 以编程方式调工具（循环/条件/聚合），'
      + '一次跑多步。**callTool 是同步调用（不要 await）**；脚本需 return 一个可 JSON 序列化的值。'
      + `每次 callTool 都经审批门；禁止嵌套 ptc；工具调用上限 ${PTC_DEFAULT_MAX_CALLS} 次（可调至 ${PTC_MAX_CALLS}）。`,
    version: '0.1.0',
    parametersSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['run'], description: '操作类型: run=执行脚本' },
        code: {
          type: 'string',
          description: 'JS 脚本（函数体）。用 `callTool("system.xxx", {...})`（同步，无需 await）调工具，return 结果。'
        },
        timeout_ms: { type: 'integer', description: `超时毫秒（默认 ${PTC_DEFAULT_TIMEOUT_MS}）` },
        max_calls: { type: 'integer', description: `工具调用次数上限（默认 ${PTC_DEFAULT_MAX_CALLS}）` }
      },
      required: ['action', 'code']
    },
    tags: ['system', 'ptc'],
    execute: run
  }
}
