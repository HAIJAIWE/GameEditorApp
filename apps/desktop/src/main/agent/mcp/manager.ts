import { readFile } from 'node:fs/promises'

import { mcpToolId, mcpToolRisk, mcpToolToSkill, mcpResourceSkills, type McpCallTool } from '@mobai/shared/agent/mcp'
import { clearDynamicToolRisk, setDynamicToolRisk, type RiskLevel } from '@mobai/shared/agent/config'
import { setMaxToolsOverride } from '@mobai/shared/agent/tools'
import { McpClient, truncateInstruction } from '@mobai/shared/agent/mcp'
import { parseMcpConfig } from '@mobai/shared/agent/mcp'
import type { McpConfig, McpServerConfig, McpToolInfo, McpTransport } from '@mobai/shared/agent/mcp'
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

/** 单个 MCP 服务器的连接状态（监督器管理的最小单元） */
interface ServerConnection {
  config: McpServerConfig
  transport: McpTransport | null
  client: McpClient | null
  /**
   * 代数：每次（重）连接 +1。异步结果（握手 / 列工具 / 重同步）都带 generation 校验，
   * 过期的旧结果一律丢弃，避免旧连接回调污染已重建的新连接（对齐 dsh 的 generation 隔离）。
   */
  generation: number
  tools: Array<{ tool: McpToolInfo; risk: RiskLevel }>
  /** 服务器 instructions（握手时取回，截断到 `MCP_MAX_INSTRUCTION_BYTES`），供上层注入系统提示 */
  instructions: string
  /** 已尝试重连次数（成功一次即清零，故对冷启动慢的服务器也能撑过退避窗口） */
  reconnectAttempts: number
  /** 待执行的重连定时器（去重：同一服务器同时只挂一个） */
  reconnectTimer: ReturnType<typeof setTimeout> | null
  /**
   * 工具注册交换串行化链（对齐 dsh connection 的 `syncChain`）。
   * 所有「注销旧工具 / 注册新工具」的交换都入队此链，避免两次 listTools/重同步的交换交错
   * （否则会双释放一个代际、或泄漏另一个代际的工具）。链上的回调再以 generation 守卫判定是否生效。
   */
  syncChain: Promise<void>
  /** 本服务器已注册的资源工具 id（仅在该服务器声明 resources 能力时非空），断开时一并注销 */
  resourceSkills: string[]
  closed: boolean
}

/**
 * MCP 管理器（Slice 18，主进程单例）+ **连接监督器**。
 *
 * 生命周期：
 * - **连接是应用级的**（`app.whenReady` 时连一次），每台服务器独立、失败隔离；
 * - **注册是库级的**（`buildStores` 每次重建 dispatcher 都要重新 `attach` 并注册）；
 * - **自愈**：stdio 进程崩溃 → `onDisconnect` 触发 → 有界指数退避重连（最多 10 次）；
 * - **工具热更新**：服务器推 `notifications/tools/list_changed` → 重新 `listTools` 并增量注册/注销。
 *
 * 设计取向：MCP 工具**桥接成 `SkillProtocol`** 进既有 `SkillDispatcher`，工具面/档位限量/审批门/操作日志零改动复用。
 */
export class McpManager {
  private readonly connections = new Map<string, ServerConnection>()
  private dispatcher: SkillDispatcher | null = null
  private connected = false
  /** 配置文件路径（`connectFromFile` 时记下；配置 UI 读写它） */
  private configPath: string | null = null
  /** 传输层工厂（可注入，便于测试用假传输层） */
  private transportFactory: (config: McpServerConfig) => McpTransport | null = createTransport

  /** 握手超时：防止某个 MCP 服务器无响应时，整个 `connect`（在 app.whenReady 时连）被无限挂起 */
  private static readonly HANDSHAKE_TIMEOUT_MS = 10_000
  /** 重连退避（对齐 dsh connection 监督器）：初始 500ms，指数翻倍，封顶 30000ms */
  private static readonly RECONNECT_INITIAL_DELAY_MS = 500
  private static readonly RECONNECT_MAX_DELAY_MS = 30_000
  /** 重连上限：达到后停止自动重连（成功一次即清零） */
  private static readonly RECONNECT_MAX_ATTEMPTS = 10

  /** 给 Promise 套一个超时（超时即 reject）；原 Promise 不被取消，仅清理定时器避免泄漏 */
  private static withTimeout<T>(promise: Promise<T>, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | undefined
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

  /** 测试用：注入假传输层，避免单测真拉子进程 */
  setTransportFactory(factory: (config: McpServerConfig) => McpTransport | null): void {
    this.transportFactory = factory
  }

  /** 连上配置里的全部服务器并发现工具（只连一次；重复调用无操作）。不 await 单台，失败隔离 */
  async connect(config: McpConfig): Promise<void> {
    if (this.connected) return
    this.connected = true
    // 工具面上限覆写（配置顶层 maxTools）：MCP 工具多了可调高，否则沿用 8/15
    setMaxToolsOverride(config.maxTools ?? null)
    for (const [server, serverConfig] of Object.entries(config.mcpServers)) {
      const conn: ServerConnection = {
        config: serverConfig,
        transport: null,
        client: null,
        generation: 0,
        tools: [],
        instructions: '',
        reconnectAttempts: 0,
        reconnectTimer: null,
        syncChain: Promise.resolve(),
        resourceSkills: [],
        closed: false
      }
      this.connections.set(server, conn)
      // 不 await：单台服务器慢/挂不影响其他服务器与 agent 本体
      void this.connectServer(server)
    }
  }

  /** （重）连接单台服务器；成功即注册工具，失败/断开即安排重连。generation 保证过期结果被丢弃 */
  private async connectServer(server: string): Promise<void> {
    const conn = this.connections.get(server)
    if (conn === undefined || conn.closed) return
    conn.generation += 1
    const generation = conn.generation
    const transport = this.transportFactory(conn.config)
    if (transport === null) return

    // 进程崩溃/流错误 → 立即让本服务器工具失效并安排重连
    if (transport.onDisconnect !== undefined) {
      transport.onDisconnect((error) => {
        if (conn.closed || conn.generation !== generation) return
        // 让本代际失效：自增 generation，使任何在途的 listTools/重同步交换在链上被判为过期而跳过
        conn.generation += 1
        console.error(`[MCP] server "${server}" 连接断开：`, error.message)
        conn.client = null
        conn.transport = null
        for (const { tool } of conn.tools) {
          const id = mcpToolId(tool.server, tool.name)
          this.dispatcher?.unregister(id)
          clearDynamicToolRisk(id)
        }
        conn.tools = []
        // 一并注销该服务器已注册的资源工具（若有）
        for (const id of conn.resourceSkills) {
          this.dispatcher?.unregister(id)
          clearDynamicToolRisk(id)
        }
        conn.resourceSkills = []
        this.scheduleReconnect(server)
      })
    }

    const client = new McpClient(server, transport, undefined, (method) => {
      if (method === 'notifications/tools/list_changed' && !conn.closed && conn.generation === generation) {
        void this.resyncServer(server, generation)
      }
    })

    try {
      const { instructions } = await McpManager.withTimeout(client.initialize(), `server "${server}" 握手`)
      const tools = await McpManager.withTimeout(client.listTools(), `server "${server}" 列工具`)
      // 连接期间已被关闭或重建（generation 变了）→ 丢弃本次结果，回收资源
      if (conn.closed || conn.generation !== generation) {
        transport.close()
        return
      }
      conn.transport = transport
      conn.client = client
      const nextTools = tools.map((tool) => ({ tool, risk: mcpToolRisk(tool.name, conn.config.risk) }))
      conn.instructions = truncateInstruction(typeof instructions === 'string' ? instructions : '')
      conn.reconnectAttempts = 0
      // 注册交换入队 syncChain（代际守卫 + 串行化），与重同步/断开注销互斥
      this.enqueueSync(server, generation, () => {
        conn.tools = nextTools
        this.registerToolSet(server, generation, nextTools)
        this.registerResourceSkills(server, generation, client)
      })
      console.log(`[MCP] server "${server}" 已连接，${nextTools.length} 个工具`)
    } catch (error) {
      transport.close()
      if (conn.closed || conn.generation !== generation) return
      console.error(`[MCP] server "${server}" 连接失败：`, error instanceof Error ? error.message : String(error))
      this.scheduleReconnect(server)
    }
  }

  /**
   * 把某台服务器的当前工具注册进 dispatcher（generation 校验保证只注册最新结果）。
   * 由 `syncChain` 交换回调与 `attach` 复用。
   */
  private registerServer(server: string, generation: number): void {
    const conn = this.connections.get(server)
    if (conn === undefined) return
    this.registerToolSet(server, generation, conn.tools)
  }

  /** 把一组工具注册进 dispatcher（代际守卫 + 构造 callTool 闭包） */
  private registerToolSet(server: string, generation: number, tools: Array<{ tool: McpToolInfo; risk: RiskLevel }>): void {
    const conn = this.connections.get(server)
    if (conn === undefined || conn.closed || conn.generation !== generation || this.dispatcher === null) return
    const callTool: McpCallTool = async (s, tool, args) => {
      const c = this.connections.get(s)
      if (c === undefined || c.client === null) throw new Error(`MCP server "${s}" 未连接`)
      return c.client.callTool(tool, args)
    }
    for (const { tool, risk } of tools) {
      setDynamicToolRisk(mcpToolId(tool.server, tool.name), risk)
      this.dispatcher.register(mcpToolToSkill(tool, callTool))
    }
  }

  /**
   * 若服务器声明了 resources 能力，把三个资源技能（list / list_templates / read）注册进 dispatcher
   * （对齐 dsh mcp-resources 的 `list_mcp_resources` / `list_mcp_resource_templates` / `read_mcp_resource`）。
   * 资源技能在连接级注册一次（不随工具列表变更），断开时由 `conn.resourceSkills` 一并注销。
   */
  private registerResourceSkills(server: string, generation: number, client: McpClient): void {
    const conn = this.connections.get(server)
    if (conn === undefined || conn.closed || conn.generation !== generation || this.dispatcher === null) return
    if (!client.hasResources()) return
    const skills = mcpResourceSkills(server, (op, params) => {
      const c = this.connections.get(server)?.client
      if (c === undefined || c === null) throw new Error(`MCP server "${server}" 未连接`)
      if (op === 'list') return c.listResources(params.cursor)
      if (op === 'templates') return c.listResourceTemplates(params.cursor)
      return c.readResource(params.uri ?? '')
    })
    const ids: string[] = []
    for (const skill of skills) {
      setDynamicToolRisk(skill.id, mcpToolRisk(skill.id, conn.config.risk))
      this.dispatcher.register(skill)
      ids.push(skill.id)
    }
    conn.resourceSkills = ids
  }

  /**
   * 把一次「工具注册交换」入队到本服务器的 `syncChain`（对齐 dsh connection 的 `enqueueSync`）。
   * 串行化保证两个 listTools/重同步交换不会交错其「注销旧/注册新」阶段；
   * 链上回调再以 `generation` 守卫判定是否仍生效，使过期代际的交换静默跳过。
   */
  private enqueueSync(server: string, generation: number, swap: () => void): void {
    const conn = this.connections.get(server)
    if (conn === undefined) return
    const run = conn.syncChain.then(() => {
      if (conn.closed || conn.generation !== generation) return
      swap()
    })
    // 链尾需存活于失败的交换之后；入队方自行负责上报
    conn.syncChain = run.catch(() => {})
  }

  /** `list_changed` 触发：重新列工具，增量注册新增/变更项、注销消失项（代际守卫 + syncChain 串行化） */
  private async resyncServer(server: string, generation: number): Promise<void> {
    const conn = this.connections.get(server)
    if (conn === undefined || conn.closed || conn.generation !== generation || conn.client === null) return
    try {
      const tools = await McpManager.withTimeout(conn.client.listTools(), `server "${server}" 工具重同步`)
      if (conn.closed || conn.generation !== generation || conn.client === null) return
      const next = tools.map((tool) => ({ tool, risk: mcpToolRisk(tool.name, conn.config.risk) }))
      const nextIds = new Set(next.map(({ tool }) => mcpToolId(tool.server, tool.name)))
      // 交换入队 syncChain：与初始注册 / 断开注销互斥，避免并发 list_changed 交错导致工具泄漏
      this.enqueueSync(server, generation, () => {
        // 注销已消失的工具（以交换时刻的 conn.tools 为准，正确处理多次重同步的链式 diff）
        for (const { tool } of conn.tools) {
          const id = mcpToolId(tool.server, tool.name)
          if (!nextIds.has(id)) {
            this.dispatcher?.unregister(id)
            clearDynamicToolRisk(id)
          }
        }
        conn.tools = next
        this.registerToolSet(server, generation, next)
      })
      console.log(`[MCP] server "${server}" 工具已重同步，${next.length} 个工具`)
    } catch (error) {
      // 重同步失败不重建连接（仅工具列表未更新），下次 list_changed 再试
      console.error(`[MCP] server "${server}" 工具重同步失败：`, error instanceof Error ? error.message : String(error))
    }
  }

  /** 安排重连：有界指数退避（初始 500ms × 2^attempts，封顶 30s），同一服务器同时只挂一个定时器 */
  private scheduleReconnect(server: string): void {
    const conn = this.connections.get(server)
    if (conn === undefined || conn.closed) return
    if (conn.reconnectTimer !== null) return // 已有待执行重连，避免重复定时器
    if (conn.reconnectAttempts >= McpManager.RECONNECT_MAX_ATTEMPTS) {
      console.error(`[MCP] server "${server}" 重连次数超限（${McpManager.RECONNECT_MAX_ATTEMPTS}），停止自动重连`)
      return
    }
    const delay = Math.min(
      McpManager.RECONNECT_MAX_DELAY_MS,
      McpManager.RECONNECT_INITIAL_DELAY_MS * 2 ** conn.reconnectAttempts
    )
    conn.reconnectAttempts += 1
    console.log(`[MCP] server "${server}" 将在 ${delay}ms 后重连（第 ${conn.reconnectAttempts} 次）`)
    conn.reconnectTimer = setTimeout(() => {
      conn.reconnectTimer = null
      void this.connectServer(server)
    }, delay)
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

  /** 绑定当前 dispatcher（库切换重建后需重新 attach），并注册已连接的工具与资源技能 */
  attach(dispatcher: SkillDispatcher): void {
    this.dispatcher = dispatcher
    for (const [server, conn] of this.connections) {
      if (conn.client !== null) {
        this.registerServer(server, conn.generation)
        if (conn.client !== null) this.registerResourceSkills(server, conn.generation, conn.client)
      }
    }
  }

  /** 已发现的 MCP 工具数（供插件中心/诊断展示） */
  toolCount(): number {
    let n = 0
    for (const conn of this.connections.values()) n += conn.tools.length
    return n
  }

  /** 某服务器的 instructions（握手时取回并截断到 32768 字节；无则空串），供上层注入系统提示 */
  serverInstructions(server: string): string {
    return this.connections.get(server)?.instructions ?? ''
  }

  /**
   * 已连接且带 instructions 的服务器，按 dsh `connection.ts` 的格式产出系统提示词块：
   * `### MCP server: <name>\n\n<instructions>`。
   * 对齐 dsh `server-context.ts` 把 instructions 注入 `systemPrompt.section({ name: 'mcp:<server>' })`
   * ——instructions 是**模型可见文本**（不是 UI 面板），随每次构建系统提示词重注入。
   * 无 instructions 的服务器不产生块（避免空段污染提示词）。
   */
  serverInstructionBlocks(): string[] {
    const blocks: string[] = []
    for (const [server, conn] of this.connections) {
      if (conn.instructions.trim() === '') continue
      blocks.push(`### MCP server: ${server}\n\n${conn.instructions}`)
    }
    return blocks
  }

  close(): void {
    for (const conn of this.connections.values()) {
      conn.closed = true
      if (conn.reconnectTimer !== null) {
        clearTimeout(conn.reconnectTimer)
        conn.reconnectTimer = null
      }
      for (const { tool } of conn.tools) clearDynamicToolRisk(mcpToolId(tool.server, tool.name))
      if (conn.transport !== null) conn.transport.close()
    }
    this.connections.clear()
    this.dispatcher = null
    this.connected = false
    setMaxToolsOverride(null) // 恢复按档位默认上限
  }
}

/** 应用级单例（主进程） */
export const mcpManager = new McpManager()
