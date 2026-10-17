# 智能体架构独立审查报告（专家视角）

> 审查对象：`desktop/src/{shared,main}/agent/**` + `main/ipc.ts` 的 AI 通道 + `docs/agent-framework-design.md`（v1.7）  
> 审查日期：2026-10-18  
> 目标：站在「市场主流智能体范式」外部视角，找出与主流不一致 / 设计不合理处；聚焦**诊断 + 最小改动**，不重写。  
> 方法：读设计文档（已自审 4 版）+ 读核心实现代码交叉验证。本文是**补充**项目自审、而非重复它的结论；项目已做对的地方只点名、不展开。



---

## 0. 先给结论（TL;DR）

项目**分层骨架、循环、工具纪律、安全边界、终止闸、观测地基都做得对**，与 Anthropic「薄 harness + 边界设在工具层」的主流立场一致，不必推倒重来。

但有一处**结构性不一致**是主流框架普遍不会犯的，需要优先处理：

> **当前存在两套并行的「AI 编排栈」，且「harness 关注点」（审批 / 预算 / 观测 / 质量门）被焊死在对话循环里，没有沉淀成共享服务。**

具体表现：`brainService.runBrainLoop` 只服务数字员工对话面板；而 `ceshu:aiGenerateChapter` / `aiGenerateData` / `aiReview` 三个 AI 能力是 `ipc.ts` 里**直连 LLM** 的单独处理函数，各自 inline 地接了确认门（DD-17）和质量门（DD-19），但**不经由同一套 harness**。每新增一个 AI 功能，就重造一遍编排 + 防护。

其余差距集中在三块：**记忆层过浅（与「RAG + 长期记忆」主流明显脱节）**、**agent 循环没有评估闭环与上下文重置**、**云端档尚有若干半成品（流式/静默回落/域 grounding）**。

下面逐项展开。

---

## 1. 现有架构职责边界与数据流向

### 1.1 分层映射（实录）

| 层                 | 模块                                                                                                          | 职责                                   |
| ----------------- | ----------------------------------------------------------------------------------------------------------- | ------------------------------------ |
| 策略/契约（shared，纯函数） | `brain` `protocol` `prompts` `budget` `toolGroups` `observability` `qualityGate` `memory` `session` `panel` | 循环代数、工具 schema、提示词骨架、预算/观测/质量**纯逻辑** |
| 运行时               | `brainService` `agentTransport` `openAiTransport` `ollamaTransport`                                         | 装配传输层 + 工具面 + 跑循环                    |
| 编排                | `dispatcher` `approvalBroker` `qualityJudge` `operationRecorder`                                            | 技能注册/解析/危险确认/评审/记录                   |
| 工具                | `skills/*`（5 个）                                                                                             | 封装副作用（数据/策划书/代码/问用户/回滚）              |
| 存储                | `sessionStore` `memoryStore` `preferenceStore` `operationLogStore`                                          | 落盘/语义检索/偏好/审计                        |

依赖方向（`shared` 禁 import `main`、skills 禁反向 import 编排层）经 grep 成立，**这是真优势**，保留。

### 1.2 两条数据通路（关键发现）

```
【通路 A：对话智能体】  DigitalPanel → IPC agent:chat → brainService.chat
   → buildToolFace(档位) → runBrainLoop(think→tool→think)
   → 每轮 turn_stats 事件 → reduceBrainEvent → 面板渲染
   → 结束：sessionStore 落盘 + memoryStore.add("问:..答:..") 整轮 blob

【通路 B：创作面 AI】  AiFullGeneratePanel/AiDataGenPanel → IPC ceshhu:ai*
   → ipc.ts 直接 new LlmClient().generate(...)
   → DD-17 确认门（inline）→ LLM 生成 → DD-19 qualityGate（inline）
   → 返回 fields + quality + usage
   ⚠️ 完全不经过 brainService / dispatcher / runBrainLoop
```

注意：`qualityGate`（`shared/agent/qualityGate.ts`）是**纯函数、可复用**，所以通路 B 复用了它的「判断」；但**通路 B 没有复用** `dispatcher` 的工具执行、`approvalBroker` 的审批流、`brainService` 的观测装配、`toolGroups` 的档位裁剪。也就是说——**判断逻辑共享了，编排与治理没有共享**。

### 1.3 耦合过重 / 职责缺失 / 流程断裂（具体点）

| 编号      | 问题                                                                                                             | 证据                                                                                                                                                                                                     | 严重度               |
| ------- | -------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------- |
| **F1**  | **harness 关注点未抽成共享服务**：审批/预算/观测/质量门散在 `brainService` 与 `ipc.ts` 两处，各自 inline 实现。新增 AI 功能 = 重造编排。               | `ipc.ts::ceshu:aiGenerateChapter` 自己算 `isCloud`/`estimatedTokens`/`llmConfirmReason`（v1.5 实现记录 §5.5.5）；`brainService.chat` 自己组装 `turn_stats`/落盘/记忆。两处对「预算闸门」的实现口径若不持续同步就会漂移。                           | **结构性（建议改，非致命）**  |
| **F2**  | **长期记忆文件 `.workspace/memory/MEMORY.md` 在 agent 循环里完全没被读取**。                                                    | `buildSystemPrompts`（`prompts.ts`）只拼 `身份 + 规则 + 工具目录 + extraBlocks`；`brainService.buildMemoryBlock` 只查 `memoryStore.search`（vectra blob 库），不读 MEMORY.md。设计文档 §7 自己也写「identity.md/ MEMORY.md TS 侧无消费者」。 | **职责缺失（必须改）**     |
| **F3**  | **记忆是「整轮 Q\&A blob」存入 32 维 bigram 哈希**，无切块、无重排、无衰减、无「learnings」萃取、无反思。                                         | `memory.ts::embedText`（字符 bigram→32 维）；`brainService` 写 `问：${input}\n答：${result.text}`；检索 `search(input, topK=3)`。                                                                                     | **设计不合理（建议改）**    |
| **F4**  | **agent 循环无评估闭环**：对话智能体永远不自评输出；DD-19 质量门只在通路 B 跑。                                                              | `runBrainLoop` 终稿直接 `done`，无 evaluator 钩子；`qualityJudge` 仅 `ceshu:aiGenerateChapter` 调用。                                                                                                               | **流程断裂（建议改）**     |
| **F5**  | **无上下文重置/压缩（DD-8 未落地）**：仅设 `num_ctx`，长会话靠模型窗口硬撑。本地 4B 下会 context rot / 截断。                                     | `brain.ts` 无 compaction 分支；设计文档 §8 DD-8「待补」。                                                                                                                                                           | **本地档致命 / 云端可选**  |
| **F6**  | **工具结果无尺寸闸（DD-7 未落地）**：`formatToolResult` 原样回灌，超长结果（如 200 条数据列表）直接撑爆 4K/16K 上下文。                               | `brain.ts::runBrainLoop` 直接 `messages.push(buildToolMessage(...))`；无截断/落盘。                                                                                                                             | **本地档致命 / 云端建议改** |
| **F7**  | **`unconfigured` 档静默回落本地 Ollama**，与 M0「不再静默回落」的产品意志直接冲突（设计文档自己记为「后续改」的已知缺陷）。                                   | `agentTransport.ts::resolveAgentTier` 把 `unconfigured` 归 `local`；v1.6 补记 §行 73 主理人裁定后续改。                                                                                                               | **必须改（语义回归）**     |
| **F8**  | **agent 循环无域 grounding（DD-18 未进循环）**：`capabilityCatalog` 只给工具名一行摘要，模型不知道本项目的章节结构/类型 schema/术语表，产出易「通顺但不符合本结构」。 | `prompts.ts::buildSystemPrompts` 无域上下文块；DD-18 在 §5.5.2② 列了但未在循环落地。                                                                                                                                     | **建议改（质量收益高）**    |
| **F9**  | **云端传输层非流式**（`openAiTransport` `stream:false`），云端对话不逐字输出，UX 与本地档不一致。                                           | `openAiTransport.ts` 实现记录 §5.5.13「非流式」。                                                                                                                                                                | **建议改（UX）**       |
| **F10** | **无 per-tool 重试预算**：工具报错后把 `[STOP]` 回灌，小模型可能反复重试同一坏调用，直到 8 次全局上限耗尽，浪费上下文/成本。                                   | `brain.ts` 仅全局 `maxToolCalls`，无按 (tool,action) 失败计数。                                                                                                                                                   | **建议改（效率）**       |
| **F11** | **观测未闭环**：M1 采了每轮 stats，但无跨会话历史聚合、无「超预算自动降级」消费端（DD-5b 真降级未做）。观测是「测量」不是「优化」。                                    | `observability.ts` 纯数据；`budget.ts` 只做护栏级（二次确认）。                                                                                                                                                        | **可选（演进）**        |

---

## 2. 对照主流范式逐项差异（致命 vs 风格）

| 主流范式                            | 本项目现状                                                                        | 判定             | 说明                                                                                                         |
| ------------------------------- | ---------------------------------------------------------------------------- | -------------- | ---------------------------------------------------------------------------------------------------------- |
| **ReAct / Function Calling 循环** | `runBrainLoop` 标准 think→tool→think，线格式已修（v1.7）                               | ✅ 对齐（风格一致）     | 实现质量高，是本项目最强的一块                                                                                            |
| **Planner / Executor 分离**       | 循环内**无显式 plan/todo**；`ceshu` 整篇生成用硬编码 `plan.order`（顺序章节）当 executor 输入        | ⚠️ 部分缺失        | 聊天场景无需 plan；但复杂域任务（整篇 GDD=16 章）缺动态规划。属**风格差异**而非致命——Anthropic 也主张「能用 workflow 就别用 agent」                   |
| **多智能体协作**                      | 无 sub-agent；DD-13 本地档明确不做、云端档仅列候选                                            | ⚠️ 有意为之        | 本地 4B 下正确；云端档若要做「评估器 + 只读复核」应走 sub-agent 或 evaluator-optimizer，**目前机制不可用**                                 |
| **RAG + 长期记忆**                  | 有 blob 向量库（32 维 hash）+ MEMORY.md 文件，但**循环只消费 blob 库、不读 MEMORY.md**；无重排/衰减/反思 | ❌ 明显偏弱         | 与 Letta「stateful agent」、主流 RAG（真实 embedding + rerank + 结构化记忆）脱节。**致命性低**（单机单用户桌面），但 MEMORY.md 不消费是**具体缺陷** |
| **可观测性 + 评估闭环**                 | 观测 ✅（M1 采每轮 token/延迟/工具数）；**评估闭环 ❌**（仅创作面有质量门，对话循环无）                         | ⚠️ 半到位         | 观测地基好；缺「评估器钩入循环」与「观测驱动调优」两步                                                                                |
| **工具设计纪律**                      | `TOOL_RISK_MAP` + zod schema + 前缀 + 渐进披露目录 + 档位限量                            | ✅ 对齐（甚至优于多数自研） | 主流强调的「少而精 / 高信号返回 / 错误引导」都做到了                                                                              |
| **安全 / 沙箱 / 治理**                | QuickJS WASM 沙箱 + approvalBroker + 「边界设在工具层」                                 | ✅ 对齐           | 与 Deep Agents「trust the LLM, 边界在工具层」一致，是背书                                                                 |
| **协调死锁防护**                      | 三道计数硬闸（turns/toolCalls/wallClock）+ 协议合法补齐                                    | ✅ 对齐           | 主流强调的 turn limit / tie-breaker 都在                                                                          |
| **上下文工程（reset/compact）**        | 只有 `num_ctx` + 提示词预算门；无 reset/compact                                        | ⚠️ 缺失          | Anthropic 2026 主张 reset 优于 compact；本地档 context rot 是真风险                                                    |
| **统一运行时 / 单一入口**                | **两套 AI 编排栈**（§1.2）                                                          | ❌ 结构性不一致       | 主流框架（LangGraph/Mastra/smolagents）均提供**一个运行时**，chat 与 task 生成都走它（task 用 workflow 子图，但仍复用 harness）           |


**致命缺陷清单（真正影响正确性/可维护性的，只有 2 条）：**

1. **F7 `unconfigured` 静默回落** —— 直接违反已落地的产品意志（M0）。
2. **F1 双编排栈 + harness 未共享** —— 不是「会出错」，而是「每加一个 AI 功能都在累积技术债」；长期会腐化防护一致性。

其余（F2–F6、F8–F11）按档位区分：本地档的 F5/F6 是**功能性致命**（4B 上跑不动/炸上下文），云端档降为可选；F2/F3/F4/F8/F9/F10/F11 是**质量/演进级**，不是致命。

---

## 3. 改造建议（按优先级 + 影响范围）

优先级：🔴 必须改 / 🟠 建议改 / ⚪ 可选。影响范围：改动触及的模块与回归面。

### 🔴 必须改

| 项                   | 建议（最小改动）                                                                                                                                                                                            | 影响范围                                                                                                                       |
| ------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- |
| **F7 静默回落**         | `agentTransport.ts::resolveAgentTier`：`unconfigured` 不再归 `local` 传输层，改为**返回「需引导」信号**；`brainService.chat` 在 `tier==='unconfigured'` 时直接返回可读错误「未配置模型，请到设置选择云端服务商或开启保密模式」，由面板引导。不动 `local`/`cloud` 两档。 | `agentTransport.ts` + `brainService.ts` + 面板错误态；单测 1–2 例。零回归已有档位路径                                                         |
| **F2 读取 MEMORY.md** | 新增 `main/agent/memoryStore.ts` 的 `loadLongTerm()`（读 `.workspace/memory/MEMORY.md` 文本），在 `brainService.buildSystemPrompts` 的 `extraBlocks` 里注入为 `## 长期记忆` 块（冷启动空则不注入）。与偏好块同形态，零新机制。                  | `brainService.ts` + `memoryStore.ts`；单测 MEMORY.md 非空时进入提示词。回归：提示词预算门（DD-6）需确认 ≤30 行核心区不受影响——长期记忆走 `extraBlocks` 不计入核心区，已符合 |

### 🟠 建议改（高性价比，不重构）

| 项                      | 建议（最小改动）                                                                                                                                                                                                                  | 影响范围                                                                           |
| ---------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------ |
| **F1 harness 抽共享**     | 抽 `main/agent/runTask.ts::runAgentTask(deps, spec)`：统一「装配档位 + 工具面 + 审批 + 预算确认 + 观测 + 质量门」六步；`brainService.chat`（含工具循环的 agent 形态）与 `ceshu:ai*`（单发 workflow 形态）都调用它。第一步可只把**预算确认 + 观测装配**抽出来共用（风险最低），工具循环暂留 `brainService`。 | 中：新增 `runTask.ts` + 改 `ipc.ts` 三处 + `brainService`。需守卫测试锁「两路径预算口径一致」           |
| **F8 域 grounding 进循环** | `prompts.ts` 新增静态 `buildDomainContextBlock()`（注入 `CHAPTER_KEYS` 章节结构 + 当前库类型 schema 摘要 + 术语表前 N 条），作为 `extraBlocks` 之一。不必接全量术语表，先接「结构 + 类型概要」。这是本项目**最好的 grounding 语料**（设计文档 §5.5.2② 已论证）。                                | `prompts.ts` + `brainService.ts`；单测块存在。回归：提示词长度（本地档需确认仍 ≤阈值，可把域块计入「按需注入」而非核心区） |
| **F6 工具结果尺寸闸**         | `brain.ts` 在 `formatToolResult` 后加一个 `clipToolResult(text, maxChars)`（本地档默认 ~1500 字、云端 ~4000 字），超限截断并附 `（结果已截断，可查询细化）`。不落盘（DD-7 落盘留后续），先截断止血。                                                                             | `brain.ts` + 单测截断分支；只影响超长工具输出，低风险                                              |
| **F9 云端流式**            | `openAiTransport.ts` 改 `stream:true` + 解析 SSE `onChunk`，与 `ollamaTransport` 同形态。让云端档也逐字渲染。                                                                                                                                | `openAiTransport.ts` + `brainService` 事件流；需 e2e 验证                             |
| **F4 评估钩子进循环**         | `runBrainLoop` 增可选 `evaluator?: (text)=>Verdict`；云端档（或开关）在 `done` 前跑一次确定性门（复用 `qualityGate` 思路，对对话终稿做「是否空/是否含明显违规」轻量判定），结果进 `BrainRunResult`。**不阻断**，只附 `verdict`。                                                        | `brain.ts` + `qualityGate.ts` 复用；单测 evaluator 被调用                              |

### 🟠 建议改（本地档功能性，按需）

| 项                     | 建议                                                                                                                   | 影响范围                   |
| --------------------- | -------------------------------------------------------------------------------------------------------------------- | ---------------------- |
| **F5 上下文重置**          | 当 `messages` 估算 token > `num_ctx*0.7` 时：把前 N 轮压成一段「交接摘要」（让模型生成或用模板），开新 `messages` 续跑，原摘要块显式重述约束防 goal drift。仅本地档默认开。 | `brain.ts`；单测 reset 分支 |
| **F10 per-tool 重试预算** | 循环内维护 `failCount[tool+action]`，同一 (tool,action) 连续失败 ≥3 次 → 发更强 `[STOP] 该操作已连续失败，请换方案` 并强制 consid。全局上限仍保留。           | `brain.ts`；单测重试计数      |

### ⚪ 可选（演进）

| 项                                      | 建议                                                                                                                                 | 影响范围                                                              |
| -------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **F3 记忆升级**                            | ① 换真实 embedding（本地轻量模型或 Ollama embed）替代 32 维 hash；② 检索加 recency 权重 + 简单重排；③ 从成功 turn 抽 `LEARNINGS`（设计文档已建 `LEARNINGS.jsonl` 但未消费）。 | 中：memoryStore + embedText；需评估本地无 embedding 模型的现状（设计文档 §11 已决定暂不引） |
| **F11 观测闭环**                           | `sessionStore` 顺带落 `runStats` 历史；加「本会话累计花费 / 是否超预算」面板汇总；未来可做「超预算自动降级」（DD-5b 真降级）。                                                  | `sessionStore` + 面板                                               |
| **Planner/todo（云端）**                   | 云端档在循环首轮加可选 `plan` 步（todo 列表注入系统提示），复杂任务可追踪进度。本地档不加。                                                                               | `brain.ts` + `prompts.ts`                                         |
| **云端 sub-agent / evaluator-optimizer** | 待 F4 评估钩子落地后，云端档把「评估器 + 只读复核」做成独立上下文调用（Anthropic Outcomes 增益路径），不恢复 5-Agent 那套。                                                    | 大：新传输/子调用机制                                                       |

---

## 4. 目标分层架构说明（文字）

> 目标不是「重写」，而是把现有骨架**补两道横向共享层**，让 chat 与创作面共用 harness，并补齐记忆/评估/上下文三块。

```
┌─ 渲染层 ───────────────────────────────────────────────────────┐
│  DigitalPanel（对话）· AiFullGeneratePanel / AiDataGenPanel（创作）│
│  档位选择 · 审批对话框 · 成本/预算行 · 质量门结论块 · 终止提示      │
└───────────────▲ 事件流（reduceBrainEvent，纯 reducer）──────────┘
                │
┌───────────────┴──────────────────────────────────────────────┐
│  【新增·横向共享】AgentTask 编排服务  runTask.ts                  │
│   统一六步：档位装配 → 工具面裁剪 → 审批闸 → 预算确认            │
│            → 观测采集 → (可选)质量门/评估钩子                    │
│   chat 形态（含工具循环）与 task 形态（单发 workflow）都走它      │
└───────▲───────────────────────────────────▲──────────────────┘
        │                                    │
┌───────┴────────────┐            ┌──────────┴──────────────────┐
│ shared/agent（纯）  │            │ main/agent（编排+运行时+存储） │
│ brain·protocol·     │            │ brainService·dispatcher·      │
│ prompts·budget·     │            │ approvalBroker·qualityJudge· │
│ toolGroups·         │            │ agentTransport·openAi/        │
│ observability·      │            │ ollamaTransport·sessionStore· │
│ qualityGate·        │            │ memoryStore·preferenceStore   │
│ memory·panel        │            │ + skills/*（5 个工具）         │
└───────▲────────────┘            └──────────▲──────────────────┘
        │                                    │
┌───────┴────────────────────────────────────┴──────────────────┐
│ 长期记忆层（补强）                                                 │
│  ① 短期 = 循环 messages（加上下文重置 F5）                         │
│  ② 长期 blob = memoryStore（vectra，F3 可升级 embedding+重排）     │
│  ③ 长期文件 = MEMORY.md（F2 必须读入循环） + LEARNINGS.jsonl（F3 萃取）│
│  ④ 域 grounding = 章节结构/类型 schema/术语表（F8 静态注入）         │
└────────────────────────────────────────────────────────────────┘
        │
┌───────┴────────────────────────────────────────────────────────┐
│ LLM 传输层：☁ 云端（OpenAI 兼容，流式） / 🔒 本地（Ollama，带 num_ctx）│
│  档位路由：cloud / local / unconfigured(引导，不再静默回落 F7)       │
└────────────────────────────────────────────────────────────────┘
```

**依赖不变量（保持现有，补一条）**：

1. `shared/agent` 不 import `main`/`electron`（已有）。
2. `skills/**` 不反向 import 编排层（已有，建议加 ESLint 规则固化）。
3. **【新增】`ipc.ts` 的 AI 处理函数不得再 inline 实现审批/预算/观测**，必须过 `runTask` 共享服务（防止 F1 漂移）。

---

## 5. 分阶段重构路线图（最小改动优先）

| 阶段                              | 目标                                                               | 改动                                                                 | 优先级   | 规模/风险                  |
| ------------------------------- | ---------------------------------------------------------------- | ------------------------------------------------------------------ | ----- | ---------------------- |
| **P0 收口语义回归**                   | F7 静默回落 + F2 读 MEMORY.md                                         | `agentTransport`/`brainService` 引导分支；`memoryStore.loadLongTerm` 注入 | 🔴 必须 | ~80 行，零回归已有档位          |
| **P1 harness 共享 + 域 grounding** | F1 抽 `runTask` 共用预算/观测 + F8 域块进循环 + F6 工具结果截断                    | 新增 `runTask.ts`；`ipc.ts` 三处改走 `runTask`；`prompts.ts` 域块            | 🟠 建议 | ~400 行，需守卫测试锁「两路径口径一致」 |
| **P2 循环健壮性**                    | F5 上下文重置 + F4 评估钩子 + F10 per-tool 重试预算 + F9 云端流式                 | `brain.ts` 加 reset/evaluator/重试计数；`openAiTransport` 流式             | 🟠 建议 | ~300 行，本地档收益最大         |
| **P3 演进（可选）**                   | F3 记忆升级（embedding+重排+learnings）· F11 观测闭环 · 云端 planner/sub-agent | 按数据决定是否做                                                           | ⚪ 可选  | 视评估而定                  |

**建议执行顺序的理由**：P0 是唯一「违反已落地产品意志」的硬伤，零风险先收；P1 把最大的技术债（双栈 + harness 漂移）用最小改动焊死，并顺手补上「域 grounding」这个质量收益最高的项；P2 解决本地档跑不动/炸上下文的功能性致命点；P3 等 P0–P2 在真机（Ollama 跑起来 + 云端实测）拿到数据后再定，避免盲调（呼应设计文档 M1「先有数据再调优」）。

**不动的**：分层范式（§7.2 已达标）、shared 既有决策、QuickJS 沙箱、审批闸、工具纪律、三道终止闸——这些与主流对齐，加固即可。

---

## 附：与项目自审文档的关系

- 本项目 `docs/agent-framework-design.md` v1.7 已自审得很扎实（G0–G10、DD-0~DD-16、M0–M6）。本报告**不重复**其已识别项，只补三块它没单列成「结构级」的：
  1. **双 AI 编排栈 / harness 未共享**（F1）——它把 §5.5.2① 当作「防护绕过」，本文升级为「运行时未统一」的结构问题。
  2. **MEMORY.md 在循环里完全不消费**（F2）——它在 §7 列为「无消费者」但未列为必须改。
  3. **agent 循环无评估闭环 + 无上下文重置**（F4/F5）——它把评估器放在创作面（DD-19），本文指出对话循环本身缺这层。
- 其余 F3/F6/F7/F8/F9/F10/F11 与文档的 DD-7/DD-8/DD-18/已知缺陷互相对应，本文给出「最小改动落点」。

---

## 6. 实现进度（2026-10-18 已落地）

按「最小改动、不推倒重来」原则全部实现；**F1/F3/F7 已于本轮补齐为完整版**（不再是留口）。已通过 `tsc --noEmit`（node + web 双工程零错误）、`eslint`（零错误）、`vitest`（**2015 例全绿 / 5 skipped**）。

| 项       | 落地内容                                                                                                                                                                 | 文件                                                | 备注                                                                                                                 |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------ |
| **F7**  | `resolveAgentTier` 三态如实透传（`unconfigured` 不再伪装 `local`）；渲染层在未配置档显示可执行引导（「去设置配云端 / 保持本地保密模式」）                                                                          | `agentTransport.ts` + `DigitalPanel.tsx`          | 传输层对 `unconfigured` 仍走原生本地 Ollama（聊天面本就以本地为原生档），只做**诚实标注 + 行内引导**，不做「无配置即报错」的破坏性改法                                 |
| **F2**  | 循环读取 `MEMORY.md` 长期记忆 + `learnings.jsonl` 沉淀知识，作为 `## 长期记忆`/`## 沉淀知识` 块注入                                                                                            | `memoryStore.ts` + `brainService.ts`              | 此前循环完全没读 MEMORY.md，现已接入                                                                                            |
| **F8**  | 域 grounding 块（GDD 章节结构）常驻注入 `extraBlocks`（不计入 30 行核心区）                                                                                                               | `brainService.ts`                                 | 放在 main 层以遵守 `shared/agent` 领域无关铁律；库级类型 schema/术语表注入需库上下文，留后续                                                      |
| **F6**  | `clipToolResult` 工具结果尺寸闸（本地 1500 / 云端 4000 字，超限截断）                                                                                                                   | `brain.ts`                                        |                                                                                                                    |
| **F5**  | `maybeResetContext` 上下文重置（DD-8）：历史超阈值压缩为交接摘要续跑                                                                                                                       | `brain.ts`                                        | 模板摘要、不额外调 LLM                                                                                                      |
| **F4**  | `evaluator` 钩子进循环；云端档挂 `defaultDialogueEvaluator`（空产出判定），结论进 `BrainRunResult.verdict`                                                                                | `brain.ts` + `brainService.ts`                    | 不阻断生成                                                                                                              |
| **F10** | per-tool 连续失败预算（`failCount`，≥3 次强制换方案）                                                                                                                               | `brain.ts`                                        | 全局上限保留                                                                                                             |
| **F9**  | 云端传输层 SSE 流式（`stream:true` + 逐 `data:` 行解析 + tool_calls 按 index 合并 + `onChunk` 逐字）                                                                                   | `openAiTransport.ts`                              | 与本地 Ollama 流式 UX 对齐；无 body 时降级读 JSON                                                                               |
| **F1**  | `runTask.ts::runSingleShotTask` **完整单发任务 harness**（预算确认 → 计时 → `AgentRunStats` 观测累计）；ceshu 三处 handler 全部改走它                                                          | `runTask.ts` + `ceshuIpc.ts`                      | 与 `runBrainLoop`（多轮）分工；两者共用 `confirmAgentBudget` + `AgentRunStats`，成本口径/观测形状单一真源。工具循环仍留在 `brainService`（不做无收益的大合并） |
| **F3**  | **可插拔真实 embedding**：`embedding.ts` 走 Ollama `/api/embeddings`（`MB_MEMORY_EMBED_MODEL` opt-in）；`embedding.json` 索引版本校验（换模型自动重建）；provider 失败优雅跳过；叠加近因重排 + learnings 萃取 | `embedding.ts`（新）+ `memoryStore.ts` + `stores.ts` | 默认仍为确定性哈希（无 embedding 模型也可用）；真实模型仅显式配置时启用，失败不阻塞主流程；不会把异维度向量混入同一索引                                                  |
| **F11** | `sessionStore.recordRunStats` 落盘运行统计；`brainService` 云端超预算记 metric（DD-5b 真降级起点）                                                                                       | `sessionStore.ts` + `brainService.ts`             | 观测闭环地基，真降级待补                                                                                                       |


**验证命令**

```
tsc --noEmit -p tsconfig.node.json --composite false   # 零错误
tsc --noEmit -p tsconfig.web.json  --composite false   # 零错误（含 DigitalPanel 改动）
eslint src/main/agent src/shared/agent src/main/ipc/ceshuIpc.ts src/main/stores.ts src/renderer/.../DigitalPanel.tsx   # 零错误
vitest run tests/unit tests/integration                # 2015 passed / 5 skipped
```

**仍待（非阻塞，需真机/产品决策）**

- e2e 需在 `npm run build` 后真机跑（Ollama + 云端 Key），本次未跑 e2e（与项目惯例一致：e2e 本地可跑但需先 build）。**F9 云端流式与 F7 面板提示建议在真机各补一条 e2e。**
- F7 当前是「行内提示 + 档位标签」；若产品要「未配置直接弹引导 / 一键开保密模式」，需再加面板按钮（后端契约已就绪）。
- 云端 planner / sub-agent 仍是演进项（DD-13 云端候选），按路线图 P3 评估。
- F3 的 Ollama embedding 需本机装对应模型（如 `nomic-embed-text`）并设 `MB_MEMORY_EMBED_MODEL` 才生效；未设置时行为与之前一致。

---

## 7. 编排核心重构（第二轮，按确认范围）

第一轮是「最小改动补齐缺口」，结果是单文件膨胀：`brain.ts` 555 行、`brainService.ts` 约 340 行，  
两者都同时承担「定义 / 求值 / 编排 / 副作用」四类职责。第二轮按主理人确认的范围**重写编排核心**，  
目标是**职责分离 + 消除重复**，不改公共 API、不改行为。

### 7.1 范围裁定（写清楚「没动什么」，避免被当成偷工减料）

| 区域                                                            | 处理             | 理由                 |
| ------------------------------------------------------------- | -------------- | ------------------ |
| `shared/agent/brain/`                                         | **重写为包**（4 文件） | 555 行单文件；类型与求值逻辑混居 |
| `main/agent/agentService/`                                    | **重写为包**（5 文件） | 编排 + 副作用 + 提示词装配混居 |
| `main/agent/ollamaTransport.ts` / `openAiTransport.ts`        | **重写**（共用行泵）   | 两份流解析拷贝已出现实质漂移     |
| `main/agent/agentStream.ts`                                   | **新增**         | 行泵 + HTTP 错误归一     |
| `main/agent/dispatcher.ts`                                    | **只修一处**       | 结构无需重写（见 7.4）      |
| `main/agent/skills/**`（1104 行）                                | **不动**         | 架构问题不在技能实现内部       |
| 纯数据表（`protocolData` / `ceshuConstants` 等）                     | **不动**         | 无逻辑                |
| `shared/schemas.ts` / `ipc.ts` / `service/api.ts` / `preload` | **不动**         | 四层 IPC 契约不在本范围内    |

安全锚点（动手前建立，零成本回滚）：

```
git tag agent-pre-rewrite-2026-10-18 HEAD    # = 30d88b6
cp -r 备份                                   # D:/tmp/agent-rewrite-backup-2026-10-18/
```

### 7.2 `shared/agent/brain/`：定义层 / 逻辑层分离

| 文件           | 职责                                                          | 关键约束               |
| ------------ | ----------------------------------------------------------- | ------------------ |
| `types.ts`   | 全部事件 / 选项 / 结果类型 + 4 个默认常量                                  | **零求值逻辑**，改类型不牵动流程 |
| `context.ts` | `safeRunEvaluator` / `clipToolResult` / `maybeResetContext` | 纯函数，可独立测           |
| `loop.ts`    | `runBrainLoop`                                              | 只管流程，不碰提示词/记忆/落盘   |
| `index.ts`   | barrel                                                      | 公共 API 不变          |
| `brain.ts`   | 一行 `export * from './brain/index'`                          | 既有 import 站点零改动    |

⚠️ 重演过的坑：`export *` **不会**把符号带进本模块局部作用域 —— 被 `loop.ts` 函数体引用的  
类型必须逐个显式 import（否则 TS2304 + 连带隐式 any）。同理，原文件里未 `export` 的私有  
`const` **不迁**（迁了就得 import 再反向导出，等于悄悄扩大公共 API）。

### 7.3 `main/agent/agentService/`：编排 / 副作用分离

| 文件                 | 职责                                                                                             |
| ------------------ | ---------------------------------------------------------------------------------------------- |
| `types.ts`         | `AgentChatOptions` / `AgentBrainServiceDeps`                                                   |
| `domainContext.ts` | `buildDomainContextBlock`（章节结构 grounding）+ `defaultDialogueEvaluator`                          |
| `memory.ts`        | `buildMemoryBlock`（相关记忆 / 长期记忆 / 沉淀知识三块拼装）                                                     |
| `service.ts`       | `createDispatcherToolRunner` + `AgentBrainService.chat()`（档位 → 传输层 → 工具面 → 提示词 → 循环 → 落盘 → 回写） |
| `index.ts`         | barrel；`brainService.ts` 退化为一行再导出                                                              |

调用顺序与改前逐行一致；**唯一新增的转换点**仍是 `toFunctionCallingTools`（线格式外层包装），  
未分裂成第二处 —— 这是历史上踩过云 400 / 本地静默的雷区。

### 7.4 `dispatcher.ts`：为什么只改一处

结构（注册表 / 模糊解析 / 确认门 / 结构化错误）经查是合理的，**重写只会增加风险**。  
真实缺陷只有一个：

> `maxAllowedRisk` 字段存了、`riskCeiling` getter 也暴露了，但 `execute()` **从不读取**。

这是典型「形似安全策略、实则零守卫」——删掉那行不会有任何测试报红。修法不是删字段，而是  
让它真正生效：`execute()` 改走 `protocol.checkPermission`（显式禁止 → 硬上限 → 危险确认三段），  
同时补 3 条守卫测试钉住它。

⚠️ 缺省值必须是 `RISK_LEVEL.SYSTEM`（不设上限），**不能**用 `protocol.ts` 的  
`DEFAULT_MAX_ALLOWED_RISK`（`FILE_SYSTEM`）：后者会让 `system.code` 这类 SYSTEM 级操作  
**即便用户点过确认也无法执行** —— 那是行为破坏，不是加强安全。硬上限（配置式禁止）与  
确认门（交互式放行）是两个维度，不能互相替代。

### 7.5 传输层：消除「复制出来的漂移」

改前两层各写一遍 `getReader → TextDecoder → 缓冲切 \n`，约 50 行 ×2，**且已漂移**：  
云端那份有 `finally { reader.releaseLock() }`，本地那份没有（抛错时锁不释放）。

现抽出 `agentStream.ts`：

- `pumpLines(body, onLine)`：只切行，不解释内容；尾行不丢；`finally` 保证释放；
- `assertHttpOk(response, label)`：两档一致的状态码 + 响应体摘要（截 200 字，保留 `param`/`code` 定位信息）。

NDJSON 与 SSE 的差异（`data:` 前缀 / `[DONE]` / 空行）留在各自传输层，共用的只有底座。

### 7.6 验证

```
tsc --noEmit -p tsconfig.node.json --composite false   # 0
tsc --noEmit -p tsconfig.web.json  --composite false   # 0
eslint src/main/agent src/shared/agent                 # 0
vitest run tests/unit tests/integration                # 2018 passed / 5 skipped（132 文件）
npm run build                                          # 成功（out/main 590.61 kB）
```

分模块验证节奏（每模块先绿再进下一个）：`brain/` 57 例 → `agentService/` 57 例 →  
传输层 62 例 → 调度器 86 例（含新增 3 条）→ 全量 2018 例。

### 7.7 e2e 实测：修好 agent 组，暴露整包既有红灯

`out/` 构建完成后跑了 e2e（`npm run build` 是前提，e2e 打的是产物不是源码）。

**agent 组：3 条 spec 全绿（9 例）**，但过程中先红了 4 例，全部是**用例本身陈旧/竞态**，  
不是重构引入 —— 用 `git worktree` 在重构前提交（`30d88b6`）上原样复跑，报错完全一致：

| 用例                                                   | 陈旧点                                                                               | 修法                                             |
| ---------------------------------------------------- | --------------------------------------------------------------------------------- | ---------------------------------------------- |
| `agent-execute-tool` / `agent-brain-chat` 的工具面断言     | 写死 2 个技能，实际注册表已增至 5（`system.code` / `tool.ask_user` / `tool.rollback_ai_changes`） | 更新为当前 5 个，并**保留写死**（注册表变化应在 e2e 层可见）           |
| `agent-digital-panel` 的 `思考中…` / `digital-streaming` | 桩服务零延迟 ⇒ 整轮在 React 提交一帧前跑完，瞬态态永远来不及渲染                                             | 桩服务加 `delayMs`：首轮延迟 600ms，终稿分片间隔 600ms 写出      |
| `agent-digital-panel` 的 `digital-step` 计数            | 断言 3 条，实际事件流是 4 条（两次 LLM 调用各一条 `llm_think`）                                       | 改为 4 并**显式断言顺序**（think → 并行1工具 → tool → think） |

**整包 e2e：54 passed / 18 failed / 2 skipped。** 18 条红全部集中在 ceshu / library-bar /  
smoke / type-field-id-ai，**与本次重构无关**（同法在 `30d88b6` 上复跑 smoke + library-bar 三条，  
失败与报错一字不差）。这是一笔**独立的技术债**，不应记在本次重构账上，但也不该继续无视：

- `library-bar` 两条：切库后标题仍为「初始库」、重启不恢复上次库 ⇒ 库切换/持久化疑似真 bug。
- `smoke`：全链路里有个 `toHaveCount(1)` 收到 2 ⇒ 疑似重复渲染或清库不彻底。
- `type-field-id-ai`：期望「未配置 AI 服务」文案含 `Ollama`，实际文案已改为指向「设置 → AI 模型服务」。
- 其余 `ceshu-*`：待逐条归类（多为断言随 UI 演进过期）。

> 建议单开一轮「e2e 债清理」，先分类（真 bug / 断言过期 / 环境依赖），再决定修哪边。  
> **不要再让 e2e 长期红着** —— 红灯常态化等于没有 e2e，本次就是靠它先被误认为「重构引入回归」。

> **补充（第三轮）**：这 18 条已全部清零，其中 1 条是真 bug（不是断言过期）。  
> 逐条分类与根因见 **§8.1**，真 bug 的修法见 **§8.2**。

### 7.8 仍存在的已知缺口（不粉饰）

- ~~🔴 **循环没有取消能力**~~ → **已在 §8.3 关闭**（保留此行只为留痕：这个坑真实存在过，  
  不是笔误）。原状：`wallClockMs` 是**轮次间**的软检查，单次 LLM 调用若挂住  
  （本地 Ollama 卡死 / 云端不回包），循环无法中断，与「三道计数闸为硬闸」的说法不符。
- 🟠 `fuzzyMatch` 仍是子串启发式：极短名（如 `a`）会命中一大片，取「键最长」兜住。  
  属已知取舍，改它需要真正的中文分词，收益不足。
- 🟠 `runBrainLoop` 的工具结果截断阈值（本地 1500 / 云端 4000）是经验值，未按模型  
  `num_ctx` 动态推导。

## 8. 第三轮：e2e 债清零 + 补取消能力

用户在这轮的原话是「把他们解决了」——指上表里两笔挂在账上的东西：**18 条既有红灯**与**取消能力缺失**。  
一句「它们是既有问题、不是本次引入」并不算解决，所以这轮把它们当交付物做掉。

### 8.1 e2e 债：18 条 → 0

先分类再修（分类错了就会去改没问题的实现）。四类，比例大致 1:7:9:2：

| 类别             | 条数    | 代表                                                                                                  | 修法                                                                |
| -------------- | ----- | --------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------- |
| **真 bug**      | 1     | `library-bar` ×2：切库后库条显示「初始库」                                                                        | 改**实现**（见 8.2），不是改断言                                              |
| **路径过期**       | 7 spec | `ceshu*.spec` 仍按 `<userData>/ceshu/` 拼路径 ⇒ `ENOENT` 被当成「没落盘」                                          | 统一用 `helpers/app.ts::libraryDir()`（`<userData>/libraries/<初始库>/`） |
| **断言过期**       | 9     | 章节数 18→17（`meta` 不算章）、结构分 3→3.1、`ai-*` 两段式成本确认、删除改为两段式确认、`ai-review` 文案改「尚未配置 AI 服务」              | 断言改为**当前契约**，并保留写死（契约变化应在 e2e 层可见）                                |
| **用例竞态**       | 3     | `思考中…` 零延迟桩不可观测；`library-active` 乐观更新抢在重载前；datagen「取消全选」跑在异步类型列表之前                                  | 桩加 `delayMs`；先登记 `load` 事件再切库；等勾选框可见再操作 / 断言 `input:checked` 数量 |

两条值得单独记住的：

1. **`library-active` 有乐观更新** ⇒ 断言文本会在整页重载**之前**通过，紧接着的 `page.evaluate` 就撞上
   `Execution context was destroyed`。而且这种「乐观值通过」根本没验证活跃库指针是否落盘 —— 修法是
   **先登记 `waitForEvent('load')` 再触发切换**，不是把超时调大。
2. **异步列表 + 默认全选** ⇒ 「取消全选」若跑在列表加载前会静默失效（本轮就多出 `monsters:1`）。
   守卫是操作后断言 `input:checked` 的**数量**，而不是只断言最终文案。

### 8.2 一个真 bug：`library:list` 拿不到活跃库

- **现象**：切到「项目 A」后库条仍显示「初始库」，但数据其实是项目 A 的；再选「初始库」毫无反应。
- **根因**：切换库 → 主进程广播 `library:changed` → `App.tsx` **整页 `location.reload()`**（组件状态全丢）。
  重挂载后 `LibraryBar` 只能拿 `library:list` 的**条目数组**，于是退化成「取 `list[0]`」。
  而 `list[0]` 恒为初始库（注册表按创建顺序存），且 `handleSwitch` 里 `name === active` 会把
  「切回初始库」判成无变化 ⇒ 用户被卡在「显示 A、数据是 B」的状态里。
- **修法**：契约层 `library:list` 的 `res` 由 `LibraryEntry[]` 改为 `{ libraries, active }`，
  活跃库指针**与列表同包下发**；渲染层不再猜。顺带在 `run()` 的失败分支补一次 `refresh()`，
  让乐观更新的下拉不会停在一个「并不活跃」的库上（否则同样会踩 `name === active` 的死角）。
- **影响面**：`library:list` 全仓只有 `LibraryBar` 一个消费方（已 grep 取证），故改 `res` 形状风险为零；
  `preload` / `shared/service/api.ts` 走 `IpcContract` 泛型，无需改动。

### 8.3 取消能力（`cancelled` 成为第四种 stopReason）

改前：`wallClockMs` 只在**轮次之间**检查，单次 LLM 调用一挂住，循环就永远出不来（用户看到永久转圈）。

设计要点（**一层都不能省**，缺任何一层功能都是空壳）：

| 层            | 改动                                                                                                                 | 为什么必须                                                                        |
| ------------ | ------------------------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------------------- |
| `shared`     | `BrainLlmRequest.signal?: AbortSignal`；`BrainStopReason` 增 `'cancelled'`；`RunBrainLoopOptions.signal`                     | 决策层要能表达「这是取消」，否则只能报 `transport_error` 把用户主动停止显示成故障                          |
| `shared`     | 循环内**内部 controller**（外部 signal 只转发）+ 墙钟定时器 abort 在途请求                                                              | 一个 controller 同时服务取消与墙钟；改动前墙钟打不穿在途调用                                              |
| 传输层         | 两个 transport 都 `fetch(…, { signal })`，且 `catch` 里 `if (isAbortError(error)) throw error`（不包装成「本地未启动」）               | 包装后循环分不清「取消」与「真失败」，会丢掉已产出的部分结果                                              |
| IPC 四层       | `agent:cancel`（`schemasData` → `ipc.ts` → `api.ts` → `preload`），主进程 `activeRuns: Map<runId, AbortController>` + `activeBySender` | 取消是**主进程**的能力：渲染层只能发意图。`runId` 可选，缺省按 sender 找当前运行（兼容不传 runId 的调用方）           |
| 渲染层         | `digital-stop`（仅 `running` 时出现）；`submitText` 生成本轮 `runId`                                                          | 没有入口的能力等于没有                                                                 |

循环里有**两道**取消闸，各自的产物不同：

1. **轮次开始前**：`stopReason='cancelled'` 后 `break`（一次 LLM 都不再调）。
2. **工具批开跑前**：为每个 `tool_call` 补一条 `[STOP]` tool 消息再 `break`。
   ⚠️ 与工具上限闸同理 —— `assistant.tool_calls` 与 tool 结果必须一一对应，否则后续会话续跑直接协议错。

`cancelled` 与三道计数闸同款：`completed: true` + `terminated` 事件 + 取已产出的部分结果，
**不是** `error` 事件、**不是** reject。

### 8.4 验证

| 闸门                                  | 结果                                                                              |
| ----------------------------------- | ------------------------------------------------------------------------------- |
| `tsc -p tsconfig.node.json`         | 0                                                                               |
| `tsc -p tsconfig.web.json`          | 0                                                                               |
| `eslint .`                          | 0（过程中修掉一处 `no-useless-assignment`：`wallClockTripped` 初值无用，声明移进循环体）           |
| `vitest run tests/unit tests/integration` | **2024 passed / 5 skipped**（132 文件），较上轮 +6                                       |
| `npm run build`                     | 成功                                                                              |
| 整包 e2e                              | **73 passed / 2 skipped / 0 failed**（75 例）                                      |

新增测试（都打**行为差异**，不是打文案）：

- 单测 6 条（`agentBrain.test.ts`）：`isAbortError` 两种真实形态 · 进循环前已取消（0 次 LLM 调用）·
  在途取消报 `cancelled` 而非 `transport_error` · 回包后未跑工具时补 `[STOP]` 且 tool 消息一一对应 ·
  **墙钟打断在途调用**（改前这条会永久挂住，是真正钉住修复点的那条）· 正常完成不受 signal 影响。
- e2e 1 条（`agent-digital-panel.spec.ts`）：桩延迟 **5s**、断言限时 **4s** —— 只有真 abort 才可能通过；
  同时断言状态落「已完成」而非「出错」、停止按钮随运行结束收起。

## 9. 第四轮：继续排雷（「发现了就解决」）

取消能力落地后按同一思路继续找「看着实现了、实际有洞」的地方，又挖出三个，全部是**没有测试就会一直静默**的那种。

### 9.1 取消打不断「等待用户答复」（用户可感知）

- **现象**：`等待确认` 状态下点「停止」，什么都不会发生——面板要卡到交互超时（`DEFAULT_INTERACTION_TIMEOUT_MS` = **120 秒**）之后才收尾。
- **根因**：`controller.signal` 只能 abort `fetch`。危险确认与提问走的是 `requestApproval` / `requestInteraction` 返回的 **promise**，不经过 fetch，也就没有任何人监听 abort。循环仍 block 在那条 promise 上，下一轮开头的取消闸根本没机会执行。
- **修法**：让答复也参与竞速 —— `withAnswerTimeout` 从「超时兜底」升级为「超时 **或** 取消兜底」，abort 时立即按「未答复」回落（**不做隐式放行**，危险操作按未批准处理）。
  另外把工具批的 `for…of` 改成带下标循环：批内被取消时，**为剩余 `tool_call` 逐个补 `[STOP]` tool 消息**，否则 `assistant.tool_calls ⟷ tool` 不对应（同工具上限闸的协议约束）。
- **测试**：3 条单测（等确认中取消 / 等回答中取消 / 批量中取消后协议仍合法）+ 1 条 e2e（面板上点停止，4s 内收到 `terminated`）。

### 9.2 `pumpLines` 提前退出不断流（云端继续计费）

`onLine` 抛错时（如上游返回 `error` 字段）`finally` 只做了 `releaseLock()`：锁摘了，**连接还在**，服务端会继续把剩下的 SSE 推完 —— 我们早已不要这段输出，但云端仍在生成、仍在计费。
改为退出时 `await reader.cancel()`（已读完是 no-op；已 errored 的流会 reject，吞掉），再释放锁。新增 `tests/unit/agentStream.test.ts` 10 例把行泵契约钉住（尾行不丢 / 跨 chunk 拼行 / CRLF 容忍 / 多字节切分 / **异常时 cancel 底层流** / HTTP 错误归一等）。

### 9.3 云端请求没有超时 —— `LLM_REQUEST_TIMEOUT_MS` 是死代码

这是 `maxAllowedRisk` 的**同型缺陷**（本项目已出现三次）：常量写得很像策略，但全仓零引用。

- `llmConfigData.ts` 说「超时后主进程抛中文『请求超时』错误，UI 直接展示」「这里给云端 fetch 挂 AbortController」——**那个 AbortController 从来没写过**。`fetch` 默认无限等待，服务端不回包时单发 AI（章节生成 / 数据生成 / 审校）永久转圈，用户只能重启应用。
- 修的时候没有直接把 30s 套上去：生成请求是 `stream: false`，等的是**完整生成**（默认 `maxTokens = 1000`，慢档上游 10 tok/s 就要 100 秒），套 30s 会把**正常但不快**的生成误判成超时。故按用途拆两个上限：
  - `LLM_REQUEST_TIMEOUT_MS = 30_000` → 轻量探活（`GET /models` 连接测试），快失败才有用；
  - `LLM_GENERATE_TIMEOUT_MS = 180_000` → 单次生成，失败兜底而非性能目标。
- 超时与「连不上」**分开报**：前者「请求超时（N 秒未返回）：已中断，请重试」，后者仍是「无法连接」。`AbortSignal.timeout()` 抛的是 `TimeoutError` 而不是 `AbortError`，判定要分别写。
- **测试**：`llmClient.test.ts` 新增 4 例 —— signal 真的挂上去了（信号缺失时数值写多少都没用）、超时文案、连接失败文案、探活用另一个上限。

### 9.4 顺手挖到的测试地基问题：套件会「丢文件」而摘要仍说 passed

起因是收尾时全量 vitest 偶发 1 条失败。原以为是 flaky 用例，连跑几轮后发现**用例总数在 1936–2046 之间漂**——不是哪条用例不稳，而是**有的测试文件整份没跑、还不计入统计**。

- **根因**：vitest 默认 `isolate: true` ⇒ 每个测试文件起一个进程（本仓 **134 个**）。本机有实时防护（火绒），进程创建被逐个扫描，启动握手超过 vitest 硬编码的 `START_TIMEOUT = 6e4`（**无配置项**），报 `Failed to start forks worker … Timeout waiting for worker to respond`，该文件从此消失。
- **实测对照**（同一台机器、同一份代码）：

  | 配置 | 结果 |
  | --- | --- |
  | 默认（每文件一进程） | 连跑 8 轮 **7 轮丢文件**：1936–2046 漂移、`Errors 9`、wall 最高 81s |
  | `--maxWorkers=6`（仍隔离） | 3 轮仍 1 轮丢文件（wall 81s）⇒ **只降并发不够** |
  | **`isolate:false` + `maxWorkers:4`** | **6/6 全量 2046、exit 0、wall 7–8s** |
  | `isolate:false` + `maxWorkers:1`（最坏共享） | 2/2 全量 2046、wall 21s ⇒ 关隔离未引入状态泄漏 |

- **修法**：`vitest.config.ts` 改 `isolate: false` + `maxWorkers: 4`（目标是**少进程**，不是满并发），并把结论写进注释。排查顺序依赖问题时 `npm test -- --isolate` 可临时恢复隔离。
- **更重要的教训**：这个失败**退出码非 0**（CI 能兜住），但终端摘要照样打印「N passed」——**只看 `tail` 就会把它当成全绿**。核对口径是括号里的总数：`Test Files … (134)` / `Tests … (2046)`，数字少了就是丢文件。本次我自己就被骗过一次。

### 9.5 验证与遗留

`tsc` node+web 0 / `eslint` 0 / `vitest` **2041 passed·5 skipped（2046）**，`isolate:false` 下连跑 6 轮全部满额（+17 例）。

遗留（明确不做，理由是收益不足或有产品判断成分）：

- 单发 AI 只有超时兜底，**没有「停止」按钮**。要做需把 `agent:cancel` 的取消表下沉成通用「任务取消注册表」并为三处面板加入口，属独立特性。
- 本地 Ollama 的单发路径仍不受超时约束（沿用 `llmConfigData` 的既定说明：由 SDK 自理）。




