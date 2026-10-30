/**
 * e2e 用的 LLM 配置夹具。
 *
 * ## 为什么不是每条用例手写字段
 * `shared/schemas.ts::llmConfigSchema` 是**全字段必填**的 zod 契约（`z.object` 默认
 * 全 required）。历史上 e2e 手抄过一份「7 个字段」的配置，随后本地采样参数
 * （`topP` / `numCtx` / `repeatPenalty` / `topK` / `seed` / `mirostat*` / `stopWords` / `numGpu`）
 * 陆续加进契约，那份夹具就静默失效了 —— 报错是 `page.evaluate: invalid_type ... path:["config","topP"]`，
 * 看上去像业务 bug，其实是夹具没跟上。
 *
 * 这里直接以 `DEFAULT_LLM_CONFIG` 为底（**单一真源**），只覆盖用例真正关心的几项。
 * 将来再加字段，夹具自动跟上，不会再漂。
 */

import { DEFAULT_LLM_CONFIG } from '../../../src/shared/config/llmConfigData'

/** 本地档（Ollama）测试配置：全字段齐全，可直接过 `llmConfigureInputSchema` */
export function localStubLlmConfig(host: string, model = 'stub:latest'): Record<string, unknown> {
  return {
    ...DEFAULT_LLM_CONFIG,
    enabled: true,
    provider: 'ollama',
    model,
    baseUrl: host
  }
}

/** 保密模式配置：强制本地、无视 baseUrl（DD-0b），用于「不该碰云端」的用例 */
export function confidentialLocalLlmConfig(): Record<string, unknown> {
  return { ...localStubLlmConfig(''), confidential: true }
}
