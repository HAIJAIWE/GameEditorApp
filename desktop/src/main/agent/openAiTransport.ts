/**
 * 云端 OpenAI 兼容传输层（M3 档位路由）：带 `tools` 的 Function Calling。
 *
 * ## 为什么现在才有
 * 数字员工对话面（`agent:chat`）此前是**第三条本地专属链路**——传输层硬编码 `OllamaChatTransport`，
 * 不读设置面板的「AI 模型服务」。M3 接「档位路由」后，云端档（`resolveLlmTier(config) === 'cloud'`）
 * 需要一个**能带工具调用的云端传输层**，本文件即它。
 *
 * ## 复用而非另造
 * 服务商 / 接口地址 / 模型名一律沿用 `shared/llmConfig.ts` 的既有真源：
 * `effectiveProvider()` + `resolveLlmBaseUrl()` + `config.model`；API Key 由调用方（ipc）从
 * `secretStore` 现取现传，**本层不落盘、不缓存**。请求形态对齐 `main/llm/client.ts` 的 OpenAI
 * 兼容路径：`POST {baseUrl}/chat/completions` + `Authorization: Bearer`。
 *
 * ## 与 `LlmClient` 的分工（不是重复造轮子）
 * - `LlmClient.generate()`：**纯文本**单轮调用（策划书/数据域的 51 个调用点），**不带 tools**；
 * - 本层：**带 tools 的多轮循环**（Brain 循环），多出 `tool_calls` 解析与回灌。
 * 两者共用同一批配置解析函数，避免「同一个 provider 两处拼出不同 URL」。
 *
 * ## ⚠️ 边界（诚实标注）
 * - **非流式**：本层一次返回完整响应（Brain 循环本就按「一轮答复」粒度消费，工具调用不需要逐字流）。
 *   逐字流式（`onChunk`）本次以「整段一次性回调」实现，面板仍可见最终文本，但**不是**逐 token。
 * - **Claude 不在此层**：Anthropic Messages API 与 OpenAI 协议不兼容（`client.ts` 既有结论），
 *   由 `resolveAgentTransport` 在同一处拦截并给出中文指引。
 */
import { LLM_MESSAGES, type LlmUsage } from '../../shared/llmConfig'
import {
  parseToolArguments,
  type BrainLlmReply,
  type BrainLlmRequest,
  type BrainLlmTransport,
  type BrainToolCall
} from '../../shared/agent/brain'

export interface OpenAiChatTransportOptions {
  /** 接口地址（`https://api.deepseek.com/v1` 形态；**不含** `/chat/completions`） */
  baseUrl: string
  model: string
  /** API Key（调用方从 secretStore 现取；可为空串 ⇒ 由服务端拒绝并回报中文错误） */
  apiKey: string
  temperature?: number
}

interface OpenAiChatResponse {
  choices?: Array<{
    message?: {
      content?: string | null
      tool_calls?: Array<{
        id?: string
        function?: { name?: string; arguments?: unknown }
      }>
    }
    finish_reason?: string
  }>
  usage?: {
    prompt_tokens?: number
    completion_tokens?: number
    total_tokens?: number
  }
  error?: { message?: string }
}

/** 拼接 OpenAI 兼容端点（容忍 baseUrl 尾部斜杠；不重复追加 /v1） */
export function buildChatCompletionsUrl(baseUrl: string): string {
  return `${baseUrl.trim().replace(/\/+$/, '')}/chat/completions`
}

export class OpenAiChatTransport implements BrainLlmTransport {
  constructor(private readonly options: OpenAiChatTransportOptions) {}

  async complete(request: BrainLlmRequest): Promise<BrainLlmReply> {
    const { baseUrl, model, apiKey } = this.options
    if (baseUrl.trim() === '') {
      throw new Error('未配置云端接口地址：请到「设置 → AI 模型服务」填写或选择服务商后重试。')
    }
    if (model.trim() === '') {
      throw new Error('未指定云端模型：请到「设置 → AI 模型服务」选择或填写模型后重试。')
    }

    const body = JSON.stringify({
      model,
      messages: request.messages,
      tools: request.tools,
      stream: false,
      temperature: this.options.temperature ?? 0.7
    })

    let response: Response
    try {
      response = await fetch(buildChatCompletionsUrl(baseUrl), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(apiKey.trim() !== '' ? { Authorization: `Bearer ${apiKey}` } : {})
        },
        body
      })
    } catch (error) {
      throw new Error(`云端 AI 调用失败：${error instanceof Error ? error.message : String(error)}`, {
        cause: error
      })
    }

    if (!response.ok) {
      const detail = await response.text().catch(() => '')
      throw new Error(`云端 AI 调用失败（HTTP ${response.status}）：${detail.slice(0, 200)}`)
    }

    const payload = (await response.json().catch(() => ({}))) as OpenAiChatResponse
    if (payload.error?.message !== undefined && payload.error.message !== '') {
      throw new Error(`云端 AI 调用失败：${payload.error.message.slice(0, 200)}`)
    }

    const choice = payload.choices?.[0]
    const message = choice?.message ?? {}
    const content = typeof message.content === 'string' ? message.content : ''
    const toolCalls: BrainToolCall[] = (message.tool_calls ?? []).map((raw, index) => ({
      id: typeof raw.id === 'string' && raw.id !== '' ? raw.id : `call_${index + 1}`,
      name: raw.function?.name ?? '',
      arguments: parseToolArguments(raw.function?.arguments)
    }))

    // 非流式：整段文本一次性回调（面板仍能显示文本；不做逐 token，见文件头边界说明）
    if (content !== '') request.onChunk?.(content)

    const usage: LlmUsage | undefined =
      payload.usage !== undefined
        ? {
            promptTokens: payload.usage.prompt_tokens ?? 0,
            completionTokens: payload.usage.completion_tokens ?? 0,
            totalTokens:
              payload.usage.total_tokens ??
              (payload.usage.prompt_tokens ?? 0) + (payload.usage.completion_tokens ?? 0)
          }
        : undefined

    const finishReason =
      typeof choice?.finish_reason === 'string' && choice.finish_reason !== ''
        ? choice.finish_reason
        : toolCalls.length > 0
          ? 'tool_calls'
          : 'stop'

    return { content, toolCalls, finishReason, model, usage }
  }
}

/** Claude 档兜底错误（与 `client.ts` 共用同一中文文案，避免两处漂移） */
export function claudeUnsupportedError(): Error {
  return new Error(LLM_MESSAGES.claudeUnsupported)
}
