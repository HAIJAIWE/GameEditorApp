/**
 * MCP 接入（Slice 18）纯逻辑单测：配置解析 / 工具→技能桥 / 协议客户端（假传输层）。
 * 传输层（stdio 子进程）不在此测——它只做字节流，协议语义在 client 里已覆盖。
 */
import { describe, expect, it } from 'vitest'

import { mcpToolId, mcpToolRisk, mcpToolToSkill } from '@mobai/shared/agent/mcp'
import { McpClient } from '@mobai/shared/agent/mcp'
import { parseMcpConfig } from '@mobai/shared/agent/mcp'
import type { McpRequestOptions, McpTransport } from '@mobai/shared/agent/mcp'
import { StdioMcpTransport } from '../../src/main/agent/mcp/stdioTransport'
import { RISK_LEVEL, clearDynamicToolRisk, resolveRiskLevel, setDynamicToolRisk } from '@mobai/shared/agent/config'

/* ------------------------------- 配置解析 ------------------------------- */

describe('parseMcpConfig', () => {
  it('解析合法服务器，跳过缺 command 的项', () => {
    const config = parseMcpConfig({
      mcpServers: {
        fs: { command: 'npx', args: ['-y', '@modelcontextprotocol/server-filesystem'], env: { ROOT: '/tmp' } },
        broken: { args: ['x'] },
        alsoBroken: 'nope'
      }
    })
    expect(Object.keys(config.mcpServers)).toEqual(['fs'])
    expect(config.mcpServers.fs.command).toBe('npx')
    expect(config.mcpServers.fs.args).toEqual(['-y', '@modelcontextprotocol/server-filesystem'])
    expect(config.mcpServers.fs.env).toEqual({ ROOT: '/tmp' })
  })

  it('非对象 / 缺 mcpServers 返回空配置', () => {
    expect(parseMcpConfig(null).mcpServers).toEqual({})
    expect(parseMcpConfig({}).mcpServers).toEqual({})
    expect(parseMcpConfig('x').mcpServers).toEqual({})
  })

  it('支持 streamable-http（url + headers）', () => {
    const config = parseMcpConfig({
      mcpServers: {
        context7: {
          url: 'https://mcp.context7.com/mcp',
          headers: { Accept: 'application/json, text/event-stream' }
        }
      }
    })
    expect(config.mcpServers.context7.url).toBe('https://mcp.context7.com/mcp')
    expect(config.mcpServers.context7.headers).toEqual({ Accept: 'application/json, text/event-stream' })
    // http 项没有 command，合法
    expect(config.mcpServers.context7.command).toBeUndefined()
  })

  it('顶层 maxTools：正整数才生效', () => {
    expect(parseMcpConfig({ mcpServers: {}, maxTools: 24 }).maxTools).toBe(24)
    expect(parseMcpConfig({ mcpServers: {}, maxTools: 0 }).maxTools).toBeUndefined()
    expect(parseMcpConfig({ mcpServers: {}, maxTools: -3 }).maxTools).toBeUndefined()
    expect(parseMcpConfig({ mcpServers: {}, maxTools: 'x' }).maxTools).toBeUndefined()
  })
})

/* ------------------------------ 工具→技能桥 ------------------------------ */

describe('mcpToolToSkill', () => {
  const tool = {
    server: 'fs',
    name: 'read_file',
    description: '读取文件内容',
    inputSchema: { type: 'object' as const, properties: { path: { type: 'string' } }, required: ['path'] }
  }

  it('id 前缀 + schema 复用 + execute 调 callTool 并映射文本', async () => {
    const calls: Array<[string, string, Record<string, unknown>]> = []
    const skill = mcpToolToSkill(tool, async (server, name, args) => {
      calls.push([server, name, args])
      return { content: [{ type: 'text', text: 'hello' }] }
    })

    expect(skill.id).toBe('mcp.fs.read_file')
    expect(mcpToolId('fs', 'read_file')).toBe('mcp.fs.read_file')
    expect(skill.parametersSchema).toBe(tool.inputSchema)

    const result = await skill.execute({ path: '/a.txt' }, {})
    expect(calls).toEqual([['fs', 'read_file', { path: '/a.txt' }]])
    expect(result).toMatchObject({ success: true, message: 'hello' })
  })

  it('MCP isError → success=false', async () => {
    const skill = mcpToolToSkill(tool, async () => ({ content: [{ type: 'text', text: 'boom' }], isError: true }))
    const result = await skill.execute({}, {})
    expect(result.success).toBe(false)
    expect(result.message).toBe('boom')
  })

  it('callTool 抛错 → 收敛为 success=false（不抛给 Brain 循环）', async () => {
    const skill = mcpToolToSkill(tool, async () => {
      throw new Error('server down')
    })
    const result = await skill.execute({}, {})
    expect(result.success).toBe(false)
    expect(result.message).toContain('MCP 工具调用失败')
    expect(result.error).toBe('server down')
  })
})

/* ------------------------------ 协议客户端 ------------------------------ */

class FakeTransport implements McpTransport {
  readonly requests: Array<{ method: string; params?: unknown; options?: McpRequestOptions }> = []
  readonly notifications: Array<{ method: string; params?: unknown }> = []
  constructor(private readonly handler: (method: string, params?: unknown) => unknown) {}
  async request(method: string, params?: unknown, options?: McpRequestOptions): Promise<unknown> {
    this.requests.push({ method, params, options })
    return this.handler(method, params)
  }
  notify(method: string, params?: unknown): void {
    this.notifications.push({ method, params })
  }
  close(): void {
    /* noop */
  }
}

describe('McpClient', () => {
  it('initialize 发 initialize 请求 + initialized 通知', async () => {
    const transport = new FakeTransport(() => ({}))
    const client = new McpClient('fs', transport)
    await client.initialize()
    expect(transport.requests[0]?.method).toBe('initialize')
    expect(transport.notifications[0]?.method).toBe('notifications/initialized')
  })

  it('listTools 解析工具，跳过无名项', async () => {
    const transport = new FakeTransport(() => ({
      tools: [
        { name: 'read_file', description: '读', inputSchema: { type: 'object', properties: { path: { type: 'string' } } } },
        { description: '无名字' }
      ]
    }))
    const client = new McpClient('fs', transport)
    const tools = await client.listTools()
    expect(tools).toHaveLength(1)
    expect(tools[0]).toMatchObject({ server: 'fs', name: 'read_file', description: '读' })
    expect(tools[0]?.inputSchema.type).toBe('object')
  })

  it('callTool 透传 name/arguments 并归一结果', async () => {
    const transport = new FakeTransport((method) => {
      if (method === 'tools/call') return { content: [{ type: 'text', text: 'ok' }] }
      return {}
    })
    const client = new McpClient('fs', transport)
    const result = await client.callTool('read_file', { path: '/a' })
    expect(result).toEqual({ content: [{ type: 'text', text: 'ok' }], isError: false })
    const call = transport.requests.find((request) => request.method === 'tools/call')
    expect(call?.params).toEqual({ name: 'read_file', arguments: { path: '/a' } })
  })

  it('callTool 把默认 60s 超时透传给传输层', async () => {
    const transport = new FakeTransport(() => ({ content: [] }))
    const client = new McpClient('fs', transport)
    await client.callTool('read_file', {})
    const call = transport.requests.find((request) => request.method === 'tools/call')
    expect(call?.options?.timeoutMs).toBe(60_000)
  })

  it('callTool 超时（传输层不响应时 reject 而非永久挂起）', async () => {
    // 永不 resolve 的传输层，配合构造时覆写的短超时，验证客户端不会无限挂起
    const hanging: McpTransport = {
      request: () => new Promise<unknown>(() => undefined),
      notify: () => undefined,
      close: () => undefined
    }
    const client = new McpClient('fs', hanging, 40)
    await expect(client.callTool('read_file', {})).rejects.toThrow(/超时/)
  })

  it('initialize 取回 capabilities，hasResources 反映 resources 能力门控', async () => {
    const withRes = new FakeTransport(() => ({ capabilities: { resources: {} } }))
    const c1 = new McpClient('fs', withRes)
    const r1 = await c1.initialize()
    expect(r1.instructions).toBeUndefined()
    expect(r1.capabilities).toEqual({ resources: {} })
    expect(c1.hasResources()).toBe(true)

    const noRes = new FakeTransport(() => ({ capabilities: {} }))
    const c2 = new McpClient('fs', noRes)
    await c2.initialize()
    expect(c2.hasResources()).toBe(false)
  })

  it('listResources 转发 resources/list 并解析，携带逐调用超时', async () => {
    const transport = new FakeTransport((method) => {
      if (method === 'resources/list') return { resources: [{ uri: 'file:///a', name: 'A' }], nextCursor: 'c1' }
      return {}
    })
    const client = new McpClient('fs', transport, 1000)
    const res = await client.listResources()
    expect(res).toEqual({ resources: [{ uri: 'file:///a', name: 'A' }], nextCursor: 'c1' })
    const req = transport.requests.find((request) => request.method === 'resources/list')
    expect(req?.params).toBeUndefined()
    expect(req?.options?.timeoutMs).toBe(1000)
  })

  it('listResourceTemplates 转发 resources/templates/list', async () => {
    const transport = new FakeTransport((method) => {
      if (method === 'resources/templates/list') {
        return { resourceTemplates: [{ uriTemplate: 'file:///{p}', name: 'T' }] }
      }
      return {}
    })
    const client = new McpClient('fs', transport)
    const res = await client.listResourceTemplates()
    expect(res.resourceTemplates).toEqual([{ uriTemplate: 'file:///{p}', name: 'T' }])
  })

  it('readResource 转发 resources/read，blob 原样保留', async () => {
    const transport = new FakeTransport((method) => {
      if (method === 'resources/read') return { contents: [{ uri: 'u', mimeType: 'image/png', blob: 'BASE64' }] }
      return {}
    })
    const client = new McpClient('fs', transport)
    const res = await client.readResource('u')
    expect(res.contents).toEqual([{ uri: 'u', mimeType: 'image/png', blob: 'BASE64' }])
    const req = transport.requests.find((request) => request.method === 'resources/read')
    expect(req?.params).toEqual({ uri: 'u' })
  })

  it('listResources 畸形返回（资源项缺 uri）抛错 fail-closed', async () => {
    const transport = new FakeTransport(() => ({ resources: [{ name: 'no-uri' }] }))
    const client = new McpClient('fs', transport)
    await expect(client.listResources()).rejects.toThrow(/uri/)
  })
})

/* ------------------------------ 传输层超时 ------------------------------ */

describe('StdioMcpTransport 超时', () => {
  it('服务器不响应时 request 按超时 reject（不永久挂起），并回收子进程', async () => {
    // 拉起一个只保持 stdin 打开、永不输出 JSON-RPC 响应的 node 进程
    const transport = new StdioMcpTransport({ command: 'node', args: ['-e', 'process.stdin.resume()'] })
    try {
      await expect(
        transport.request('tools/call', { name: 'x' }, { timeoutMs: 50 })
      ).rejects.toThrow(/超时/)
    } finally {
      transport.close()
    }
  })
})

/* ------------------------------ 风险分级 ------------------------------ */

describe('MCP 工具风险分级（Slice 20）', () => {
  it('mcpToolRisk：显式配置优先于启发式', () => {
    expect(mcpToolRisk('anything', 'system')).toBe(RISK_LEVEL.SYSTEM)
    expect(mcpToolRisk('read_file', 'system')).toBe(RISK_LEVEL.SYSTEM)
    expect(mcpToolRisk('shell_exec', 'read')).toBe(RISK_LEVEL.READ_ONLY)
  })

  it('mcpToolRisk：按工具名启发式', () => {
    expect(mcpToolRisk('shell_exec')).toBe(RISK_LEVEL.SYSTEM)
    expect(mcpToolRisk('write_file')).toBe(RISK_LEVEL.SYSTEM)
    expect(mcpToolRisk('delete_record')).toBe(RISK_LEVEL.SYSTEM)
    expect(mcpToolRisk('read_file')).toBe(RISK_LEVEL.READ_ONLY)
    expect(mcpToolRisk('list_items')).toBe(RISK_LEVEL.READ_ONLY)
    expect(mcpToolRisk('update_record')).toBe(RISK_LEVEL.DATA_WRITE)
  })

  it('动态风险表优先于静态表，可清除回退', () => {
    setDynamicToolRisk('mcp.fs.read_file', RISK_LEVEL.SYSTEM)
    expect(resolveRiskLevel('mcp.fs.read_file')).toBe(RISK_LEVEL.SYSTEM)
    clearDynamicToolRisk('mcp.fs.read_file')
    expect(resolveRiskLevel('mcp.fs.read_file')).toBe(RISK_LEVEL.DATA_WRITE) // 回退默认
  })

  it('配置解析保留 risk 字段（非法值丢弃）', () => {
    const config = parseMcpConfig({
      mcpServers: {
        shell: { command: 'x', risk: 'system' },
        bad: { command: 'y', risk: 'nope' }
      }
    })
    expect(config.mcpServers.shell.risk).toBe('system')
    expect(config.mcpServers.bad.risk).toBeUndefined()
  })
})
