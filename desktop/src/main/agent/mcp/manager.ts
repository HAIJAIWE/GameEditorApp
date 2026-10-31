import { readFile } from 'node:fs/promises'

import { mcpToolId, mcpToolRisk, mcpToolToSkill, type McpCallTool } from '../../../shared/agent/mcp'
import { clearDynamicToolRisk, setDynamicToolRisk, type RiskLevel } from '../../../shared/agent/config'
import { setMaxToolsOverride } from '../../../shared/agent/tools'
import { McpClient } from '../../../shared/agent/mcp'
import { parseMcpConfig } from '../../../shared/agent/mcp'
import type { McpConfig, McpServerConfig, McpToolInfo, McpTransport } from '../../../shared/agent/mcp'
import type { SkillDispatcher } from '../execution/dispatcher'
import { StdioMcpTransport } from './stdioTransport'
import { StreamableHttpTransport } from './streamableHttpTransport'

/** 按配置选传输层：有 `url` 走 HTTP，有 `command` 走 stdio，都没有返回 null */
function createTransport(config: McpServerConfig): McpTransport | null {
  if (config.url !== undefined) return new StreamableHttpTransport(config.url, config.headers)
  if (config.command !== undefined) {
    return new StdioMcpTransport({ command: config.command, args: config.args, env: config.env })
  }
  return null
}

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
  /** 已发现的工具 + 各自的风险等级（风险在注册时写进动态风险表） */
  private tools: Array<{ tool: McpToolInfo; risk: RiskLevel }> = []
  private dispatcher: SkillDispatcher | null = null
  private connected = false
  /** 配置文件路径（`connectFromFile` 时记下；配置 UI 读写它） */
  private configPath: string | null = null

  /** 握手超时：防止某个 MCP 服务器无响应时，整个 `connect`（在 app.whenReady 时连）被无限挂起 */
  private static readonly HANDSHAKE_TIMEOUT_MS = 10_000

  /** 给 Promise 套一个超时（超时即 reject）；原 Promise 不被取消，仅清理定时器避免泄漏 */
  private static withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
    // 用 Promise<T> 而非 Promise<never>：new Promise<never> 会让 Promise.race 的泛型推定出错（TS2345）
    const timeout = new Promise<T>((_resolve, reject) => {
      timer = setTimeout(
        () => reject(new Error(`${label} 超时（${McpManager.HANDSHAKE_TIMEOUT_MS}ms）`)),
        McpManager.HANDSHAKE_TIMEOUT_MS
      )
    })
    return Promise.race([promise, timeout]).finally(() => {
      if (timer !== undefined) clearTimeout(timer)
    })
  }

  /** 连上配置里的全部服务器并发现工具（只连一次；重复调用无操作） */
  async connect(config: McpConfig): Promise<void> {
    if (this.connected) return
    this.connected = true
    // 工具面上限覆写（配置顶层 maxTools）：MCP 工具多了可调高，否则沿用 8/15
    setMaxToolsOverride(config.maxTools ?? null)
    for (const [server, serverConfig] of Object.entries(config.mcpServers)) {
      const transport = createTransport(serverConfig)
      if (transport === null) continue
      let client: McpClient | null = null
      try {
        client = new McpClient(server, transport)
        await McpManager.withTimeout(client.initialize(), `server "${server}" 握手`)
        const tools = await McpManager.withTimeout(client.listTools(), `server "${server}" 列工具`)
        this.clients.set(server, client)
        // 已登记到 this.clients，交给 close() 在关闭时统一回收；catch 不再关它
        client = null
        // 按服务器配置（显式 risk）或工具名启发式，算出每个工具的风险
        for (const tool of tools) {
          this.tools.push({ tool, risk: mcpToolRisk(tool.name, serverConfig.risk) })
        }
      } catch (error) {
        // 单个服务器失败/超时不影响其他服务器与 agent 本体；未成功登记的客户端在此关闭，避免 stdio 子进程残留
        if (client !== null) client.close()
        console.error(`[MCP] server "${server}" 连接失败：`, error instanceof Error ? error.message : String(error))
      }
    }
    this.registerAll()
  }

  /** 从配置文件读取并连接；文件缺失/格式错 = 不启用 MCP（静默） */
  async connectFromFile(path: string): Promise<void> {
    this.configPath = path
    try {
      const raw: unknown = JSON.parse(await readFile(path, 'utf8'))
      await this.connect(parseMcpConfig(raw))
    } catch {
      // 没有 mcp.json 是正常情况（默认不启用）
    }
  }

  /** 配置文件路径（配置 UI 用；未初始化返回 null） */
  configPathOrNull(): string | null {
    return this.configPath
  }

  /** 用新配置**重连**（配置 UI 保存后调用）：先关旧连接，再按新配置连一遍 */
  async reload(config: McpConfig): Promise<void> {
    this.close()
    await this.connect(config)
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
    for (const { tool } of this.tools) clearDynamicToolRisk(mcpToolId(tool.server, tool.name))
    for (const client of this.clients.values()) client.close()
    this.clients.clear()
    this.tools = []
    this.connected = false
    setMaxToolsOverride(null) // 恢复按档位默认上限
  }

  private registerAll(): void {
    if (this.dispatcher === null) return
    const callTool: McpCallTool = async (server, tool, args) => {
      const client = this.clients.get(server)
      if (client === undefined) throw new Error(`MCP server "${server}" 未连接`)
      return client.callTool(tool, args)
    }
    for (const { tool, risk } of this.tools) {
      // 动态风险表：MCP 工具是运行时的，静态 TOOL_RISK_MAP 覆盖不到
      setDynamicToolRisk(mcpToolId(tool.server, tool.name), risk)
      // 重复注册（同一 dispatcher 二次 attach）返回 false，无害
      this.dispatcher.register(mcpToolToSkill(tool, callTool))
    }
  }
}

/** 应用级单例（主进程） */
export const mcpManager = new McpManager()
