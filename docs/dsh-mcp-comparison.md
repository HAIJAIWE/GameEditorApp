# dsh × 本项目：MCP 接入对照报告

> 目的：把参考项目 `deepseek-harness`（下文称 **dsh**）的 MCP 实现，与我们 `GameEditorApp/desktop` 的 MCP 子系统做一次**逐文件、逐能力**的对照，标出差异、补齐项与优先级。
>
> dsh 源码基准（本次对照使用的真实路径）：  
> `deepseek-harness-master/deepseek-harness-master/packages/mcp/mcp-client/src/`
>
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
- **我们** 把 MCP 做成 **「技能的另一个来源」**：MCP 工具被桥接成 `SkillProtocol` 注册进既有 `SkillDispatcher`，                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                                    工具面分组、档位限量、审批门、操作日志、Brain 循环**全部零改动复用**。代价是少了 dsh 的「连接自愈」与「工具名归一」细节。

**本次已补齐（2026-10-31）**：

- 逐调用超时 60s（对齐 dsh 的 `DEFAULT_TOOL_CALL_TIMEOUT_MS=60_000`），见 §3；
- 连接监督器 + `listChanged` 自动重同步（对齐 dsh 的 `connection.ts`），见 §2/§9；
- 四项防御性补齐（工具名规范化 + SHA-256 12 位后缀、`CallToolResult` 严格 schema 校验、图像准入 → 附件/vision、`serverName` 校验 + `instructions` 截断），见 §4/§5/§6。  
  至此 §7 八项差异**全部对齐或达成可接受态**。

---

## 1. 架构对照

| 维度     | dsh                                  | 我们                                                  |
| ------ | ------------------------------------ | --------------------------------------------------- |
| 接入形态   | Cordis 插件（`mcp-client`），一服务器一实例      | 主进程单例 `McpManager`（`manager.ts`）                    |
| 工具出口   | 直接挂进 dsh 的工具调用面                      | 桥接成 `SkillProtocol` → `SkillDispatcher`（复用全部既有机制）   |
| 工具 id  | `mcp__<server>__<raw>`（+SHA 后缀，见 §4） | `mcp.<server>.<tool>`                               |
| 传输层    | 官方 SDK `Client` + 官方 transports      | 自研 `StdioMcpTransport` + `StreamableHttpTransport`  |
| 协议语义   | SDK 包办（`initialize`/`list`/`call`）   | `McpClient` 自研（协议层，可注入假传输层单测）                       |
| 连接生命周期 | 插件级 `start` / `stop`，带监督器            | 应用级 `connect`（app.whenReady 一次）+ 库级 `attach`（切库重注册） |

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

- `McpClient` 新增 `DEFAULT_CALL_TIMEOUT_MS = 60_000`，`callTool` 双层生效（详见 §3）：
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

**我们（补齐后）**：

- 命名 `mcp.<server>.<tool>`（点分隔，与我们工具面前缀一致），由 `mcpToolId(server, tool)` 生成。在桥接层 `bridge.ts` 新增 `normalizeMcpToolName`：**非 `[A-Za-z0-9_-]` 字符 → `_`**、超 64 字符截断、改动原名时追加 **64 位 FNV-1a 取 12 位十六进制后缀**（对齐 dsh 的 SHA-256 12 位后缀，防碰撞）；`mcpToolId` 以归一化名作宿主键，避免脏字符进工具面 id。
- `listTools` 在 `connect` 时拉一次；**已有 `listChanged` 自动重同步**（见 §2/§9）。
- 结果处理：`isError === true → success:false`（在 `mcpToolToSkill` 的桥里收敛），异常整体收敛为 `success:false` 不抛给 Brain 循环。新增**严格 `CallToolResult` schema 校验**（§5）：非对象 / `content` 非数组 / 块缺 `type` / 图像块缺 `data` 或 MIME 非法 → `parseCallToolResult` 直接抛错，fail-closed。

---

## 5. 结果校验与图像准入

**dsh**：

- 严格按 `CallToolResult` schema 校验返回结构。
- **图像准入**：结果里的图像（PNG/JPEG/WebP/GIF）走规范化 base64，并写入 attachment store，作为多模态输入回灌对话。

**我们（补齐后）**：

- `McpCallResult.content: McpContentBlock[]`，每个块 `{ type, text?, data?, mimeType? }`；`parseCallToolResult` 严格校验（非对象 / `content` 非数组 / 块缺 `type` → 抛错；图像块缺 `data` 或 MIME 不在 `MCP_ALLOWED_IMAGE_MIME`（png/jpeg/webp/gif）→ 抛错）。
- **图像准入 → vision 链路**：`mcpToolToSkill` 把合法图像块收敛为 `SkillResult.images`（`data:<mime>;base64,<data>` data URL）；`buildToolMessage(..., images)` 透传到 `BrainMessage.images`，由传输层按 `modelSupportsVision` 决定是否下发（对齐记忆 §6 的 vision 单点真源 `resolveVisionSupport`）。未命中视觉模型的服务器结果，图像仍保留在 `SkillResult.images` 但传输层不下发并在提示词说明「仅提供路径」。
- 与 dsh 差异：dsh 走 attachment store，我们走 `SkillResult.images` → Brain vision 通道（更贴合既有 vision 管线，不另建附件表）。
- **聊天卡内联渲染（对齐 dsh `ui-tool` 的 `tool.call.images` 槽）**：`SkillResult.images` 经 `step_done` 事件（`images?` 字段）透传到 `DigitalStep.images`，`ToolStepCard` 在「输出」段下方渲染缩略图条，点击经 `AttachmentLightbox` 全屏查看。dsh 的图像走持久化附件引用 + Gateway URL；我们用内联 `data:` URL（MCP 图像直接来自 `CallToolResult` base64，不经附件系统），渲染层一致。

**优先级**：原「低」，现已补齐（含前端卡片渲染）。

---

## 6. 配置与风险分级

| 项               | dsh                                           | 我们                                                                                                                                                                                                           |
| --------------- | --------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 配置形态            | `mcpServers`（`command`/`url`/`headers`/`env`） | 同构，`userData/mcp.json` 可直接搬                                                                                                                                                                                  |
| 每服务器风险档         | 无显式档位（靠工具名/schema）                            | 有：配置 `risk` 或工具名启发式（shell/write/delete→SYSTEM 需二次确认；read/list→READ_ONLY）                                                                                                                                     |
| instructions 截断 | `maxInstructionBytes=32768`                   | **`truncateInstruction` 截断到 `MCP_MAX_INSTRUCTION_BYTES=32768`**，并经 `McpManager.serverInstructionBlocks()` 注入系统提示词（格式 `### MCP server: <name>\n\n<text>`），对齐 dsh `server-context.ts` 的 `systemPrompt.section` |
| serverName 校验   | `[A-Za-z0-9_-]{1,32}`                         | **`SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/`**，`parseMcpConfig` 直接跳过不匹配的键（容错）                                                                                                                           |

我们的**风险分级**反而比 dsh 更贴合「审批门」需求（dsh 没有我们这套 `RISK_LEVEL` + 二次确认机制），这是桥接成 `SkillProtocol` 带来的红利。

---

## 7. 差异清单与优先级

| # | 能力                              | dsh                                 | 我们                                                                 | 状态               | 优先级 |
| - | ------------------------------- | ----------------------------------- | ------------------------------------------------------------------ | ---------------- | --- |
| 1 | 逐调用超时                           | 60s（AbortSignal → SDK）              | **60s（客户端 + 传输双层）**                                                | ✅ 已补齐 2026-10-31 | —   |
| 2 | 握手超时                            | SDK `requestTimeout`                | 10s（更严）                                                            | ✅ 已有             | —   |
| 3 | 连接监督器 / 重连退避                    | generation + 有界指数退避 + `maxAttempts` | **generation 隔离 + 有界指数退避（500→30000）+ maxAttempts=10**              | ✅ 已补齐 2026-10-31 | —   |
| 4 | `listChanged` 自动重同步             | 有                                   | **通知驱动 `tools/list` 重拉 + 增量注册/注销**                                 | ✅ 已补齐 2026-10-31 | —   |
| 5 | 工具名规范化 + SHA 后缀                 | 有                                   | 点分隔 + `normalizeMcpToolName`（脏字符→`_`，截断 64，改动时追加 12 位十六进制后缀）       | ✅ 已补齐 2026-10-31 | —   |
| 6 | `CallToolResult` schema 校验      | 严格                                  | 严格（`parseCallToolResult` 抛错 fail-closed）                           | ✅ 已补齐 2026-10-31 | —   |
| 7 | 图像准入 → 附件/vision                | 有                                   | `SkillResult.images` → `BrainMessage.images`（传输层按视觉模型能力下发）         | ✅ 已补齐 2026-10-31 | —   |
| 8 | instructions 截断 / serverName 校验 | 有                                   | `MCP_MAX_INSTRUCTION_BYTES=32768` 截断 + `SERVER_NAME_PATTERN` 跳过非法键 | ✅ 已补齐 2026-10-31 | —   |

### 建议落地顺序

1. **（已做）逐调用超时 60s** —— 低成本高价值，防止工具调用永久挂起。
2. **（已做）连接监督器 + `listChanged` 重同步** —— `McpManager` 重构为「每台服务器一个 `ServerConnection` + 监督器」：`onDisconnect` 触发有界指数退避重连（generation 隔离避免旧连接回调污染）；服务器推 `notifications/tools/list_changed` 触发 `tools/list` 重拉并增量注册/注销。保持「桥接成技能」出口不变。详见下方 §9。
3. **（已做）工具名规范化 + SHA 后缀 / `CallToolResult` 严格校验 / 图像准入 → vision / `serverName` 校验 + `instructions` 截断** —— 四项防御性补齐，见 §4/§5/§6 与新测试 `tests/unit/mcpGaps.test.ts`。

---

## 8. 验证（本次改动）

```bash
npx vitest run tests/unit/mcp.test.ts        # 17 条（含 3 条超时）
npx vitest run tests/unit/mcpSupervisor.test.ts  # 4 条（监督器）
npx vitest run tests/unit/mcpGaps.test.ts    # 15 条（四项补齐）
npm run typecheck                            # tsc ×3 通过
npm run lint                                 # eslint 通过
env -u NODE_OPTIONS npm run build            # 构建通过
npx vitest run                                # 全量 3494 通过 / 6 跳过（基线 3472 +3 +4 +15）
```

涉及文件：

- `desktop/src/shared/agent/mcp/types.ts` —— 新增 `McpRequestOptions`（`timeoutMs` / `signal`），`McpTransport.request` 加可选第三参；`McpTransport` 加可选 `onNotification` / `onDisconnect` 钩子；`McpContentBlock` / `McpCallResult.content: McpContentBlock[]`；`MCP_ALLOWED_IMAGE_MIME`、`MCP_MAX_INSTRUCTION_BYTES`。
- `desktop/src/shared/agent/mcp/client.ts` —— `DEFAULT_CALL_TIMEOUT_MS=60_000` + `withCallTimeout` 失败闭合；`initialize()` 返回 `instructions`；`parseCallToolResult` 严格校验；`truncateInstruction`；构造时转发 `onNotification`。
- `desktop/src/shared/agent/mcp/bridge.ts` —— `TOOL_NAME_MAX=64`、`shortHash`（64 位 FNV-1a 取 12 位十六进制）、`normalizeMcpToolName`（脏字符→`_`，截断 64，改动时追加后缀）；`mcpToolToSkill` 收敛图像块 → `SkillResult.images`。
- `desktop/src/shared/agent/mcp/config.ts` —— `SERVER_NAME_PATTERN = /^[A-Za-z0-9_-]{1,32}$/`；`parseMcpConfig` 跳过不匹配键。
- `desktop/src/shared/agent/config/protocol.ts` —— `SkillResult.images?: string[]`。
- `desktop/src/shared/agent/runtime/brainMessages.ts` —— `buildToolMessage(..., images?)` 附加图像。
- `desktop/src/shared/agent/brain/loop.ts` —— `runTool` 透传 `images` 到工具消息。
- `desktop/src/main/agent/mcp/stdioTransport.ts` —— `request` 支持超时/中断，pending 带 cleanup；`handleLine` 路由服务器通知；`failAll` 在真实断开时触发 `onDisconnect`。
- `desktop/src/main/agent/mcp/streamableHttpTransport.ts` —— `fetch` 走 `AbortController`，超时 abort + `cause` 保留；`readSse` 路由服务器推送通知。
- `desktop/src/main/agent/mcp/manager.ts` —— **重构为「每台服务器一个 `ServerConnection` + 监督器」**：generation 隔离 + 有界指数退避重连（500→30000、maxAttempts=10）+ `listChanged` 重同步（增量注册/注销）；`serverInstructions(server)` 暴露截断后的 instructions；`serverInstructionBlocks()` 按 dsh 格式产出系统提示词块。
- `desktop/src/main/agent/agentService/service.ts` —— `chat()` 构建系统提示词时，经 `mcpManager.serverInstructionBlocks()` 把已连接且带 instructions 的 MCP 服务器提示文本注入 `extraBlocks`（对齐 dsh `server-context.ts` 的 prompt 注入；instructions 是模型可见文本，非 UI 面板）。
- `desktop/tests/unit/mcp.test.ts` —— 17 条（含 3 条超时，含真实 stdio 子进程）。
- `desktop/tests/unit/mcpSupervisor.test.ts` —— 4 条（连接注册 / listChanged 重同步 / 断开立即注销 / 退避重连，假传输层）。


- `desktop/tests/unit/mcpGaps.test.ts` —— 15 条（工具名规范化 / schema 校验 / 图像准入 / serverName 校验 + instructions 截断）。

## 9. 连接监督器设计要点（2026-10-31 补齐）

- **`ServerConnection` 粒度**：每台服务器一条记录，独立 `generation` / `reconnectAttempts` / `reconnectTimer`。`connect` 不再 await 单台（失败隔离，单台慢/挂不影响其他与 agent 本体）。
- **generation 隔离**（对齐 dsh）：每次（重）连接 `generation += 1`；握手 / 列工具 / 重同步的异步结果都带 generation 校验，过期结果一律丢弃，杜绝旧连接回调污染新连接。
- **`onDisconnect` 自愈**：stdio 进程崩溃 → `failAll` 触发 `onDisconnect` → 立即把该服务器工具失效（注销 + 清动态风险 + `toolCount` 归零，避免调用挂起/空响）→ 安排重连。HTTP 无持久连接，故不实现 `onDisconnect`（不自动重连）。
- **有界指数退避**：`delay = min(30000, 500 × 2^attempts)`；成功一次即 `reconnectAttempts=0`（对冷启动慢的服务器可撑过 ~100s 退避窗口）；达 `maxAttempts=10` 停止并告警。同一服务器同时只挂一个重连定时器（去重）。
- **`listChanged` 重同步**：服务器推 `notifications/tools/list_changed` → 重新 `tools/list`（带 10s 握手超时兜底）→ 与旧工具集 diff：消失的注销、新增/变更的注册。generation 守卫保证只应用最新结果。
- **保留的「桥接成技能」出口不变**：重连/重同步后仍是 `mcpToolToSkill` 注册进 `SkillDispatcher`，工具面/审批/日志零改动复用。
