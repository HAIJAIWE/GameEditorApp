/**
 * Ollama `/api/chat` 传输层（A1-2）：带 `tools` 的 Function Calling + NDJSON 流式增量。
 *
 * 为什么不用 `ollama` npm 客户端：本层需要**完全可控**的 tool_calls 形状与流式解析
 * （不同客户端版本对 `tool_calls[].function.arguments` 是「对象」还是「JSON 字符串」有差异），
 * 直接用 `fetch` 打 `/api/chat` 更稳，也让桩服务 E2E 的契约显式可读。
 *
 * 主机/模型沿用项目既有约定：`MB_OLLAMA_HOST`（默认 127.0.0.1:11434）、`MB_OLLAMA_MODEL`。
 */

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
}

export class OllamaChatTransport implements BrainLlmTransport {
  constructor(private readonly options: OllamaChatTransportOptions = {}) {}

  private resolveHost(): string {
    return this.options.host ?? process.env['MB_OLLAMA_HOST'] ?? DEFAULT_HOST
  }

  private resolveModel(): string {
    const model = this.options.model ?? process.env['MB_OLLAMA_MODEL']
    if (model === undefined || model === '') {
      throw new Error('未指定本地模型：请设置 MB_OLLAMA_MODEL，或先 ollama pull 拉取模型后重试')
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
      throw new Error(
        `未检测到本地 Ollama 服务，请先启动（ollama serve，地址 ${this.resolveHost()}）后重试`,
        { cause: error }
      )
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

    return { content, toolCalls, finishReason }
  }
}
