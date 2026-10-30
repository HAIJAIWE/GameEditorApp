import type { JsonObjectSchema } from '../config/protocol'
import type { McpCallResult, McpToolInfo, McpTransport } from './types'

/**
 * MCP 客户端（协议层，宿主无关，传输层注入）。
 *
 * 只做三件事：`initialize`（握手 + 发 initialized 通知）、`tools/list`、`tools/call`。
 * 真正的字节流（stdio 子进程 / SSE）在 `McpTransport` 实现里，故这里可用假传输层完整单测。
 */

/** 我们支持的 MCP 协议版本（与主流客户端一致） */
const PROTOCOL_VERSION = '2024-11-05'

export class McpClient {
  constructor(
    private readonly server: string,
    private readonly transport: McpTransport
  ) {}

  /** 握手：`initialize` 请求 + `notifications/initialized` 通知 */
  async initialize(): Promise<void> {
    await this.transport.request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'mb-desktop', version: '0.1.0' }
    })
    this.transport.notify('notifications/initialized')
  }

  /** 发现工具；形状不合法（无 name）的跳过 */
  async listTools(): Promise<McpToolInfo[]> {
    const result = (await this.transport.request('tools/list')) as {
      tools?: Array<{ name?: unknown; description?: unknown; inputSchema?: unknown }>
    }
    const tools = Array.isArray(result?.tools) ? result.tools : []
    const out: McpToolInfo[] = []
    for (const tool of tools) {
      if (typeof tool.name !== 'string' || tool.name.trim() === '') continue
      out.push({
        server: this.server,
        name: tool.name,
        description: typeof tool.description === 'string' ? tool.description : '',
        inputSchema: normalizeSchema(tool.inputSchema)
      })
    }
    return out
  }

  /** 调用工具；结果只保留 `content` 与 `isError` */
  async callTool(name: string, args: Record<string, unknown>): Promise<McpCallResult> {
    const result = (await this.transport.request('tools/call', { name, arguments: args })) as {
      content?: unknown
      isError?: unknown
    }
    return {
      content: Array.isArray(result?.content) ? (result.content as McpCallResult['content']) : [],
      isError: result?.isError === true
    }
  }

  close(): void {
    this.transport.close()
  }
}

/** 把 MCP 的 inputSchema 规整成我们 `JsonObjectSchema` 形状（非 object 根则退化为空 schema） */
function normalizeSchema(raw: unknown): JsonObjectSchema {
  if (raw !== null && typeof raw === 'object' && (raw as { type?: unknown }).type === 'object') {
    const schema = raw as JsonObjectSchema
    return {
      type: 'object',
      properties: schema.properties ?? {},
      ...(schema.required !== undefined ? { required: schema.required } : {})
    }
  }
  return { type: 'object', properties: {} }
}
