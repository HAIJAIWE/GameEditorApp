/**
 * 单发 AI 任务的统一入口（W1 / 「双编排栈」收口）。
 *
 * ## 解决的问题
 * 策划书四路 AI（整章 / 单字段 / 批量数据 / 审阅）此前各自在 handler 里手写同一段
 * 前导：取 `callOpts` → 判云端档 → 估 token → 调 harness → 在闭包里发请求。
 * 四份副本意味着**任何一处漏改都不易察觉** —— 事实上 `ceshu:aiGenerateField`
 * 当时就整段缺失（无预算门、无取消、无观测），正是「复制粘贴式编排」的典型腐化。
 *
 * 本模块把这段前导收敛成 `runAiTask`：调用方只声明**任务是什么**（提示词、预算档、
 * 取消归属）和**拿到正文后怎么加工**（`interpret`），治理关注点全部在内部完成。
 *
 * ## 分层（为什么在这里而不在 `main/agent/`）
 * `main/agent/` 是**对话式多轮编排**（工具循环、审批闸、会话记忆）；本模块是**单发任务**，
 * 没有轮次、没有工具、没有审批。两者语义不同，合并会让 agent 层被迫承担两种模式，
 * 故单开 `main/ai/`，只复用底层 harness（`runSingleShotTask`）与纯函数门。
 *
 * ## 不变量
 * - **取消必须穿透**：`signal` 同时交给正文请求与 `interpret`（判官要用同一张取消表），
 *   且不在此处 catch —— 用户点「停止」必须如实报「已停止」，不能降级成成功。
 * - **对外契约零改动**：本模块只被 handler 内部调用，`IpcContract` / `preload` / 渲染层无感。
 * - **不 import 业务域**：`main/ai/**` 不得依赖 `main/data/**`、`main/ceshu/**`
 *   （eslint 规则 7 已机器化），领域细节一律经参数注入。
 */

import { estimateTokens, type LlmTaskType } from '@mobai/shared/agent/runtime'
import type { LlmUsage } from '@mobai/shared/config/llm'
import type { AgentRunStats } from '@mobai/shared/agent/observability'
import type { LlmCallOptions } from '../llm/client'
import { runSingleShotTask } from '@mobai/agent-core/execution/runTask'

/** 主进程侧的 LLM 配置门面（对应 `ipc.ts::LlmShared`，此处只声明本模块用到的两个方法） */
export interface AiLlmPort {
  llmCallOptions: () => Promise<LlmCallOptions>
  isCloudCall: (callOpts: LlmCallOptions) => boolean
}

/** 只声明 `generate` 一个方法，便于测试注入桩而不必构造整个 LlmClient */
export interface AiGeneratePort {
  generate: (
    system: string,
    prompt: string,
    options: LlmCallOptions
  ) => Promise<{ model: string; content: string; usage?: LlmUsage }>
}

/** 预算档：决定确认门阈值与文案。`null` 表示**不做**确认（见 `AiTaskSpec.budget`） */
export interface AiTaskBudget {
  taskType: LlmTaskType
  /** 整篇 / 一键生成 */
  bulk?: boolean
  /** 批量条数（datagen） */
  count?: number
}

/** `interpret` 可用的上下文：与正文请求**同源**的调用配置 + 同一张取消表 */
export interface AiTaskContext {
  callOpts: LlmCallOptions
  signal?: AbortSignal
}

export interface AiTaskSpec<T> {
  system: string
  prompt: string
  /**
   * 预算档。`null` = 跳过确认门，仅借用取消 / 计时 / 观测。
   *
   * 只该用于「最小粒度、且渲染层没有确认回路」的任务（当前是单字段生成）；
   * 常规通道一律给具体档位，否则等于把成本护栏悄悄关掉。
   */
  budget: AiTaskBudget | null
  /** 渲染层是否已带 `confirmed: true` 重发（DD-17） */
  confirmed?: boolean
  /** 取消归属（`event.sender.id`）；给了即可被面板「停止」经 `task:cancel` 打断 */
  senderId?: number
  /** 拿到正文后的加工：解析 JSON、跑确定性质量门、调判官等 */
  interpret: (content: string, ctx: AiTaskContext) => Promise<T>
}

export interface AiTaskResult<T> {
  /** `interpret` 的产出 */
  value: T
  /** 模型原始正文（UI 展示「原文」/排查解析失败用） */
  content: string
  /** 实际模型名；本地档或异常时可能为空串 */
  model: string
  /** token 用量（成本观测）；`null` = 未上报 */
  usage: LlmUsage | null
  latencyMs: number
  /** 与对话循环同形的运行统计，便于两条通路汇总展示 */
  stats: AgentRunStats
}

interface AiRunPayload<T> {
  interpreted: T
  content: string
}

/**
 * 执行一次单发 AI 任务：**预算确认 → 计时 → 登记取消 → 请求 → 加工 → 观测**。
 *
 * `interpret` 内的异常（含判官的业务失败）按调用方语义处理；取消异常一律向上抛。
 */
export async function runAiTask<T>(
  deps: { llm: AiLlmPort; client: AiGeneratePort },
  spec: AiTaskSpec<T>
): Promise<AiTaskResult<T>> {
  const callOpts = await deps.llm.llmCallOptions()
  const isCloud = deps.llm.isCloudCall(callOpts)
  const estimatedTokens = estimateTokens(spec.system + spec.prompt)

  const task = await runSingleShotTask<AiRunPayload<T>>({
    isCloud,
    estimatedTokens,
    // 预算档为 null 时 taskType 只影响统计口径（不触发确认门），取最保守的 chapter
    taskType: spec.budget?.taskType ?? 'chapter',
    ...(spec.budget?.bulk !== undefined ? { bulk: spec.budget.bulk } : {}),
    ...(spec.budget?.count !== undefined ? { count: spec.budget.count } : {}),
    skipBudgetConfirm: spec.budget === null,
    confirmed: spec.confirmed === true,
    ...(spec.senderId !== undefined ? { senderId: spec.senderId } : {}),
    run: async (signal) => {
      const { model, content, usage } = await deps.client.generate(spec.system, spec.prompt, {
        ...callOpts,
        ...(signal !== undefined ? { signal } : {})
      })
      // 判官等后续步骤复用同一 signal：既与正文共用取消表，也让「停止」能打断 judge
      const interpreted = await spec.interpret(content, {
        callOpts,
        ...(signal !== undefined ? { signal } : {})
      })
      return { value: { interpreted, content }, model, usage }
    }
  })

  return {
    value: task.value.interpreted,
    content: task.value.content,
    model: task.model ?? '',
    usage: task.usage ?? null,
    latencyMs: task.latencyMs,
    stats: task.stats
  }
}
