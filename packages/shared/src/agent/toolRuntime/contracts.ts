/**
 * 工具契约（对齐 dsh `core/tools/contracts.ts` 的命名与语义）。
 *
 * 与 dsh 的三条同源设计：
 * 1. **强制 canonical 输出**：`output = { schema, render }`，`execute` 返回**JSON 值**而不是字符串；
 *    执行器先用 schema 校验，再 `render` 成模型可见内容。工具不能"想返回什么就返回什么"。
 * 2. **参数无损**：执行前快照 + 深冻结（见 `jsonValue.ts`），工具改不动调用方，回放也一致。
 * 3. **展示是纯函数**：`presentCall` / `presentResult` 只依赖 args 与 result，
 *    所以直播与回放能复用同一套 UI 投影。
 *
 * @module agent/tools/contracts
 */

import type { JsonObjectSchema } from '../config'
import type { JsonSchemaNode } from './jsonSchema'
import type { JsonValue } from './jsonValue'

/** 保留给"模型面向的程序化传输"的名字（与 dsh 同名，暂未启用） */
export const RUN_CODE_NAME = 'run_code'

/** 调用被取消（dispatch 后） */
export const TOOL_ABORTED = 'TOOL_ABORTED'
/** 调用在 dispatch 前就被取消 */
export const TOOL_ABORTED_BEFORE_DISPATCH = 'TOOL_ABORTED_BEFORE_DISPATCH'

/** 模型可见内容块（本仓只用文本；图像仍走 `SkillResult.images` 的独立链路） */
export type ContentBlock = { type: 'text'; text: string }

/** 待执行状态的展示意图（纯数据，可回放） */
export interface ToolCallView {
  title: string
  detail?: string
}

/** 已执行状态的展示意图（纯数据，可回放） */
export interface ToolResultView {
  title?: string
  detail?: string
}

/** 交给 `presentResult` 的完成态 */
export interface ToolResult {
  content: ContentBlock[]
  isError: boolean
  /** 工具私有的展示载荷（由 `output.presentationMeta` 投影） */
  meta?: JsonValue
}

/**
 * 工具自有的**输出契约**：成功值必须符合 `schema`，再由 `render` 投影成内容块。
 */
export interface ToolOutputDefinition {
  /** 每个成功值都必须通过的 JSON Schema */
  readonly schema: JsonSchemaNode
  /** 纯投影：参数 + 已校验的值 → 模型可见内容 */
  render(args: unknown, value: JsonValue): ContentBlock[]
  /** 纯投影：给 UI 的展示载荷（可选） */
  presentationMeta?(args: unknown, value: JsonValue): JsonValue
}

/** 执行上下文（`signal` 可变：超时策略会临时换成派生 signal，结束后还原） */
export interface ToolRunContext {
  readonly callId: string
  readonly name: string
  /** 已快照并冻结的参数 */
  readonly arguments: unknown
  /** 取消信号；策略层可临时替换，但必须还原 */
  signal: AbortSignal
  /** 宿主私有上下文（本仓放 `SkillExecutionContext`），契约不解释它 */
  readonly hostContext?: unknown
}

/** 只读视图（传给 `projectContent` / `finalizeContent`） */
export type ToolExecution = Readonly<ToolRunContext>

/** 结构化错误信息（`code` 供重试/沙箱/回放路由） */
export interface ToolErrorInfo {
  message: string
  info?: { name?: string; code?: string }
}

/** 成功结果：既有模型内容，也有 canonical 值 */
export interface ToolExecutionSuccess {
  isError: false
  content: ContentBlock[]
  /** canonical 值（已通过 `output.schema`） */
  value: JsonValue
  meta?: JsonValue
  /**
   * 执行后守卫产出的**建议性上下文**（如「你正在重复调用同一工具」提醒）。
   * 与 dsh `tools/post-execute` 瀑布的 `additionalContexts` 同义：只提示、绝不改写或否决结果。
   */
  advisoryContexts?: string[]
}

/** 失败结果 */
export interface ToolExecutionFailure {
  isError: true
  content: ContentBlock[]
  error: ToolErrorInfo
  value?: undefined
  /** 同 `ToolExecutionSuccess.advisoryContexts`：失败结果一般不应附加提醒（见 `ToolPostExecGuard` 约定） */
  advisoryContexts?: string[]
}

export type ToolExecutionResult = ToolExecutionSuccess | ToolExecutionFailure

/** 审批前的决定（与 dsh 同名） */
export type PreToolDecision = { kind: 'allow' } | { kind: 'deny'; reason: string }

/** 执行后的决定：保留或替换结果 */
export type PostToolDecision = { kind: 'keep' } | { kind: 'replace'; result: ToolExecutionResult }

/**
 * 执行后守卫（对齐 dsh `tools/post-execute` 瀑布的插件）。
 *
 * 与 dsh 同源的硬约束：**只读取、绝不改写**执行结果，也**不否决**调用——
 * 它只能产出「建议性上下文」（`advisoryContexts`），由循环决定如何呈现给模型
 * （通常作为一条 user 消息紧跟在工具结果之后）。失败结果不应返回提醒（模型该看的是错误本身）。
 */
export interface ToolPostExecGuard {
  /** 守卫唯一 id（用于去重 / 调试） */
  readonly id: string
  /** 评估一次执行，返回 0..n 条建议性提醒文本 */
  evaluate(exec: ToolExecution, result: ToolExecutionResult): string[] | Promise<string[]>
}

/** 并发调度模式：**只有精确声明安全才是 parallel**（fail-closed） */
export type ToolExecutionMode = { kind: 'exclusive' } | { kind: 'parallel' }

/**
 * 一个已注册的工具。
 *
 * `parameters` 复用 `JsonObjectSchema`，因此 `ToolsService.schemas()` 能直接产出
 * Function Calling 线格式，不需要第二套 schema 类型。
 */
export interface ToolDefinition {
  readonly name: string
  readonly description: string
  readonly parameters: JsonObjectSchema
  /** 强制输出契约 */
  readonly output: ToolOutputDefinition
  /**
   * 执行一次调用，返回 canonical 值。
   * @param args - 已快照冻结的参数
   * @param exec - 执行身份、取消信号、宿主上下文
   */
  execute(args: unknown, exec: ToolRunContext): Promise<unknown>
  /** 在 post-execute 策略之前安装内容（可选） */
  projectContent?(exec: ToolExecution, result: ToolExecutionResult): ContentBlock[] | undefined
  /** 最后一次内容变换（每个结局都会调用，含策略失败；必须 total 且不抛） */
  finalizeContent?(exec: ToolExecution, result: ToolExecutionResult): ContentBlock[] | undefined
  /**
   * 协作式超时预算（毫秒）。**永不发给模型**（`schemas()` 只白名单 name/description/parameters）。
   * 声明它 = 承诺转发 `exec.signal` 并在 abort 后到达静止。
   */
  timeoutMs?: number
  /**
   * 与兄弟调用并发的纯分类器。**只有精确返回 `true` 才并行**；
   * 省略/抛错/非 true 一律独占（fail-closed）。此元数据永不发给模型。
   */
  isConcurrencySafe?(args: unknown): boolean
  /** 纯投影：待执行态 */
  presentCall?(args: unknown): ToolCallView | undefined
  /** 纯投影：完成态 */
  presentResult?(args: unknown, result: ToolResult): ToolResultView | undefined
}

/** 一步之内准入的工具集（步末 dispose） */
export interface ResolvedToolSet {
  /** 关闭准入（步结束后调用） */
  dispose(): void
  /** 读取仍可见的注册（scope 不匹配时永不返回） */
  view(scope?: string): ReadonlyMap<string, ToolDefinition>
}

/** 无法确定工具可用性（条件抛错 ≠ 正常不可用） */
export class ToolActivationError extends Error {
  constructor(name: string, cause: unknown) {
    super(`cannot resolve availability of tool "${name}"`)
    this.name = 'ToolActivationError'
    this.cause = cause
  }
}

/** 工具不存在 */
export class ToolNotFoundError extends Error {
  constructor(name: string) {
    super(`unknown tool "${name}"`)
    this.name = 'ToolNotFoundError'
  }
}

/** 工具返回值不符合它自己声明的 `output.schema` */
export class ToolOutputError extends Error {
  constructor(name: string, detail: string) {
    super(`tool "${name}" returned an invalid canonical value: ${detail}`)
    this.name = 'ToolOutputError'
  }
}
