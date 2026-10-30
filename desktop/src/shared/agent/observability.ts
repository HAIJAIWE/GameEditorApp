/**
 * Agent 运行观测（M1 观测先行 / DD-10）。
 *
 * 把「每轮消耗」收敛成可累加、可序列化的纯数据，让面板与（未来的）历史统计都能消费。
 * 纯函数、不依赖 Electron / DOM / 存储，可在 Node 环境完整单测。
 *
 * 与 `budget.ts`（云端成本护栏）的关系：budget 管「预算 / 上限 / 是否超支」，
 * 本模块管「实际发生多少」。两者互补——本模块的 `totalTokens` 是 budget 评估的**事后真值**。
 *
 * ## 为什么独立成文件、不塞进 `brain.ts`
 * `brain.ts` 是循环逻辑，本模块是「数据形状 + 累加代数」。把可单测的纯代数挪出来，
 * 循环单测不必为观测写桩，观测单测也不必拉起整个循环。
 */

import type { LlmUsage } from '../config/llm/llmConfig'

/**
 * 档位（M1 记录值）。
 * - 数字员工对话面（Ollama 传输层）在 M3 接档位路由之前恒为 `local`；
 * - `cloud` / `unconfigured` 是预留位，待 M3 的档位路由把 `resolveLlmTier` 注入循环后填充。
 */
export type AgentRunTier = 'cloud' | 'local' | 'unconfigured'

/** 单轮 LLM 调用产生的观测点（M1 核心采集项；与 `turn_stats` 事件一一对应） */
export interface AgentTurnStat {
  /** 第几轮（0 起） */
  turn: number
  /** 实际调用的模型（本地档为 Ollama 模型名；云端档为模型名） */
  model: string
  /** 档位（M3 之前恒为 `local`） */
  tier: AgentRunTier
  /** token 用量（来自 LLM 响应；本地档 Ollama 取 `prompt_eval_count` / `eval_count`） */
  usage: LlmUsage
  /** 该轮 LLM 调用耗时（毫秒，仅含网络往返，不含工具执行等待） */
  latencyMs: number
  /** 该轮 LLM 决策出的工具调用数（用于识别「工具面过载」） */
  toolCalls: number
}

/** 一次完整 `chat()` 的运行累计（面板与历史统计的消费形态） */
export interface AgentRunStats {
  /** 实际发生的 LLM 轮数 */
  turns: number
  promptTokens: number
  completionTokens: number
  totalTokens: number
  /** 累计耗时（毫秒） */
  latencyMs: number
  /** 累计工具调用数 */
  toolCalls: number
  /** 末轮模型（多轮应一致；无调用时为 ''） */
  model: string
  tier: AgentRunTier
}

/** 空累计（每次新会话轮次起点） */
export function emptyAgentRunStats(tier: AgentRunTier = 'local'): AgentRunStats {
  return {
    turns: 0,
    promptTokens: 0,
    completionTokens: 0,
    totalTokens: 0,
    latencyMs: 0,
    toolCalls: 0,
    model: '',
    tier
  }
}

/** 由一次 LLM 答复 + 计时构造观测点（runBrainLoop 内调用；usage 缺失回落零值） */
export function turnStatFromReply(
  turn: number,
  model: string,
  tier: AgentRunTier,
  usage: LlmUsage | undefined,
  latencyMs: number,
  toolCalls: number
): AgentTurnStat {
  const safe: LlmUsage = usage ?? { promptTokens: 0, completionTokens: 0, totalTokens: 0 }
  return { turn, model, tier, usage: safe, latencyMs, toolCalls }
}

/**
 * 把一个观测点并入累计（**纯函数**：返回新对象，不就地修改入参——
 * 与 `reduceBrainEvent` 的不可变归约取向一致，便于单测与回放）。
 */
export function accumulateTurn(stats: AgentRunStats, turn: AgentTurnStat): AgentRunStats {
  return {
    turns: stats.turns + 1,
    promptTokens: stats.promptTokens + turn.usage.promptTokens,
    completionTokens: stats.completionTokens + turn.usage.completionTokens,
    totalTokens: stats.totalTokens + turn.usage.totalTokens,
    latencyMs: stats.latencyMs + turn.latencyMs,
    toolCalls: stats.toolCalls + turn.toolCalls,
    // 末轮模型覆盖（多轮应一致；首轮为空时保留已有非空值）
    model: turn.model !== '' ? turn.model : stats.model,
    tier: turn.tier
  }
}
