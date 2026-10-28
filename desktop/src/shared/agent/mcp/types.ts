import type { JsonObjectSchema } from '../protocol'

/**
 * MCP（Model Context Protocol）接入类型（Slice 18）。
 *
 * 目的：让本项目的 agent 能用**外部 MCP 服务器**提供的工具（文件系统 / git / 浏览器 / 数据库…），
 * 为「未来通用编码 / 开发应用」铺路。做法是把 MCP 工具**转成 `SkillProtocol` 注册进现有
 * `SkillDispatcher`**——于是工具面、档位限量、审批门、操作日志全部**零改动复用**。
 *
 * 本文件只放**纯类型**（宿主无关），传输/进程实现留在 `main/agent/mcp/`。
 */

/** 单个 MCP 服务器配置（stdio 启动：`command` + `args` + `env`） */
export interface McpServerConfig {
  command: string
  args?: string[]
  env?: Record<string, string>
}

/** MCP 配置文件形态（与 Claude Desktop / dsh 的 `mcpServers` 同构） */
export interface McpConfig {
  mcpServers: Record<string, McpServerConfig>
}

/** 一个 MCP 工具的元信息（`tools/list` 的结果项） */
export interface McpToolInfo {
  /** 所属服务器名（配置里的 key） */
  server: string
  /** 工具名（服务器内唯一） */
  name: string
  description: string
  inputSchema: JsonObjectSchema
}

/** `tools/call` 的返回（只取文本内容做消息；其余原样带回 `data`） */
export interface McpCallResult {
  content: Array<{ type: string; text?: string }>
  isError?: boolean
}

/**
 * JSON-RPC 传输层抽象（可注入，便于用假传输层单测）。
 * - `request`：发请求并等对应 id 的响应（成功取 result，失败 reject）；
 * - `notify`：发通知（不等响应）；
 * - `close`：关闭连接/子进程。
 */
export interface McpTransport {
  request(method: string, params?: unknown): Promise<unknown>
  notify(method: string, params?: unknown): void
  close(): void
}
