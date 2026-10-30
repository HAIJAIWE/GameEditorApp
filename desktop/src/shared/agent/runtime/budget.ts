/**
 * 云端 LLM 调用的**成本护栏**（v0.6 M5）。
 *
 * ## 为什么需要这一层
 * 本项目云端档（OpenAI / 豆包 / Qwen / DeepSeek）是按 token 计费的，而策划书/数据的 AI 能力
 * 走的是渲染层直连通路（`window.mbApi.ceshu.*`），**不在 agent 循环里**，也没有任何「花了多少」的可见性。
 * 本地档（Ollama）免费，无需护栏。⇒ 本模块只在**云端档**生效。
 *
 * ## 设计取舍（避免过度）
 * - 预算是**护栏不是账单**：用 token 维度（跨厂商可比），不引入各家单价表。
 * - 预估是**保守粗估**：渲染层用「任务规模」经验值、主进程用「提示词长度」估算，都对照同一份预算常量；
 *   不追求精确（精确值由 `llmClient.generate` 返回的 `usage` 事后给出）。
 * - 超预算 = **降级而非静默烧钱**：提示「建议拆分任务」并需显式确认，而不是硬拦或偷偷继续。
 *
 * 本地档（ollama）返回 `cloud: false`，`evaluateBudget` 一律判 `level: 'free'`、不拦截。
 */

export type LlmTaskType = 'chapter' | 'full' | 'datagen' | 'review'

export interface BudgetScale {
  /** 整篇生成时的章节数（用于经验预估与预算） */
  chapters?: number
  /** 批量数据生成的条目数 */
  count?: number
}

/** 各任务类型的 token 预算（保守设定，宁多估不漏） */
export function taskBudget(task: LlmTaskType, scale: BudgetScale = {}): number {
  switch (task) {
    case 'chapter':
      return 4000
    case 'full':
      // 整篇 = 章节数 × 单章（约 18 章 × 3000）
      return (scale.chapters ?? 18) * 3000
    case 'datagen':
      return (scale.count ?? 1) * 2000
    case 'review':
      return 8000
  }
}

/**
 * 渲染层经验预估（不依赖提示词内容，只看任务规模参数）。
 * 用途：在发起前就给出「预估 / 预算」的体感进度条。与 `taskBudget` 同源常量，但口径略宽。
 */
export function estimateTaskTokens(task: LlmTaskType, scale: BudgetScale = {}): number {
  switch (task) {
    case 'chapter':
      return 3500
    case 'full':
      return (scale.chapters ?? 18) * 3200
    case 'datagen':
      return (scale.count ?? 1) * 1800
    case 'review':
      return 7500
  }
}

/**
 * 基于文本长度的粗略 token 预估。
 * 中文约 1.6 字符/token、英文约 4 字符/token；取保守中值 ~2 字符/token（宁多估）。
 * 主进程组装好提示词后调用，比渲染层经验值更贴近真实。
 */
export function estimateTokens(text: string): number {
  if (text.length === 0) return 0
  return Math.ceil(text.length / 2)
}

export type BudgetLevel = 'free' | 'ok' | 'warn' | 'over'

export interface BudgetStatus {
  estimated: number
  budget: number
  /** 是否超出预算（仅云端档为 true 才有意义） */
  over: boolean
  /** 占用比例（0..n）；budget 为 0 时记 0 */
  ratio: number
  /** 是否云端档（云端档才计费，本地档免费） */
  cloud: boolean
  level: BudgetLevel
}

/** 比较预估与预算，给出护栏等级（本地档一律 `free`、不拦截） */
export function evaluateBudget(estimated: number, budget: number, cloud: boolean): BudgetStatus {
  const ratio = budget > 0 ? estimated / budget : 0
  let level: BudgetLevel = 'ok'
  if (!cloud) level = 'free'
  else if (ratio > 1) level = 'over'
  else if (ratio > 0.8) level = 'warn'
  return { estimated, budget, over: cloud && ratio > 1, ratio, cloud, level }
}
