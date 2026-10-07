# 智能体框架重写设计（E59 起）

> **状态**：v0.3 草案（**已重写**，取代 v0.1/v0.2），待主理人裁决。
> **动因**：E42 裁决「`core/agent` 域停止 1:1 迁移，改为框架重写」——方向定了，架构未定。
>
> **修订记录**
> - **v0.1 → v0.2**：我犯了一个**根本性的方法错误**：把它当成「从零设计一个 2026 最新 agent 框架」，
>   于是去外部找资料、写了与本项目无关的 NPC `agent_os` 对照，**而完全没有先读本项目已有的设计文档**。
>   读完本项目 4 份 agent 设计资产后，真相是：**这个项目的 agent 框架不是"要设计"，而是"已收官过一次、
>   现在要判断要不要按 4B 实况调整"**。v0.2 全部重写。
> - **v0.2 → v0.3**：主理人指示「**去看最新智能体框架的项目，到 GitHub 那边看看，成熟的框架**」。
>   于是本轮**直接抓取 6 个成熟框架的 GitHub 仓库**（`smolagents` / `deepagents` / `deepagentsjs` /
>   `letta` / `mastra` / `atomic-agents`），新增 **§3.5 GitHub 实证对照**、重做 §6 选型表、
>   新增 **DD-15（步数预算）/ DD-16（Context Provider 式注入）**。**结论未变，但依据更硬、且发现了新选项。**
>
> **证据强度标注**（全文通用）：
> `[实测]` 本机/本仓跑出来的 · `[一手]` 模型厂商官方文档 · `[GitHub]` 直接抓取成熟框架仓库所得 · `[二手]` 第三方文章/实测（附出处）· `[推断]` 我的推理，未直接验证

---

## 1. 先纠正定位：本项目**不是**从零设计 agent

这是 v0.2 与 v0.1 最大的差别。本项目已有 **4 份 agent 设计资产 + 1 个已收官的实现计划**：

| # | 资产 | 位置 | 规模 | 状态 |
|---|---|---|---|---|
| A1 | **Agent OS 底层框架设计蓝图** | `docs/archive/AGENT_OS_BLUEPRINT_STATUS.md` | 132 行 | 2026-05-27 存档，**2026-06-23 归档**（自评「L6 自我进化体 ✅ 100% 实现」） |
| A2 | **A 档立项方案（AI/Agent 引擎 + 库管理）** | `desktop/docs/a-tier-plan.md` | 375 行 | **A1-1~A1-5 全部 ✅ 完成（2026-10-04）**，带 commit 号与回写记录 |
| A3 | **Agent 工作区实态** | `data/libraries/default/.workspace/` | 166 行 | **活着**（`memory/MEMORY.md` 最后更新 `2026-10-07 19:22:35`） |
| A4 | **`shared/` 分层契约 + 分层拆分方案** | `desktop/src/shared/README.md` / `desktop/docs/shared-layering-design.md` | 206 / 362 行 | 生效中（4 条 ESLint 边界规则） |

**A1 蓝图已经实现的东西** `[实测·读源码]`：

| 部分 | 内容 |
|---|---|
| 多智能体 | 5 Agent（`boss` + 4 workers：game_designer / data_analyst / content_writer / code_assistant），**独立目录 + 工具集隔离** |
| 身份 | `IdentityManager.load_identity(id) → SystemPrompt`；**SOUL 5 要素硬边界**（核心身份/职责/绝对边界/工作风格/输出格式） |
| 编排 | `brain.process()` → `intent.Planner.plan()` → `agent_manager`；TaskTicket 7 字段 + `delegate_to_agent` |
| 协作三模式 | 顺序接力 / **并行竞标 `parallel_bidding`** / **辩论共识 `debate_consensus`** |
| 记忆 | 三层（短期/长期/情节）+ `LEARNINGS.jsonl` + 容量上限 |
| 反思 | `brain._reflect_on_failures` + `evaluation/auto_evaluator.py` **LLM-as-Judge** |
| 工具 | `dispatcher.register/execute` + `skill_protocol` + `mcp.py`（MCP server 已实现）+ **16 激活技能** |
| 防护 | `_DEFAULT_MAX_ITERATIONS = 5`、每轮 SOUL 硬边界、`_replan_step` 动态修正、`_sliding_window_compress` |
| 未接 | LangChain / AutoGen「预留接口，未实际对接」 |

**A2 计划已经落地的东西** `[实测·读回写区]`：

- §0 结论：**不需要 1:1 复刻 21,669 行**（三分：必修核心契约 ≈6,000–8,000 / 按需 / 其余）
- A1-1 技能协议 + 调度器内核（`shared/agent/protocol.ts` 18 例 + `main/agent/dispatcher.ts` 15 例）✅
- A1-2 Brain 循环 + 事件流 + Ollama 工具调用（`shared/agent/brain.ts`）✅
- A1-3 会话与记忆（`sessionStore.ts` / `memoryStore.ts`）✅
- A1-4 审批通道端到端（含「拒绝路径断言沙箱没有被执行」）✅
- A1-5 业务技能 + 托盘/全局热键（`main/tray.ts`）✅ —— **A1 全部收官**
- **`system.code` 用 QuickJS WASM 沙箱「整体替换」** Python 的 `subprocess + 正则黑名单`（后者可绕）`[实测]`
- 有意不移植并写明理由：`system.ceshu` 的 delete/export/import（UI 已有入口，再暴露会重复且更难确认）

**⇒ 所以 E42「停止 1:1 迁移」的真正含义不是"要设计一个新框架"，而是"别再往 22,981 行上投入"**。
本设计的任务因此变成：**已收官的 A1，在 4B + 4K 的真实约束下够不够？差在哪？补多少？**

---

## 2. 本项目的三条硬约束（决定一切）`[实测]`

| # | 约束 | 证据 |
|---|---|---|
| **A** | **本地单机 Ollama，8GB 卡，主力 4B 级** | `src/main/agent/ollamaTransport.ts:19` 写死 `http://127.0.0.1:11434`；`shared/llmConfig.ts:68` 预置含 `qwen3:8b`/`qwen2.5:7b` |
| **B** | **TS + Electron 客户端，无服务端** | agent 资产全在 `src/main/agent/` + `src/shared/agent/`，跑在主进程 |
| **C** | **实际上下文只有 4K** | `grep -rn "num_ctx\|num_predict" src/` **零命中** ⇒ 吃 Ollama 默认；Ollama 按显存定默认、**<24GiB ⇒ 4096** `[二手]` |

**C 最容易漏、也最致命**：同规格 8GB 卡实测第 7 轮即**半句截断**——不是变慢、不是变笨，是**没空间说完** `[二手]`。
而 Python 侧 `src/core/agent/brain_prompt.py:105-126` 正在往 prompt 拼 `plan_ctx`/`learn_ctx`——**正是让 4B 毒上加毒的模式**。

**另一条被低估的事实** `[实测]`：**35 个技能**（`CAPABILITIES.md`，2026-06-21 生成），
而 `identity.md` 里已经写了「**闲聊时绝不调用工具**」——说明**工具调用难用这件事早被感知到，只是没解决**。

---

## 3. 2026 业界共识 × 我们的蓝图：对照表

这一节是 v0.2 新增的核心。**好消息是：我们的蓝图大部分方向已经是对的。**

| 2026 共识 | 我们有没有 | 判定 |
|---|---|---|
| 五可组合模式（chaining/routing/parallelization/**orchestrator-workers**/**evaluator-optimizer**）`[一手]` | ReAct while 循环 + planner | ✅ 已有 |
| **planner / generator / evaluator 三角色分离** `[一手]` | planner=`intent.Planner`、generator=`brain._agent_loop`、evaluator=`evaluation/auto_evaluator.py` | ✅ 已有 |
| **评估器独立上下文**（Outcomes 报告 docx +8.4% / pptx +10.1%）`[二手]` | `auto_evaluator.py` 存在，**但是否独立上下文未核** | ⚠️ **待核** |
| **Deep Agents 四件套**：todo / 虚拟文件系统 / sub-agent 独立上下文 / 上下文管理中间件 `[一手]` | `todo_skill` ✅、`workspace/*.md` ✅、TaskTicket ✅、`_sliding_window_compress` ✅ | ✅ 大部分已有 |
| **Skills 渐进披露**（`SKILL.md` 枢纽、description 是触发条件、gotchas 最高信号）`[二手]` | `CAPABILITIES.md` 是**扁平清单**（35 条 name/desc/tags），非渐进披露 | ⚠️ **形态落后** |
| **context engineering**：context rot、just-in-time、**2026 代删 80% 提示词反而更强** `[一手]` | `_sliding_window_compress` 做压缩 | ⚠️ **手段可能选错**（见 §5） |
| 工具设计：少而精、工具名加前缀、高信号返回、错误信息要引导 `[一手]` | `protocol.ts` 有 `TOOL_RISK_MAP` 风险分级 ✅；工具数 ❌ | ⚠️ **数量失控** |
| MCP（垂直连工具）`[二手]` | `mcp.py` 已实现 server | ✅ 已有 |
| 共享状态层、无 agent 私有状态 `[二手]` | `sessionStore` + `operationLog` 已是单一真源 | ✅ 已有 |
| 逐 agent 埋 token / 延迟 / 成功率 `[二手]` | `operationLogStore` 记录操作，**未见 token/延迟成本** | ⚠️ **缺** |
| **协调死锁防护**（timeout / turn limit / tie-breaker）`[二手]` | `_DEFAULT_MAX_ITERATIONS = 5` | ✅ 已有 turn limit |

**结论：架构思想基本不落后，落后的是「在 4B 上跑不动」和「观测缺失」。**

### 3.5 GitHub 上的成熟框架实证（2026-10-07 直接抓仓库，非二手博客）

> 抓取对象：`smolagents` / `deepagents` / `deepagentsjs` / `letta` / `mastra` / `atomic-agents` 的 GitHub 仓库
> README 与仓库结构。**star 数只当注意力信号，不当选型依据**（见下方「star 陷阱」）。

**① smolagents（HuggingFace）—— 对我们 4B 最有用的一份**

| 事实 | 出处 | 对我们的意义 |
|---|---|---|
| **agent 逻辑只写 ~1,000 行**（`agents.py`），"We kept abstractions to their minimal shape **above raw code**" | README | 印证「薄 harness」路线；**1,000 行**是我们净新增预算的参照上限 |
| **`CodeAgent`（把动作写成 Python 代码）比「让 LLM 输出工具调用字典」少用 30% 步数**（= 少 30% LLM 调用），且高难 benchmark 表现更好 | README | **本轮拿到的最有价值新数据**：在 4B + 4K 下，**步数 = token = 上下文预算**，省 30% 步数是命门级收益 |
| `LocalPythonExecutor` **不是安全沙箱**——"applies some restrictions but **can be bypassed and must not be used as a security boundary**" | README Security | 印证我们「用 QuickJS 而非 Python 黑名单」的历史决定是对的 |
| 沙箱支持 E2B / Blaxel / Modal / **Docker**；模型支持本地 `transformers`、**`ollama`**、LiteLLM 100+ | README | 本地模型一等公民，不是二等公民 |
| "**why use a framework at all?**" 正面回答：代码 agent 需要在 **system prompt / parser / execution 三处保持一致格式**，这个复杂度非平凡；但鼓励"只取需要的部分" | README | 给出「引 vs 自建」的判据：**只有当框架替你省掉一段非平凡的一致性维护时才引** |

> ⚠️ 我们**不能直接用 CodeAgent**（它需要 Python 执行器做沙箱，而我们的沙箱是 **QuickJS WASM**，`system.code` 已就位），
> 但可以借它的**思想**：**一次动作里串联多个工具**（其示例一次 action 循环搜索 3 个站点），而不是每个工具一次 LLM 往返。

**② Deep Agents（`deepagents` + `deepagentsjs`）—— 姿态与我们最像**

- **有官方 TypeScript 版**（`npm install deepagents`，**且提供 `deepagents/browser` 入口**「no Node-only exports」）——这是我上轮只知 Python 版的漏项。
- 4 件套：`write_todos` / filesystem 六工具 / `task`（sub-agent 独立上下文）/ 上下文管理中间件。
- **依赖是 peer dependencies**：`@langchain/core` + `@langchain/langgraph` + `@langchain/langgraph-checkpoint` + `@langchain/langgraph-sdk` + `langchain` + `langsmith` —— **6 个包**才能装起来。
- **安全立场（重要背书）**："Deep Agents follows a **'trust the LLM'** model. The agent can do anything its tools allow. **Enforce boundaries at the tool/sandbox level, not by expecting the model to self-police.**"
  ⇒ 与我们已有的 `approvalBroker` + `TOOL_RISK_MAP` + QuickJS 沙箱**方向完全一致**，属背书而非改动。

**③ Letta —— 形态上与我们最接近的成熟产品**

- 定位 **"Platform for stateful agents: AI with advanced memory that can learn and improve over time"**（f.k.a. MemGPT）。
- 主流源码已迁到 **`letta-ai/letta-code`**，npm 包 **`@letta-ai/letta-code`**；**有 Windows/macOS/Linux 桌面 app** + 本地/自托管 `letta server` + **TypeScript 的 Letta Agent SDK**。旧 V1 API server 已进 `archive` 分支。
- **对本项目最大的启示**：它把 agent 定义为 **stateful 系统**，而不是"无状态的 LLM 循环"——
  这与我们已有的 `.workspace/`（identity / persona / MEMORY / LEARNINGS / CAPABILITIES）**方向一致**，说明我们这条路是对的。
- 但它是一个**完整的记忆服务器产品**，我们只需借它的理念，不该引入。

**④ Mastra（TS 生态最大）—— 两个必须知道的坑**

- 亮点确实实在：model routing 40+ providers、**graph-based workflows**（`.then()/.branch()/.parallel()`）、
  **suspend & resume**（用 storage 记住执行状态，**可无限期暂停后恢复**）、**Observational Memory**、MCP 双向、内建 evals + observability、本地 Studio。
- **坑 1（许可）**：**双许可证**——核心 Apache-2.0，但 **`ee/` 目录是 Mastra Enterprise License**（source-available，非开源）。选型时要逐目录看。
- **坑 2（形态）**：自带 Studio（`localhost:4111`）、对项目结构 opinionated、为**部署成服务**设计——我们是进程内客户端，收益面窄。

**⑤ Atomic Agents（极简派，值得抄它的哲学）**

- 极简模块化：**Single-purpose / Reusable / Composable / Predictable**；建在 Instructor + Pydantic 上。
- **Agent = System Prompt + Input Schema + Output Schema + History + Context Providers**（五件套，职责极清晰）。
- **"All logic and control flows are written in Python"** —— 明确反对**框架接管控制流**。
- **Context Providers = "Inject dynamic context into the agent's system prompt at runtime"** —— 这正是我们"按会话注入 ≤8 个工具"的现成说法。
- 文档工程做得极好：`llms.txt` / `llms-full.txt` / Context7 索引 / Agent Skills。

**⚠️ star 陷阱（必须知道）** `[二手·GitHub 快照 2026-05~06]`

- 排名最高的一批里，**最大 star 属于一个已冻结的项目**：`microsoft/autogen` **58,025 star，frozen**（Microsoft 已把 AutoGen + Semantic Kernel 合入 Agent Framework，并劝用户别再基于它新建项目）。
- vendor SDK（OpenAI / Anthropic / Google / AWS / Microsoft）**集体只有约一年历史**。
- 结论：**star 衡量的是注意力，不是架构**；选型要读源码与安全立场（本轮最有力的信号是 Deep Agents 那句 "trust the LLM + 边界设在工具层" 与 smolagents 那句 "LocalPythonExecutor 不是安全边界"）。

**⑥ 跨框架的「五个轮子」框架** `[二手]`
所有 agent 运行时都在解同样 5 个问题：**记忆在哪 / 工具在哪执行 / 怎么学"做法"而不是"调能力" / 谁批准危险动作 / 人怎么把消息送进循环**。
一篇 2026-06 的横向评测断言：**只有 Letta 真正解了记忆，只有 smolagents 真正解了沙箱**。
⇒ 对我们：**记忆与沙箱两块我们已有（workspace + QuickJS）**，这恰好是别人最难的两块；**缺的是"做法"（Skills 渐进披露）与"治理"（成本观测）**——与 §5 的 G2/G3/G6 一致。

---

## 4. 4B 小模型会推翻 2026 主流的三条 `[二手]`

这是本设计与"照抄主流"的分水岭，也是**重写 L6 蓝图的真正理由**：

1. **提示词冗长税**：60 行 agent 定义 ⇒ 4B **完全不用工具**、纯表面模仿「研究形状」的答案；砍到 8 行 ⇒ 工具调用回来。阈值 ≈ **30 行**。
2. **软路由失效**：写「需要外部信息就委派给 researcher 子 agent」被 Qwen/Gemma **完全无视**（自己硬扛并死循环）；显式指定 agent 才行。⇒ **agent 选择归人，不归模型**。
3. **数字硬上限 > 提示词条款**：150+ 次 `Invalid Tool` 死循环时，提示词写「错两次就停」**无效**；「最多 6 次调用」**有效**。机理：模型无法自省重试，**但能数数**。

**对照我们的蓝图，4B 上的必然失效点** `[推断，基于上述实测]`：

| 蓝图设计 | 在 4B 上的问题 | 对应实测 |
|---|---|---|
| **5 Agent + 工具集隔离** | 4B 无法在 35 个工具里挑对（"多工具只挑第一个"） | 3 |
| **并行竞标 `parallel_bidding`** | 多 agent 协调税 + 小模型 sub-agent 表现差 | 2 |
| **辩论共识 `debate_consensus`** | 需要长时程多轮论证，4B 上下文撑不住 | 上下文 4K |
| **16~35 个激活技能** | 描述超 2–3 行就"读不完"漏参数 | 3 |
| **`_sliding_window_compress`** | Anthropic 2026 实测：**context reset（带结构化交接开新 agent）优于单纯 compact**，且 compact 会导致「goal drift：约束静默消失」 | 见上 |
| **详细 SOUL prompt** | 提示词冗长税 | 1 |

---

## 5. 差距分析：已收官 A1 在 4B 下的真实缺口

| 缺口 | 严重度 | 依据 |
|---|---|---|
| **G1 上下文只有 4K，且未显式设定 `num_ctx`** | 🔴 最高 | `[实测]` 零配置 ⇒ 默认 4096；8GB 卡第 7 轮截断 |
| **G2 工具面 35 个（协议层声明 12 个 `system.*` 槽位，实现 5 个）** | 🔴 高 | `[实测]` 4B「多工具只挑第一个」；且 `identity.md` 已写「闲聊时绝不调用工具」= 症状已现 |
| **G3 无逐轮成本/延迟观测** | 🟠 中高 | `[实测]` operationLog 无 token/延迟；`[二手]` token 用量单独解释 80% 性能方差 |
| **G4 终止只有 `MAX_ITERATIONS=5`，无 maxToolCalls / wallClock** | 🟠 中高 | `[二手]` 计数式硬闸才有效；150+ 次死循环靠 turn limit 拦不住 |
| **G5 压缩策略可能选错**（compact vs context reset） | 🟡 中 | `[二手]` Anthropic 2026：reset 优于 compact；compact 导致 goal drift |
| **G6 `CAPABILITIES.md` 是扁平清单，非渐进披露** | 🟡 中 | `[二手]` Skills 最佳实践：SKILL.md 枢纽 + 渐进披露 |
| **G7 评估器是否真在独立上下文未核** | 🟡 中 | `[二手]` Outcomes 增益的核心正是上下文隔离 |
| **G8 主力模型 4B 本身可靠性不足** | 🟠 中高 | `[二手]` ≤4B 工具调用不建议生产；7–8B 是黄金区间 |

**不需要动的**（已验证到位）：审批闸与风险分级、事件流 reducer、会话/记忆落盘、
QuickJS 沙箱（**已整体替换掉可绕的黑名单**）、SOUL 硬边界、turn limit、MCP、`shared/` 分层契约。

---

## 6. 选型：不引入 agent 框架（结论不变，依据更硬）

| 候选 | 判定 | 理由 |
|---|---|---|
| **Claude Agent SDK** | 否决 | 每轮 **~35,000 input tokens**（其余框架 1,288–1,432 的 **25 倍**）、8.5s、299MB，**不支持换模型厂商** ⇒ 本地 Qwen 直接出局 `[二手]` |
| **LangGraph(.js)** | 否决 | 最成熟的状态图/checkpoint/HITL，但为**服务端编排**设计、Python 为主；且 `sessionStore` + `operationLog` 已覆盖其核心诉求 |
| **Mastra** | 否决 | TS 原生、最快，但 **240 包 / 176MB**；且是"应用框架"（自带 Studio、结构 opinionated），与"薄 harness"相反 |
| **Deep Agents（Python）** | 否决 | 建在 LangGraph 上；且**需要 6 个 peer deps**（`@langchain/core`/`langgraph`/`langgraph-checkpoint`/`langgraph-sdk`/`langchain`/`langsmith`）才能装 |
| **Deep Agents JS（`deepagentsjs`）** | **否决（本轮新增评估）** | **有官方 TS 版且有 `deepagents/browser` 入口**（比我上轮掌握的更贴近本项目）⇒ 但：① 那 6 个 peer deps 仍要装；② **4 件套我们已有 3.5 件**（`todo_skill`、`workspace/` 文件系统、TaskTicket），唯一缺的是「大结果落盘 + 路径引用」＝ **DD-7，自己写约 200 行**；③ 它的 `task` sub-agent 在 4B 上不可用（§4 实测 2）⇒ **引它只为省 200 行，不值** |
| **smolagents** | 否决（**但必读**） | 不可 —— 它是 Python；但**本项目最有价值的一份参照**：agent 逻辑只写 **~1,000 行**，且给出了「CodeAgent 比工具调用字典**少 30% 步数**」的硬数据（§3.5①） |
| **Letta** | 否决（**长期参照**） | 形态最接近（桌面 app + 本地 server + TS SDK），但它是**完整记忆服务器产品**；我们只需借它「agent 是 **stateful 系统**而非无状态循环」这一理念——而这条路我们 `.workspace/` 已经在走 |
| **Mastra** | 否决 | TS 生态最大、suspend/resume 与 Observational Memory 值得读；**但双许可证**（`ee/` 是 Enterprise source-available）+ 自带 Studio + 为部署成服务设计 ⇒ 进程内客户端收益面窄 |
| **Vercel AI SDK 7** | 备选 | 最轻（15 包/53MB）、provider-agnostic。但"你拥有这个 loop"——状态仍在自己手里，**不省事，只多一层** |
| **自建薄 harness** | **采纳** | Anthropic 一手即持此立场：**「Framework abstraction is an anti-pattern」**；框架注入开销（1,288–1,432 之间 11% 差异）在 4K 预算下是**实质成本** |

> **但有一条要改口径** `[纠正 v0.1]`：本项目**已有"预演资产"**——`a-tier-plan.md §2.4` 明确记载
> **QuickJS WASM 沙箱已在 A1-5 落地并整体替换 Python 黑名单**。所以不是"从零自建"，
> 而是**在已收官的 A1 上做定向加固**。净新增因此更小。

---

## 7. 目标架构（在已有资产上加固，不重建）

```
┌─ 渲染层 ────────────────────────────────────────────────┐
│  数字员工面板 · 任务卡 · 进度可见化 · 审批对话框 · 成本行   │ ← agentic laziness 的解药
└───────────────▲────────────────────────────────────────┘
                │ 事件流（reduceBrainEvent，纯 reducer ✅已有）
┌───────────────┴────────────────────────────────────────┐
│ shared/agent/  protocol ✅ · brain ✅ · session ✅ · panel ✅│  ← 分层契约：保留原样不改名
│                 ⬆ 新增：budget.ts（成本/闸门/观测）        │     (shared-layering-design §2.1)
└───────────────▲────────────────────────────────────────┘
┌───────────────┴────────────────────────────────────────┐
│ main/agent/  brainService · dispatcher · ollamaTransport  │
│               approvalBroker ✅ · operationLog ✅           │
│   ┌── Harness 加固（净新增 ~300–500 行）──────────────┐   │
│   │ 拼提示词(≤30行 闸) → 调模型 → 审批闸 → 执行        │   │
│   │ → 大结果落盘 → 计数闸(maxToolCalls/maxTurns/     │   │
│   │ wallClock) → 回灌 → … → 产出                      │   │
│   └───────────────────────────────────────────────────┘   │
│   skills/  system.game_data ✅ · system.ceshu ✅ · system.code ✅(QuickJS) │
│            ask_user ❌(A1-4 遗留) · rollback ✅            │
└───────────────▲────────────────────────────────────────┘
┌───────────────┴────────────────────────────────────────┐
│ ollamaTransport  /api/chat + tools + stream(NDJSON) ✅    │
│                  ⬆ 显式 num_ctx（G1）· 考虑提 qwen3:8b（G8）│
└────────────────────────────────────────────────────────┘

工作区（✅ 已有，方向正确，强化而非重写）：
data/libraries/<库>/.workspace/
  identity.md    SOUL 5 要素硬边界（✅ 已有，正是「≤30 行」的载体）
  persona.md     小墨人格（✅）
  memory/MEMORY.md  长期记忆/用户偏好（✅ 活着）
  memory/capabilities/CAPABILITIES.md  ⚠️ 35 条扁平清单 → 改渐进披露（G6）
  memory/LEARNINGS.jsonl  反思经验（✅）
```

### 7.1 与 `shared/` 分层契约的对齐 `[实测·读 shared/README.md]`

- `shared/agent/` **保留原样、不改名**（`shared-layering-design.md §2.1`）—— 本设计遵守。
- 依赖方向：`main` **禁止**直接 import `shared/domain/**`（ESLint 规则 4 已生效）⇒
  **新增的 `budget.ts` 放 `shared/agent/`（已被现有规则覆盖），不放 `domain/agent/`**——
  后者虽有"预挂规则"但**当前无文件**，贸然启用会引入新的边界。
- 五分区（contract/domain/config/service/util）中，agent 属 **domain 性质但已在 `shared/agent/`**，
  本设计**不动这个既有决策**（它有 91% 文件被测试直接 import 的取证支撑）。

---

## 8. 设计决策（DD）

格式：**问题 → 证据 → 决策 → 处置（复用/重做/不做）→ 代价 → 复盘条件**

| # | 问题 | 证据 | 决策 | 处置 | 复盘条件 |
|---|---|---|---|---|---|
| **DD-1** | 上下文预算 | G1 | 传输层**显式下发 `num_ctx`**，默认 16384，可在设置调 | 重做（改 1 处 + 传输层字段） | 无 |
| **DD-2** | 主力模型 | G8 | 默认从 4B 提到 **`qwen3:8b`**（`llmConfig.ts:68` 已有预置，5.2GB 装得下 8GB 卡），保留 4B 为低配回退；设置里显式警告"溢出到系统 RAM 会大幅变慢" | 配置 | 无（性价比最高） |
| **DD-3** | 工具面 | G2 | **协议层 12 个 `system.*` 槽位收敛为按场景分组、每次会话只暴露 ≤8 个**；技能总清单保留但**不一次性注入** | 重做（`protocol.ts` 分组 + `CAPABILITIES.md` 改渐进披露） | 升级 ≥14B 可放宽 |
| **DD-4** | 路由归谁 | 4B 实测 2 | **技能由用户显式选定**（面板下拉），不做模型软路由；`identity.md` 的「闲聊时绝不调用工具」升级为机器可执行的路由前置 | 重做（面板 + 路由前置） | 升级 ≥14B / 接云端大模型 |
| **DD-5** | 终止 | G4 + 4B 实测 3 | 三道计数硬闸 `maxToolCalls`(8) / `maxTurns`(6) / `wallClockMs`(120s)，任一触发即**带部分产出 finalize**；**提示词里不写"出错就停"** | 新增（`budget.ts`） | 无 |
| **DD-6** | 提示词预算 | 4B 实测 1 | **系统提示词 ≤30 行**（`identity.md` 天然载体），**构建期/单测期断言**；超限即红 | 新增断言 | 升级 ≥14B 放宽 |
| **DD-7** | 大结果 | 2.1 just-in-time | 工具返回 >2KB 落盘到 `<库>/.workspace/agent/run/<runId>/`，上下文只留**相对路径 + 摘要 + 行数**，可按路径取回 | 新增 | 无 |
| **DD-8** | 压缩策略 | G5 | 从 `_sliding_window_compress`（Py 侧）改为 **context reset**：到达阈值时**带结构化交接摘要开新轮**（约束显式重述，防 goal drift） | 新增（替代压缩） | 无 |
| **DD-9** | 评估器 | G7 + `[二手]` Outcomes | 先**核实** `auto_evaluator.py` 是否独立上下文；若否，改为独立调用；默认关，面板给开关 | 核实 + 可能重做 | 用户反馈"AI 结果需反复手改"则默认开 |
| **DD-10** | 观测 | G3 + `[二手]` token 解释 80% 方差 | 复用 `operationLog`，**每轮追加**：输入/输出 token、耗时、工具调用序列、三闸计数、审批决定；面板加"本次消耗/已用轮次/上限"一行 | 新增（扩展已有 store） | 无 |
| **DD-11** | 审批闸 | A1-4/A1-5 已验证 | **完全复用**（`approvalBroker` + `TOOL_RISK_MAP` + 拒绝路径断言沙箱未执行）；不新造 | **复用** | 无 |
| **DD-12** | 沙箱 | `a-tier-plan §2.4` 已落地 | **完全复用** QuickJS WASM（零宿主能力 + CPU 超时 + 内存上限 + 参数夹取上限）；**不复刻** Python 黑名单 | **复用** | 无 |
| **DD-13** | 多 agent | 4B 实测 2 + 协调税 | **不恢复** 5 Agent / 并行竞标 / 辩论共识；**不做动态 sub-agent**。若将来验证需要，只用**静态专家 + 显式任务描述** | **不做**（永久 ⛔，除非换模型档位） |
| **DD-14** | 协议 | 2.8 | 工具层按 MCP 的 schema 纪律（统一命名、清晰描述、声明式权限）；**不做 A2A** | 复用已有 `mcp.py` 思路 | 要接外部 agent 时 |
| **DD-15** | 步数预算 | `[二手·GitHub]` smolagents 实测：**CodeAgent（动作写成代码）比「LLM 输出工具调用字典」少 30% 步数** | **每个动作允许串联多个工具调用**；并对高频组合**提供复合工具**（如 `batchUpdateItems`）而不是让模型逐个调。理由：4B + 4K 下**每一步都是命门**，省 30% 步数是本轮拿到的最大单项收益 | 新增（协议层加"批量动作"语义 + 优先补复合工具） | 升级大模型后可回退 |
| **DD-16** | 上下文注入方式 | `[GitHub]` atomic-agents 的 **Context Providers**：「Inject dynamic context into the agent's system prompt at runtime」 | 用**同一机制**实现 DD-3/DD-4：把「本次会话可见的 ≤8 个工具 + 相关记忆片段 + 数据概览」做成**运行时注入的 context provider**，而不是把 35 条能力静态拼进提示词 | 新增（对齐已验证的成熟范式） | 无 |

---

## 9. 路线图 M0–M4（每期独立可交付，**都只是"加固"**）

| 期 | 目标 | 出口（可验收） | 规模 |
|---|---|---|---|
| **M0 上下文与终止** | 修 G1 + G4 | `num_ctx` 可配且有默认；三道计数闸生效；触发后带部分产出 finalize 并诚实显示 | ~200 行 |
| **M1 观测先行** | 修 G3 | 每轮有 token/延迟/成本行；面板可见"已用轮次/上限"；**先有数据再调提示词** | ~150 行 |
| **M2 提示词瘦身** | 修 G6 + DD-6 | `identity.md` ≤30 行断言转绿；`CAPABILITIES.md` 改渐进披露；单测跑 8 类典型请求，工具调用成功率 ≥80% | ~300 行 |
| **M2.5 步数预算** | 修 DD-15 | 每个动作可串联多工具；补 ≥2 个高频**复合工具**；单跑同一任务**步数下降 ≥20%** | ~200 行 |
| **M3 工具面收敛** | 修 G2 + DD-3/4 | 协议层分组、每次会话 ≤8 工具；用户显式选技能；场景下工具调用成功率 ≥80% | ~250 行 |
| **M4 评估器核实** | 修 G7 | 确认评估器上下文隔离；生成类任务可选跑 | ~200 行（可能更少） |

**建议先做 M0**：纯增量、零风险，且立刻让 4B 的「半句截断」和「死循环」变成**可见可控**的现象。
M1 必须紧跟 M0——**没有成本数据，后面所有调优都是盲调**。

---

## 10. Python `core/agent` 22,981 行的处置 `[实测]`

**它现在是什么**：22 个外部 `import` 点，**全部来自 `src/ui/`（PyQt 界面层）**
（`ai_bridge.py` / `digital_employee.py` / `digital_panel_tasks.py` / `digital_panel_ui.py` / `ceshu/*`）。
而 PyQt 界面正被 Electron 逐片取代（E28 已重写顶层 IA、E57 完成前端尾巴）
⇒ **在 Electron 客户端里，这 22,981 行是纯死代码。**

**三个选项**（需裁决）：

| 选项 | 说明 | 代价 |
|---|---|---|
| **保留（现状）** | 作为 Python 侧的权威参考与审计基线（`migration-audit.md` 的 299 文件 / 91,164 行是迁移基线，删了会破坏对账） | 仓库体积、维护心智负担 |
| **归档** | 移到 `src/_retired_agent/`，在 `docs/archive/` 留一份说明，保持 git 历史 | 需要同步改审计的域文件数（97 → 0），牵连 docsLedger 守卫 |
| **删除** | 彻底移除 | 同上，且**丢失"原实现"参照**——对后续复核不利 |

**我的建议**：**先不动**。理由：① 它现在零运行时成本（客户端根本不加载 Python）；
② 删它会动审计基线（299 文件 / 91,164 行）并牵连守卫，性价比极低；
③ 真正该做的是**在文档里标明"这 22,981 行在客户端里是死代码"**，避免后人误以为还需迁移。
——这一条已在本节记录，**并建议回写进 `migration-audit.md` 的 E42 横幅**。

---

## 11. 明确不做（附理由）

| 不做 | 理由 |
|---|---|
| 不引入 agent 框架 | §6 |
| 不恢复 5 Agent / 并行竞标 / 辩论共识 / 动态 sub-agent | DD-13；4B 实测 + 协调税 |
| 不做模型软路由 | DD-4（4B 实测失效） |
| 不重写向量检索（`memory_vector` 271 + `memory_search` 231 行） | "能用就行"规模，且与"无 embedding 模型"现状匹配；DD-7 的文件检索已覆盖大部分 |
| 不做语音 / 视觉 | `speech_service.py` / `vision_capture.py` 属独立能力线 |
| 不把 `diagnostics/`（3,796 行）纳入 | 是**代码修复/自愈工具链**，与游戏设计数据编辑器是两个产品，要单独立项 |
| 不动 `shared/` 分层既有决策 | §7.1；`shared/agent/` 保留原样有 91% 测试直接 import 的取证支撑 |

---

## 12. 需要主理人裁决的 5 件事

| # | 决策 | 我的推荐 |
|---|---|---|
| **D1** | 默认主力模型是否 4B → `qwen3:8b`（DD-2）？ | **提**。8GB 装得下（5.2GB），工具调用可靠性从"生产不可用"到约 85%，**本设计性价比最高的单点**。代价是更慢。 |
| **D2** | Python `core/agent` 22,981 行的处置（§10）？ | **先不动 + 回写文档标注死代码**。删它会破坏审计基线，性价比极低。 |
| **D3** | 工具面收敛到多少（DD-3）？ | **每次会话 ≤8**；总清单保留但分组懒加载。 |
| **D4** | 评估器默认开还是关（DD-9）？ | **默认关**（4B 下多一次调用延迟明显），面板给开关。 |
| **D5** | 起步范围：只做 M0+M1，还是 M0–M3 一起？ | **M0+M1 先行**。M0 修命门、M1 给数据；没有 M1 的数据，M2/M3 的调优是盲调。 |

---

## 附录 A：v0.1 读错的地方（留档，防止重犯）

| v0.1 的错误 | 正确读法 |
|---|---|
| 把它当"从零设计 2026 框架"，去外部找资料 | **先读本项目 4 份 agent 设计资产**：`docs/archive/AGENT_OS_BLUEPRINT_STATUS.md`、`desktop/docs/a-tier-plan.md`、`data/libraries/default/.workspace/`、`desktop/docs/shared-layering-design.md` |
| 写了与本项目无关的 **NPC `agent_os`** 对照章节 | 用户没提该项目。**本项目 `grep 9573\|agent_os src/` 零命中**，两者无技术关联 |
| 把「LLM-as-Judge / Skills / MCP / turn limit / 压缩」当成 2026 新发现 | 我们**蓝图里全都有**（A1 第三/四/五部分），2026 只是给了新证据 |
| 完全无视 `shared-layering-design.md` 的分层契约 | 新增模块必须落在 `shared/agent/`（保留原样不改名），且 `main` 禁直接碰 `domain/**` |
| 以为 Python 22,981 行是"待迁移欠债" | 实测 22 个 import 点**全在 PyQt UI** ⇒ 客户端里是**死代码**，与"重写框架"无关 |
| 漏掉 `a-tier-plan.md` 里**已有的预演资产**（QuickJS 沙箱已整体替换黑名单） | 是"在已收官的 A1 上加固"，不是"从零自建"，净新增因此更小 |

## 附录 B：证据索引

**本仓实测（`[实测]`）**
- `docs/archive/AGENT_OS_BLUEPRINT_STATUS.md`（132 行全文读过）—— L6 蓝图、5 Agent、SOUL 5 要素、协作三模式、`_DEFAULT_MAX_ITERATIONS=5`、`_sliding_window_compress`、LLM-as-Judge、MCP 已实现、LangChain/AutoGen 仅预留
- `desktop/docs/a-tier-plan.md`（§0 结论 / §2.1–2.5 / §6 回写区读过）—— 不需 1:1 复刻、A1-1~A1-5 收官、QuickJS 替换黑名单、有意不移植清单
- `data/libraries/default/.workspace/`（4 文件读过）—— identity/persona/MEMORY(最后更新 2026-10-07 19:22:35)/CAPABILITIES(35 技能)
- `desktop/docs/shared-layering-design.md` §0/§1.3/§2.1 + `src/shared/README.md` 五分区与依赖方向表
- `src/main/agent/ollamaTransport.ts:19,61-62`（默认 host、`stream:true`+tools）
- `grep "num_ctx\|num_predict" src/` → 零命中；`grep "9573\|agent_os" src/` → 零命中
- `grep "from core.agent" src/ --include=*.py` → 22 点，**全在 `src/ui/`**
- `src/shared/agent/protocol.ts:31-63` → 12 个 `system.*` 工具槽位 + `TOOL_RISK_MAP`
- `src/core/agent/brain_prompt.py:105-126` → `plan_ctx`/`learn_ctx` 拼装
- TS 侧 agent 资产：`main/agent/` 14 文件 2,033 行、`shared/agent/` 8 文件 1,564 行、digital UI 796 行、`main/llm/client.ts` 259 行
- `docs/migration-audit.md` §1（✅116/43,072 · ◐15/8,328 · ⛔162/39,314 · ⚠️6/450 = 299 / 91,164）

**外部一手**：Anthropic《building effective agents》（五模式 +「Framework abstraction is an anti-pattern」+ 工具设计是首要失败模式）、《Effective context engineering》、《Writing tools for agents》、《Effective harnesses for long-running agents》、2026 harness 文章（context anxiety / **reset 优于 compact** / generator-evaluator）、Claude Managed Agents 公测（**Outcomes：独立上下文评分器，docx +8.4% / pptx +10.1%**）、LangChain Deep Agents 文档（四件套 / `interrupt_on` / 支持 Ollama）

**GitHub 实证（2026-10-07 直接抓仓库，非二手博客）`[GitHub]`**
- `huggingface/smolagents` README —— agent 逻辑 **~1,000 行**；**CodeAgent 比「输出工具调用字典」少 30% 步数**；`LocalPythonExecutor` **不是安全沙箱**（可绕、不得作安全边界）；沙箱支持 E2B/Blaxel/Modal/Docker；支持本地 `transformers` / `ollama` / LiteLLM 100+；正面回答「为什么要框架」（system prompt / parser / execution 三处格式一致性）
- `langchain-ai/deepagents` README —— 4 件套；**model-agnostic 含 Ollama/vLLM/llama.cpp**；**安全立场「trust the LLM，边界设在工具/沙箱层，不指望模型自我审查」**；"Inspired by Claude Code"
- `langchain-ai/deepagentsjs`（**TS 版，645 commits，2026-10-05 仍在更**）—— `npm install deepagents` + **`deepagents/browser` 入口（无 Node-only 导出）**；**6 个 peer deps**（`@langchain/core`/`langgraph`/`langgraph-checkpoint`/`langgraph-sdk`/`langchain`/`langsmith`）；`createDeepAgent` 返回 compiled LangGraph
- `letta-ai/letta` README —— **"Platform for stateful agents: AI with advanced memory"**（f.k.a. MemGPT）；主流源码迁至 **`letta-ai/letta-code`**，npm **`@letta-ai/letta-code`**；**有 Windows/macOS/Linux 桌面 app** + 本地 `letta server` + **TypeScript Agent SDK**；旧 V1 server 已 archive
- `mastra-ai/mastra` README —— 40+ providers；**graph-based workflows**（`.then()/.branch()/.parallel()`）；**suspend & resume**（storage 记状态、可无限期暂停）；**Observational Memory**；MCP 双向；evals + observability；本地 Studio；**双许可证：核心 Apache-2.0，`ee/` 为 Enterprise source-available**
- `BrainBlend-AI/atomic-agents`（仓库现址 `Eigenwise/atomic-agents`）README —— 极简模块化（Single-purpose/Reusable/Composable/Predictable）；**Agent = System Prompt + Input Schema + Output Schema + History + Context Providers**；**"All logic and control flows are written in Python"**（反对框架接管控制流）；Context Providers = 运行时注入系统提示；经 Instructor 支持 Ollama / 任何 OpenAI-compatible；文档工程有 `llms.txt`/`llms-full.txt`/Context7
- GitHub star 快照 `[二手]` —— `microsoft/autogen` **58,025 但 frozen**（Microsoft 已并入 Agent Framework 并劝用户别再基于它新建）；`langchain` 136,707 / `crewAI` 51,380 / `agno` 40,118 / `langgraph` 32,027 / `smolagents` 27,302 / `vercel/ai` 24,220 / `mastra` 23,871 / `letta` 22,707 / `pydantic-ai` 17,055 / `claude-agent-sdk-python` 6,860；TS 阵营还有 `n8n` 187,791 / `cline` 61,755 / `flowise` 52,810
- 「五个轮子」横向评测 `[二手]`（2026-06）：记忆 / 沙箱 / skills-vs-MCP / 工具治理 / 传输；**只有 Letta 解了记忆，只有 smolagents 解了沙箱**

**外部二手**：4B 三教训（提示词冗长税 / 软路由失效 / 数字硬上限胜于提示词条款）、≤4B 工具调用分档（≤4B 不可生产、7–8B 黄金区间）、8GB 卡 Ollama 默认 `num_ctx=4096` + 第 7 轮截断、九框架同题实测（Claude Agent SDK ~35,000 tok/轮 = 25 倍、8.5s、299MB）、2026 多 agent 架构综述（≤5 agent、协调税、共享状态层、逐 agent 埋成本、协调死锁）

**未能实测（诚实边界）**
- 本机 **Ollama 当前未运行**（`curl 127.0.0.1:11434` 连接被拒）⇒ `num_ctx` 实际生效值、
  4B 真实工具调用成功率、8B 升级后的延迟/显存，**本文档全部未在本机跑过**
- `auto_evaluator.py` 是否真在独立上下文，**本轮未核**（DD-9 的第一动作就是核这个）
- 51 个 E2E 至今未在真机跑过
