import type { JsonObjectSchema } from '../config'
import type {
  McpCallResult,
  McpContentBlock,
  McpResourceListResult,
  McpResourceReadResult,
  McpResourceTemplateListResult,
  McpServerCapabilities,
  McpToolInfo,
  McpTransport,
  McpRequestOptions
} from './types'
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
  /** 握手后从服务器取回的能力声明（决定是否暴露资源工具等）；未握手为 undefined */
  private capabilities: McpServerCapabilities | undefined

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

  /** 握手后服务器声明的能力（用于能力门控，对齐 dsh `getServerCapabilities`） */
  serverCapabilities(): McpServerCapabilities | undefined {
    return this.capabilities
  }

  /** 服务器是否声明了 resources 能力（决定是否注册资源工具，对齐 dsh 的 `listable` 门控） */
  hasResources(): boolean {
    return this.capabilities?.resources !== undefined
  }

  /** 握手：`initialize` 请求 + `notifications/initialized` 通知；取回 `instructions` 与 `capabilities` */
  async initialize(): Promise<{ instructions: string | undefined; capabilities: McpServerCapabilities | undefined }> {
    const result = (await this.transport.request('initialize', {
      protocolVersion: PROTOCOL_VERSION,
      capabilities: {},
      clientInfo: { name: 'mb-desktop', version: '0.1.0' }
    })) as { instructions?: unknown; capabilities?: unknown }
    this.transport.notify('notifications/initialized')
    this.capabilities =
      result.capabilities !== undefined && typeof result.capabilities === 'object'
        ? (result.capabilities as McpServerCapabilities)
        : undefined
    return {
      instructions: typeof result?.instructions === 'string' ? result.instructions : undefined,
      capabilities: this.capabilities
    }
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

  /** 列出服务器资源（对齐 dsh `resources/list`）；仅当 `hasResources()` 为真时调用 */
  async listResources(cursor?: string, options?: McpRequestOptions): Promise<McpResourceListResult> {
    const raw = await this.withCallTimeout(
      this.transport.request('resources/list', cursor !== undefined ? { cursor } : undefined, {
        timeoutMs: this.callTimeoutMs,
        ...options
      })
    )
    return parseResourceList(raw)
  }

  /** 列出服务器资源 URI 模板（对齐 dsh `resources/templates/list`） */
  async listResourceTemplates(cursor?: string, options?: McpRequestOptions): Promise<McpResourceTemplateListResult> {
    const raw = await this.withCallTimeout(
      this.transport.request('resources/templates/list', cursor !== undefined ? { cursor } : undefined, {
        timeoutMs: this.callTimeoutMs,
        ...options
      })
    )
    return parseResourceTemplateList(raw)
  }

  /** 读取指定 URI 的资源（对齐 dsh `resources/read`）；二进制 blob 原样带回，由上层决定是否入模型 */
  async readResource(uri: string, options?: McpRequestOptions): Promise<McpResourceReadResult> {
    const raw = await this.withCallTimeout(
      this.transport.request('resources/read', { uri }, { timeoutMs: this.callTimeoutMs, ...options })
    )
    return parseResourceRead(raw)
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

/**
 * 严格校验 `resources/list` 返回（对齐 dsh 对资源结果的 fail-closed 处理）。
 * 非法（非对象 / resources 非数组 / 资源项缺 uri 或 name）直接抛错。
 */
function parseResourceList(raw: unknown): McpResourceListResult {
  if (raw === null || typeof raw !== 'object') throw new Error('MCP resources/list 返回非对象结果')
  const obj = raw as Record<string, unknown>
  if (obj.resources !== undefined && !Array.isArray(obj.resources)) {
    throw new Error('MCP resources/list 返回的 resources 不是数组')
  }
  const resources = (Array.isArray(obj.resources) ? obj.resources : []).map((item, index) => {
    if (item === null || typeof item !== 'object') throw new Error(`MCP resources/list resources[${index}] 不是对象`)
    const r = item as Record<string, unknown>
    if (typeof r.uri !== 'string' || typeof r.name !== 'string') {
      throw new Error(`MCP resources/list resources[${index}] 缺 uri 或 name`)
    }
    return {
      uri: r.uri,
      name: r.name,
      ...(typeof r.description === 'string' ? { description: r.description } : {}),
      ...(typeof r.mimeType === 'string' ? { mimeType: r.mimeType } : {}),
      ...(typeof r.size === 'number' ? { size: r.size } : {})
    }
  })
  return { resources, ...(typeof obj.nextCursor === 'string' ? { nextCursor: obj.nextCursor } : {}) }
}

/** 严格校验 `resources/templates/list` 返回 */
function parseResourceTemplateList(raw: unknown): McpResourceTemplateListResult {
  if (raw === null || typeof raw !== 'object') throw new Error('MCP resources/templates/list 返回非对象结果')
  const obj = raw as Record<string, unknown>
  if (obj.resourceTemplates !== undefined && !Array.isArray(obj.resourceTemplates)) {
    throw new Error('MCP resources/templates/list 返回的 resourceTemplates 不是数组')
  }
  const resourceTemplates = (Array.isArray(obj.resourceTemplates) ? obj.resourceTemplates : []).map((item, index) => {
    if (item === null || typeof item !== 'object') throw new Error(`MCP resourceTemplates[${index}] 不是对象`)
    const r = item as Record<string, unknown>
    if (typeof r.uriTemplate !== 'string' || typeof r.name !== 'string') {
      throw new Error(`MCP resourceTemplates[${index}] 缺 uriTemplate 或 name`)
    }
    return {
      uriTemplate: r.uriTemplate,
      name: r.name,
      ...(typeof r.description === 'string' ? { description: r.description } : {}),
      ...(typeof r.mimeType === 'string' ? { mimeType: r.mimeType } : {})
    }
  })
  return { resourceTemplates, ...(typeof obj.nextCursor === 'string' ? { nextCursor: obj.nextCursor } : {}) }
}

/** 严格校验 `resources/read` 返回；二进制 blob 原样保留 */
function parseResourceRead(raw: unknown): McpResourceReadResult {
  if (raw === null || typeof raw !== 'object') throw new Error('MCP resources/read 返回非对象结果')
  const obj = raw as Record<string, unknown>
  if (obj.contents !== undefined && !Array.isArray(obj.contents)) {
    throw new Error('MCP resources/read 返回的 contents 不是数组')
  }
  const contents = (Array.isArray(obj.contents) ? obj.contents : []).map((item, index) => {
    if (item === null || typeof item !== 'object') throw new Error(`MCP resources/read contents[${index}] 不是对象`)
    const c = item as Record<string, unknown>
    if (typeof c.uri !== 'string') throw new Error(`MCP resources/read contents[${index}] 缺 uri`)
    const out: { uri: string; mimeType?: string; text?: string; blob?: string } = { uri: c.uri }
    if (typeof c.mimeType === 'string') out.mimeType = c.mimeType
    if (typeof c.text === 'string') out.text = c.text
    if (typeof c.blob === 'string') out.blob = c.blob
    return out
  })
  return { contents }
}
