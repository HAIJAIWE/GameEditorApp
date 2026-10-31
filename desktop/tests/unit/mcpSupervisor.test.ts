/**
 * MCP 连接监督器单测（Slice 18 监督器）：断线重连 / listChanged 重同步。
 * 通过 `setTransportFactory` 注入假传输层，避免单测真拉子进程。
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { McpManager } from '../../src/main/agent/mcp/manager'
import type { SkillDispatcher } from '../../src/main/agent/execution/dispatcher'
import type { McpTransport } from '../../src/shared/agent/mcp'

/** 可注入的假传输层：能模拟 list_changed 通知与进程断开 */
class SupervisedTransport implements McpTransport {
  readonly requestLog: Array<string> = []
  closed = false
  private readonly handler: (method: string, params?: unknown) => unknown
  private notificationListener?: (method: string, params?: unknown) => void
  private disconnectListener?: (error: Error) => void
  constructor(handler: (method: string, params?: unknown) => unknown) {
    this.handler = handler
  }
  async request(method: string, params?: unknown): Promise<unknown> {
    this.requestLog.push(method)
    return this.handler(method, params)
  }
  notify(): void {
    /* noop */
  }
  close(): void {
    this.closed = true
  }
  onNotification(listener: (method: string, params?: unknown) => void): void {
    this.notificationListener = listener
  }
  onDisconnect(listener: (error: Error) => void): void {
    this.disconnectListener = listener
  }
  emitNotification(method: string): void {
    this.notificationListener?.(method)
  }
  simulateDisconnect(): void {
    this.disconnectListener?.(new Error('killed'))
  }
}

interface FakeDispatcher {
  registered: Set<string>
  unregistered: Set<string>
  register: (skill: { id: string }) => boolean
  unregister: (id: string) => boolean
}

function makeFakeDispatcher(): FakeDispatcher {
  const registered = new Set<string>()
  const unregistered = new Set<string>()
  return {
    registered,
    unregistered,
    register(skill: { id: string }): boolean {
      registered.add(skill.id)
      return true
    },
    unregister(id: string): boolean {
      unregistered.add(id)
      registered.delete(id)
      return true
    }
  }
}

const flush = (): Promise<void> => new Promise((resolve) => setTimeout(resolve, 10))

function defaultHandler(method: string): unknown {
  if (method === 'initialize') return {}
  if (method === 'tools/list') return { tools: [{ name: 'a', description: '', inputSchema: { type: 'object' } }] }
  return {}
}

describe('McpManager 连接监督器', () => {
  let manager: McpManager
  let dispatcher: FakeDispatcher

  beforeEach(() => {
    manager = new McpManager()
    dispatcher = makeFakeDispatcher()
    manager.attach(dispatcher as unknown as SkillDispatcher)
  })

  afterEach(() => {
    manager.close()
  })

  it('连上服务器并注册工具到 dispatcher', async () => {
    const transport = new SupervisedTransport(defaultHandler)
    manager.setTransportFactory(() => transport)
    await manager.connect({ mcpServers: { srv: { command: 'x' } } })
    await flush()
    expect(dispatcher.registered.has('mcp.srv.a')).toBe(true)
    expect(manager.toolCount()).toBe(1)
  })

  it('listChanged 通知触发工具重同步（新增/移除都正确）', async () => {
    let list = { tools: [{ name: 'a', description: '', inputSchema: { type: 'object' } }] }
    const transport = new SupervisedTransport((method) => {
      if (method === 'tools/list') return list
      return {}
    })
    manager.setTransportFactory(() => transport)
    await manager.connect({ mcpServers: { srv: { command: 'x' } } })
    await flush()
    expect(dispatcher.registered.has('mcp.srv.a')).toBe(true)

    // 服务器工具集变成只有 b
    list = { tools: [{ name: 'b', description: '', inputSchema: { type: 'object' } }] }
    transport.emitNotification('notifications/tools/list_changed')
    await flush()

    expect(dispatcher.registered.has('mcp.srv.b')).toBe(true)
    expect(dispatcher.unregistered.has('mcp.srv.a')).toBe(true)
    expect(manager.toolCount()).toBe(1)
  })

  it('进程断开：立即注销工具并安排重连（不立即重连）', async () => {
    const transport = new SupervisedTransport(defaultHandler)
    manager.setTransportFactory(() => transport)
    await manager.connect({ mcpServers: { srv: { command: 'x' } } })
    await flush()
    expect(dispatcher.registered.has('mcp.srv.a')).toBe(true)

    transport.simulateDisconnect()
    // 断开处理是同步的：工具立即失效、从工具面移除
    expect(dispatcher.unregistered.has('mcp.srv.a')).toBe(true)
    expect(manager.toolCount()).toBe(0)
    // 退避后才重连，不应立即再次握手
    expect(transport.requestLog.filter((m) => m === 'initialize').length).toBe(1)
  })

  it('断开后按有界指数退避自动重连', async () => {
    vi.useFakeTimers()
    try {
      const transport = new SupervisedTransport(defaultHandler)
      manager.setTransportFactory(() => transport)
      manager.connect({ mcpServers: { srv: { command: 'x' } } })
      await vi.advanceTimersByTimeAsync(0)
      const initCount = (): number => transport.requestLog.filter((m) => m === 'initialize').length
      expect(initCount()).toBe(1)

      transport.simulateDisconnect()
      // 退避初始 500ms 后应触发第二次握手
      await vi.advanceTimersByTimeAsync(500)
      expect(initCount()).toBe(2)
    } finally {
      vi.useRealTimers()
    }
  })

  it('并发 list_changed 经 syncChain 串行化，不泄漏旧工具', async () => {
    // 第 0 次 tools/list（初始连接）→ [a]；随后两次 list_changed 并发触发，
    // 第 1 次返回 [b]，第 2 次返回 [c]。经 syncChain 串行后交换顺序执行：
    // 先以 [a] 为基准注销 a 注册 b，再以 [b] 为基准注销 b 注册 c。最终只残留 c，无泄漏。
    let call = 0
    const toolsForCall = (): { tools: Array<{ name: string; description: string; inputSchema: object }> } => {
      const t = call++
      const name = t === 0 ? 'a' : t === 1 ? 'b' : 'c'
      return { tools: [{ name, description: '', inputSchema: { type: 'object' } }] }
    }
    const transport = new SupervisedTransport((method) => {
      if (method === 'tools/list') return toolsForCall()
      if (method === 'initialize') return {}
      return {}
    })
    manager.setTransportFactory(() => transport)
    await manager.connect({ mcpServers: { srv: { command: 'x' } } })
    await flush()
    expect(dispatcher.registered.has('mcp.srv.a')).toBe(true)

    transport.emitNotification('notifications/tools/list_changed')
    transport.emitNotification('notifications/tools/list_changed')
    await flush()

    expect(dispatcher.registered.has('mcp.srv.c')).toBe(true)
    expect(dispatcher.unregistered.has('mcp.srv.a')).toBe(true)
    expect(dispatcher.unregistered.has('mcp.srv.b')).toBe(true)
    expect(manager.toolCount()).toBe(1)
  })

  it('声明 resources 能力的服务器注册三个资源技能，断开后一并注销', async () => {
    const transport = new SupervisedTransport((method) => {
      if (method === 'initialize') return { capabilities: { resources: {} } }
      if (method === 'tools/list') return { tools: [{ name: 'a', description: '', inputSchema: { type: 'object' } }] }
      return {}
    })
    manager.setTransportFactory(() => transport)
    await manager.connect({ mcpServers: { srv: { command: 'x' } } })
    await flush()
    expect(dispatcher.registered.has('mcp.srv.list_resources')).toBe(true)
    expect(dispatcher.registered.has('mcp.srv.list_resource_templates')).toBe(true)
    expect(dispatcher.registered.has('mcp.srv.read_resource')).toBe(true)

    transport.simulateDisconnect()
    expect(dispatcher.unregistered.has('mcp.srv.list_resources')).toBe(true)
    expect(dispatcher.unregistered.has('mcp.srv.read_resource')).toBe(true)
  })

  it('未声明 resources 能力的服务器不注册资源技能', async () => {
    const transport = new SupervisedTransport((method) => {
      if (method === 'initialize') return { capabilities: {} }
      if (method === 'tools/list') return { tools: [{ name: 'a', description: '', inputSchema: { type: 'object' } }] }
      return {}
    })
    manager.setTransportFactory(() => transport)
    await manager.connect({ mcpServers: { srv: { command: 'x' } } })
    await flush()
    expect(dispatcher.registered.has('mcp.srv.list_resources')).toBe(false)
    expect(dispatcher.registered.has('mcp.srv.read_resource')).toBe(false)
  })
})
