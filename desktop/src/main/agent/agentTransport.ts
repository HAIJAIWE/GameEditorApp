/**
 * 数字员工对话面的**档位路由**（M3 / ollamaTransport 头注「接档位路由属 M3」的落点）。
 *
 * ## 规则（唯一真源 = `resolveLlmTier`）
 * | 生效档位 | 传输层 | 说明 |
 * |---|---|---|
 * | `cloud` | `OpenAiChatTransport` | 走设置面板选定的云端服务商（OpenAI 兼容端点） |
 * | `local` | `OllamaChatTransport` | 本机 Ollama（`num_ctx` 由配置下发，DD-1） |
 * | `unconfigured` | `OllamaChatTransport` | 无配置可路由 ⇒ 回本对话面的**原生本地**传输层（M0 的「不静默回落」闸门针对的是策划书/数据域的 51 个云端调用点；本对话面本就以本地为原生档，见 `ollamaTransport.ts` 头注） |
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
} from '../../shared/llmConfig'
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

/** 数字员工对话面**实际生效**的档位（与传输层一一对应，不含 `unconfigured`——它归到 `local` 传输层） */
export function resolveAgentTier(config: StoredLlmConfig | undefined): AgentRunTier {
  return resolveLlmTier(config) === 'cloud' ? 'cloud' : 'local'
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
      apiKey
    })
  }
  // 本地 / 未配置：本对话面的原生传输层（`num_ctx` 由配置显式下发，未配置则用传输层默认 16384）
  return config !== undefined
    ? new OllamaChatTransport({ numCtx: config.numCtx })
    : new OllamaChatTransport()
}
