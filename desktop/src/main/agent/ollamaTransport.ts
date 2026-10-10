/**
 * Ollama `/api/chat` 传输层（A1-2）：带 `tools` 的 Function Calling + NDJSON 流式增量。
 *
 * 为什么不用 `ollama` npm 客户端：本层需要**完全可控**的 tool_calls 形状与流式解析
 * （不同客户端版本对 `tool_calls[].function.arguments` 是「对象」还是「JSON 字符串」有差异），
 * 直接用 `fetch` 打 `/api/chat` 更稳，也让桩服务 E2E 的契约显式可读。
 *
 * 主机/模型沿用项目既有约定：`MB_OLLAMA_HOST`（默认 127.0.0.1:11434）、`MB_OLLAMA_MODEL`。
 *
 * ## ⚠️ 本层**不受设置面板的「AI 模型服务」影响**（不是 bug，是 M0 有意留下的边界）
 * 它是数字员工对话面（`agent:chat`）的**第三条独立链路**：不 import `StoredLlmConfig`、
 * 不读 `confidential`、不走 `resolveLlmTier`。用户在这里改不动、在这里也看不到，
 * 改完设置发现本对话面没变化是**预期行为**。
 * 之所以在错误文案里明说这一点，是为了不给用户「设置没生效」的错觉（那才是真误导）。
 * 接档位路由属 M3；现在接会提前烧掉 M0.5 的 `num_ctx` 设计空间。
 */

import { LLM_MESSAGES, type LlmUsage } from '../../shared/llmConfig'
import {
  parseToolArguments,
  type BrainLlmReply,
  type BrainLlmRequest,
  type BrainLlmTransport,
  type BrainToolCall
} from '../../shared/agent/brain'

const DEFAULT_HOST = 'http://127.0.0.1:11434'

export interface OllamaChatTransportOptions {
  host?: string
  model?: string
  temperature?: number
}

interface OllamaChatChunk {
  message?: {
    role?: string
    content?: string
    tool_calls?: Array<{
      id?: string
      function?: { name?: string; arguments?: unknown }
    }>
  }
  done?: boolean
  done_reason?: string
  error?: string
  /** 最终 chunk 携带的 token 计数（Ollama 在 `done:true` 时给出累计值） */
  prompt_eval_count?: number
  eval_count?: number
}

export class OllamaChatTransport implements BrainLlmTransport {
  constructor(private readonly options: OllamaChatTransportOptions = {}) {}

  private resolveHost(): string {
    return this.options.host ?? process.env['MB_OLLAMA_HOST'] ?? DEFAULT_HOST
  }

  private resolveModel(): string {
    const model = this.options.model ?? process.env['MB_OLLAMA_MODEL']
    if (model === undefined || model === '') {
      throw new Error(
        '未指定本地模型：数字员工对话面读取的是环境变量 MB_OLLAMA_MODEL（或本机已拉取的默认模型），' +
          '请先 ollama pull 拉取模型并设置该环境变量后重试（设置面板的「AI 模型服务」对本对话面不生效）'
      )
    }
    return model
  }

  async complete(request: BrainLlmRequest): Promise<BrainLlmReply> {
    const model = this.resolveModel()
    const body = JSON.stringify({
      model,
      messages: request.messages,
      tools: request.tools,
      stream: true,
      options: { temperature: this.options.temperature ?? 0.7 }
    })

    let response: Response
    try {
      response = await fetch(`${this.resolveHost()}/api/chat`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body
      })
    } catch (error) {
      // 与 `main/llm/client.ts` 的 Ollama 分支共用同一常量 ⇒ 两处「本地未启动」文案永不漂移
      throw new Error(LLM_MESSAGES.ollamaNotRunning(this.resolveHost()), { cause: error })
    }

    if (!response.ok || response.body === null) {
      const detail = await response.text().catch(() => '')
      throw new Error(`AI 调用失败（HTTP ${response.status}）：${detail.slice(0, 120)}`)
    }

    const reader = response.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''
    let content = ''
    const toolCalls: BrainToolCall[] = []
    let finishReason = 'stop'
    // M1 观测：token 计数（仅最终 chunk 携带累计值，取最后非空值即可）
    let promptEvalCount = 0
    let evalCount = 0

    const handleLine = (line: string): void => {
      const trimmed = line.trim()
      if (trimmed === '') return
      let chunk: OllamaChatChunk
      try {
        chunk = JSON.parse(trimmed) as OllamaChatChunk
      } catch {
        return
      }
      if (typeof chunk.error === 'string' && chunk.error !== '') {
        throw new Error(`AI 调用失败：${chunk.error.slice(0, 120)}`)
      }
      if (typeof chunk.prompt_eval_count === 'number') promptEvalCount = chunk.prompt_eval_count
      if (typeof chunk.eval_count === 'number') evalCount = chunk.eval_count
      const message = chunk.message
      if (message !== undefined) {
        const delta = typeof message.content === 'string' ? message.content : ''
        if (delta !== '') {
          content += delta
          request.onChunk?.(delta)
        }
        for (const raw of message.tool_calls ?? []) {
          toolCalls.push({
            id: typeof raw.id === 'string' && raw.id !== '' ? raw.id : `call_${toolCalls.length + 1}`,
            name: raw.function?.name ?? '',
            arguments: parseToolArguments(raw.function?.arguments)
          })
        }
      }
      if (chunk.done === true) {
        finishReason = typeof chunk.done_reason === 'string' && chunk.done_reason !== '' ? chunk.done_reason : 'stop'
      }
    }

    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let index = buffer.indexOf('\n')
      while (index >= 0) {
        handleLine(buffer.slice(0, index))
        buffer = buffer.slice(index + 1)
        index = buffer.indexOf('\n')
      }
    }
    handleLine(buffer)

    // M1 观测：token 用量（本地档 Ollama 从最终 chunk 的 prompt_eval_count/eval_count 取）
    const usage: LlmUsage | undefined =
      promptEvalCount > 0 || evalCount > 0
        ? { promptTokens: promptEvalCount, completionTokens: evalCount, totalTokens: promptEvalCount + evalCount }
        : undefined
    return { content, toolCalls, finishReason, model, usage }
  }
}
