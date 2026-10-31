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

- 顶层 `"maxTools": N` 可调高**工具面上限**（默认本地 8 / 云端 15；MCP 工具多了才需要，否则会被截断）。
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
- **逐调用超时 60s（对齐 dsh 的 `DEFAULT_TOOL_CALL_TIMEOUT_MS`）**：客户端层 `withCallTimeout` 失败闭合 + 传输层 `AbortController`（http）/ pending 清理（stdio），握手另有独立 10s 短超时
- **连接监督器（对齐 dsh `connection.ts`）**：`McpManager` 重构为「每台服务器一个 `ServerConnection` + 监督器」——stdio 进程崩溃经 `onDisconnect` 触发**有界指数退避重连**（`500×2^n` 封顶 30s、`maxAttempts=10`、generation 隔离防旧连接污染）；服务器推 `notifications/tools/list_changed` 触发 **`tools/list` 重同步**（增量注册/注销，工具面实时更新）；HTTP 无持久连接故不自动重连
- 工具 → 技能桥（文本内容拼接、`isError`→`success`、异常收敛）
- 配置解析（容错，stdio/http 二选一 + `risk`）+ 应用级单例 + 库级注册
- **MCP 配置 UI**（Slice 20）：工具菜单「MCP 配置」→ `McpConfigPanel` 编辑 `mcp.json`，保存后 `mcp:setConfig` 写盘并**重连**
- **风险分级**（Slice 20）：动态风险表 + 每服务器 `risk` 档 + 工具名启发式（shell/write/delete→SYSTEM 需二次确认；read/list→READ_ONLY）
- **dsh 四项防御性补齐**：① 工具名规范化 `normalizeMcpToolName`（脏字符→`_`，截断 64，改动时追加 12 位 FNV-1a 十六进制后缀）；② `CallToolResult` 严格 schema 校验（`parseCallToolResult` fail-closed）；③ 图像准入 → `SkillResult.images` → `BrainMessage.images`（传输层按视觉模型能力下发），并**在聊天工具卡内联渲染缩略图条**（对齐 dsh `ui-tool` 的 `tool.call.images` 槽：`step_done` 事件透传 `images` 到 `DigitalStep`，`ToolStepCard` 渲染缩略图、点击经 `AttachmentLightbox` 全屏查看）；④ `serverName` 校验（`SERVER_NAME_PATTERN` 跳过非法键）+ `instructions` 截断（`MCP_MAX_INSTRUCTION_BYTES=32768`，并**注入系统提示词**——经 `serverInstructionBlocks()` 在 `chat()` 构建提示词时拼成 `### MCP server: <name>\n\n<text>` 块，对齐 dsh `server-context.ts` 的 prompt 注入；instructions 是模型可见文本，不是 UI 面板）
- 单测：`mcp.test.ts` 17 条 + `mcpSupervisor.test.ts` 4 条 + `mcpGaps.test.ts` 17 条（共 38 条：配置/桥/客户端/超时/监督器/重同步/重连/命名/校验/图像/vision/serverName/instructions 注入）；dsh 对照见 [`dsh-mcp-comparison.md`](./dsh-mcp-comparison.md)

**未做（后续）**
- ~~**工具面限量**~~ → **已可配置**（Slice 21）：MCP 配置顶层 `"maxTools": N` 调高上限（默认 8/15，`setMaxToolsOverride`）
- ~~**SubAgent 通道 / 并行执行**~~ → **已做**（Slice 19，opt-in）：`parallelToolCalls` + `tool.spawn_subagent`，见 [`agent-parallel-subagent.md`](./agent-parallel-subagent.md)

## 6. 验证

```bash
npx vitest run tests/unit/mcp.test.ts tests/unit/mcpSupervisor.test.ts tests/unit/mcpGaps.test.ts   # 38 条
npm run typecheck && npx eslint src/shared/agent/mcp src/main/agent/mcp
env -u NODE_OPTIONS npm run build
```
