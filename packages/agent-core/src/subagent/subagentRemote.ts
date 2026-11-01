/**
 * 远程子智能体 provider（Slice 33）。
 *
 * 把子任务 POST 给一个 HTTP 服务（自建/第三方 agent 服务），取回 `{ text }` 作为结果。
 * 与 CLI provider 同属 `SubAgentProvider` 的实现——主循环零改动即可接入。
 *
 * 约定（最小契约）：
 * - 请求：`POST {url}`，JSON `{ task, depth }`，可带自定义 `headers`（如鉴权）；
 * - 响应：JSON `{ text: string }`（缺失时退化为整个 JSON 的字符串）；
 * - 非 2xx → `success:false`；超时/取消 → abort。
 *
 * 安全：远程服务在自己的环境里跑，本进程的沙箱策略管不到它；是否允许使用由调用方决定。
 */

import type { SubAgentOutcome, SubAgentProvider, SubAgentTask } from '@mobai/shared/agent/brain'

export interface RemoteSubAgentOptions {
  /** provider 名称（默认 `remote`） */
  id?: string
  /** 服务地址（完整 URL） */
  url: string
  /** 额外请求头（如 Authorization） */
  headers?: Record<string, string>
  /** 超时（毫秒，默认 120000） */
  timeoutMs?: number
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

export function createRemoteSubAgentProvider(options: RemoteSubAgentOptions): SubAgentProvider {
  const id = options.id ?? 'remote'
  const timeoutMs = options.timeoutMs ?? 120_000

  return {
    id,
    run: async (task: SubAgentTask): Promise<SubAgentOutcome> => {
      if (task.signal.aborted) return { text: '远程子智能体已取消', success: false }

      const controller = new AbortController()
      const onAbort = (): void => controller.abort()
      task.signal.addEventListener('abort', onAbort, { once: true })
      const timer = setTimeout(() => controller.abort(), timeoutMs)

      try {
        const response = await fetch(options.url, {
          method: 'POST',
          headers: { 'content-type': 'application/json', ...(options.headers ?? {}) },
          body: JSON.stringify({ task: task.task, depth: task.depth }),
          signal: controller.signal
        })
        if (!response.ok) {
          return { text: `远程子智能体失败：HTTP ${response.status}`, success: false }
        }
        const payload: unknown = await response.json().catch(() => null)
        const text =
          payload !== null && typeof payload === 'object' && typeof (payload as { text?: unknown }).text === 'string'
            ? (payload as { text: string }).text
            : JSON.stringify(payload)
        return { text, success: true }
      } catch (error) {
        return { text: `远程子智能体失败：${errorText(error)}`, success: false }
      } finally {
        clearTimeout(timer)
        task.signal.removeEventListener('abort', onAbort)
      }
    }
  }
}
