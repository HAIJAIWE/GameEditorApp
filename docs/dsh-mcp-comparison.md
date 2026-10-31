# dsh × 本项目：MCP 接入对照报告

> 目的：把参考项目 `deepseek-harness`（下文称 **dsh**）的 MCP 实现，与我们 `GameEditorApp/desktop` 的 MCP 子系统做一次**逐文件、逐能力**的对照，标出差异、补齐项与优先级。
>
> dsh 源码基准（本次对照使用的真实路径）：
> `deepseek-harness-master/deepseek-harness-master/packages/mcp/mcp-client/src/`
> - `index.ts` —— 配置 / `apply` / serverName 预留 / 默认超时
> - `connection.ts` —— 连接**监督器**（重连、退避、generation 管理）
> - `transport.ts` —— 官方 `@modelcontextprotocol/client` SDK 的传输封装
> - `tools.ts` —— 工具命名 / `syncTools` / 结果校验 / 图像准入
> - `server-context.ts` —— 服务器 instructions 注入
>
> 我们实现基准：`desktop/src/shared/agent/mcp/`（协议/类型，宿主无关） + `desktop/src/main/agent/mcp/`（stdio / http / manager，主进程）。

---

## 0. 一句话结论

两者**目标一致**（把外部 MCP 工具接进 agent 工具面），但**架构取向不同**：

- **dsh** 把 MCP 做成一个 **Cordis 插件**，一个服务器 = 一个插件实例，自带连接监督器、重连退避、工具名归一、图像准入。
- **我们** 把 MCP 做成 **「技能的另一个来源」**：MCP 工具被桥接成 `SkillProtocol` 注册进既有 `SkillDispatcher`，工具面分组、档位限量、审批门、操作日志、Brain 循环**全部零改动复用**。代价是少了 dsh 的「连接自愈」与「工具名归一」细节。

**本次已补齐（2026-10-31）**：逐调用超时 60s（对齐 dsh 的 `DEFAULT_TOOL_CALL_TIMEOUT_MS=60_000`），见 §3。其余差异见各节「我们的状态」。

---

## 1. 架构对照

| 维度 | dsh | 我们 |
|---|---|---|
| 接入形态 | Cordis 插件（`mcp-client`），一服务器一实例 | 主进程单例 `McpManager`（`manager.ts`） |
| 工具出口 | 直接挂进 dsh 的工具调用面 | 桥接成 `SkillProtocol` → `SkillDispatcher`（复用全部既有机制） |
| 工具 id | `mcp__<server>__<raw>`（+SHA 后缀，见 §4） | `mcp.<server>.<tool>` |
| 传输层 | 官方 SDK `Client` + 官方 transports | 自研 `StdioMcpTransport` + `StreamableHttpTransport` |
| 协议语义 | SDK 包办（`initialize`/`list`/`call`） | `McpClient` 自研（协议层，可注入假传输层单测） |
| 连接生命周期 | 插件级 `start` / `stop`，带监督器 | 应用级 `connect`（app.whenReady 一次）+ 库级 `attach`（切库重注册） |

我们的「桥接成技能」路线刻意牺牲了 dsh 的连接监督器，换取**工具面/审批/日志零改动**与**宿主无关的可单测协议层**。这是有意的架构选择，不是缺漏。

---

## 2. 连接管理（dsh 有监督器，我们没有）

**dsh —— `connection.ts`**：
- **generation 管理**：SDK 把「一个 Protocol 绑定一个 transport 终身」，所以重连 = 新建 `Client` + 重新 `connect`；用 `isCurrent(generation)` 做幂等保护，避免旧连接回调污染新连接。
- **串行 `enqueueSync`**：dispose / register 交换走串行链，避免 dispose 与 register 竞态。
- **`scheduleReconnect`**：有界指数退避 —— `initialDelayMs=500` → `maxDelayMs=30000`，`maxAttempts=10`，带稳定性窗口预算重置。`GENERATION_CLOSE_TIMEOUT_MS=5000` 失败闭合。
- **`listChanged`**：服务器推 `notifications/tools/list_changed` 时自动重新 `syncTools`。
- **`maxInstructionBytes=32768`**：服务器 instructions 截断上限。
- **`serverName` 校验**：`[A-Za-z0-9_-]{1,32}` 正则。

**我们的状态**：
- `McpManager.connect` 是**一次性、非自愈**的：连得上就注册，连不上只跳过该服务器（`console.error`），**没有重连、没有退避、没有 generation 隔离**。
- 切库走 `close()` + `reload()` 全量重连（用户手动保存配置触发），不是监督器式的自动恢复。
- 没有 `listChanged` 自动重同步；服务器工具变更只能靠用户保存配置触发 `reload`。

**风险**：服务器进程崩溃后不会自动恢复，需要进程重启或手动保存配置。当前阶段可接受（MCP 是「未来通用开发」铺路功能，非核心闭环），但属于**已知缺口**。

---

## 3. 超时（本次对齐补齐）

**dsh —— `index.ts`**：
- `DEFAULT_TOOL_CALL_TIMEOUT_MS = 60_000`，挂在 `toolCallTimeoutMs` 配置项；`callTool` 把 `AbortSignal` 透传给 SDK，SDK 再 abort 底层 transport。
- 握手本身没有独立短超时（依赖 SDK 的 `requestTimeout`）。

**我们（补齐后）**：
- `McpClient` 新增 `DEFAULT_CALL_TIMEOUT_MS = 60_000`，`callTool` 双层生效：
  1. **客户端层** `withCallTimeout`（`client.ts`）：即便传输层忘记/不支持超时，也保证**失败闭合**（fail-closed），调用方永不无限挂起。
  2. **传输层** `request(method, params, { timeoutMs, signal })`：
     - `StdioMcpTransport`：定时器到点 reject 并**清理 pending 条目**（避免孤儿项与 `nextId` 泄漏）。
     - `StreamableHttpTransport`：用 `AbortController` 包裹 `fetch` + SSE 读取，超时即 abort 在途网络请求。
- 握手超时仍是 `McpManager.HANDSHAKE_TIMEOUT_MS = 10_000`（**比 dsh 更严**，确保 `app.whenReady` 时单台服务器卡死不会拖垮整个启动）。

```ts
// desktop/src/shared/agent/mcp/client.ts
const DEFAULT_CALL_TIMEOUT_MS = 60_000
async callTool(name, args) {
  return this.withCallTimeout(
    this.transport.request('tools/call', { name, arguments: args }, { timeoutMs: this.callTimeoutMs })
  )
}
```

**单测**（`tests/unit/mcp.test.ts`）：新增 3 条 —— 默认 60s 透传、客户端层超时 fail-closed、stdio 真实进程不响应时按超时 reject 并回收子进程。

---

## 4. 工具命名与同步

**dsh —— `tools.ts`**：
- 命名 `mcp__<server>__<raw>`；当规范化/截断（64 字符上限）改变了原名时，追加 **SHA-256 12 位十六进制后缀** 防碰撞。
- `syncTools` 两阶段（fetch + swap），冲突策略 `contain` / `throw`；`listChanged` 触发重同步。
- 结果 `CallToolResult` schema 校验；`isError → throw`。

**我们**：
- 命名 `mcp.<server>.<tool>`（点分隔，与我们工具面前缀一致），由 `mcpToolId(server, tool)` 生成，无规范化/哈希后缀（我们允许服务器工具名直接透传，冲突概率低；若未来需要再引入后缀）。
- `listTools` 在 `connect` 时拉一次；**无 `listChanged` 重同步**（见 §2）。
- 结果处理：`isError === true → success:false`（在 `mcpToolToSkill` 的桥里收敛），异常整体收敛为 `success:false` 不抛给 Brain 循环 —— 与 dsh 的 fail-closed 取向一致，但 dsh 多了一层 `CallToolResult` schema 校验（我们仅取 `content` 数组，其余忽略）。

---

## 5. 结果校验与图像准入

**dsh**：
- 严格按 `CallToolResult` schema 校验返回结构。
- **图像准入**：结果里的图像（PNG/JPEG/WebP/GIF）走规范化 base64，并写入 attachment store，作为多模态输入回灌对话。

**我们**：
- `McpCallResult` 只取 `content: Array<{ type, text? }>` 与 `isError`；非文本块（含图像）**被丢弃**，不进附件系统。
- 没有图像准入通道 —— 与 dsh 的 vision 回灌能力存在差距。

**优先级**：低。当前 MCP 定位是「开发类工具（fs/git/shell）」，大多是文本。如需接「截图/视觉」类 MCP 服务器再补。

---

## 6. 配置与风险分级

| 项 | dsh | 我们 |
|---|---|---|
| 配置形态 | `mcpServers`（`command`/`url`/`headers`/`env`） | 同构，`userData/mcp.json` 可直接搬 |
| 每服务器风险档 | 无显式档位（靠工具名/schema） | 有：配置 `risk` 或工具名启发式（shell/write/delete→SYSTEM 需二次确认；read/list→READ_ONLY） |
| instructions 截断 | `maxInstructionBytes=32768` | 无（instructions 仅透传，未截断也未注入 server-context 式提示） |
| serverName 校验 | `[A-Za-z0-9_-]{1,32}` | 无显式校验（依赖配置解析容错） |

我们的**风险分级**反而比 dsh 更贴合「审批门」需求（dsh 没有我们这套 `RISK_LEVEL` + 二次确认机制），这是桥接成 `SkillProtocol` 带来的红利。

---

## 7. 差异清单与优先级

| # | 能力 | dsh | 我们 | 状态 | 优先级 |
|---|---|---|---|---|---|
| 1 | 逐调用超时 | 60s（AbortSignal → SDK） | **60s（客户端 + 传输双层）** | ✅ 已补齐 2026-10-31 | — |
| 2 | 握手超时 | SDK `requestTimeout` | 10s（更严） | ✅ 已有 | — |
| 3 | 连接监督器 / 重连退避 | generation + 有界指数退避 + `maxAttempts` | 无 | ❌ 缺口 | 中（非核心闭环） |
| 4 | `listChanged` 自动重同步 | 有 | 仅手动 `reload` | ❌ 缺口 | 中 |
| 5 | 工具名规范化 + SHA 后缀 | 有 | 点分隔直透 | ⚠️ 可接受 | 低 |
| 6 | `CallToolResult` schema 校验 | 严格 | 宽松（只取 content） | ⚠️ 可接受 | 低 |
| 7 | 图像准入 → 附件/vision | 有 | 无（图像被丢弃） | ❌ 缺口 | 低 |
| 8 | instructions 截断 / serverName 校验 | 有 | 无 | ❌ 缺口 | 低 |

### 建议落地顺序
1. **（已做）逐调用超时 60s** —— 低成本高价值，防止工具调用永久挂起。
2. **连接监督器 + `listChanged` 重同步** —— 提升 MCP 健壮性，建议作为后续独立 slice（可参考 `connection.ts` 的 generation/退避模型，但保持我们「桥接成技能」的出口不变）。
3. **图像准入** —— 仅当要接视觉类 MCP 服务器时再做。
4. **工具名 SHA 后缀 / schema 校验 / instructions 截断** —— 防御性增强，按需补。

---

## 8. 验证（本次改动）

```bash
npx vitest run tests/unit/mcp.test.ts   # 17 条（含 3 条超时）
npm run typecheck                      # tsc ×3 通过
npm run lint                           # eslint 通过
env -u NODE_OPTIONS npm run build      # 构建通过
npx vitest run                         # 全量 3475 通过 / 6 跳过（基线 +3）
```

涉及文件：
- `desktop/src/shared/agent/mcp/types.ts` —— 新增 `McpRequestOptions`（`timeoutMs` / `signal`），`McpTransport.request` 加可选第三参。
- `desktop/src/shared/agent/mcp/client.ts` —— `DEFAULT_CALL_TIMEOUT_MS=60_000` + `withCallTimeout` 失败闭合。
- `desktop/src/main/agent/mcp/stdioTransport.ts` —— `request` 支持超时/中断，pending 带 cleanup。
- `desktop/src/main/agent/mcp/streamableHttpTransport.ts` —— `fetch` 走 `AbortController`，超时 abort + `cause` 保留。
- `desktop/tests/unit/mcp.test.ts` —— 新增 3 条超时测试（含真实 stdio 子进程）。
