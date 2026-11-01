/**
 * 最小 LSP stdio 客户端（对齐 dsh `lsp-stdio` 的可用子集）。
 *
 * 生命周期是**每次调用一次性**：spawn 服务器 → `initialize` → `initialized` → 调用方
 * `didOpen` + 请求 → `shutdown`/`exit` → kill。不做常驻/缓存（v1 求正确，牺牲启动开销）。
 *
 * 只做**只读导航**：服务器→客户端的请求（如 `workspace/configuration`、`client/registerCapability`）
 * 一律回 `null`，不实现写/编辑能力。
 */

import { spawn, type ChildProcess } from 'node:child_process'
import { pathToFileURL } from 'node:url'

import { encodeLspMessage, LspMessageReader } from './framing'

/** 语言服务器启动命令 */
export interface LspServerSpec {
  command: string
  args: string[]
}

interface PendingEntry {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
  timer: ReturnType<typeof setTimeout>
}

interface JsonRpcMessage {
  id?: unknown
  method?: unknown
  result?: unknown
  error?: unknown
}

export class LspClient {
  private child: ChildProcess | null = null
  private readonly reader: LspMessageReader
  private readonly pending = new Map<number, PendingEntry>()
  private nextId = 1
  private stderr = ''
  private closed = false

  constructor(
    private readonly spec: LspServerSpec,
    private readonly rootPath: string
  ) {
    this.reader = new LspMessageReader((message) => this.handleMessage(message))
  }

  /** 服务器 stderr（诊断用） */
  stderrText(): string {
    return this.stderr
  }

  private handleMessage(raw: unknown): void {
    if (raw === null || typeof raw !== 'object') return
    const message = raw as JsonRpcMessage
    // 响应：有数字 id 且无 method
    if (typeof message.id === 'number' && message.method === undefined) {
      const entry = this.pending.get(message.id)
      if (entry === undefined) return
      this.pending.delete(message.id)
      clearTimeout(entry.timer)
      if (message.error !== undefined) entry.reject(new Error(JSON.stringify(message.error)))
      else entry.resolve(message.result)
      return
    }
    // 服务器→客户端请求：只读导航不需要，回 null 让服务器继续
    if (typeof message.id === 'number' && typeof message.method === 'string') {
      this.write({ jsonrpc: '2.0', id: message.id, result: null })
    }
  }

  private write(message: unknown): void {
    if (this.closed) return
    this.child?.stdin?.write(encodeLspMessage(message))
  }

  /** 启动服务器并完成 initialize 握手 */
  async start(timeoutMs: number): Promise<void> {
    const child = spawn(this.spec.command, this.spec.args, { windowsHide: true })
    this.child = child
    child.stdout?.on('data', (chunk: Buffer) => this.reader.push(chunk))
    child.stderr?.on('data', (chunk: Buffer) => {
      this.stderr += chunk.toString('utf8')
    })
    child.on('exit', () => {
      this.closed = true
      for (const [, entry] of this.pending) {
        clearTimeout(entry.timer)
        entry.reject(new Error('语言服务器已退出'))
      }
      this.pending.clear()
    })
    child.on('error', (error: Error) => {
      this.closed = true
      for (const [, entry] of this.pending) {
        clearTimeout(entry.timer)
        entry.reject(error)
      }
      this.pending.clear()
    })

    const rootUri = pathToFileURL(this.rootPath).toString()
    await this.request(
      'initialize',
      {
        processId: process.pid,
        rootUri,
        capabilities: {},
        workspaceFolders: [{ uri: rootUri, name: 'workspace' }]
      },
      timeoutMs
    )
    this.notify('initialized', {})
  }

  /** 发请求并等响应（带超时） */
  request(method: string, params: unknown, timeoutMs: number): Promise<unknown> {
    return new Promise((resolve, reject) => {
      const id = this.nextId++
      const timer = setTimeout(() => {
        this.pending.delete(id)
        reject(new Error(`LSP 请求超时（${method}）`))
      }, timeoutMs)
      this.pending.set(id, { resolve, reject, timer })
      this.write({ jsonrpc: '2.0', id, method, params })
    })
  }

  /** 发通知（无响应） */
  notify(method: string, params: unknown): void {
    this.write({ jsonrpc: '2.0', method, params })
  }

  /** 优雅关闭：shutdown → exit → kill（尽力而为，不抛） */
  async stop(): Promise<void> {
    if (this.closed) return
    try {
      await this.request('shutdown', null, 1000)
    } catch {
      // 忽略
    }
    this.notify('exit', null)
    this.closed = true
    this.child?.kill()
    this.child = null
  }
}
