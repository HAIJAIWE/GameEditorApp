/**
 * 云端 OpenAI 兼容传输层（M3 档位路由）：带 `tools` 的 Function Calling + SSE 流式增量。
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
 * - **流式（F9）**：本层以 `stream:true` + SSE 解析实现逐 token 回调 `onChunk`，面板可见逐字输出；
 *   本地档 Ollama 早已流式，现云端档对齐，两档 UX 一致。
 * - **Claude 不在此层**：Anthropic Messages API 与 OpenAI 协议不兼容（`client.ts` 既有结论），
 *   由 `resolveAgentTransport` 在同一处拦截并给出中文指引。
 * - **`request.tools` 原样下发**：本层**不补** Function Calling 外层包装 —— 进来时已是
 *   `[{type:'function', function:{…}}]`（`brainService` 经 `toFunctionCallingTools` 转好）。
 *   若把 `toJsonSchema()` 的内层对象直接透传，OpenAI 兼容端点会回
 *   `400 InvalidParameter: input.tools.0.type must be one of ['function']`（线上实测）。
 *
 * ## 重构说明（本文件唯一实质变更）
 * 行泵下沉到 `agentStream.pumpLines`，与 Ollama NDJSON 共用一份实现（含 `finally { releaseLock() }`
 * 与末尾残片 flush）。SSE 语义留在本层：`data:` 前缀、`[DONE]` 终止符、`tool_calls` 按 `index` 合并。
 * 改前两层的行泵是各自拷贝，已出现「一份有锁释放、一份没有」的漂移。
 */

import { LLM_MESSAGES, type LlmUsage } from '../../shared/config/llm/llmConfig'
import {
  parseToolArguments,
  type BrainLlmReply,
  type BrainLlmRequest,
  type BrainLlmTransport,
  type BrainMessage,
  type BrainToolCall
} from '../../shared/agent/brain'
import { resolveVisionSupport, type VisionMode } from '../../shared/util/ui/visionSupport'
import { assertHttpOk, isAbortError, pumpLines } from './agentStream'

/** OpenAI 多模态 content part（文本 + 图片） */
type OpenAiContentPart =
  | { type: 'text'; text: string }
  | { type: 'image_url'; image_url: { url: string } }

/**
 * 把消息映射成 OpenAI 线格式：视觉模型把 `images` 转成 `content` 数组（text + image_url）；
 * 非视觉模型丢弃图片（只保留文本）。`images` 字段本身绝不下发（不是 OpenAI 协议字段）。
 */
function toOpenAiMessages(messages: readonly BrainMessage[], vision: boolean): unknown[] {
  return messages.map((message) => {
    if (message.images === undefined || message.images.length === 0) return message
    if (!vision) return { ...message, images: undefined }
    const content: OpenAiContentPart[] = [
      { type: 'text', text: message.content },
      ...message.images.map((url) => ({ type: 'image_url' as const, image_url: { url } }))
    ]
    return { ...message, content, images: undefined }
  })
}

export interface OpenAiChatTransportOptions {
  /** 接口地址（`https://api.deepseek.com/v1` 形态；**不含** `/chat/completions`） */
  baseUrl: string
  model: string
  /** API Key（调用方从 secretStore 现取；可为空串 ⇒ 由服务端拒绝并回报中文错误） */
  apiKey: string
  temperature?: number
  /** 视觉设定（`auto` 按模型名判断 / `on` 强制 / `off` 强制不发）；缺省 `auto` */
  vision?: VisionMode
}

interface OpenAiStreamChunk {
  choices?: Array<{
    delta?: {
      content?: string | null
      tool_calls?: Array<{
        index?: number
        id?: string
        function?: { name?: string; arguments?: unknown }
      }>
    }
    finish_reason?: string | null
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

/** 把单个 chunk 的 usage 映射为 `LlmUsage`（缺字段回落零值） */
function mapUsage(usage: OpenAiStreamChunk['usage']): LlmUsage | undefined {
  if (usage === undefined) return undefined
  const promptTokens = usage.prompt_tokens ?? 0
  const completionTokens = usage.completion_tokens ?? 0
  const totalTokens = usage.total_tokens ?? promptTokens + completionTokens
  return { promptTokens, completionTokens, totalTokens }
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

    // `tools: []` 会被部分严格端点判为非法（宁可省略而非空数组）；本层只做透传。
    const body = JSON.stringify({
      model,
      messages: toOpenAiMessages(request.messages, resolveVisionSupport(model, this.options.vision)),
      ...(request.tools.length > 0 ? { tools: request.tools } : {}),
      stream: true,
      // 请求服务端在末段 chunk 回传 usage（多数 OpenAI 兼容支持；不支持则观测记零值）
      stream_options: { include_usage: true },
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
        body,
        ...(request.signal !== undefined ? { signal: request.signal } : {})
      })
    } catch (error) {
      // 取消必须原样抛出（否则循环会把「用户停止」当成云端故障）
      if (isAbortError(error)) throw error
      throw new Error(`云端 AI 调用失败：${error instanceof Error ? error.message : String(error)}`, {
        cause: error
      })
    }

    await assertHttpOk(response, '云端 AI 调用失败')

    // 无流式 body（极少数环境 / 测试桩）⇒ 降级为一次性读 JSON
    const stream: ReadableStream<Uint8Array> | null | undefined = response.body
    if (stream === null || stream === undefined) {
      return this.completeFromJson(response, model, request)
    }

    // SSE 流式解析：逐 `data:` 行累加 content（onChunk）与 tool_calls（按 index 合并）
    let content = ''
    let finishReason: string = 'stop'
    let usage: LlmUsage | undefined
    const toolCallSlots: Array<{ id: string; name: string; arguments: string }> = []

    const handleLine = (line: string): void => {
      const trimmed = line.trim()
      if (trimmed === '' || !trimmed.startsWith('data:')) return
      const data = trimmed.slice(5).trim()
      if (data === '[DONE]') return
      let chunk: OpenAiStreamChunk
      try {
        chunk = JSON.parse(data) as OpenAiStreamChunk
      } catch {
        return // 跳过畸形行，不中断整轮
      }
      if (chunk.error?.message !== undefined && chunk.error.message !== '') {
        throw new Error(`云端 AI 调用失败：${chunk.error.message.slice(0, 200)}`)
      }
      if (chunk.usage !== undefined) usage = mapUsage(chunk.usage)
      const choice = chunk.choices?.[0]
      if (choice === undefined) return
      const delta = choice.delta
      if (typeof delta?.content === 'string' && delta.content !== '') {
        content += delta.content
        request.onChunk?.(delta.content)
      }
      if (delta?.tool_calls !== undefined) {
        for (const tc of delta.tool_calls) {
          const slotIndex = tc.index ?? toolCallSlots.length
          if (toolCallSlots[slotIndex] === undefined) {
            toolCallSlots[slotIndex] = { id: '', name: '', arguments: '' }
          }
          const slot = toolCallSlots[slotIndex]
          if (typeof tc.id === 'string' && tc.id !== '') slot.id = tc.id
          if (typeof tc.function?.name === 'string') slot.name += tc.function.name
          if (tc.function?.arguments !== undefined) {
            slot.arguments +=
              typeof tc.function.arguments === 'string' ? tc.function.arguments : JSON.stringify(tc.function.arguments)
          }
        }
      }
      if (typeof choice.finish_reason === 'string' && choice.finish_reason !== '') {
        finishReason = choice.finish_reason
      }
    }

    await pumpLines(stream, handleLine)

    const toolCalls: BrainToolCall[] = toolCallSlots
      .filter((slot): slot is { id: string; name: string; arguments: string } => slot !== undefined)
      .map((slot, index) => ({
        id: slot.id !== '' ? slot.id : `call_${index + 1}`,
        name: slot.name,
        arguments: parseToolArguments(slot.arguments)
      }))

    return {
      content,
      toolCalls,
      finishReason: toolCalls.length > 0 && finishReason === 'stop' ? 'tool_calls' : finishReason,
      model,
      usage
    }
  }

  /** 非流式降级路径：一次性读 JSON（`response.body` 缺失时的兜底，语义与流式守恒） */
  private async completeFromJson(
    response: Response,
    model: string,
    request: BrainLlmRequest
  ): Promise<BrainLlmReply> {
    const payload = (await response.json().catch(() => ({}))) as {
      choices?: Array<{
        message?: {
          content?: string
          tool_calls?: Array<{ id?: string; function?: { name?: string; arguments?: unknown } }>
        }
        finish_reason?: string
      }>
      usage?: OpenAiStreamChunk['usage']
      error?: { message?: string }
    }
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
    if (content !== '') request.onChunk?.(content)
    const finishReason =
      typeof choice?.finish_reason === 'string' && choice.finish_reason !== ''
        ? choice.finish_reason
        : toolCalls.length > 0
          ? 'tool_calls'
          : 'stop'
    return { content, toolCalls, finishReason, model, usage: mapUsage(payload.usage) }
  }
}

/** Claude 档兜底错误（与 `client.ts` 共用同一中文文案，避免两处漂移） */
export function claudeUnsupportedError(): Error {
  return new Error(LLM_MESSAGES.claudeUnsupported)
}
