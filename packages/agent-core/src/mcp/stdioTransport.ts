import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process'

import type { McpRequestOptions, McpTransport, StdioServerConfig } from '@mobai/shared/agent/mcp'

/**
 * MCP stdio 传输层：拉起子进程，用**行分隔 JSON-RPC** 通信。
 *
 * 只负责字节流与 id 配对；协议语义（initialize / tools/list / tools/call）在 `McpClient`。
 * 子进程退出/报错时，把所有在途请求 reject，避免调用方永久挂起。
 */

/**
 * 凭证形环境变量键（子进程继承前剥离），对齐 dsh 的 `scrubbedParentEnv()`。
 * 保守匹配、误删风险低：云厂商前缀 + 常见密钥/令牌后缀。dsh 也是「剥离凭证形 + 陈旧 DSH_* 名」后再把配置 env 叠加上去。
 */
const SECRET_ENV_PATTERN =
  /^(?:AWS_|GCP_|AZURE_|DSH_|KUBE_|VAULT_)|(?:API[_-]?KEY|PRIVATE[_-]?KEY|SECRET|PASSWORD|PASSWD|TOKEN|CREDENTIAL|ACCESS[_-]?KEY)/i

/** 继承当前进程环境，但剥离凭证形键，避免把宿主机的密钥泄漏给 MCP 子进程；配置 env 后续再叠加其上 */
function scrubChildEnv(): Record<string, string> {
  const out: Record<string, string> = {}
  for (const [key, value] of Object.entries(process.env)) {
    if (value === undefined) continue
    if (SECRET_ENV_PATTERN.test(key)) continue
    out[key] = value
  }
  return out
}

interface JsonRpcResponse {
  jsonrpc: '2.0'
  id?: number
  result?: unknown
  error?: { code: number; message: string }
}

interface Pending {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  /** 清理本次请求挂着的定时器 / abort 监听，避免泄漏 */
  cleanup: () => void
}

export class StdioMcpTransport implements McpTransport {
  private readonly child: ChildProcessWithoutNullStreams
  private readonly pending = new Map<number, Pending>()
  private nextId = 1
  private buffer = ''
  private closed = false
  private notificationListener?: (method: string, params?: unknown) => void
  private disconnectListener?: (error: Error) => void

  constructor(config: StdioServerConfig) {
    // 不显式传 stdio：默认即 ['pipe','pipe','pipe']，且类型为 ChildProcessWithoutNullStreams（流非空）
    this.child = spawn(config.command, config.args ?? [], {
      // 继承（已剥离凭证）环境 + 叠加服务器配置 env（对齐 dsh：scrubbedParentEnv 之上再 merge 配置 env）
      env: { ...scrubChildEnv(), ...(config.env ?? {}) }
    })
    this.child.stdout.setEncoding('utf8')
    this.child.stdout.on('data', (chunk: string) => this.onData(chunk))
    // 服务器 stderr 是其自身日志，不混进协议流
    this.child.stderr.on('data', () => undefined)
    this.child.on('exit', () => this.failAll(new Error('MCP server exited')))
    this.child.on('error', (error) => this.failAll(error))
  }

  request(method: string, params?: unknown, options?: McpRequestOptions): Promise<unknown> {
    if (this.closed) return Promise.reject(new Error('MCP transport closed'))
    const id = this.nextId
    this.nextId += 1
    const payload = JSON.stringify({ jsonrpc: '2.0', id, method, ...(params !== undefined ? { params } : {}) })
    return new Promise((resolve, reject) => {
      let timer: ReturnType<typeof setTimeout> | undefined
      const clearTimer = (): void => {
        if (timer !== undefined) {
          clearTimeout(timer)
          timer = undefined
        }
      }
      const onAbort = (): void => {
        this.pending.delete(id)
        clearTimer()
        reject(new Error('MCP 调用被中断'))
      }
      let removeAbort: (() => void) | undefined
      if (options?.signal !== undefined) {
        const signal = options.signal
        if (signal.aborted) onAbort()
        else {
          signal.addEventListener('abort', onAbort, { once: true })
          removeAbort = () => signal.removeEventListener('abort', onAbort)
        }
      }
      if (options?.timeoutMs !== undefined) {
        timer = setTimeout(() => {
          this.pending.delete(id)
          if (removeAbort !== undefined) removeAbort()
          reject(new Error(`MCP 调用超时（${options.timeoutMs}ms）`))
        }, options.timeoutMs)
      }
      this.pending.set(id, {
        resolve: (value) => {
          clearTimer()
          if (removeAbort !== undefined) removeAbort()
          resolve(value)
        },
        reject: (error) => {
          clearTimer()
          if (removeAbort !== undefined) removeAbort()
          reject(error)
        },
        cleanup: () => {
          clearTimer()
          if (removeAbort !== undefined) removeAbort()
        }
      })
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

  onNotification(listener: (method: string, params?: unknown) => void): void {
    this.notificationListener = listener
  }

  onDisconnect(listener: (error: Error) => void): void {
    this.disconnectListener = listener
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
    if (typeof message.id !== 'number') {
      // 服务器通知（无 id，如 notifications/tools/list_changed）：路由给监听者
      if (this.notificationListener !== undefined) {
        const note = message as unknown as { method?: unknown; params?: unknown }
        if (typeof note.method === 'string') this.notificationListener(note.method, note.params)
      }
      return
    }
    const pending = this.pending.get(message.id)
    if (pending === undefined) return
    this.pending.delete(message.id)
    pending.cleanup()
    if (message.error !== undefined) pending.reject(new Error(message.error.message))
    else pending.resolve(message.result)
  }

  private failAll(error: Error): void {
    if (this.closed && this.pending.size === 0) return
    const wasClosed = this.closed
    this.closed = true
    for (const pending of this.pending.values()) {
      pending.cleanup()
      pending.reject(error)
    }
    this.pending.clear()
    // 仅当是真实断开（exit/error 触发）而非我们主动 close 时，才通知上层重连
    if (!wasClosed && this.disconnectListener !== undefined) this.disconnectListener(error)
  }
}
