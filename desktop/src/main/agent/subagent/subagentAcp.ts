/**
 * ACP（Agent Client Protocol）子智能体 provider（Slice 36）。
 *
 * 按 ACP v1 规范（JSON-RPC 2.0 + 换行分帧 ndjson）驱动一个**进程外** ACP agent：
 *   initialize → session/new → session/prompt
 * 期间接收 `session/update` 通知（`agent_message_chunk` 累积最终答案），
 * 自动应答 `session/request_permission`（默认拒绝；`allow` 选第一个 allow_once/allow_always）。
 *
 * 与 CLI provider 的区别：CLI 只是「跑命令取 stdout」；ACP 是**有状态的协议**——
 * 有会话 id、流式更新、权限协商、取消通知。
 *
 * 诚实边界：子 agent 在自己的进程/模型/工具里跑，父级能力约束不跨界；
 * `read-only` 沙箱下直接拒绝（本 provider 不做 OS 级文件限制）。
 */

import { spawn } from 'node:child_process'

import type { SubAgentOutcome, SubAgentProvider, SubAgentTask } from '../../../shared/agent/brain'

const DEFAULT_PROTOCOL_VERSION = 1
const DEFAULT_TIMEOUT_MS = 300_000

export interface AcpSubAgentOptions {
  /** provider 名称（默认 `acp`） */
  id?: string
  /** ACP agent 可执行文件（必填） */
  command: string
  /** 命令参数 */
  args?: string[]
  /** 子进程 & ACP 会话工作目录（绝对路径） */
  cwd?: string
  /** 额外环境变量 */
  env?: Record<string, string>
  /** 权限策略：`reject`（默认，全部拒绝）/ `allow`（选第一个允许项） */
  permission?: 'reject' | 'allow'
  /** 整体超时（毫秒，默认 300000） */
  timeoutMs?: number
  /** ACP 协议版本（默认 1） */
  protocolVersion?: number
}

interface RpcPending {
  resolve: (value: unknown) => void
  reject: (error: Error) => void
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createAcpSubAgentProvider(options: AcpSubAgentOptions): SubAgentProvider {
  const id = options.id ?? 'acp'
  const permission = options.permission ?? 'reject'
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS
  const protocolVersion = options.protocolVersion ?? DEFAULT_PROTOCOL_VERSION

  return {
    id,
    run: (task: SubAgentTask): Promise<SubAgentOutcome> => {
      if (task.sandboxPolicy === 'read-only') {
        return Promise.resolve({
          text: '[STOP] 沙箱策略 read-only：不运行外部 ACP 子智能体（可能写文件）',
          success: false
        })
      }
      if (task.signal.aborted) return Promise.resolve({ text: 'ACP 子智能体已取消', success: false })

      return new Promise<SubAgentOutcome>((resolve) => {
        let child: ReturnType<typeof spawn>
        try {
          child = spawn(options.command, [...(options.args ?? [])], {
            ...(options.cwd !== undefined ? { cwd: options.cwd } : {}),
            env: { ...process.env, ...(options.env ?? {}) },
            shell: false,
            stdio: ['pipe', 'pipe', 'pipe']
          })
        } catch (error) {
          resolve({ text: `ACP 子智能体启动失败：${errorText(error)}`, success: false })
          return
        }

        let settled = false
        let nextId = 1
        let buffer = ''
        let stderr = ''
        let sessionId: string | undefined
        const chunks: string[] = []
        const pending = new Map<number, RpcPending>()
        const timerRef: { current: ReturnType<typeof setTimeout> | undefined } = { current: undefined }

        const write = (message: unknown): void => {
          try {
            child.stdin?.write(`${JSON.stringify(message)}\n`)
          } catch {
            /* 子进程已退出 */
          }
        }

        const finish = (outcome: SubAgentOutcome): void => {
          if (settled) return
          settled = true
          if (timerRef.current !== undefined) clearTimeout(timerRef.current)
          task.signal.removeEventListener('abort', onAbort)
          for (const entry of pending.values()) entry.reject(new Error('ACP 子智能体已结束'))
          pending.clear()
          try {
            child.kill('SIGTERM')
          } catch {
            /* 已退出 */
          }
          resolve(outcome)
        }

        const onAbort = (): void => {
          if (sessionId !== undefined) write({ jsonrpc: '2.0', method: 'session/cancel', params: { sessionId } })
          finish({ text: 'ACP 子智能体已取消', success: false })
        }

        const send = (method: string, params: unknown): Promise<unknown> => {
          const requestId = nextId++
          return new Promise<unknown>((res, rej) => {
            pending.set(requestId, { resolve: res, reject: rej })
            write({ jsonrpc: '2.0', id: requestId, method, params })
          })
        }

        const handleMessage = (message: Record<string, unknown>): void => {
          // 响应（有 id 且有 result/error）
          if (typeof message.id === 'number' && (message.result !== undefined || message.error !== undefined)) {
            const entry = pending.get(message.id)
            if (entry === undefined) return
            pending.delete(message.id)
            if (message.error !== undefined) entry.reject(new Error(JSON.stringify(message.error)))
            else entry.resolve(message.result)
            return
          }
          const method = message.method
          if (typeof method !== 'string') return
          const params = message.params as Record<string, unknown> | undefined

          // agent → client 的请求：自动应答权限
          if (message.id !== undefined) {
            if (method === 'session/request_permission') {
              const allow =
                permission === 'allow' && Array.isArray(params?.options)
                  ? (params.options as Array<{ optionId?: unknown; kind?: unknown }>).find(
                      (option) => option.kind === 'allow_once' || option.kind === 'allow_always'
                    )
                  : undefined
              write({
                jsonrpc: '2.0',
                id: message.id,
                result: {
                  outcome: allow !== undefined ? { outcome: 'selected', optionId: allow.optionId } : { outcome: 'cancelled' }
                }
              })
            } else {
              write({ jsonrpc: '2.0', id: message.id, error: { code: -32601, message: `unsupported: ${method}` } })
            }
            return
          }

          // 通知：累积 agent 文本
          if (method === 'session/update' && params !== undefined) {
            const update = params.update as Record<string, unknown> | undefined
            if (update?.sessionUpdate === 'agent_message_chunk') {
              const content = update.content as Record<string, unknown> | undefined
              if (content?.type === 'text' && typeof content.text === 'string') chunks.push(content.text)
            }
          }
        }

        const onLine = (line: string): void => {
          if (line.trim() === '') return
          let parsed: unknown
          try {
            parsed = JSON.parse(line)
          } catch {
            return // 非 JSON 行忽略
          }
          if (parsed !== null && typeof parsed === 'object') handleMessage(parsed as Record<string, unknown>)
        }

        child.stdout?.setEncoding('utf8')
        child.stdout?.on('data', (chunk: string) => {
          buffer += chunk
          let index = buffer.indexOf('\n')
          while (index >= 0) {
            onLine(buffer.slice(0, index))
            buffer = buffer.slice(index + 1)
            index = buffer.indexOf('\n')
          }
        })
        child.stderr?.setEncoding('utf8')
        child.stderr?.on('data', (chunk: string) => {
          stderr += chunk
        })
        child.on('error', (error: Error) => finish({ text: `ACP 子智能体启动失败：${error.message}`, success: false }))
        child.on('close', (code: number | null) => {
          const tail = stderr.trim()
          finish({
            text: `ACP 子智能体提前退出（退出码 ${code ?? 'null'}）${tail !== '' ? `：${tail}` : ''}`,
            success: false
          })
        })

        task.signal.addEventListener('abort', onAbort, { once: true })
        timerRef.current = setTimeout(() => {
          finish({ text: `ACP 子智能体超时（${timeoutMs}ms）`, success: false })
        }, timeoutMs)

        void (async (): Promise<void> => {
          try {
            await send('initialize', { protocolVersion, clientCapabilities: {} })
            const session = (await send('session/new', {
              cwd: options.cwd ?? process.cwd(),
              mcpServers: []
            })) as { sessionId?: unknown }
            if (typeof session?.sessionId !== 'string') throw new Error('ACP 子智能体未返回 sessionId')
            sessionId = session.sessionId
            const result = (await send('session/prompt', {
              sessionId,
              prompt: [{ type: 'text', text: task.task }]
            })) as { stopReason?: unknown }
            const stopReason = typeof result?.stopReason === 'string' ? result.stopReason : 'unknown'
            const text = chunks.join('').trim()
            finish({
              text: text !== '' ? text : `ACP 子智能体无输出（stopReason=${stopReason}）`,
              success: stopReason === 'end_turn'
            })
          } catch (error) {
            finish({ text: `ACP 子智能体失败：${errorText(error)}`, success: false })
          }
        })()
      })
    }
  }
}
