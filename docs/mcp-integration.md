# MCP 接入（Slice 18）

> 目的：让本项目的 agent 能用**外部 MCP 服务器**的工具（文件系统 / git / 浏览器 / 数据库…），为「未来通用编码 / 开发应用」铺路。

## 1. 核心思路：MCP 只是「技能的另一个来源」

不新开一套工具通路。MCP 工具被**转成 `SkillProtocol` 注册进现有 `SkillDispatcher`**，于是：

- 工具面分组、按档位限量（本地 8 / 云端 15）、审批门、操作日志 —— **全部零改动复用**；
- Brain 循环、`toFunctionCallingTools`、`requestApproval` —— 都不用动；
- 工具 id 统一前缀 `mcp.<server>.<tool>`。

```
MCP server ──stdio JSON-RPC──▶ McpClient ──tools/list──▶ McpToolInfo
                                                            │
                                            mcpToolToSkill（bridge，纯函数）
                                                            ▼
                                              SkillProtocol  ──register──▶ SkillDispatcher
                                                            ▼
                                         工具面 / 审批 / 日志 / Brain 循环（既有机制）
```

## 2. 文件布局

| 文件 | 职责 |
|---|---|
| `shared/agent/mcp/types.ts` | MCP 类型（配置 / 工具元信息 / 调用结果 / `McpTransport` 接口） |
| `shared/agent/mcp/config.ts` | 解析 `{ mcpServers: {...} }`（容错：坏项跳过） |
| `shared/agent/mcp/bridge.ts` | `mcpToolToSkill`：MCP 工具 → `SkillProtocol`（纯函数，可单测） |
| `shared/agent/mcp/client.ts` | 协议层：`initialize` / `tools/list` / `tools/call`（传输层注入） |
| `main/agent/mcp/stdioTransport.ts` | 真实传输（stdio）：拉子进程，行分隔 JSON-RPC，id 配对 |
| `main/agent/mcp/streamableHttpTransport.ts` | 真实传输（HTTP）：POST JSON-RPC，响应支持 `application/json` 或 `text/event-stream`(SSE)，带 `Mcp-Session-Id` |
| `main/agent/mcp/manager.ts` | 单例：应用级连接、库级注册、失败隔离、按配置选传输层 |

## 3. 配置

在 `userData/mcp.json` 放（与 Claude Desktop / dsh 的 `mcpServers` 同构）：

```json
{
  "mcpServers": {
    "filesystem": {
      "command": "npx",
      "args": ["-y", "@modelcontextprotocol/server-filesystem", "D:/work"],
      "env": {}
    }
  }
}
```

远程（streamable-http，如 dsh 的 context7）：

```json
{
  "mcpServers": {
    "context7": {
      "url": "https://mcp.context7.com/mcp",
      "headers": { "Accept": "application/json, text/event-stream" }
    }
  }
}
```

- **stdio**（`command`）与 **http**（`url`）二选一，按配置自动选传输层。
- 没有这个文件 = **不启用 MCP**（静默，不影响 agent 本体）。
- 单个服务器起不来 = 只跳过它，其他服务器与 agent 不受影响。
- dsh 的 MCP 配置（`/d/dsh/storages/mcp_connector.json`）就是这两种形态，**可直接搬**。

## 4. 生命周期（为什么连接与注册分开）

- **连接是应用级的**：`app.whenReady` 时连一次（`mcpManager.connectFromFile`），子进程不随切库重拉。
- **注册是库级的**：`buildStores` 每次重建 dispatcher 后 `mcpManager.attach(dispatcher)` 重新注册已发现的工具。
- 连接晚于首次 `buildStores` 时，`connect` 完成后会 `registerAll` 到当前 dispatcher。

## 5. 已做 / 未做（诚实边界）

**已做**
- **两种传输**：stdio 子进程 + Streamable HTTP（`application/json` 与 SSE 两种响应）
- `initialize`/`tools/list`/`tools/call`
- 工具 → 技能桥（文本内容拼接、`isError`→`success`、异常收敛）
- 配置解析（容错，stdio/http 二选一）+ 应用级单例 + 库级注册
- 9 条单测（配置含 http / 桥 / 协议客户端用假传输层）

**未做（后续）**
- **MCP 配置 UI**（现在手写 `mcp.json`；未来可在「插件中心」加配置面板）
- **风险分级**：MCP 工具目前走 `DEFAULT_TOOL_RISK`（未登记），shell 类工具**不会**自动要求二次确认；要更严可在 `TOOL_RISK_MAP` 登记或按服务器配置风险
- **工具面限量**：MCP 工具计入本地 8 / 云端 15 的上限，接多了会被截断（可调 `TOOL_FACE_LIMITS`）
- **SubAgent 通道 / 并行执行**（`execute_parallel`）：本次**未做**，仍按事件流顺序执行

## 6. 验证

```bash
npx vitest run tests/unit/mcp.test.ts   # 8 条
npm run typecheck && npx eslint src/shared/agent/mcp src/main/agent/mcp
env -u NODE_OPTIONS npm run build
```
