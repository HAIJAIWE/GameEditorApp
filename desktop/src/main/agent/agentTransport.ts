/**
 * 数字员工对话面的**档位路由**（M3 / ollamaTransport 头注「接档位路由属 M3」的落点）。
 *
 * ## 规则（唯一真源 = `resolveLlmTier`）
 * | 生效档位 | 传输层 | 说明 |
 * |---|---|---|
 * | `cloud` | `OpenAiChatTransport` | 走设置面板选定的云端服务商（OpenAI 兼容端点） |
 * | `local` | `OllamaChatTransport` | 本机 Ollama（`num_ctx` 由配置下发，DD-1） |
 * | `unconfigured` | `OllamaChatTransport` | 未配置任何模型 ⇒ 回本对话面**原生本地**传输层（本地是聊天面原生档）；档位 honest 记为 `unconfigured`（不再假装成已选定的 `local`），使观测/面板能提示「未配置，去设置选云端或开启保密模式」 |
 *
 * ## 为什么 `claude` 单列
 * Anthropic Messages API 与 OpenAI 协议不兼容（`client.ts` 既有结论）。此处**不**把它偷偷
 * 当 OpenAI 兼容端点去打（那会得到 404 而不是可读原因），而是返回一个**调用即抛出可读中文**的
 * 传输层——让 Brain 循环把错误收敛成 `transport_error` 事件，面板能显示「为什么不能用」。
 */
import {
  effectiveProvider,
  resolveLlmBaseUrl,
  resolveLlmTier,
  type StoredLlmConfig
} from '../../shared/config/llm/llmConfig'
import type { AgentRunTier } from '../../shared/agent/observability'
import type { BrainLlmTransport } from '../../shared/agent/brain'
import { OllamaChatTransport } from './ollamaTransport'
import { claudeUnsupportedError, OpenAiChatTransport } from './openAiTransport'

/** 调用即抛错的传输层（用于「档位不支持」的可读降级，而非静默换档） */
export function failingTransport(error: Error): BrainLlmTransport {
  return {
    complete: () => Promise.reject(error)
  }
}

/**
 * 数字员工对话面**实际生效**的档位（与传输层一一对应）。
 * 三态如实透传：`cloud` / `local` / `unconfigured`。
 * ⚠️ 不再把 `unconfigured` 伪装成 `local`——M0「不静默回落」的产品意志要求观测层能区分
 * 「用户故意选了本地」与「根本没配置」（后者应提示去设置 / 开保密模式）。传输层对
 * `unconfigured` 仍走原生本地 Ollama（聊天面本就以本地为原生档），只是**档位标签**诚实化。
 */
export function resolveAgentTier(config: StoredLlmConfig | undefined): AgentRunTier {
  const tier = resolveLlmTier(config)
  return tier === 'cloud' ? 'cloud' : tier === 'unconfigured' ? 'unconfigured' : 'local'
}

/**
 * 按档位解析传输层。
 * @param config 非敏感配置镜像（来自 `llm:configure`；`undefined` ⇒ 未配置）
 * @param apiKey API Key（由 ipc 从 secretStore 现取；仅云端档使用）
 */
export function resolveAgentTransport(
  config: StoredLlmConfig | undefined,
  apiKey: string
): BrainLlmTransport {
  if (config !== undefined && resolveLlmTier(config) === 'cloud') {
    if (effectiveProvider(config) === 'claude') {
      return failingTransport(claudeUnsupportedError())
    }
    return new OpenAiChatTransport({
      baseUrl: resolveLlmBaseUrl(config),
      model: config.model,
      apiKey,
      vision: config.vision
    })
  }
  // 本地 / 未配置：本对话面的原生传输层（`num_ctx` 由配置显式下发，未配置则用传输层默认 16384）
  return config !== undefined
    ? new OllamaChatTransport({ numCtx: config.numCtx, vision: config.vision })
    : new OllamaChatTransport()
}
