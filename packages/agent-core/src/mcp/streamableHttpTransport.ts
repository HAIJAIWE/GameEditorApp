import type { McpRequestOptions, McpTransport } from '@mobai/shared/agent/mcp'

/**
 * MCP **Streamable HTTP** 传输层（Slice 18b）。
 *
 * 与 stdio 平级，只是把字节流换成 HTTP：POST JSON-RPC 到服务器 URL；响应可能是
 * `application/json`（直接取 result）或 `text/event-stream`（SSE，逐条 `data:` 里找对应 id）。
 * 服务器若回 `Mcp-Session-Id` 头，后续请求带上它。
 *
 * 用全局 `fetch`（Electron 44 的 Node 已内置），不额外引依赖。
 */

interface JsonRpcReply {
  id?: number
  method?: string
  params?: unknown
  result?: unknown
  error?: { message: string }
}

export class StreamableHttpTransport implements McpTransport {
  private nextId = 1
  private sessionId: string | null = null
  private closed = false
  private notificationListener?: (method: string, params?: unknown) => void

  constructor(
    private readonly url: string,
    private readonly headers: Record<string, string> = {}
  ) {}

  async request(method: string, params?: unknown, options?: McpRequestOptions): Promise<unknown> {
    if (this.closed) throw new Error('MCP transport closed')
    const id = this.nextId
    this.nextId += 1
    const body = JSON.stringify({ jsonrpc: '2.0', id, method, ...(params !== undefined ? { params } : {}) })

    // 逐调用超时：用 AbortController 包裹（可同时叠加外部 signal）；超时即 abort 掉在途 fetch / SSE 流
    let signal: AbortSignal | undefined = options?.signal
    let controller: AbortController | undefined
    let abortTimer: ReturnType<typeof setTimeout> | undefined
    if (options?.timeoutMs !== undefined) {
      const ctrl = new AbortController()
      controller = ctrl
      signal = ctrl.signal
      if (options.signal !== undefined) {
        const external = options.signal
        if (external.aborted) ctrl.abort()
        else external.addEventListener('abort', () => ctrl.abort(), { once: true })
      }
      abortTimer = setTimeout(() => ctrl.abort(), options.timeoutMs)
    }

    try {
      const response = await fetch(this.url, {
        method: 'POST',
        headers: this.buildHeaders(),
        body,
        signal
      })

      const sessionId = response.headers.get('mcp-session-id')
      if (sessionId !== null) this.sessionId = sessionId
      if (!response.ok) throw new Error(`MCP HTTP ${response.status} ${response.statusText}`)

      const contentType = response.headers.get('content-type') ?? ''
      if (contentType.includes('text/event-stream')) return await this.readSse(response, id)

      const reply = (await response.json()) as JsonRpcReply
      if (reply.error !== undefined) throw new Error(reply.error.message)
      return reply.result
    } catch (error) {
      // abort 既可能来自我们的超时定时器，也可能来自外部 signal：统一收敛为超时/中断错误
      if (controller !== undefined && controller.signal.aborted) {
        throw new Error(`MCP 调用超时（${options?.timeoutMs ?? 0}ms）`, { cause: error })
      }
      throw error
    } finally {
      if (abortTimer !== undefined) clearTimeout(abortTimer)
    }
  }

  notify(method: string, params?: unknown): void {
    if (this.closed) return
    void fetch(this.url, {
      method: 'POST',
      headers: this.buildHeaders(),
      body: JSON.stringify({ jsonrpc: '2.0', method, ...(params !== undefined ? { params } : {}) })
    }).catch(() => undefined)
  }

  close(): void {
    this.closed = true
  }

  onNotification(listener: (method: string, params?: unknown) => void): void {
    this.notificationListener = listener
  }

  private buildHeaders(): Record<string, string> {
    return {
      'Content-Type': 'application/json',
      Accept: 'application/json, text/event-stream',
      ...(this.sessionId !== null ? { 'Mcp-Session-Id': this.sessionId } : {}),
      ...this.headers
    }
  }

  /** 读 SSE 流，找到与本次请求 id 匹配的响应；找不到则抛错 */
  private async readSse(response: Response, id: number): Promise<unknown> {
    const reader = response.body?.getReader()
    if (reader === undefined) throw new Error('MCP SSE：无响应体')
    const decoder = new TextDecoder()
    let buffer = ''
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      buffer += decoder.decode(value, { stream: true })
      let newline = buffer.indexOf('\n')
      while (newline >= 0) {
        const line = buffer.slice(0, newline).trim()
        buffer = buffer.slice(newline + 1)
        if (line.startsWith('data:')) {
          const data = line.slice(5).trim()
          if (data !== '' && data !== '[DONE]') {
            let message: JsonRpcReply | null
            try {
              message = JSON.parse(data) as JsonRpcReply
            } catch {
              message = null
            }
          if (message !== null && message.id === id) {
            await reader.cancel().catch(() => undefined)
            if (message.error !== undefined) throw new Error(message.error.message)
            return message.result
          }
          // 服务器主动推送的通知（无 id，如 notifications/tools/list_changed）：路由给监听者
          if (message !== null && message.method !== undefined && message.id === undefined) {
            this.notificationListener?.(message.method, message.params)
          }
          }
        }
        newline = buffer.indexOf('\n')
      }
    }
    throw new Error('MCP SSE：流结束但未收到对应响应')
  }
}
