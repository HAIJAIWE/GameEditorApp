/**
 * `schemasData` 拆分件：**LLM 配置与字段级文本生成**（`llm:*` 通道）。
 *
 * 原 `schemasData.ts` 的 113 个 schema 按业务域拆开，导出名一字未改；
 * 消费者请直接指向本文件（不再经 `core/schemas` 桶）。
 */

import { z } from 'zod'

/** 单次文本生成的入参 */
export const llmGenerateInputSchema = z.object({
  /** 系统提示（缺省则用一个通用的「游戏文案助手」人格） */
  system: z.string().max(4000).default(''),
  /** 用户提示（必填；组装逻辑在 shared/fieldAiAssist，渲染层只传结果） */
  prompt: z.string().min(1).max(20000)
})

export type LlmGenerateInput = z.infer<typeof llmGenerateInputSchema>

/**
 * LLM 非敏感配置。
 * **刻意不含 apiKey** —— Key 走 safeStorage（见 `shared/secretNames.ts` 的 `llmApiKey`）。
 */
/**
 * LLM 非敏感配置（对齐 `StoredLlmConfig` 全 17 字段）。
 *
 * ⚠️ 铁律（见 `llmConfigData.ts:240`）：本 schema 必须**镜像 `StoredLlmConfig` 的全部字段**。
 * zod `object()` 默认剥掉未知键，只改 `StoredLlmConfig` 不改这里 ⇒ 主进程静默丢字段
 * （表现为「设置存了但没用」）。历史上 `confidential` 已踩过此坑。
 * 各字段取值上下限与 `llmConfigData.ts` 的同名常量保持一致（此处用字面量，与文件既有写法统一）。
 */
export const llmConfigSchema = z.object({
  enabled: z.boolean(),
  provider: z.enum(['ollama', 'openai', 'doubao', 'qwen', 'claude', 'deepseek', 'custom']),
  model: z.string().max(200),
  baseUrl: z.string().max(500),
  temperature: z.number().min(0).max(2),
  maxTokens: z.number().int().min(1).max(32000),
  topP: z.number().min(0).max(1),
  numCtx: z.number().int().min(512).max(128000),
  repeatPenalty: z.number().min(1).max(2),
  topK: z.number().int().min(0).max(100),
  seed: z.number().int().min(-1).max(2147483647),
  mirostatMode: z.number().int().min(0).max(2),
  mirostatTau: z.number().min(0).max(10),
  mirostatEta: z.number().min(0).max(1),
  stopWords: z.string().max(2000),
  numGpu: z.number().int().min(-1).max(200),
  confidential: z.boolean(),
  /** 视觉输入设定：auto=按模型名判断，on=强制发图，off=强制不发 */
  vision: z.enum(['auto', 'on', 'off'])
})

/** 渲染层 → 主进程推配置镜像（启动时 + 改设置时各一次） */
export const llmConfigureInputSchema = z.object({
  config: llmConfigSchema
})

export const llmStatusInputSchema = z.object({})

/** 测试连接（E63）：无入参，主进程按当前配置镜像探活 */
export const llmTestConnectionInputSchema = z.object({})

export type LlmConfigureInput = z.infer<typeof llmConfigureInputSchema>
