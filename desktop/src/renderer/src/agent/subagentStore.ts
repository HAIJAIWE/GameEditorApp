import type { DigitalSubagent } from '../../../shared/agent/panel'
import type { BrainEvent } from '../../../shared/agent/brain/types'

/**
 * 子智能体共享 store（agent-team 插件 / 后续可复用）。
 *
 * 单一数据源：与右侧智能体面板（DigitalPanel）订阅**同一条** `agent:event` 事件流，
 * 自己维护一份 `DigitalSubagent[]`（running/done/failed）。独立订阅、不改动 DigitalPanel，
 * 因此不会动摇既有子智能体 UI 与 e2e 锚点（`digital-subagents`）。
 */

interface AgentEventApi {
  onEvent(handler: (event: unknown) => void): () => void
  subagentStop(req: { id: string }): Promise<{ ok: boolean }>
}

function getAgentApi(): AgentEventApi | undefined {
  const mbApi = (window as unknown as { mbApi?: { agent?: AgentEventApi } }).mbApi
  return mbApi?.agent
}

/**
 * 纯函数归约：把一条子智能体事件应用到列表。
 * - `subagent_started`：新增 running 条目（已存在则幂等返回原列表）；
 * - `subagent_done`：把对应 id 的状态翻成 done/failed 并写入结果文本；
 * - 其它事件：原样返回（引用不变，便于 `useSyncExternalStore` 稳定快照）。
 */
export function reduceSubagents(prev: DigitalSubagent[], event: BrainEvent): DigitalSubagent[] {
  if (event.type === 'subagent_started') {
    if (prev.some((item) => item.id === event.id)) return prev
    return [...prev, { id: event.id, task: event.task, status: 'running' }]
  }
  if (event.type === 'subagent_done') {
    return prev.map((item) =>
      item.id === event.id ? { ...item, status: event.success ? 'done' : 'failed', result: event.text } : item
    )
  }
  return prev
}

let subagents: DigitalSubagent[] = []
const listeners = new Set<() => void>()
let started = false

function emit(): void {
  for (const listener of listeners) listener()
}

function ensureStarted(): void {
  if (started) return
  const api = getAgentApi()
  if (api === undefined) return
  started = true
  api.onEvent((payload) => {
    subagents = reduceSubagents(subagents, payload as BrainEvent)
    emit()
  })
}

/** 订阅子智能体列表变化（自动启动底层事件订阅，幂等）。返回取消订阅函数。 */
export function subscribeSubagents(callback: () => void): () => void {
  ensureStarted()
  listeners.add(callback)
  return () => {
    listeners.delete(callback)
  }
}

/** `useSyncExternalStore` 的快照读取：引用仅在变化时更新。 */
export function getSubagentsSnapshot(): DigitalSubagent[] {
  return subagents
}

/** 停止某个运行中的子智能体（经 `agent:subagentStop` IPC，不牵连父循环）。 */
export async function stopSubagent(id: string): Promise<void> {
  await getAgentApi()?.subagentStop({ id })
}
