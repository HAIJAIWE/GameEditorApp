# 智能体对照：dsh 源码 vs 本项目（数字员工该怎么落）

> 状态：**只读调研**（2026-10-28）。目的：在动手做「数字员工/智能体」之前，先把 dsh 的实现读清楚，给出「抄什么、不抄什么、按什么顺序」的结论。
> dsh 源码位置：`D:/GameEditorApp/deepseek-harness-master/deepseek-harness-master/packages/`（完整 monorepo；`/d/dsh` 只是运行/配置目录，不是源码）。
> 本项目 agent：`desktop/src/shared/agent/brain/loop.ts` + `desktop/src/main/agent/dispatcher.ts` + `main/agent/skills/`。

---

## 0. 一句话结论

**数字员工不是「一个主区视图」，而是「智能体的前端」。** 它已经做对了（`DigitalPanel` = 聊天 UI，走 `agent.chat` + 事件流，是薄客户端）。
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

### 2.3 子智能体（`subagent`）—— 数字员工的核心差距

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

| 维度 | dsh | 本项目 | 差距 | 对「数字员工」的影响 |
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

## 5. 对「数字员工」的结论

### 5.1 抄什么（按优先级）

1. **子智能体的异步模型**（最高优先）
   - 工具调用立即返回 `started subagent <id>`，**不阻塞父循环**；运行时在子任务完成后发**完成通知**（父级下一轮据此继续）。
   - `maxDepth`（默认 1）+ `maxActiveSubagents`（默认 8，按树共享名额）。
   - 本地子级支持 `sendMessage` + 冷恢复（至少先做「完成后可继续对话」）。
   - 这条直接决定「数字员工能不能带一队子智能体干活」。

2. **工具执行的全批次 + 保序 + 屏障**
   - 把「逐工具 await」改成「全批次交执行器，保序返回」；非审批工具默认并行（并发上限可配，不必照抄 10，按本地模型能力定）。
   - 审批/交互仍串行（单令牌），作为**独占屏障**。

3. **会话事件日志**（中期）
   - 现在 messages 在内存，长会话/恢复/审计都弱。可先做「append-only 事件 + 投影」的最小版。

### 5.2 不抄什么

- **cordis 插件运行时**：我们已有自己的 `PluginHost`（宿主无关契约），不必引入 cordis。
- **完整沙箱栈**（`sandbox-windows-acl` 等）：本项目不以 shell 为主，风险分级 + 审批够用；真要做再上。
- **`DigitalPanel` 迁 `mainView`**：它是右栏常驻的 agent 面，不是中间页签。若将来插件化，应走 `view` + `app.dock` 挂载点，而不是 `mainView`。
- **照抄 `maxParallelToolCalls=10`**：本地 4B 模型并发太高会乱，按实测定（我们现有 4 是合理起点）。

### 5.3 建议的落地顺序（切片）

| 片 | 内容 | 风险 |
|---|---|---|
| A | 子智能体改**异步 activation + 完成通知**（保留 depth≤1，先不做多 provider） | 中 |
| B | 工具执行改**全批次保序 + 屏障**（并行仍 opt-in，默认值不动） | 中 |
| C | 子智能体**容量上限**（`maxActiveSubagents`）+ `sendMessage` 继续对话 | 中 |
| D | 会话**append-only 事件日志**最小版（可恢复/审计） | 高 |
| E | 技能**目录注入 + 按需加载**（替代硬编码技能表） | 中 |
| F | 审批 `never` 无头模式 + 审计落库 | 低 |

> 每一片都要过四道闸 + e2e；A/B 是「数字员工」体验的分水岭，建议先做。

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
