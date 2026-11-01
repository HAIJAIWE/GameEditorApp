/**
 * 工具执行流水线（对齐 dsh `core/tools/pipeline.ts` 的 `ToolExecutionPipeline`）。
 *
 * 一次调用经过：**参数无损快照 → 深冻结 → 策略链（`tools/execute` 中间件）→ dispatch
 * → canonical 输出校验 → render → finalize**。
 *
 * 三个与 dsh 同源的硬规则：
 * - **fail-closed 并发**：`isConcurrencySafe` 只有精确返回 `true` 才 parallel，其余一律 exclusive。
 * - **不放弃 promise**：超时/取消由策略层把 signal 换掉，但**不**丢弃工具自己的 promise（无法硬杀同进程代码）。
 * - **策略可组合**：`use(policy)` 是 around 中间件，顺序即语义（超时、沙箱、审批都挂这里）。
 *
 * @module agent/tools/pipeline
 */

import {
  TOOL_ABORTED_BEFORE_DISPATCH,
  ToolNotFoundError,
  ToolOutputError,
  type ToolDefinition,
  type ToolExecutionFailure,
  type ToolExecutionMode,
  type ToolExecutionResult,
  type ToolPostExecGuard,
  type ToolRunContext
} from './contracts'
import { validateJsonSchemaValue } from './jsonSchema'
import { deepFreeze, snapshotJsonValue, type JsonValue } from './jsonValue'
import type { ToolsService } from './tools'

/**
 * 环绕策略：与 dsh 的 `ctx.on('tools/execute', (exec, next) => …)` 同构。
 * 不调用 `next()` = 短路（拒绝）；调用后再改结果 = 替换。
 */
export type ToolPolicy = (exec: ToolRunContext, next: () => Promise<ToolExecutionResult>) => Promise<ToolExecutionResult>

/** 一次执行请求 */
export interface ToolExecutionInput {
  name: string
  arguments: unknown
  callId?: string
  signal?: AbortSignal
  /** 宿主私有上下文（本仓传 `SkillExecutionContext`） */
  hostContext?: unknown
}

/** 永不取消的默认 signal（模块级复用，避免每次分配） */
const NEVER_ABORTED = new AbortController().signal

function errorResult(error: unknown, code = 'TOOL_EXECUTION_FAILED'): ToolExecutionFailure {
  const message = error instanceof Error ? error.message : String(error)
  const name = error instanceof Error ? error.name : 'Error'
  return {
    isError: true,
    content: [{ type: 'text', text: `Error: ${message}` }],
    error: { message, info: { name, code } }
  }
}

function abortedResult(): ToolExecutionFailure {
  return {
    isError: true,
    content: [{ type: 'text', text: 'Error: tool call aborted before dispatch' }],
    error: { message: 'tool call aborted before dispatch', info: { name: 'ToolAbortError', code: TOOL_ABORTED_BEFORE_DISPATCH } }
  }
}

/** 共享调用流水线 */
export class ToolExecutionPipeline {
  private readonly policies: ToolPolicy[] = []
  /** 执行后守卫（对齐 dsh `tools/post-execute` 瀑布）；只收集建议性上下文，绝不改写/否决结果 */
  private readonly postExecGuards: ToolPostExecGuard[] = []

  constructor(private readonly tools: ToolsService) {}

  /**
   * 挂一个环绕策略。
   * @param policy - 中间件
   * @returns 卸载函数
   */
  use(policy: ToolPolicy): () => void {
    this.policies.push(policy)
    return () => {
      const index = this.policies.indexOf(policy)
      if (index >= 0) this.policies.splice(index, 1)
    }
  }

  /**
   * 挂一个执行后守卫（如重复调用提醒）。
   * @param guard - 守卫（接收已执行结果与执行身份，返回建议性上下文）
   * @returns 卸载函数
   */
  usePostExecGuard(guard: ToolPostExecGuard): () => void {
    this.postExecGuards.push(guard)
    return () => {
      const index = this.postExecGuards.indexOf(guard)
      if (index >= 0) this.postExecGuards.splice(index, 1)
    }
  }

  /**
   * 分类并发模式（fail-closed）。
   *
   * 只有工具显式声明且**精确返回 `true`** 才 parallel；未知/省略/抛错/非 true 一律 exclusive。
   * @param input - 工具名与已解析参数
   */
  executionMode(input: { name: string; arguments: unknown }): ToolExecutionMode {
    const tool = this.tools.get(input.name)
    if (tool?.isConcurrencySafe === undefined) return { kind: 'exclusive' }
    try {
      return tool.isConcurrencySafe(input.arguments) === true ? { kind: 'parallel' } : { kind: 'exclusive' }
    } catch {
      return { kind: 'exclusive' }
    }
  }

  /**
   * 执行一次调用。
   * @param input - 名称、参数、取消信号、宿主上下文
   * @returns 归一化结果（成功带 canonical 值，失败带结构化错误）
   */
  async execute(input: ToolExecutionInput): Promise<ToolExecutionResult> {
    const tool = this.tools.get(input.name)
    if (tool === undefined) return errorResult(new ToolNotFoundError(input.name), 'TOOL_NOT_FOUND')

    // 参数必须无损：不能 JSON 往返就拒绝（而不是静默丢字段）
    const snapshot = snapshotJsonValue(input.arguments ?? {})
    if (snapshot === undefined) {
      return errorResult(new Error('tool execution arguments must be losslessly JSON-serializable'), 'TOOL_ARGUMENTS_INVALID')
    }

    const exec: ToolRunContext = {
      callId: input.callId ?? `${tool.name}:${Date.now()}`,
      name: tool.name,
      arguments: deepFreeze(snapshot),
      signal: input.signal ?? NEVER_ABORTED,
      ...(input.hostContext !== undefined ? { hostContext: input.hostContext } : {})
    }

    // 调用前已取消：不执行，直接给结构化结果（与 dsh 的 aborted-before-dispatch 一致）
    if (exec.signal.aborted) return abortedResult()

    let chain = async (): Promise<ToolExecutionResult> => this.dispatch(tool, exec)
    for (let index = this.policies.length - 1; index >= 0; index -= 1) {
      const policy = this.policies[index]
      if (policy === undefined) continue
      const next = chain
      chain = () => policy(exec, next)
    }

    let result: ToolExecutionResult
    try {
      result = await chain()
    } catch (error: unknown) {
      result = errorResult(error)
    }

    // finalizeContent：每个结局都过一遍（含策略失败），必须 total
    const finalizer = tool.finalizeContent?.bind(tool)
    if (finalizer !== undefined) {
      try {
        const replaced = finalizer(exec, result)
        if (replaced !== undefined) result = { ...result, content: replaced }
      } catch {
        // finalizer 契约要求不抛；真抛了也绝不能影响结果
      }
    }

    // post-execute 守卫（对齐 dsh `tools/post-execute` 瀑布）：只收集建议性上下文，绝不改写结果。
    // 任一守卫抛错都不影响主结果——守卫是辅助提示，不是执行链路的一环。
    if (this.postExecGuards.length > 0) {
      const advisory: string[] = []
      for (const guard of this.postExecGuards) {
        try {
          const contexts = await guard.evaluate(exec, result)
          if (Array.isArray(contexts)) {
            for (const context of contexts) {
              if (typeof context === 'string' && context.length > 0) advisory.push(context)
            }
          }
        } catch {
          // 守卫失败绝不能影响主结果
        }
      }
      if (advisory.length > 0) result = { ...result, advisoryContexts: advisory }
    }
    return result
  }

  /** 真正调用工具并校验 canonical 输出 */
  private async dispatch(tool: ToolDefinition, exec: ToolRunContext): Promise<ToolExecutionResult> {
    let raw: unknown
    try {
      raw = await tool.execute(exec.arguments, exec)
    } catch (error: unknown) {
      return errorResult(error)
    }

    const violation = validateJsonSchemaValue(tool.output.schema, raw)
    if (violation !== null) {
      return errorResult(
        new ToolOutputError(tool.name, `${violation.path}: ${violation.message}`),
        'TOOL_OUTPUT_INVALID'
      )
    }

    const value = raw as JsonValue
    let content = tool.output.render(exec.arguments, value)

    const projector = tool.projectContent?.bind(tool)
    if (projector !== undefined) {
      try {
        const replaced = projector(exec, { isError: false, content, value })
        if (replaced !== undefined) content = replaced
      } catch {
        // 投影是纯函数；抛错就当没投影
      }
    }

    const meta = tool.output.presentationMeta?.(exec.arguments, value)
    return { isError: false, content, value, ...(meta !== undefined ? { meta } : {}) }
  }
}
