import { readFile } from 'node:fs/promises'

import { mcpToolToSkill, type McpCallTool } from '../../../shared/agent/mcp/bridge'
import { McpClient } from '../../../shared/agent/mcp/client'
import { parseMcpConfig } from '../../../shared/agent/mcp/config'
import type { McpConfig, McpToolInfo } from '../../../shared/agent/mcp/types'
import type { SkillDispatcher } from '../dispatcher'
import { StdioMcpTransport } from './stdioTransport'

/**
 * MCP 管理器（Slice 18，主进程单例）。
 *
 * 生命周期：**连接是应用级的**（`app.whenReady` 时连一次），**注册是库级的**（`buildStores`
 * 每次重建 dispatcher 都要重新 `attach` 并注册）。这样切库不会重拉子进程，也不会丢 MCP 工具。
 *
 * 失败隔离：单个服务器起不来只跳过它，不影响其他服务器与 agent 本体。
 */
export class McpManager {
  private readonly clients = new Map<string, McpClient>()
  private tools: McpToolInfo[] = []
  private dispatcher: SkillDispatcher | null = null
  private connected = false

  /** 连上配置里的全部服务器并发现工具（只连一次；重复调用无操作） */
  async connect(config: McpConfig): Promise<void> {
    if (this.connected) return
    this.connected = true
    for (const [server, serverConfig] of Object.entries(config.mcpServers)) {
      try {
        const client = new McpClient(server, new StdioMcpTransport(serverConfig))
        await client.initialize()
        const tools = await client.listTools()
        this.clients.set(server, client)
        this.tools.push(...tools)
      } catch (error) {
        // 单个服务器失败不影响其他服务器与 agent 本体
        console.error(`[MCP] server "${server}" 连接失败：`, error instanceof Error ? error.message : String(error))
      }
    }
    this.registerAll()
  }

  /** 从配置文件读取并连接；文件缺失/格式错 = 不启用 MCP（静默） */
  async connectFromFile(path: string): Promise<void> {
    try {
      const raw: unknown = JSON.parse(await readFile(path, 'utf8'))
      await this.connect(parseMcpConfig(raw))
    } catch {
      // 没有 mcp.json 是正常情况（默认不启用）
    }
  }

  /** 绑定当前 dispatcher（库切换重建后需重新 attach），并注册已发现的工具 */
  attach(dispatcher: SkillDispatcher): void {
    this.dispatcher = dispatcher
    this.registerAll()
  }

  /** 已发现的 MCP 工具数（供插件中心/诊断展示） */
  toolCount(): number {
    return this.tools.length
  }

  close(): void {
    for (const client of this.clients.values()) client.close()
    this.clients.clear()
    this.tools = []
    this.connected = false
  }

  private registerAll(): void {
    if (this.dispatcher === null) return
    const callTool: McpCallTool = async (server, tool, args) => {
      const client = this.clients.get(server)
      if (client === undefined) throw new Error(`MCP server "${server}" 未连接`)
      return client.callTool(tool, args)
    }
    for (const tool of this.tools) {
      // 重复注册（同一 dispatcher 二次 attach）返回 false，无害
      this.dispatcher.register(mcpToolToSkill(tool, callTool))
    }
  }
}

/** 应用级单例（主进程） */
export const mcpManager = new McpManager()
