/**
 * MCP 对照 dsh 的四项补齐单测：
 * 5. 工具名规范化 + 短哈希后缀
 * 6. CallToolResult 严格 schema 校验
 * 7. 图像准入 → SkillResult.images（vision 链路）
 * 8. serverName 校验 + instructions 截断
 */
import { describe, expect, it } from 'vitest'

import { normalizeMcpToolName, mcpToolToSkill, mcpToolId, parseMcpConfig, McpClient } from '../../src/shared/agent/mcp'
import { buildToolMessage } from '../../src/shared/agent/runtime'
import type { McpTransport } from '../../src/shared/agent/mcp'
import { McpManager } from '../../src/main/agent/mcp/manager'
import type { SkillDispatcher } from '../../src/main/agent/execution/dispatcher'

/** 最小假传输层：request 由 handler 驱动，支持 initialize/tools/call */
class FakeTransport implements McpTransport {
  constructor(private readonly handler: (method: string, params?: unknown) => unknown) {}
  async request(method: string, params?: unknown): Promise<unknown> {
    return this.handler(method, params)
  }
  notify(): void {
    /* noop */
  }
  close(): void {
    /* noop */
  }
}

function makeTool(name: string) {
  return {
    server: 'srv',
    name,
    description: 'd',
    inputSchema: { type: 'object' as const, properties: {} }
  }
}

describe('5. 工具名规范化 + 短哈希后缀（对齐 dsh tools.ts）', () => {
  it('干净名原样保留', () => {
    expect(normalizeMcpToolName('read_file')).toBe('read_file')
    expect(mcpToolId('srv', 'read_file')).toBe('mcp.srv.read_file')
  })

  it('非法字符替换为下划线；规范化改变了原名 → 追加 12 位哈希后缀', () => {
    const out = normalizeMcpToolName('read/file')
    expect(out).toMatch(/^read_file_[0-9a-f]{12}$/)
  })

  it('超过 64 字符截断并追加哈希后缀', () => {
    const long = 'a'.repeat(70)
    const out = normalizeMcpToolName(long)
    expect(out.length).toBe(64 + 1 + 12)
    expect(out.startsWith('a'.repeat(64) + '_')).toBe(true)
  })

  it('同一原名产生稳定后缀（幂等）', () => {
    expect(normalizeMcpToolName('read/file')).toBe(normalizeMcpToolName('read/file'))
  })
})

describe('6. CallToolResult 严格 schema 校验（对齐 dsh）', () => {
  it('合法文本结果被解析', async () => {
    const client = new McpClient('srv', new FakeTransport(() => ({ content: [{ type: 'text', text: 'hi' }] })))
    const r = await client.callTool('t', {})
    expect(r.content).toEqual([{ type: 'text', text: 'hi' }])
    expect(r.isError).toBe(false)
  })

  it('content 非数组 → 抛错（被桥收敛为 success:false）', async () => {
    const client = new McpClient('srv', new FakeTransport(() => ({ content: 'oops' })))
    await expect(client.callTool('t', {})).rejects.toThrow(/content/)
  })

  it('图像块合法（白名单 MIME + 有 data）被保留', async () => {
    const client = new McpClient(
      'srv',
      new FakeTransport(() => ({ content: [{ type: 'image', data: 'BASE64', mimeType: 'image/png' }] }))
    )
    const r = await client.callTool('t', {})
    expect(r.content[0]).toMatchObject({ type: 'image', data: 'BASE64', mimeType: 'image/png' })
  })

  it('图像块 MIME 不在白名单 → 抛错', async () => {
    const client = new McpClient(
      'srv',
      new FakeTransport(() => ({ content: [{ type: 'image', data: 'X', mimeType: 'image/bmp' }] }))
    )
    await expect(client.callTool('t', {})).rejects.toThrow(/MIME/)
  })

  it('图像块缺 data → 抛错', async () => {
    const client = new McpClient(
      'srv',
      new FakeTransport(() => ({ content: [{ type: 'image', mimeType: 'image/png' }] }))
    )
    await expect(client.callTool('t', {})).rejects.toThrow(/data/)
  })
})

describe('7. 图像准入 → SkillResult.images（vision 链路）', () => {
  it('image 块转为 data URL 写入 SkillResult.images', async () => {
    const skill = mcpToolToSkill(makeTool('snap'), async () => ({
      content: [
        { type: 'text', text: 'ok' },
        { type: 'image', data: 'BASE64', mimeType: 'image/png' }
      ],
      isError: false
    }))
    const result = await skill.execute({}, {})
    expect(result.success).toBe(true)
    expect(result.images).toEqual(['data:image/png;base64,BASE64'])
  })

  it('无图像时不挂 images 字段', async () => {
    const skill = mcpToolToSkill(makeTool('read'), async () => ({
      content: [{ type: 'text', text: 'plain' }],
      isError: false
    }))
    const result = await skill.execute({}, {})
    expect(result.images).toBeUndefined()
  })

  it('buildToolMessage 把 images 透传到消息', () => {
    const msg = buildToolMessage('call1', 'srv.snap', 'ok', ['data:image/png;base64,AAA'])
    expect(msg.role).toBe('tool')
    expect(msg.images).toEqual(['data:image/png;base64,AAA'])
  })
})

describe('8. serverName 校验 + instructions 截断（对齐 dsh）', () => {
  it('非法服务器名被跳过（容错优先）', () => {
    const cfg = parseMcpConfig({
      mcpServers: {
        valid_name: { command: 'x' },
        'bad name!': { command: 'x' },
        toolongtoolongtoolongtoolongtoolongtoolongtoolongtoolongtoolong: { command: 'x' }
      }
    })
    expect(Object.keys(cfg.mcpServers)).toEqual(['valid_name'])
  })

  it('握手取回的 instructions 被截断到 32768 字节并可由 manager 暴露', async () => {
    const longInstructions = 'i'.repeat(40000)
    const transport = new FakeTransport((method) => {
      if (method === 'initialize') return { instructions: longInstructions }
      if (method === 'tools/list') return { tools: [{ name: 'a', description: '', inputSchema: { type: 'object' } }] }
      return {}
    })
    const manager = new McpManager()
    manager.setTransportFactory(() => transport)
    manager.attach({ register: () => true, unregister: () => true } as unknown as SkillDispatcher)
    await manager.connect({ mcpServers: { srv: { command: 'x' } } })
    await new Promise((r) => setTimeout(r, 10))
    const got = manager.serverInstructions('srv')
    expect(got.length).toBe(32768)
    expect(got).toBe('i'.repeat(32768))
    manager.close()
  })

  it('短 instructions 原样保留', async () => {
    const transport = new FakeTransport((method) => {
      if (method === 'initialize') return { instructions: 'use me' }
      if (method === 'tools/list') return { tools: [{ name: 'a', description: '', inputSchema: { type: 'object' } }] }
      return {}
    })
    const manager = new McpManager()
    manager.setTransportFactory(() => transport)
    manager.attach({ register: () => true, unregister: () => true } as unknown as SkillDispatcher)
    await manager.connect({ mcpServers: { srv: { command: 'x' } } })
    await new Promise((r) => setTimeout(r, 10))
    expect(manager.serverInstructions('srv')).toBe('use me')
    manager.close()
  })
})
