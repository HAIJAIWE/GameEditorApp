import type { JsonObjectSchema } from '../config'
import type { McpCallResult, McpContentBlock, McpToolInfo, McpTransport } from './types'
import { MCP_ALLOWED_IMAGE_MIME, MCP_MAX_INSTRUCTION_BYTES } from './types'

/**
 * MCP 客户端（协议层，宿主无关，传输层注入）。
 *
 * 只做三件事：`initialize`（握手 + 发 initialized 通知）、`tools/list`、`tools/call`。
 * 真正的字节流（stdio 子进程 / SSE）在 `McpTransport` 实现里，故这里可用假传输层完整单测。
 */

/**
 * 我们广播的 MCP 协议版本。
 * 对齐 dsh 的 `versionNegotiation: { mode: 'auto' }`：广播**最新稳定版**，由服务器回选其支持的最高版本
 * （MCP 规范：服务器在 `initialize` 响应里给出它实际要用的版本）。写死旧版会让只讲新版协议的服务器握手失败。
 */
const PROTOCOL_VERSION = '2025-06-18'

/**
 * 工具调用默认超时（ms），对齐 dsh 的 `DEFAULT_TOOL_CALL_TIMEOUT_MS = 60_000`。
 * 仅约束「握手之后」的 `tools/call`；握手本身另有 `McpManager.HANDSHAKE_TIMEOUT_MS`（10s）约束。
 */
const DEFAULT_CALL_TIMEOUT_MS = 60_000

export class McpClient {
  constructor(
    private readonly server: string,
    private readonly transport: McpTransport,
    /** 逐调用超时（ms）；可在构造时覆写（单测用小值），默认 60s */
    private readonly callTimeoutMs: number = DEFAULT_CALL_TIMEOUT_MS,
    /** 服务器→本端通知的转发回调（如 `notifications/tools/list_changed`）；传输层不支持则永不触发 */
    onNotification?: (method: string, params?: unknown) => void
  ) {
    if (onNotification !== undefined && transport.onNotification !== undefined) {
      transport.onNotification((method, params) => onNotification(method, params))
    }
  }

  /** 握手：`initialize` 请求 + `notifications/initialized` 通知；返回服务器 `instructions`（若无则 undefined） */
  async initialize(): Promise<string | undefined> {
    const result = (await this.transport.request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'mb-desktop', version: '0.1.0' }
    })) as { instructions?: unknown }
    this.transport.notify('notifications/initialized')
    return typeof result?.instructions === 'string' ? result.instructions : undefined
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

  /** 调用工具；严格校验 `CallToolResult` 形状（对齐 dsh 的 schema 校验），带逐调用超时（默认 60s） */
  async callTool(name: string, args: Record<string, unknown>): Promise<McpCallResult> {
    const raw = await this.withCallTimeout(
      this.transport.request('tools/call', { name, arguments: args }, { timeoutMs: this.callTimeoutMs })
    )
    return parseCallToolResult(raw)
  }

  close(): void {
    this.transport.close()
  }

  /**
   * 给工具调用 Promise 套超时（默认 `callTimeoutMs`）。
   * 即便传输层忘记/不支持 `timeoutMs`，客户端也保证失败闭合（对齐 dsh 的 fail-closed）。
   * 原 Promise 不被取消，仅清理定时器避免泄漏；传输层自身的 `timeoutMs` 仍负责回收其内部状态（stdio 的 pending / http 的 fetch）。
   */
  private withCallTimeout<T>(promise: Promise<T>): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    const timeout = new Promise<T>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error(`MCP 工具调用超时（${this.callTimeoutMs}ms）`)),
        this.callTimeoutMs
      )
    })
    return Promise.race([promise, timeout]).finally(() => {
      if (timer !== undefined) clearTimeout(timer)
    })
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

/**
 * 严格校验 `tools/call` 返回（对齐 dsh 的 `CallToolResult` schema 校验）。
 * 不合法（非对象 / content 非数组 / 块缺 type / 图像块缺 data 或 MIME 不支持）直接抛错，
 * 由 `mcpToolToSkill` 的 try/catch 收敛为 `success:false`（不把畸形响应透传给 Brain 循环）。
 */
function parseCallToolResult(raw: unknown): McpCallResult {
  if (raw === null || typeof raw !== 'object') {
    throw new Error('MCP tools/call 返回非对象结果')
  }
  const obj = raw as Record<string, unknown>
  const content = obj.content
  if (content !== undefined && !Array.isArray(content)) {
    throw new Error('MCP tools/call 返回的 content 不是数组')
  }
  const blocks: McpContentBlock[] = Array.isArray(content)
    ? content.map((item, index) => {
        if (item === null || typeof item !== 'object') {
          throw new Error(`MCP tools/call content[${index}] 不是对象`)
        }
        const block = item as Record<string, unknown>
        if (typeof block.type !== 'string') {
          throw new Error(`MCP tools/call content[${index}] 缺 type 字段`)
        }
        const out: McpContentBlock = { type: block.type }
        if (typeof block.text === 'string') out.text = block.text
        if (typeof block.data === 'string') out.data = block.data
        if (typeof block.mimeType === 'string') out.mimeType = block.mimeType
        if (out.type === 'image') {
          if (out.data === undefined || out.data.trim() === '') {
            throw new Error(`MCP tools/call content[${index}] 图像块缺 data`)
          }
          if (out.mimeType === undefined || !MCP_ALLOWED_IMAGE_MIME.has(out.mimeType)) {
            throw new Error(`MCP tools/call content[${index}] 图像 MIME 不支持：${String(out.mimeType)}`)
          }
        }
        return out
      })
    : []
  return { content: blocks, isError: obj.isError === true }
}

/** 服务器 instructions 截断（对齐 dsh `maxInstructionBytes = 32768`） */
export function truncateInstruction(instructions: string): string {
  return instructions.length > MCP_MAX_INSTRUCTION_BYTES
    ? instructions.slice(0, MCP_MAX_INSTRUCTION_BYTES)
    : instructions
}
