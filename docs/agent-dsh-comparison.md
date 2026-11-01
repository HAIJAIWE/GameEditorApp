# 智能体对照：dsh 源码 vs 本项目（智能体该怎么落）

> 状态：**只读调研**（2026-10-28）。目的：在动手做「智能体」之前，先把 dsh 的实现读清楚，给出「抄什么、不抄什么、按什么顺序」的结论。
>
> **导航：三份对照文档的分工。** 本篇 = **智能体内核专项**；`dsh-ui-comparison.md` = **UI 专项**（逐组件改写地图）；`project-dsh-comparison.md` = **全项目级总览**（本篇未覆盖的产品应用层、工具族、上下文压缩、持久化、宿主集成）。
> dsh 源码位置：`D:/GameEditorApp/deepseek-harness-master/deepseek-harness-master/packages/`（完整 monorepo；`/d/dsh` 只是运行/配置目录，不是源码）。
> 本项目 agent：`desktop/src/shared/agent/brain/loop.ts` + `desktop/src/main/agent/dispatcher.ts` + `main/agent/skills/`。

---

## 0. 一句话结论

> **前提：云端优先。** 参数（并发/工具面/预算）按档位分：云端取 dsh 同款激进值，本地才保守。不用本地模型的局限去否架构。

**智能体不是「一个主区视图」，而是「智能体的前端」。** 它已经做对了（`DigitalPanel` = 聊天 UI，走 `agent.chat` + 事件流，是薄客户端）。
真正要补的不是 UI 插件化，而是**后端三件事**：① 子智能体的「异步 activation + 完成通知」模型；② 工具执行改成「全批次 + 保序 + 独占屏障 + 默认并行」；③ 会话事件日志（可恢复/可审计）。

**不建议**把 `DigitalPanel` 迁成 `mainView`（它是右栏常驻的 agent 面，不是中间页签）。

---

## 1. dsh 的智能体架构：两个平面 + 一堆可替换包

dsh 用 **cordis** 做插件组合，profile 是 YAML 补丁层（`bundles` + `cordis.patch.yml`）。关键分层：

| 平面 | 谁负责 | 内容 |
|---|---|---|
| **host-plane** | 宿主组合（`dsh-base` + `dsh-web-app`） | 注册表、沙箱、审批栈、持久化、模型路由 |
| **agent-plane** | 预设（`agent.cordis.yml`） | 人设（persona）、工具行（tool rows） |

> 预设文件原话：「This file is an AGENT-PLANE composition... The host composition keeps everything a preset must not own: the registries themselves, the sandbox and approval stack, persistence, and the model route.」

**包地图**（`packages/`）：

| 包 | 职责 |
|---|---|
| `core/agent-loop` | 默认 agent 驱动器：创建/恢复 agent，跑轮次与步骤 |
| `core/tools` | 工具注册表 + 带守卫的执行流水线 |
| `core/session` | append-only 会话事件日志（历史由此派生） |
| `core/system-prompt` | 有序段 + 工具 schema + 变量组装提示词 |
| `subagent/subagent` | 委派服务（一个服务 + 多个 provider） |
| `subagent/tool-subagent` | 面向模型的 `subagent` 工具 |
| `skill/tool-skill` | `<available_skills>` 目录 + `skill` 加载工具 |
| `guard/repeat-tool-reminder` | 重复工具调用提醒（建议性） |
| `sandbox/sandbox-policy` | 逐调用文件操作策略 |
| `interaction/user-approval` | 一次性审批 seam（ask/never） |
| `interaction/tool-ask-user` | `ask_user_question`（阻塞/timed） |
| `preset/agent-preset` | 预设注册表（persona + 工具过滤） |

---

## 2. 六个关键机制（读源码提炼）

### 2.1 Agent 循环（`core/agent-loop`）

- **每个步骤**：发「派生历史 + 可见工具 schema」→ 模型工具调用走**受守卫的工具流水线**→ 每个被接纳的事实**追加进会话日志**，下一步据此派生。
- **`maxParallelToolCalls`**：volatile 正整数，**默认 10**；`1` = 串行。每个批次把当前值传给 `execute()`，优先级高于执行器配置，**实时改动下一批生效**。
- 循环把**完整原始调用批次**交给 `ctx.tools.execute()`；内置执行器**保留模型顺序 + 独占屏障**。
- **协作式取消**：`agent.cancel()` 中止当前活动并清空待处理（除非 `keepInbox`）；已流式交付的文本会终结保留。
- **inbox**：`agent/inbox/spliced|discarded|claimed|inserted`——支持运行中插话（Steer）/排队（Queue）。

### 2.2 工具流水线（`core/tools`）

- `defineTool({ name, description, parameters, output, execute })`：类型化参数/输出，执行前校验，无效输入变普通错误结果。
- `ctx.tools.execute()` 接受**完整原始批次**；allow/deny/ask 策略；失败返回最终结果**不中止当前轮**。
- **条件工具** `register(def, { when })`：每步算一次，false 则从描述/PTC/执行集合排除。
- 超时、并行安全标记、可选 UI 展示。

### 2.3 子智能体（`subagent`）—— 智能体的核心差距

- **一个服务，多个 provider**：`spawn` / `fork` / `acp` / `claude-code` / `codex` / `dsh-sdk`。每个后端以唯一名称注册。
- **`startActivation()` 返回 `{ childId, result, dispose }`**；工具调用**立即返回 `started subagent <childId>`，不等待**；运行时负责执行、**完成通知**、清理。
- **`maxDepth` 默认 1**（`0` 禁止、`'provider-managed'` 交给外部）；**`maxActiveSubagents` 默认 8**（每棵 activation 树共享名额，根父不占位）。
- **本地 spawn/fork 子级**：保留持久会话，可 `sendMessage()` 追加工作、可**冷恢复**；**外部后端**只执行一次，不接受后续消息。
- **`delivery: 'parent' | 'caller'`**：父级拿完成通知，或调用方（工作流）等待结果。
- 子级 preset（`agentPreset` / `allowedAgentPresets`）、子级模型选择（`modelSelectionSettings` + `list_subagent_models`）。
- **措辞随上下文变**：全新子 agent「看不到这段对话」；fork 子 agent「看不到当前这轮进行中的内容」。

### 2.4 技能（`skill/tool-skill`）

- 首次请求前注入**持久目录**（名称 + 有长度上限的描述）；`skill` 工具加载完整指令；用户可用 `/name` 调用。
- 目录变更**追加一份完整替换**（空目录停用旧名称）。

### 2.5 循环卫生（`guard/repeat-tool-reminder`）

- 检测**完全相同的工具调用**（同工具、同参数、与属性顺序无关）；默认在 **3/5/8 次**提醒。
- **只是建议**，绝不阻止或延迟合理重复；新用户消息清计数；每 agent 独立跟踪。

### 2.6 沙箱 + 审批（`sandbox` / `interaction`）

- **沙箱策略**：逐调用文件操作策略；**默认 `read-only`（故障安全）**，`workspace-write` 需显式选择；会话可切换并跨重启保留；模型收到「有效策略」但**不收到能力清单**。
- **审批**：一次性 seam；`ask`（默认）→ 应答者 waterfall；`never` → 确定性拒绝（CI/无头）；应答者缺失/失败 → `unavailable` **以拒绝关闭（fail-closed）**；每次请求/结果**记进会话审计日志**。
- **`ask_user_question`**：阻塞 / `timed`（到期模型可继续独立工作，问题仍可答）/ `timeout:-1` 无限；**存活的子 agent 不能调用**。

---

## 3. 本项目现状（准确参数）

| 项 | 现状 | 位置 |
|---|---|---|
| 循环 | `runBrainLoop`：推理→工具→反思；`maxTurns` 默认 **6**；`wallClockMs` 默认 **120s** | `shared/agent/brain/loop.ts` |
| 取消 | 内部 controller + 外部 signal 转发；**abort 在途 HTTP**（不只下一轮检查） | 同上 |
| 工具执行 | **顺序默认**；`parallelToolCalls` opt-in；`maxToolConcurrency` 默认 **4**；保序 | 同上 |
| 失败计数 | 同工具同动作连续失败 ≥**3** → 注入 `[STOP]`（比 dsh 更硬） | 同上 |
| 子智能体 | `tool.spawn_subagent`：**同步递归** `runBrainLoop`（独立消息、同工具面），结果包「子智能体结果：…」回灌；**depth ≤ 1**；子循环 `maxTurns:3` / 墙钟 ≤60s | 同上 |
| 分发/审批 | `SkillDispatcher`：注册/模糊匹配/**审批门**/权限；单令牌 `dangerConfirmed`（故审批不并行） | `main/agent/dispatcher.ts` |
| 技能 | 6 个：ceshu / code / gameData / rollback / askUser / spawn_subagent | `main/agent/skills/` |
| 工具面 | 档位限量（本地 8 / 云端 15），MCP 配置可 `maxTools` 覆写 | `shared/agent/toolGroups.ts` |
| 风险分级 | 动态风险表 + 名称启发式（shell/write/delete→SYSTEM） | `shared/agent/protocol.ts` |
| MCP | stdio + Streamable HTTP；工具→SkillProtocol；配置 UI | `shared/agent/mcp/`、`main/agent/mcp/` |
| 会话 | `messages` 数组（内存）+ session store（非 append-only 事件日志） | `shared/agent/brain/`、`main/agent/` |
| 插话 | 无 | — |

---

## 4. 差距对照表

| 维度 | dsh | 本项目 | 差距 | 对「智能体」的影响 |
|---|---|---|---|---|
| **子智能体模型** | 异步 activation + 完成通知 + 深度/容量/消息/冷恢复 | 同步递归、depth≤1 | **大** | 高：多角色协作/长任务做不了 |
| **工具执行** | 全批次 + 保序 + 独占屏障 + 默认并行 10 | 顺序默认、并行 opt-in 4 | **大** | 中高：多工具回合慢 |
| **会话模型** | append-only 事件日志 + 投影 | 内存 messages | **大** | 中：恢复/审计/长会话弱 |
| **插话/steering** | inbox（insert/claim/splice） | 无 | 中 | 中：跑起来就不能改需求 |
| **审批** | ask/never + fail-closed + 审计 | 审批门（单令牌） | 中 | 低：已有，缺无头模式 |
| **沙箱** | 逐调用文件策略（read-only 默认） | 风险分级 + 审批 | 中 | 低（本项目不跑 shell 为主） |
| **技能** | 目录注入 + 按需加载 + `/name` | 6 个硬编码技能 | 中 | 中：技能扩展要改代码 |
| **重复调用 guard** | 精确重复 + [3,5,8] 建议 | failCount≥3 直接 `[STOP]` | 小 | 低（我们更硬，但会误杀合理重复） |
| **preset** | YAML 组合（persona+工具行） | `presets.ts` 借设计 | 中 | 中：换人格/工具要改代码 |
| **取消** | 协作式、保留已交付文本 | 已实现（abort 在途） | 小 | — |

---

## 5. 对「智能体」的结论

> **前提：本产品是云端优先**（用户 2026-10-28 明确）。本地模型要么需要训练、要么在工具调用上不可靠——所以**不拿本地模型的保守假设去限制架构**。凡「按档位可调」的参数，云端档取 dsh 同款激进值，本地档才保守。

### 5.1 抄什么（按优先级）

1. **子智能体的异步模型**（最高优先）
   - 工具调用立即返回 `started subagent <id>`，**不阻塞父循环**；运行时在子任务完成后发**完成通知**（父级下一轮据此继续）。
   - `maxDepth`（默认 1）+ `maxActiveSubagents`（默认 8，按树共享名额）。
   - 本地子级支持 `sendMessage` + 冷恢复（至少先做「完成后可继续对话」）。
   - 这条直接决定「智能体能不能带一队子智能体干活」。

2. **工具执行的全批次 + 保序 + 屏障**
   - 把「逐工具 await」改成「全批次交执行器，保序返回」；非审批工具默认并行。
   - **并发按档位**：云端档默认 **10**（dsh 同值），本地档保守（现 4）。`maxTurns`/墙钟/工具面同理：云端放宽，本地收紧。
   - 审批/交互仍串行（单令牌），作为**独占屏障**。

3. **会话事件日志**（中期）
   - 现在 messages 在内存，长会话/恢复/审计都弱。可先做「append-only 事件 + 投影」的最小版。

### 5.2 抄机制，不抄框架（区分清楚）

之前这里写「不抄」，其中两条是**本地模型偏见，已纠正**；剩下的是真取舍：

| 项 | 结论 | 理由 |
|---|---|---|
| **`maxParallelToolCalls=10` / 大工具面 / 长预算** | **抄（云端档）** | 云端模型工具调用稳、上下文大；之前用「本地 4B 会挑错」否掉是错的。改 tier-aware：云端 10 / 本地 4。 |
| **子智能体服务 seam（多 provider）** | **抄机制** | dsh 的核心是 `ctx.subagents` + provider 注册表（spawn/fork/acp/…）。我们该抄「服务 + 多后端」的**结构**，不必 vendor cordis 框架。 |
| **cordis 运行时本身** | **暂不 vendor** | 它是 dsh 的 DI 容器；我们 UI 层已有 `PluginHost`，agent 层可先做**轻量 service registry**（几十行）达到同样解耦。真要 vendor 再评估依赖/学习成本。 |
| **沙箱 policy（read-only 默认 / workspace-write）** | **抄 seam** | 与云端/本地无关，是「agent 能否写文件/跑命令」的安全边界。云端 agent 会写代码就跑不了没有边界。**不抄** Windows ACL 全套实现。 |
| **`DigitalPanel` 迁 `mainView`** | **不抄** | 它是右栏常驻的 agent 面，不是中间页签。将来插件化走 `view` + `app.dock`。 |

### 5.3 建议的落地顺序（切片）

| 片 | 内容 | 风险 |
|---|---|---|
| A | 子智能体改**异步 activation + 完成通知**（保留 depth≤1，先不做多 provider） | 中 |
| B | 工具执行改**全批次保序 + 屏障**（并行仍 opt-in，默认值不动） | 中 |
| C | 子智能体**容量上限**（`maxActiveSubagents`）+ `sendMessage` 继续对话 | 中 ✅（Slice 26/40） |
| D | 会话**append-only 事件日志**最小版（可恢复/审计） | 高 |
| E | 技能**目录注入 + 按需加载**（替代硬编码技能表） | 中 |
| F | 审批 `never` 无头模式 + 审计落库 | 低 |

> 每一片都要过四道闸 + e2e；A/B 是「智能体」体验的分水岭，建议先做。

> **已落地（Slice 25，2026-10-28）**：tier-aware 参数——云端档 `maxTurns 12 / wallClock 300s / 并行默认开·并发 10 / 工具面 24`；本地档 `6 / 120s / 关·4 / 8`。`loop.ts` 提前算 `tier`，`agentService` 不再显式兜底 `maxTurns`（否则盖掉档位默认）。
>
> **已落地（Slice 26，2026-10-28）**：子智能体改**异步 activation**——`spawn_subagent` 立即返回 `started subagent <id>`，父循环在 finalize 前 `drainSubAgents()` 收量并以「完成通知」注入，然后继续；并发上限 `MAX_ACTIVE_SUBAGENTS=8`，`depth≤1` 不变。
>
> **已确认（B 片基本已具备）**：工具执行已是「先预启动、再按原顺序 await」，审批/交互串行（独占屏障）——即 dsh 的「保序 + 屏障」语义；本轮只是把云端默认并发提到 10（Slice 25）。
>
> **已落地（Slice 27，2026-10-28）**：审批策略 `approvalPolicy: 'ask'(默认) | 'never'`——`never` 确定性拒绝危险操作、不发审批事件（无头/CI）。
>
> **已落地（Slice 28，2026-10-28）**：运行中收件箱 `BrainInbox { push, drain }`——循环每轮开始前 drain 注入 `user` 消息；`onSubAgentSpawned(childId, inbox)` 暴露子智能体 handle，可 `sendMessage` 插话（dsh inbox / Steer）。
>
> **已落地（Slice 29，2026-10-28）**：会话事件日志 append-only——`AgentSessionStore.recordEvents` 每轮写一行 `events.jsonl`（只追加不覆盖），`agentService` 每轮落盘 `result.events`。**最小版只审计**，不从日志派生历史。
>
> **已确认（E 片基本已具备）**：系统提示词已有 `## 可用工具`（`face.catalog`，按场景分组 + 每工具一行摘要），完整 schema 走 function calling——即 dsh 的「目录 + 渐进披露」。dsh 的 markdown 技能包是另一概念，本项目暂无。
>
> **已落地（Slice 30，2026-10-28）**：子智能体 **provider seam**——`SubAgentProvider { id, run(SubAgentTask) }`；默认进程内 `spawn`，外部后端（CLI/远程）实现接口注入 `subAgentProvider` 即可，不改循环。
>
> **已落地（Slice 31，2026-10-28）**：**CLI 外部后端**——`createCliSubAgentProvider`（`shell:false`、arg/stdin、超时/取消 kill、stdout→stderr 回退）。配置 `MB_SUBAGENT_CLI=claude`（可选 `MB_SUBAGENT_CLI_ARGS` JSON 数组 / `MB_SUBAGENT_CLI_INPUT=stdin`）即把子任务交给本地 CLI 编码智能体；未配置仍用进程内 spawn。
>
> **已落地（Slice 32，2026-10-28）**：**沙箱策略** `SandboxPolicy = 'read-only' | 'workspace-write'`（缺省后者）；`read-only` 下 **CLI provider 拒绝运行**（`MB_SANDBOX_POLICY=read-only` 切换）。**诚实边界**：非 OS 级隔离，强制点目前是「拒绝外部 CLI」。
> **事件日志回放**：`AgentSessionStore.readEvents(sessionId?)` 按会话读 run 记录 + `deriveTranscript` 派生可读轨迹（工具/最终答复/中止/轮次）。**仍非「从日志派生完整消息历史」**——恢复走 `save()` 快照。
>
> **已落地（Slice 33，2026-10-28）**：**远程子智能体 provider**——`createRemoteSubAgentProvider`（POST `{task,depth}` → `{text}`，headers 鉴权、超时/取消 abort）。`stores.ts` 优先级 **远程 URL（`MB_SUBAGENT_REMOTE_URL`/`_TOKEN`）> CLI（`MB_SUBAGENT_CLI`）> 进程内 spawn**。
>
> **已落地（Slice 34，2026-10-28）**：**事件溯源历史**——`AgentSessionStore.appendTurn`（`turns.jsonl`，只追加）+ `readTurns` + `deriveMessagesFromTurns`；`RunBrainLoopOptions.initialMessages` 播种历史；`AgentChatOptions.resumeHistory` 用稳定 `sessionId` 从轮次日志恢复。
>
> **已落地（Slice 35，2026-10-28）**：**OS 级文件沙箱（Windows ACL）**——`windowsSandbox.ts` 用 `icacls /deny <user>:(W)` 在窗口期真·拒绝写入、`finally` 恢复。CLI provider：`read-only` + 显式 `cwd` + `MB_SANDBOX_ACL=1` ⇒ 真·OS 只读；否则拒绝运行。**诚实边界**：非容器/内核隔离。
>
> **已落地（Slice 36，2026-10-28）**：**ACP 子智能体 provider**——`createAcpSubAgentProvider`（ACP v1：JSON-RPC 2.0 + ndjson；`initialize`→`session/new`→`session/prompt`，累积 `session/update` 的 `agent_message_chunk`，自动应答 `session/request_permission`，`session/cancel` 取消）。`MB_SUBAGENT_ACP` 启用；优先级 **远程 > ACP > CLI > 进程内**。
>
> **已落地（Slice 40，2026-10-28）**：**子智能体「继续对话」后端能力 → UI 接通**（C 片收尾）。① `loop.ts` 给每个子智能体**独立 `AbortController`**，`onSubAgentSpawned(childId, inbox, stopChild)` 额外暴露 `stopChild`（只 abort 子级，父级取消时经监听器级联 abort）；② `AgentBrainService` 加**本轮注册表** `childId → { inbox, stop }`，`chat()` 开始清空、`subagent_done` 时摘除，公开 `sendToSubagent` / `stopSubagent`；③ IPC `agent:subagentSend` / `agent:subagentStop` + preload + `MbApi`；④ 面板 `DigitalSubagentList` 对**运行中**子智能体显示「插话输入 + 停止」，停止后乐观标记「已停止」。**诚实边界**：仅对「本轮仍注册」的子智能体有效；已完成/跨轮返回 `ok:false`（面板不提示）；「插话」对进程内 spawn 子循环即时生效（子循环每轮 drain 自己的 inbox），外部 provider 是否消费 inbox 由其实现决定。
>
> **已落地（2026-11-01，技能级能力，对应 dsh 三个包）**：
> - `system.todo_write`（对齐 dsh `tool-todo`）：整表替换 + 三态 + 默认单 in_progress；清单作为工具结果进 messages，模型下一轮可见。
> - `compaction` 升级为 **LLM 结构化 checkpoint**（对齐 dsh `compaction-basic`）：云端档超压力阈值时调 `createCompactSummarizer` 生成 8 段交接摘要，失败回落模板；`maybeResetContextAsync` 统一入口。
> - `system.present_plan`（对齐 dsh `plan-mode` 的 `exit_plan_mode` 审阅流）：模型动手前把 `# 标题` 起头的 markdown 计划经 `SkillInteraction.detail` 交用户审阅，`批准并执行 / 需要修改` 二选一；**不引入会话级只读 plan 模式开关**（产品已有独立 Plan 工作模式，避免冲突），改为轻量门禁。渲染层 `SkillInteraction`/`SkillInteractionQuestion` 新增可选 `detail` 字段（等宽块展示长文本，不解析为富文本）。
> - `system.goal`（对齐 dsh `goal` + `tool-goal`）：目标生命周期管理（create/edit/pause/resume/complete/block/clear）+ 阶段 + 轮次上限 `maxRounds`。服务层把活跃目标的「目标 + 阶段 + 轮次进度」注入 `【本轮目标】` 提示词，并把循环 `maxTurns` 钳到 `maxRounds`（dsh `maxGoalRounds` 的轮次安全闸）。**v1 内存态**（非事件溯源投影），状态作为工具结果进 messages；不做 goal-round-driver 自动续跑。
> - **编程能力**（对齐 dsh `fs` + `fs-sandbox` + `shell`）：`system.file_ops`（read/list/write/edit/delete/mkdir/copy/move）与 `system.shell`（run）——让 agent 能改代码、跑命令。工作区根默认 `<库>/code`，可在面板「工作区」栏改选任意文件夹（持久化 `<库>/workspace.json`，技能用 `() => getWorkspaceRoot()` 动态读，运行时切换无需重建 dispatcher），受 `SandboxPolicy`（`read-only` 拒绝变更/命令）约束；路径围栏移植 dsh `containment.ts`（词法 + 文件身份双判定，防 `../` 穿越与 Windows 8.3/大小写别名）。风险：file_ops 的 read/list 免审批、其余 FILE_SYSTEM，shell 为 SYSTEM（每次审批）。**shell 硬化**：① 用 `spawn` + **进程树终止**（Windows `taskkill /T /F`、POSIX 进程组 kill），超时/结束不留孤儿进程；② 跑命令期间用 icacls 对库的 `data`/`ceshu`/`design` 加「拒绝写入」ACE（`withReadOnlyDirs`），越界命令也破坏不了游戏库。**诚实边界**：仍未做完整写围栏——命令可写到工作区之外的用户目录（dsh 用 bwrap/landlock/seatbelt/windows-acl 做内核级隔离），完整隔离列为后续。
> - **技术设计文档**（产品侧能力，非 dsh 移植）：`system.tech_doc`——GDD（策划书，描述「是什么」）之外的工程文档（描述「怎么实现」）。`outline` 返回标准 9 章大纲（概述/架构/模块/数据模型/接口/时序/依赖/风险/里程碑）+ 写作指引；`write`/`read`/`list` 存 `<库>/tech/<name>.md`（产品工件，与代码工作区 `<库>/code` 分开）。风险：outline/read/list 免审批、write DATA_WRITE。**面板**：主区新增「技术设计」页签（`techDoc.mainView`，order 20）——列表 + 预览/编辑 + 新建（预填大纲）+ 保存 + 导出 .md，经 `techDoc:*` IPC 复用技能逻辑。
> - **远程执行**（对齐 dsh `ssh` 的可用子集）：`system.ssh`（action=run）薄包装 `ssh -o BatchMode=yes -o ConnectTimeout=10`，参数 target/command/port/identity_file/timeout_ms，返回退出码与输出。认证依赖用户已配置的 key/agent；远端无法本地围栏，风险 SYSTEM（每次审批）。
> - **持久终端**（对齐 dsh `terminal` 的可用子集）：`system.terminal`（start/send/read/stop/status）——常驻 shell 会话，`cd`/环境变量/后台进程跨调用保留。**非真 PTY**（dsh 用 node-pty）：输出是管道流，无回显/光标/TUI；一次性命令仍用 `system.shell`。风险 SYSTEM（每次审批）。
> - **文档解析**（对齐 dsh `document` 的可用子集）：`system.document`（action=read）把工作区内文档转纯文本——docx/pptx 用 `jszip` 解 XML 取文本节点、xlsx 用 `exceljs`、txt/md/json/csv/yaml 直读；文件 20MB、文本 200K 字符上限；路径围栏在工作区。**PDF 需额外库，v1 明确 `EUNSUPPORTED`**（提示先转 docx/txt）。风险 READ_ONLY。
> - **网页抓取**（对齐 dsh `web-fetch-http` 的可用子集）：`system.web_fetch`（action=fetch）用 Node 全局 `fetch`，默认把 HTML 剥成纯文本（去 script/style、解实体），`raw:true` 回原始 HTML。**SSRF 防护**：默认拒绝 localhost/127/10/192.168/172.16-31/169.254/::1/.local；仅 http/https；超时 15s（上限 60s）、响应体 2MB、文本 200K 字符上限。风险 NETWORK（审批）。**搜索需外部 provider，本版不做**。
> - **LSP 代码导航**（对齐 dsh `lsp` + `lsp-stdio` + `tool-lsp`）：`system.lsp`（definition / references / implementation / hover，只读，免审批）。最小 stdio 客户端（`framing.ts` 按字节分帧、`lspClient.ts` 一次性生命周期 initialize→didOpen→请求→shutdown、服务器→客户端请求一律回 null）。**语言服务器由部署自备**（`<库>/lsp.json` 声明扩展名→命令，我们不随附）；坐标 1-based→0-based。单测用假 LSP 服务器 fixture 覆盖四个操作。
> - 项目约定文件（对齐 dsh `context/agent-instructions` 的 AGENTS.md 机制，取最小子集）：读库级 `<库>/AGENTS.md`，非空则作为常驻系统提示词块 `## 项目约定（AGENTS.md，用户维护，必须遵守）` 注入（32K 字符上限截断）。与「偏好（从反馈学）」「记忆（历史检索）」语义不同——这是**用户显式手写的强约定**，每轮常驻、优先级更高。dsh 的逐级发现/去重/增量刷新/字节预算不搬（一库一目录，单文件足够）。
> - `system.job` + `JobRegistry`（对齐 dsh `jobs` + `tool-jobs` 的注册表 seam）：把**异步子智能体**提升为可查询/可取消的一等后台任务。服务侧把 `subagent_started`/`subagent_done` 事件喂进进程内 `JobRegistry`（有界输出尾部 + 进度 + 状态），`system.job` 技能经 `SkillExecutionContext` 注入的 `jobRegistry`/`jobCancel` 做 `list`/`status`/`cancel`。**跨轮保留**：注册表用跨轮唯一 id `t<turn>:<childId>`（子智能体 id 每轮自增会撞），面板「后台任务」区（`DigitalJobList` + `useDigitalJobs` 2s 轮询）经 `agent:jobList`/`agent:jobCancel` 显示历史与取消。**简化边界**：不做 dsh 的输出环 offset/lossy、owner 隔离、spill 文件、`JobSpec.run` 生产者 seam；进度条为不确定态动效（子智能体不报 progress）。

---

## 6. 来源（可复查）

- dsh 源码：`D:/GameEditorApp/deepseek-harness-master/deepseek-harness-master/packages/`
  - `core/agent-loop/README.zh.md`（循环、`maxParallelToolCalls`、inbox、取消）
  - `core/tools/README.zh.md`（defineTool、批次执行、条件工具）
  - `subagent/subagent/README.zh.md`（服务/provider/activation/容量/消息/恢复）
  - `subagent/tool-subagent/README.zh.md`（`maxDepth`、preset、模型选择、措辞）
  - `skill/tool-skill/README.zh.md`（目录注入、`/name`）
  - `guard/repeat-tool-reminder/README.zh.md`（[3,5,8] 建议）
  - `sandbox/sandbox-policy/README.zh.md`（read-only 默认）
  - `interaction/user-approval/README.zh.md`（ask/never、fail-closed、审计）
- 本项目：`desktop/src/shared/agent/brain/loop.ts`、`desktop/src/main/agent/dispatcher.ts`、`desktop/src/main/agent/skills/`
