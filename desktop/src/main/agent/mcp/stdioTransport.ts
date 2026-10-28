import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'

import type { McpServerConfig, McpTransport } from '../../../shared/agent/mcp/types'

/**
 * MCP stdio 传输层：拉起子进程，用**行分隔 JSON-RPC** 通信。
 *
 * 只负责字节流与 id 配对；协议语义（initialize / tools/list / tools/call）在 `McpClient`。
 * 子进程退出/报错时，把所有在途请求 reject，避免调用方永久挂起。
 */

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id?: number
  result?: unknown
  error?: { code: number; message: string }
}

export class StdioMcpTransport implements McpTransport {
  private readonly child: ChildProcessWithoutNullStreams
  private readonly pending = new Map<number, { resolve: (value: unknown) => void; reject: (error: Error) => void }>()
  private nextId = 1
  private buffer = ''
  private closed = false

  constructor(config: McpServerConfig) {
    // 不显式传 stdio：默认即 ['pipe','pipe','pipe']，且类型为 ChildProcessWithoutNullStreams（流非空）
    this.child = spawn(config.command, config.args ?? [], {
      env: { ...process.env, ...(config.env ?? {}) }
    })
    this.child.stdout.setEncoding('utf8')
    this.child.stdout.on('data', (chunk: string) => this.onData(chunk))
    // 服务器 stderr 是其自身日志，不混进协议流
    this.child.stderr.on('data', () => undefined)
    this.child.on('exit', () => this.failAll(new Error('MCP server exited')))
    this.child.on('error', (error) => this.failAll(error))
  }

  request(method: string, params?: unknown): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error('MCP transport closed'))
    const id = this.nextId
    this.nextId += 1
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, ...(params !== undefined ? { params } : {}) })
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject })
      this.child.stdin.write(`${payload}\n`)
    })
  }

  notify(method: string, params?: unknown): void {
    if (this.closed) return
    this.child.stdin.write(`${JSON.stringify({ jsonrpc: '2.0', method, ...(params !== undefined ? { params } : {}) })}\n`)
  }

  close(): void {
    if (this.closed) return
    this.closed = true
    this.failAll(new Error('MCP transport closed'))
    this.child.kill()
  }

  private onData(chunk: string): void {
    this.buffer += chunk
    let newline = this.buffer.indexOf('\n')
    while (newline >= 0) {
      const line = this.buffer.slice(0, newline).trim()
      this.buffer = this.buffer.slice(newline + 1)
      if (line !== '') this.handleLine(line)
      newline = this.buffer.indexOf('\n')
    }
  }

  private handleLine(line: string): void {
    let message: JsonRpcResponse
    try {
      message = JSON.parse(line) as JsonRpcResponse
    } catch {
      return // 非 JSON 行（服务器日志混入）直接忽略
    }
    if (typeof message.id !== 'number') return // 服务器通知，本客户端不消费
    const pending = this.pending.get(message.id)
    if (pending === undefined) return
    this.pending.delete(message.id)
    if (message.error !== undefined) pending.reject(new Error(message.error.message))
    else pending.resolve(message.result)
  }

  private failAll(error: Error): void {
    if (this.closed && this.pending.size === 0) return
    this.closed = true
    for (const pending of this.pending.values()) pending.reject(error)
    this.pending.clear()
  }
}
