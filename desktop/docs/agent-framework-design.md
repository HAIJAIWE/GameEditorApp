# 智能体框架重写设计（E59 起）

> **状态**：v1.0 草案（**已重写**，取代 v0.1~v0.4），待主理人裁决。
> **动因**：E42 裁决「`core/agent` 域停止 1:1 迁移，改为框架重写」——方向定了，架构未定。
>
> **修订记录（四次纠错，全部记录在案）**
> - **v0.1 → v0.2**：我把它当成「从零设计一个 2026 最新 agent 框架」，去外部找资料、写了与本项目无关的
>   NPC `agent_os` 对照，**而完全没有先读本项目已有的 4 份 agent 设计文档**。读完后真相是：
>   **不是"要设计"，而是"已收官过一次，现在要判断要不要按约束调整"**。
> - **v0.2 → v0.3**：主理人指示「去看最新智能体框架的**项目**，到 GitHub 那边看看」。于是直接抓了
>   6 个成熟框架的 GitHub 仓库，新增 §3.5、重做 §6、新增 DD-15/DD-16。
> - **v0.3 → v0.4**：主理人指出「**优先云端，然后本地**」。⇒ v0.3 把「本地 4B/4K」当成全局硬约束是**反的**，
>   那些**只对本地档成立**。v0.4 把骨架改为**双档**，重写 §2/§4/§5/§7/§9/§12，每条 DD 标适用档位。
> - **v0.4 → v0.5**：主理人问「**这个框架有什么不足？我们主要是搞游戏策划书和数据的**」。
>   ⇒ 前四节全是**通用 agent 设计**，我从没把它落到本域上。v0.5 新增 **§5.5 域内审视**：
>   取证发现**策划书/数据的 AI 能力 100% 绕过 agent 层**（`window.mbApi.ceshu` 53 处 / `data` 42 处全直连，
>   `agent` 仅 1 处且只服务对话面），而**域内 7,114 行确定性 rubric 已在生产里跑着却没接进产出路径**。
>   新增 DD-17~DD-21、修订 DD-9 与路线图 M4。
> - **v0.5 → v0.6**（本次会话）：把 DD-19 从"仅策划书半边"补完**数据半边**——新增 `evaluateDataCandidates`
>   （复用 `dataCountConstraint::findCountConstraint`/`exceedsCountConstraint` 数量约束 + `dataStats::assessBalance` 平衡性），
>   接进 `ceshu:aiGenerateData` 响应的 `quality` 字段，并在 `AiDataGenPanel` 渲染质量门结论块
>   （`datagen-quality`，数量约束 `is-count` / 平衡性 `is-balance` 分色）。DD-19 至此**策划书 + 数据两个面都过确定性门**。
>   ⇒ 这同时是 M5 成本护栏的前置——有了数据侧门才能按"生成后是否违反数量约束/平衡性"判定值不值得导入。
>   ⚠️ **本次会话遇到文档静默回退**：工作树 `agent-framework-design.md` 被回退成 v0.3 坏快照
>   （HEAD `337d8bc` 才是 v0.5 真值），已按铁律备份 `/tmp` 并从 HEAD 还原后再做增量。
> - **v0.6 → v0.7**（本次会话）：落地 **M5 成本护栏（DD-5b 护栏级）**。新增 `shared/agent/budget.ts`
>   （`taskBudget`/`estimateTaskTokens`/`estimateTokens`/`evaluateBudget` 纯函数，按任务分档预算：chapter 4000 / full 章数×3000 / datagen 条数×2000 / review 8000）；
>   先补 token 用量观测地基——`main/llm/client.ts` 的 `generate()` 真正从 OpenAI `usage` 与 Ollama `prompt_eval_count`/`eval_count` 取 `usage`，`LlmUsage` 类型因分层约束（shared 禁 import main）移到 `shared/llmConfig.ts`；
>   `protocol.ts::llmConfirmReason` 复用 DD-17 确认门入口，当 `isCloud && taskType && estimatedTokens` 时算预算与 `evaluateBudget`，`over` 即前置二次确认"预计花费约 X token（预算 Y），建议拆分任务"；
>   渲染层在 `AiDataGenPanel`/`AiFullGeneratePanel` 渲染 token 花费块（`datagen-cost`/`ai-full-cost` + `.budget-bar` 分色 free/ok/warn/over）。
>   ⚠️ **仅护栏级**：预算条 + 超限前二次确认**已落地**；DD-5b 的"超预算真降级（收缩可见工具→缩短上下文）"**未做**，留待后续（需结合 DD-3 工具面与 DD-8 上下文管理）。本地 Ollama 视为 free、不拦截。
>   ⇒ 运行期举证 `preview/verify-e59.mjs` **22/22**（新增 T6 数据花费块 / T7 整篇累计花费块）；vitest **1825 passed**；`npm run build` 通过。
> - **v0.7 → v0.8**（本次会话）：把 DD-19 当初**待 M5 接**的"**导入前二次确认**"真正落地——完成 M5 的原本意图（用数据侧质量门的"是否违反约束"判定作为导入前置）。`AiDataGenPanel` 的 `handleImport` 在质量门 `quality.hasIssues` 为真且未确认时，进入内联二次确认态（沿用 DD-17 范式、不自造弹窗）：提示"质量门检出 N 处问题（如：…），仍要导入勾选的 M 条？"+ `仍要导入`/`取消` 两按钮；点确认才真正写数据表，强化"AI 只产候选、人工审批后才写入"的硬约束。生成新候选时重置该态。
>   ⚠️ **范围判定**：仅以 `hasIssues`（数量约束超限或离散度偏高）为触发条件，不对"常规无问题"的生成拦路；balance 属建议项，同样纳入确认而非静默放行。LLM judge 权重已在 **v1.0** 接（见 §5.5.8，章节侧辅助维度，不覆盖确定性门）。
>   ⇒ 运行期举证 `preview/verify-e59.mjs` **28/28**（新增 **T8**：生成后未点导入不出现确认态 / 点导入出现 `datagen-import-confirm` / 取消消失 / 仍要导入后门消失）；vitest **1825 passed**；`npm run build` 通过。
> - **v0.8 → v0.9**（本次会话）：落地 **M6 保密模式（DD-0b）**。核心是把"数据不出本机"做成**硬保证**而非软提示——`StoredLlmConfig` 新增 `confidential:boolean`；新增 `effectiveProvider()`/`isCloudProvider()`（shared 层，主/渲染共用）；`main/llm/client.ts::resolveConfig` **无视 stored.provider、保密模式强制回落 ollama**（经 `client.generate` 实际走本地 `/api/generate`，物理上不向云端发请求）；3 个 AI handler（`aiGenerateChapter`/`aiGenerateData`/`aiReview`）的 `isCloud` 改用 `isCloudProvider()`，保密模式一律 `false`（不弹"云端花费"确认、不烧钱）；`validateLlmConfig` 按 effectiveProvider 校验（保密模式下不要求云端 Key/模型）；`shared/schemas.ts::llmConfigSchema` 补 `confidential` 字段（zod 默认剥未知键，漏加会被 IPC 边界静默吞掉）；`SettingsPanel` 新增 `llm-confidential` 显式 🔒 开关 + "数据不出本机"提示，开启后服务商选择框 disabled 且 UI 一律按 ollama 渲染。
>   ⚠️ **范围判定**：本版是"整篇/整库一刀切"的全局保密档（G9 原始诉求）；DD-0b 文档里提的"章节级/字段级保密粒度"（v0.4 §2.3）**未做**，留待后续——那需要 per-call 携带 tier 而非全局 flag，属更大重构。
>   ⇒ 单测 `llmConfig.test.ts` **32 passed**（新增 DD-0b effectiveProvider/isCloudProvider/保密校验/**保密忽略云端 baseUrl** 5 例 + confidential 读写 2 例）；`npm run typecheck` 0 错 + eslint 0；`npm run build` 通过。
>   ⇒ 运行期举证 `preview/verify-e59.mjs` **38/38**（新增 **T9** 9 子项：默认关闭且无提示 / 先选云端 deepseek 出现 API Key 行 / 开保密 ⇒ 出现「数据不出本机」+ 服务商强制回落 ollama + 下拉 disabled + API Key 行消失 + **「实际生效」接口地址回落 localhost 而非云端域名** / 关保密 ⇒ 恢复原服务商）；vitest 全量 **120 文件 / 1830 用例 passed**。
> - **v0.9 → v1.0**（本次会话）：收口 **DD-19 剩余项——LLM judge 权重接入**（章节侧）。设计定型：**确定性门为主、LLM judge 为辅**，judge 只补机器判不了的维度（毒性 / 可读性 / 创意），权重远低于确定性门——`toxicity==='flagged'` 也**不推翻** `blocking`/`scoreDelta`，只往 `summary` 追加合规提示。分层上 judge 的 LLM 调用放 `main` 层（`main/agent/qualityJudge.ts::runLlmJudge`，复用正文同源 `callOpts` ⇒ 自动走 `effectiveProvider` 遵守保密、任何失败 try/catch 降级返回 `null` 不阻断主生成），纯合并逻辑 `applyJudge` 放 `shared/agent/qualityGate.ts`（可单测、不 import main）；`QualityGateVerdict` 新增 `judge:LlmJudgeVerdict|null` 字段，确定性 `evaluateChapterDraft` 产出的 verdict 此字段为 `null`，异步算完再由 `applyJudge` 合并。`aiGenerateChapter` 在确定性门之后 `await runLlmJudge` 并用 `applyJudge` 合并；渲染层 `AiFullGeneratePanel` 收集每章 `quality.judge`，进度行加 per-chapter 徽标（`safe`/`flagged` 分色）+ 底部聚合块（合规风险高亮 + 可读性/创意均值 + 未评审计数）。**数据侧不叠 judge**（已由确定性平衡门覆盖，避免过度 + 无谓成本）。
>   ⚠️ **范围判定**：judge 仅在章节侧接入；单章 `CeshuView` 路径只用 `result.fields` 回填表单、章节 `quality` 本就未渲染（与确定性门同现状，不单独为 judge 加展示，避免过度 + 不一致）；judge 的失败/降级一律静默返回 `null`，永不阻断或拖垮正文生成；保密模式下 judge 经 `effectiveProvider` 强制本地 Ollama，物理不触云端。
>   ⇒ 运行期举证 `preview/verify-e59.mjs` 维持 **38/38**；单测 `agentQualityGate.test.ts` 新增 `applyJudge` 5 例（确定性 verdict 默认 `judge:null` / `null` 降级原样返回 / `safe` 不改动 summary / `flagged` 追加合规提示且不改 `blocking`/`scoreDelta` / 纯函数不改动入参）；vitest 全量 **120 文件 / 1882 用例 passed**（原 1877 + 5）；`npm run typecheck` 0 错（node+web）+ eslint 0 + `npm run build` 通过。
>
> **证据强度标注**（全文通用）：
> `[实测]` 本机/本仓跑出来的 · `[一手]` 模型厂商官方文档 · `[GitHub]` 直接抓成熟框架仓库所得 · `[二手]` 第三方文章/实测（附出处）· `[推断]` 我的推理，未直接验证

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

## 2. 产品前提：**云端主力，本地兜底**（主理人裁定）

> ⚠️ **v0.3 的根本前提错误**：本文前两版把「本地单机 Ollama / 8GB / 4B / 4K 上下文」当成**全局硬约束**，
> 并据此把 `num_ctx`、模型档位、工具面收敛全做成"命门"。主理人裁定 **「优先云端、然后本地」** ——
> 那个前提**只对本地档成立**。v0.4 全线重做。

### 2.1 代码现状（实测）：云端**已经真实现**，但默认值是本地优先

| 事实 | 证据 | 含义 |
|---|---|---|
| **6 家服务商全部真通** | `main/llm/client.ts`：Ollama 走原生 `/api/generate`（`ollama` SDK）；`openai`/`doubao`/`qwen`/`deepseek` 走 OpenAI 兼容 `POST {baseUrl}/chat/completions`；`claude` 走 `x-api-key` + `anthropic-version` + content 数组 | **云端优先不需要新建传输层**，只需改默认与加策略 |
| 但**下拉顺序本地优先** | `shared/llmConfig.ts:109-116` `LLM_PROVIDER_ORDER = ['ollama','openai','doubao','qwen','claude','deepseek']` | 该顺序是**对齐 Python `api_config.py:35 MODEL_PRESETS` 的声明顺序**（迁移保真），**不是产品决策** |
| **未配置时静默回落本地** | `client.ts:43-44`「当前生效的服务商（未配置时回落 ollama）」 | 云端优先下这是**错的默认** |
| 错误提示写死本地 | `client.ts:144` `请先执行 ollama pull（如 ollama pull qwen3:8b）` | 云端优先下这是**误导性文案** |
| 项目里**没有任何**「云端优先」的既定记录 | `grep -rn "云端\|远程\|云优先" desktop/docs/ docs/ README.md CHANGELOG.md` → 仅 4 条命中且全属别的语境（E22 生图 / E2E 未实跑云端 / desc 生成偏差 / 「无远程网页」） | 本地优先是**迁移保真的副产品**，需按产品意志纠正 |

### 2.2 两条档位，两套约束（这才是本设计的正确骨架）

| 维度 | **云端档（主力）** | **本地档（兜底 / 保密）** |
|---|---|---|
| 上下文 | **不是瓶颈**（前沿模型 200K 级） | **4K 硬约束** `[实测]` 全仓未设 `num_ctx` ⇒ 吃 Ollama 默认 4096；8GB 卡第 7 轮即半句截断 `[二手]` |
| **第一性约束** | **token 花费**（Anthropic：token 用量单独解释 **80%** 性能方差 `[二手]`） | **延迟与显存** |
| 模型能力 | 前沿模型可用 | 4B→8B 是天花板；**≤4B 工具调用不建议生产、7–8B 是黄金区间** `[二手]` |
| 多 agent / sub-agent | **重新可行**（Anthropic 官方 lead+subagent 独立上下文比单 agent **+90.2%** `[二手]`） | **不可行**（4B 实测三条，见 §4） |
| 评估器独立上下文 | **更值得做**（可真开独立调用，Outcomes 报 docx **+8.4%** / pptx **+10.1%** `[二手]`） | 成本高、收益可疑 |
| 提示词 ≤30 行 | 从**硬闸降为优化项**（云端能吃长提示词；但 Anthropic 2026 仍主张「删 80% 提示词反而更强」`[一手]`） | **硬闸**（4B 提示词冗长税，见 §4） |
| 工具 ≤8 个 | 放宽（但「工具设计是首要失败模式」`[一手]` 仍成立） | **硬闸**（4B「多工具只挑第一个」） |
| 步数预算 | **更重要**（步数 = 钱） | 重要（步数 = 上下文命门） |
| **不可替代的价值** | 能力上限 | **① 保密 ② 离线可用 ③ 零成本** |

### 2.3 由此得到的产品判断（v0.4 新增，最重要的一条）

**本地档不是「性能不足的降级备份」，它是「保密档」。**
本项目处理的是**未发布的游戏设计稿**（世界观、剧情、数值、系统设计）——
把这类内容上传云端，对不少独立开发者是**不可接受**的。
⇒ 产品上应有一个**显式的「保密模式 / 离线模式」开关**（走本地档、不联网、不上传），
而不是让"本地"仅作为"云端没配好时的静默回落"。

### 2.4 另一条被低估的事实（与档位无关）

`[实测]` **35 个技能**（`CAPABILITIES.md`，2026-06-21），而 `identity.md` 里已写
「**闲聊时绝不调用工具**」——**工具调用难用这件事早被感知到，只是没解决**。这一条**两档都成立**。

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

## 4. 两条档位的差异化约束

### 4.1 本地档：4B 小模型会推翻 2026 主流的三条 `[二手]`

> ⚠️ **适用范围**：以下三条**只约束本地档**。v0.3 曾把它们当成全局约束，是我的错。

1. **提示词冗长税**：60 行 agent 定义 ⇒ 4B **完全不用工具**、纯表面模仿「研究形状」的答案；砍到 8 行 ⇒ 工具调用回来。阈值 ≈ **30 行**。
2. **软路由失效**：写「需要外部信息就委派给 researcher 子 agent」被 Qwen/Gemma **完全无视**（自己硬扛并死循环）；显式指定 agent 才行。⇒ **agent 选择归人，不归模型**。
3. **数字硬上限 > 提示词条款**：150+ 次 `Invalid Tool` 死循环时，提示词写「错两次就停」**无效**；「最多 6 次调用」**有效**。机理：模型无法自省重试，**但能数数**。

**对照我们的蓝图，本地档上的必然失效点** `[推断，基于上述实测]`：

| 蓝图设计 | 在本地档 4B 上的问题 | 对应实测 |
|---|---|---|
| **5 Agent + 工具集隔离** | 4B 无法在 35 个工具里挑对（"多工具只挑第一个"） | 3 |
| **并行竞标 `parallel_bidding`** | 多 agent 协调税 + 小模型 sub-agent 表现差 | 2 |
| **辩论共识 `debate_consensus`** | 需要长时程多轮论证，4B 上下文撑不住 | 上下文 4K |
| **16~35 个激活技能** | 描述超 2–3 行就"读不完"漏参数 | 3 |
| **`_sliding_window_compress`** | Anthropic 2026：**context reset 优于 compact**，且 compact 导致「goal drift：约束静默消失」 | 一手 |
| **详细 SOUL prompt** | 提示词冗长税 | 1 |

### 4.2 云端档：完全不同的三条（**不是本地那套**）

| 约束 | 依据 | 设计含义 |
|---|---|---|
| **成本是第一约束**（步数 = 钱） | Anthropic：token 用量单独解释 **80%** 性能方差 `[二手]` | **步数预算从"优化项"升为"核心机制"**（§3.5① smolagents 的「少 30% 步数」在这档是**直接省钱**）；需要**按任务分档的 token 预算 + 超预算降级**（如降级为只读工具、缩短上下文） |
| **多 agent / sub-agent 重新可行** | Anthropic 内部研究系统 lead + 并行 subagent（各自独立 context window）比单 agent 基线 **+90.2%** `[二手]`；2026 共识的 orchestrator-workers / critic-refiner 模式 `[一手]` | v0.3 里被我 ⛔ 的「并行 / sub-agent / 评估器」在**云端档应重新评估为候选**，DD-13 需按档位分列 |
| **提示词长度的方向相反** | Anthropic 2026 对新模型**删掉 80% 系统提示词后基准无下降** `[一手]` | 云端档也别堆长提示词——**但理由是"新模型有判断力、旧规则是过时的 casts"，不是"小模型读不完"** ⇒ 同一条优化，**两条不同理由**，实现上可共用一套（短提示词 + 工具描述纪律） |

> **两条档位的交集（一次实现，两档受益）**：工具设计纪律（少而精 / 前缀 / 高信号 / 错误信息要引导）`[一手]`、
> 步数预算、观测先行、审批闸 + 沙箱边界、Skills 渐进披露、MCP schema 纪律。
> ⇒ **这些是本设计的主干**；分档的只是「提示词长度」「工具数量上限」「是否允许多 agent」三处。

---

## 5. 差距分析（按档位分列）

| 缺口 | 档位 | 严重度 | 依据 |
|---|---|---|---|
| **G0 默认档位错**：下拉本地优先 + 未配置静默回落 ollama + 错误提示写死 `ollama pull` | **两档** | 🔴 **最高** | §2.1 `[实测]`；与主理人「云端优先」裁定直接冲突 |
| **G1 本地档上下文只有 4K，未显式设 `num_ctx`** | 本地 | 🔴 高 | `[实测]` 零配置 ⇒ 4096；8GB 卡第 7 轮截断 |
| **G2 工具面 35 个**（协议层 12 槽位 / 实现 5 个） | **两档**（本地尤甚） | 🔴 高 | 4B「多工具只挑第一个」；`identity.md` 已写「闲聊时绝不调用工具」= 症状已现 |
| **G3 无逐轮成本/延迟观测** | **两档**（云端尤甚） | 🔴 高 | `[实测]` operationLog 无 token/延迟；`[二手]` token 解释 80% 方差 |
| **G4 终止只有 `MAX_ITERATIONS=5`，无 maxToolCalls / wallClock** | **两档**（云端＝成本护栏，本地＝命门） | 🟠 中高 | `[二手]` 计数式硬闸才有效 |
| **G5 缺 token 预算与超预算降级** | **云端** | 🟠 中高 | v0.4 新增：步数＝钱，需分档预算 + 降级策略 |
| **G6 压缩策略可能选错**（compact vs context reset） | **两档** | 🟡 中 | `[二手]` Anthropic 2026：reset 优于 compact；compact 导致 goal drift |
| **G7 `CAPABILITIES.md` 35 条扁平清单，非渐进披露** | **两档** | 🟡 中 | `[二手]` Skills 最佳实践：SKILL.md 枢纽 + 渐进披露 |
| **G8 评估器是否真在独立上下文未核** | **两档**（云端收益更大） | 🟡 中 | `[二手]` Outcomes 增益的核心正是上下文隔离 |
| **G9 无「保密模式」**：用户无法显式选择"数据不出本机" | 本地 | 🟠 中高 | §2.3 `[推断]`：未发布设计稿上传云端对不少独立开发者不可接受 |
| **G10 本地档模型档位偏低**（4B） | 本地 | 🟠 中高 | `[二手]` ≤4B 工具调用不建议生产；7–8B 黄金区间 |

**不需要动的**（已验证到位，且**与档位无关**）：审批闸与风险分级、事件流 reducer、会话/记忆落盘、
QuickJS 沙箱（**已整体替换掉可绕的黑名单**，且 smolagents README 亦证其 `LocalPythonExecutor` 同样不是安全边界）、
SOUL 硬边界、turn limit、MCP、`shared/` 分层契约、**6 家服务商的真实传输实现**、
**以及域内那 7,114 行确定性纯逻辑**（`validateCeshu` / `scoreCeshu` / `assessBalance` / `dataCountConstraint` / `dataRef` / `ceshuFieldDeps` —— 见 §5.5，它们不是"缺口"，是**没被用起来的现成资产**）。

---

## 5.5 域内审视：这套框架在「游戏策划书 + 数据」上的不足（v0.5 新增）

> 前五节都是**通用 agent 设计**。但本项目的产品是**游戏策划书 + 游戏数据**，
> 不是通用助手。这一节补上此前四版都缺的那一半：**把设计落到域上，逐条找不足。**

### 5.5.1 取证：能力通路与 rubric 源的真实分布 `[实测]`

| 事实 | 证据 |
|---|---|
| 渲染层 `window.mbApi.ceshu`（策划书） | **53 处** —— 全部**直连** |
| 渲染层 `window.mbApi.data`（数据） | **42 处** —— 全部**直连** |
| 渲染层 `window.mbApi.agent` | **仅 1 处**（`DigitalPanel.tsx:125` 取 `ChatApi`，即**对话面**） |
| 策划书 AI 能力的 IPC | `ceshu:aiGenerateChapter` / `ceshu:aiGenerateData` / `ceshu:aiReview` 三个，**均无风险分级、无审批闸** |
| 域内**确定性 rubric 源**（现成、纯函数、已上线） | `validateCeshu`（`ceshuValidation.ts` 178 行）· `scoreCeshu` + `countWordsInChapter` + `gradeLabel`（`ceshuScorer.ts` 515 行）· `ceshu:checklist` / `ceshu:wordStats` / `ceshu:score` / `ceshu:validate` 四个纯函数门 · `assessBalance`（`dataStats.ts` 150 行，阈值 0.3）· P5 数量约束（`dataCountConstraint.ts` 111 行）· `@data[...]` 引用解析（`dataRef.ts` 219 行）· 系统依赖图（`ceshuFieldDeps.ts` 680 行） |
| 域结构**天然可契约** | `CHAPTER_KEYS`（基础 9 章 + `INDUSTRIAL_CHAPTER_KEYS = slice(9)`）· `typeSchema.ts` 类型 schema · `ceshuPresets.ts` 280 行 + `ceshuTemplates.ts` 239 行（**域内已有的方法论**） |
| 策划书侧纯逻辑总量 | `ceshu*.ts` + 三个 data 模块 = **7,114 行** |

### 5.5.2 八条不足

**① 【最严重·结构性】agent 与「创作面」是两条不相通的通路**

- **现象**：策划书与数据的 AI 能力（`ceshu` 53 处 + `data` 42 处）**全部直连**，不进 `main/agent/dispatcher`、不进 `protocol.ts` 的技能注册、**不进 `approvalBroker` 审批闸**。agent 通路只服务数字员工面板的**对话面**。
- **后果**：`TOOL_RISK_MAP` 风险分级、`approvalBroker`、`operationLog` 审计——**对真正会改数据的 AI 能力全部不生效**。也就是说：**最危险的操作（整章重写 `aiGenerateChapter`、批量生成数据 `aiGenerateData`）恰恰是唯一没有防护的**；而风险较低的对话面反而全套防护。
- **这不是 bug，是 A1 的既定选择**：`a-tier-plan.md` A1-5 落地记录写明 `system.ceshu` 的 `delete`/`export`/`import` **未移植**，理由是"UI 已有完整入口，再经 Agent 暴露会与既有交互重复且更难确认"。
- **优化方向**：**不必把创作面全塞进 agent**（那个理由是对的），但**必须共用同一套风险分级与审批闸**——把 `ceshu:ai*` 三个 handler 纳入 `TOOL_RISK_MAP`，写操作（`saveChapter` / 生成后落盘）走一次确认。**成本极低、收益极高**。

**② agent 缺「域词汇」与「域契约」，产出无法验证**

- **现象**：术语表 `glossaryTerms.ts` 143 条**只用于字段 ID 生成**（`fieldId.ts`），策划书/数据生成时**不注入**；`CHAPTER_KEYS` 章节结构、`typeSchema.ts` 类型 schema 也没作为常驻 context。
- **后果**：模型不知道这个项目有哪些类型（职业/技能/装备/怪物…）、策划书有哪些章节、字段命名约定 ⇒ 产出看起来通顺但**不符合本项目的结构**。
- **优化方向**：把 DD-16 的 Context Provider **具体化**——常驻注入「当前库的类型 schema + 章节结构 + 143 条术语表 + 当前系统开关」。这也是**最好的 grounding 语料**：项目自己的数据就是权威知识源，比任何 RAG 都准。

**③ 产出是「自由文本」而不是「可校验结构」，于是只能靠 LLM 自评**

- **现象**：策划书有 `validateCeshu` / `scoreCeshu` / 字数 / 完整度等**确定性检查**，数据有数量约束与平衡性判定；但 agent 的产出路径（`brain.ts` → LLM → 文本）**没有强制跑这些门**。
- **后果**：**无法用机器判定"这次生成是好是坏"** ⇒ v0.4 的评估器（DD-9）只能退化成 LLM 自评——而 Anthropic 的证据恰恰说自评不可靠（self-preference bias，官方为此专门做了独立上下文的 Outcomes）。
- **优化方向（v0.5 的第一优先）**：**产出契约 + 确定性评分门**。agent 生成策划书/数据后**必须**依次跑 `validateCeshu` → `scoreCeshu` → `dataCountConstraint` / `assessBalance`，把结果作为评估器的**第一道**；LLM judge 只补"文字质量 / 创意 / 是否有毒"这类机器判不了的维度。
  **这正好复刻 Anthropic 的原话逻辑**："code 有自动化测试就能提供客观验证"——**本项目的策划书质量同样有自动化检查**。

**④ 策划书 ⇄ 数据 的双向依赖，在 agent 层没有表达**

- **现象**：策划书的 `enabled_systems` 决定该建哪些数据表（`ceshu:confirmSystems` → `ceshu:syncData` → `dataSync.ensureTypeSchema`）；反过来数据表的引用被策划书 `@data[...]` 引用（`dataRef.ts`）。**存在双向依赖环**。
- **后果**：agent 做单侧任务时可能**破坏另一侧**——改了类型名，策划书里的 `@data[...]` 引用失效；改了系统开关，对应数据表该增未增。这是最容易造成**静默数据损坏**的一类 bug。
- **优化方向**：把**跨域一致性检查做成 agent 的一等工具**。而且这正是 DD-15「复合工具」的最佳用例：「重命名类型 → 全库引用同步」应该是**一个工具**，而不是让模型自己串联 5 次调用（后者在 4B 上必然出错，在云端上也不可靠）。

**⑤ 35 个技能清单 ≠ 域能力清单**

- **现象**：`CAPABILITIES.md` 的 35 条是**Python 时代的能力盘点**，其中大量在 TS 侧根本不存在（`system.shell` / `system.tts` / `system.speech_input` / `system.browser` / `tool.web_fetch`…）。
- **优化方向**：M2/M3 收敛工具面时**按域重组**，而不是按 Python 技能表逐条删。面向本项目只有三个真实场景：**策划书创作 / 数据编辑 / 系统设计**。

**⑥ 数据侧 agent 只会 CRUD，浪费了本域最大的价值**

- **现象**：`gameDataSkill.ts` 316 行是 list/query/create/update/delete；但本域真正难的是**平衡性**（`assessBalance` 阈值 0.3）、**数量约束**（P5）、**引用完整性**（`dataRef`）、**跨表一致性**（680 行依赖图）。
- **优化方向**：数据侧 agent 的差异化价值应是「**跨表分析 + 平衡性建议 + 引用修复**」，而不是 CRUD。CRUD 交给表单就够。

**⑦ 策划书整篇都是未发布内容 ⇒ 保密模式的粒度要重设计**

- v0.4 已提"保密模式"（G9/DD-0b/M6）。但**域内更极端**：策划书整篇是未发布的世界观/剧情/数值，而数据表里是**已定版**的数值。
- **优化方向**：保密粒度应能到**章节级 / 字段级**（如"只把 `vision` 章节发云端做润色，数值一律不出本机"），而非整篇一刀切。

**⑧ 评估器这一条我 v0.4 问错了问题**

- v0.4 写的是"核实 `auto_evaluator.py` 是否独立上下文"——那是 **Python 侧**的事，TS 侧根本没这个文件。
- **真问题是**：TS 侧已经有 4 个纯函数门（`validate` / `score` / `wordStats` / `checklist`）+ 2 个数据侧门（`assessBalance` / `dataCountConstraint`）⇒ **评估器应以确定性检查为主、LLM judge 为辅**，而不是反过来。

### 5.5.3 对设计的修正（v0.5 新增/修订）

| # | 问题 | 证据 | 决策 | 处置 | 档位 | 复盘条件 |
|---|---|---|---|---|---|---|
| **DD-17** ⭐**✅ 已实现** | `ceshu:ai*` 纳入确认门 | §5.5.2① | 判定抽成纯函数 `shared/agent/protocol.ts::llmConfirmReason` / `isBulkLlmCall`（**判定与文案同源**）；两个 AI schema 加 `confirmed` 可选标志；`main/ipc.ts` 在调 LLM 前拦；渲染层用**内联两按钮确认态**（`AiFullGeneratePanel` / `AiDataGenPanel`，沿用 `ClearAllPanel` 范式，不自造弹窗） | 新增 | **两档** | 保密模式（M6）落地后，可再加"本地档禁止出境"语义 |
| **DD-18** | 缺域词汇/域契约 | §5.5.2② | **域 context provider**：常驻注入「类型 schema + `CHAPTER_KEYS` + 143 条术语表 + 当前系统开关」——这是本项目 grounding 的第一手段 | 新增（具体化 DD-16） | 两档 | — |
| **DD-19** ⭐**✅ 已实现（v1.0 收口）** | 产出无法机器验证 | §5.5.2③⑧ | **策划书半边**（`evaluateChapterDraft`，已接 `aiGenerateChapter.quality`）；**数据半边**（v0.6 补完）：`evaluateDataCandidates` 复用 `dataCountConstraint`（数量约束，硬）+ `dataStats::assessBalance`（离散度，建议），接进 `ceshu:aiGenerateData.quality`，并在 `AiDataGenPanel` 渲染结论块（`is-count`/`is-balance` 分色）。**两个面都过确定性门**。**导入前二次确认已在 v0.8 接**（质量门 `hasIssues` ⇒ 导入前内联二次确认）。**LLM judge 权重已在 v1.0 接**（章节侧 `applyJudge` + `runLlmJudge`，辅助维度，不覆盖确定性门；见 §5.5.8） | 新增 | **两档** | M5 成本护栏依赖本门的"是否违反约束"判定 |
| **DD-20** | 策划书⇄数据双向依赖无表达 | §5.5.2④⑥ | **跨域一致性工具**作为一等工具（重命名类型→全库引用同步、删系统→停用数据表、字段改名→迁移引用…）；同时是 DD-15 复合工具的最佳用例 | 新增 | 两档 | — |
| **DD-21** | 35 个技能清单 ≠ 域能力清单 | §5.5.2⑤ | 工具面**按三个真实场景重组**（策划书创作 / 数据编辑 / 系统设计），替代按 Python 技能表删减 | 新增 | 两档 | — |
| **修订 DD-9** | 评估器问错了问题 | §5.5.2⑧ | 先核实的不再是 Python 的 `auto_evaluator.py`（TS 侧没这文件），而是**「确定性门是否已接进产出路径」** | 修订 | 两档 | — |
| **修订 §9** | 路线图优先级 | — | M4 从"核实评估器上下文"改为 **"接确定性评分门 + 产出契约"**（DD-19），优先级上调到 M2 之后 | 修订 | — | — |

> **一句话总结这一节**：v0.1~v0.4 把这个项目当成"一个要加固的通用 agent 框架"，
> 但**真正的缺口不在 agent 机制本身，而在于「创作面绕过了防护」与「域内现成的确定性检查没被用起来」**。
> 前者是安全/一致性问题（①④），后者是**投入产出比最高的机会**（③⑨——7,114 行现成 rubric 已经在生产里跑着了）。

### 5.5.4 实现记录（E60）：DD-17 + DD-19 已落地

| 项 | 落地 |
|---|---|
| `shared/agent/protocol.ts` | 新增 `LLM_BULK_COUNT_THRESHOLD`（10）、`LlmCallScope`、`isBulkLlmCall`、`llmConfirmReason`（判定与文案同源） |
| `shared/schemas.ts` | `ceshuAiGenerateInputSchema` / `ceshuDataGenInputSchema` 各加 `confirmed: z.boolean().optional()`（**刻意不用 `default`**——契约类型取 `z.infer`（输出类型），用 `default` 会逼 3 个既有调用点补传） |
| `shared/agent/qualityGate.ts` | 新增（DD-19）：`evaluateChapterDraft` + `QualityGateVerdict`（策划书半边）；`evaluateDataCandidates` + `DataQualityVerdict` + `DataQualityIssue` + `DataBalanceRow`（数据半边，v0.6） |
| `shared/ceshuAi.ts` | `CeshuAiGenerateResult` 加可选 `quality?: QualityGateVerdict \| null` |
| `shared/ceshuDataGen.ts` | `CeshuDataGenResult` 加可选 `quality?: DataQualityVerdict \| null`（v0.6） |
| `main/ipc.ts` | 两个 AI handler 在调 LLM 前走确认门；`aiGenerateChapter` 返回 `quality`（策划书门）；`aiGenerateData` 返回 `quality`（数据门，v0.6，复用 `dataService.listAllItems` 取现有条数合并算数量约束） |
| `AiFullGeneratePanel.tsx` | 内联确认态（`ai-full-confirm` / `-yes` / `-no`），确认后带 `confirmed: true` |
| `AiDataGenPanel.tsx` | 同上（`datagen-confirm` / `-yes` / `-no`，仅当 `count > 10`）；v0.6 新增质量门结论块渲染（`datagen-quality`，`is-count`/`is-balance` 分色） |
| `styles.css` | `.datagen-quality` / `.datagen-quality-title` / `.datagen-quality-issues` / `.is-count` / `.is-balance`（v0.6） |
| 单测 | `agentProtocol.test.ts` +7（25 例）、新增 `agentQualityGate.test.ts` **19 例**（策划书 9 + 数据 10） |
| **运行期举证** | `preview/verify-e59.mjs` **15/15**（新增 T5：数据质量门 UI 渲染 `datagen-quality` 出现且 `is-balance` 落位）；回归 verify-e51 41/41 · e57 46/46 · e58 14/14 · docsLedger 8/8 全绿 |

### 5.5.5 实现记录（v0.7）：M5 成本护栏（DD-5b 护栏级）

| 项 | 落地 |
|---|---|
| `shared/agent/budget.ts` | 新增（M5 核心）：`LlmTaskType`（`chapter`/`full`/`datagen`/`review`）；`taskBudget`（chapter 4000 / full `章数×3000` / datagen `条数×2000` / review 8000）；`estimateTaskTokens`（经验值，口径略宽于预算：3500 / `×3200` / `×1800` / 7500）；`estimateTokens(text)=⌈len/2⌉`（主进程按提示词长度粗估）；`evaluateBudget`（ratio>1→over / >0.8→warn / 非云端→free） |
| `shared/llmConfig.ts` | 新增 `LlmUsage` 接口（从 `main/llm/client.ts` 移入——分层约束 `shared` 禁 import `main`，否则 TS6307） |
| `src/main/llm/client.ts` | `generate()` 真正取用量：OpenAI 兼容分支解析 `usage.{prompt_tokens,completion_tokens,total_tokens}`；Ollama 分支取 `prompt_eval_count`/`eval_count`；返回加 `usage?: LlmUsage`（两分支都只在有值时返回） |
| `shared/agent/protocol.ts` | `LlmCallScope` 加 `taskType?`/`estimatedTokens?`/`isCloud?`；`llmConfirmReason` 在 bulk/count 判定之后，当 `isCloud && taskType && estimatedTokens!=null` 时算 `taskBudget`+`evaluateBudget`，`over` 即返回"预计花费约 X token（预算 Y），建议拆分任务…"——**复用 DD-17 确认门入口，不新造机制** |
| `main/ipc.ts` | `ceshu:aiGenerateChapter` / `ceshu:aiGenerateData` / `ceshu:aiReview` 三处：调 LLM 前算 `isCloud`（provider≠ollama）、`estimated=estimateTokens(system+prompt)`，连同 `taskType`（`full?'full':'chapter'` / `'datagen'` / `'review'`）传入 `llmConfirmReason`；解构 `usage` 随结果返回 `usage: usage ?? null`；`aiGenerateData` 把 `buildDataGenPrompt` 提到门之前 |
| `shared/ceshuAi.ts` / `shared/ceshuDataGen.ts` | `CeshuAiGenerateResult` / `CeshuDataGenResult` / `CeshuAiReviewResult`（extends）均加 `usage?: LlmUsage \| null`；`shared/schemas.ts` 的 `ceshuGetInputSchema` 加 `confirmed: z.boolean().optional()`；`shared/ipc.ts` 契约 `ceshu:aiReview` req 加 `confirmed?` |
| `AiDataGenPanel.tsx` | 生成后渲染 `datagen-cost`（`datagen-cost` testid）："本次花费 {usage.totalTokens} token（预算 {budget}）"+ `.budget-bar`/`.budget-bar-fill.level-{status.level}`（width=min(100,ratio*100)%）；仅当 `result?.usage && total>0` |
| `AiFullGeneratePanel.tsx` | 累加 `usageAcc += response.usage?.totalTokens ?? 0`；生成后渲染 `ai-full-cost`：同预算条，预算取自 `taskBudget('full',{chapters:plan.order.length})` |
| `styles.css` | `.datagen-cost`/`.datagen-cost-label`/`.budget-bar`/`.budget-bar-fill`/`.budget-bar-fill.level-free/ok/warn/over`（色走 `--accent/--success/--warning/--danger`） |
| 单测 | 新增 `tests/unit/agentBudget.test.ts` **11 例**（预算线性缩放 / estimateTokens / 本地=free / ok·warn·over 阈值 / 零预算安全）；`agentProtocol.test.ts` 的 `llmConfirmReason` 覆盖云端超限分支 |
| **运行期举证** | `preview/verify-e59.mjs` **22/22**（新增 **T6** 数据花费块出现「本次花费 900 token（预算 10000）」+ 预算条渲染；**T7** 整篇生成后累计花费块「本次花费 21600 token（预算 54000）」）；回归 verify-e51 41/41 · e57 46/46 · e58 14/14 同前；vitest **1825 passed**（原 1804→1814→1825）；`npm run build` 通过 |

> **M5 范围判定（避免过度）**：本次只做「护栏级」——**预算条 + 超限前二次确认**。DD-5b 原话的"超预算真降级（收缩可见工具→缩短上下文→明确告知已降级）"**未实现**，理由：① 真降级要动 DD-3 工具面与 DD-8 上下文管理，二者尚未落地；② 当前"提示拆分 + 显式确认"已是有效护栏，不会静默烧钱，符合 G5 核心诉求。本地 Ollama 视为 free、全程不拦。

### 5.5.6 实现记录（v0.8）：DD-19「导入前二次确认」落地（完成 M5 原本意图）

| 项 | 落地 |
|---|---|
| `AiDataGenPanel.tsx` | 新增 `importConfirming` 态；`handleImport` 在 `quality?.hasIssues && !importConfirming` 时进入内联二次确认（沿用 DD-17 范式、不自造弹窗），显式列出问题数与首条问题文案 + `仍要导入`/`取消`；确认后才逐条 `data.createItem` 写入；生成新候选时 `setImportConfirming(false)` 重置 |
| 触发条件 | `DataQualityVerdict.hasIssues`（数量约束超限 `count_limit` 或离散度偏高 `balance` 任一）⇒ 不对"常规无问题"的生成拦路；这是 DD-19 设计里"AI 只产候选、人工审批后才写入"硬约束的落地 |
| 运行期举证 | `preview/verify-e59.mjs` **28/28**（新增 **T8** 6 子项：未点导入不出现确认态 / 点导入出现 `datagen-import-confirm` / 文案带出"仍要导入"与"处问题" / 取消消失 / 仍要导入后门消失）；vitest **1825 passed**；`npm run build` 通过 |

> **范围判定**：仅以 `hasIssues` 触发，不额外拦路；LLM judge 权重已在 **v1.0** 收口（见 §5.5.8，DD-19 原 note 的剩余项）。

### 5.5.7 实现记录（v0.9）：M6 保密模式（DD-0b）落地

| 项 | 落地 |
|---|---|
| `shared/llmConfig.ts` | `StoredLlmConfig` 增 `confidential:boolean`；`DEFAULT_LLM_CONFIG.confidential=false`；`loadLlmConfig`/`sanitizeLlmConfig` 均读夹该字段；**新增 `effectiveProvider()`（保密 ⇒ 强制 `'ollama'`）与 `isCloudProvider()`（保密 ⇒ 恒 `false`）**；`validateLlmConfig` 改按 `effectiveProvider` 校验（保密时不要求云端 Key/模型）；**`resolveLlmBaseUrl` 保密时忽略 `stored.baseUrl`**（见下行 bug 修复） |
| ⚠️ **同批发现并修的 bug** | 只强制 `provider` 不够：用户若此前选过云端，`stored.baseUrl` 里存的是 `https://api.deepseek.com/v1`，沿用会让 **`new Ollama({host:'api.deepseek.com'})` 去连云端域名**（既报错又违背"数据不出本机"），且设置面板「实际生效」会显示云端地址。⇒ 保密模式下 `resolveLlmBaseUrl` 与 `client.ts::resolveConfig` **一律忽略 `stored.baseUrl`**，回落 `MB_OLLAMA_HOST` / Ollama 预设。**这是截图举证抓出来的，纯读代码想不到** |
| `main/llm/client.ts` | `resolveConfig` **无视 `stored.provider`**，保密模式经 `effectiveProvider` 强制 `'ollama'` ⇒ `generate()` 走 Ollama 原生 `/api/generate`，**物理上不向任何云端发请求**（这是"数据不出本机"的硬保证，不是 UI 文案） |
| `main/ipc.ts` | 3 个 AI handler（`ceshu:aiGenerateChapter`/`aiGenerateData`/`aiReview`）的 `isCloud` 改 `isCloudProvider(callOpts.config ?? DEFAULT_LLM_CONFIG)` ⇒ 保密模式不弹"云端花费"确认、不烧钱 |
| `shared/schemas.ts` | `llmConfigSchema` 补 `confidential: z.boolean()`。⚠️ zod object 默认**剥未知键**，漏加会被 IPC 边界静默吞掉（开关看着生效、实际主进程收不到） |
| `SettingsPanel.tsx` | 新增 `llm-confidential` 显式 🔒 开关 + `llm-confidential-notice`「已开启保密模式：所有 AI 调用强制走本地 Ollama」；开启后 `llm-provider` select **disabled** 且 UI 一律按 `effectiveProvider(llm)` 渲染（`llmPreset`、Claude 不兼容提示都改用 effective） |
| 测试 | `llmConfig.test.ts` **32 passed**（新增 effectiveProvider/isCloudProvider/保密校验 4 例 + confidential 读写 2 例 + **保密忽略云端 baseUrl 回归 1 例**，白名单键断言 6 ⇒ 7）；`npm run typecheck` 0 错；eslint 0；运行期 `preview/verify-e59.mjs` **38/38**（新增 T9 9 子项）；vitest 全量 **120 文件 / 1830 用例** |

> **范围判定**：本版是**全局一刀切**保密档（G9 原始诉求）。文档 §2.3 提的**章节级/字段级保密粒度**（"只把 `vision` 章节发云端润色、数值不出本机"）**未做** —— 那需要 per-call 携带 tier 而非全局 flag，属更大重构，留待后续。

### 5.5.8 实现记录（v1.0）：DD-19 剩余项——LLM judge 权重接入（章节侧）

| 项 | 落地 |
|---|---|
| `shared/agent/qualityGate.ts` | `QualityGateVerdict` 增 `judge: LlmJudgeVerdict \| null`（确定性 `evaluateChapterDraft` 产出时恒为 `null`）；新增 `LlmJudgeVerdict` 接口（`toxicity: 'safe'\|'flagged'` / `readability` 0-10 / `creativity` 0-10 / `score` 0-100 / `comment`）+ 纯函数 `applyJudge(verdict, judge)`：judge 为 `null` ⇒ 原样返回；`toxicity==='flagged'` ⇒ 只往 `summary` 追加合规提示、**不改** `blocking`/`scoreDelta`；纯函数不就地修改入参（已单测锁死） |
| `main/agent/qualityJudge.ts`（新增） | `runLlmJudge(callOpts, chapter, fields)`：`new LlmClient().generate(JUDGE_SYSTEM, 评审prompt, callOpts)` 取 judge。**复用正文同源 `callOpts` ⇒ `resolveConfig→effectiveProvider` 自动把保密模式的 judge 也强制本地 Ollama，物理不触云端**。整体 `try/catch`，任何失败（未配置/网络/解析）一律返回 `null`（降级，绝不阻断正文生成）；`normalizeJudge` 对 LLM 原始 JSON 做容错（毒性字段不可信即降级为 `null`，数字夹取 0-10/0-100） |
| `main/ipc.ts::ceshu:aiGenerateChapter` | 确定性门算完（`evaluateChapterDraft`）后，`await runLlmJudge(callOpts, chapter, fields)` 再 `applyJudge(deterministic, judge)` 合并进返回 `quality`；judge 失败不影响 `fields`/`usage` 返回 |
| `renderer/AiFullGeneratePanel.tsx` | 收集每章 `response.quality?.judge`，进度行加 per-chapter 徽标（`ai-full-judge-badge safe/flagged` 分色，显示「合规 / ⚠合规风险 + score 分」）；底部聚合块 `ai-full-judge`（合规风险高亮列章节名 + 可读性/创意均值 + 已评审 N/总 章，含「未获评审」计数）；`styles.css` 补 `.ai-full-judge*` 样式 |
| 设计取舍 | **judge 只在章节侧接入**；数据侧已由确定性平衡门覆盖，**不叠 judge**（避免过度 + 无谓 token 成本）；单章 `CeshuView` 路径只用 `result.fields` 回填表单、章节 `quality` 本就未渲染（与确定性门同现状，不为 judge 单独加展示，避免不一致）；judge 失败/降级一律静默 `null`，永不阻断或拖垮正文生成 |
| 测试 | `agentQualityGate.test.ts` 新增 `applyJudge` 5 例（确定性 verdict 默认 `judge:null` / `null` 降级原样返回 / `safe` 不改动 summary / `flagged` 追加合规提示且不改 `blocking`/`scoreDelta` / 纯函数不改动入参）；vitest 全量 **120 文件 / 1882 用例 passed**（原 1877 + 5）；`npm run typecheck` 0 错（node+web）+ eslint 0 + `npm run build` 通过 |

> **范围判定**：judge 是**辅助**维度，权重远低于确定性门；`toxicity` 命中只追加提示、把"是否发布"的最终裁决权留在人手里，不自动拦截。保密模式下的 judge 经 `effectiveProvider` 强制本地，无需额外判断；若本地无模型致调用失败，被 `runLlmJudge` 降级为 `null`。

---

## 6. 选型：不引入 agent 框架（结论不变，依据更硬）

| 候选 | 判定 | 理由 |
|---|---|---|
| **Claude Agent SDK** | 否决 | 每轮 **~35,000 input tokens**（其余框架 1,288–1,432 的 **25 倍**）、8.5s、299MB，**不支持换模型厂商** `[二手]` ⇒ 与"云端可换模型 + 本地可换模型"的双档设计直接冲突 |
| **LangGraph(.js)** | 否决 | 最成熟的状态图/checkpoint/HITL，但为**服务端编排**设计、Python 为主；且 `sessionStore` + `operationLog` 已覆盖其核心诉求 |
| **Mastra** | 否决 | TS 生态最大，suspend/resume 与 Observational Memory 值得读；**但双许可证**（`ee/` 是 Enterprise source-available 非开源）+ 自带 Studio + 为部署成服务设计 ⇒ 进程内客户端收益面窄 |
| **Deep Agents（Python）** | 否决 | 建在 LangGraph 上，**需 6 个 peer deps** 才能装 |
| **Deep Agents JS（`deepagentsjs`）** | **否决** | **有官方 TS 版 + `deepagents/browser` 入口**（我 v0.2 漏了这项）⇒ 但：① 6 个 peer deps 仍要装；② **4 件套我们已自备 3.5 件**（`todo_skill`、`workspace/` 文件系统、TaskTicket），唯一缺的「大结果落盘 + 路径引用」= **DD-7，自写约 200 行**；③ 它的 `task` sub-agent **在本地档不可用**（§4.1 实测 2）⇒ **引它只为省 200 行，不值** |
| **smolagents** | 否决（**但必读**） | 不可（Python）；**本项目最有价值的一份参照**：agent 逻辑只写 **~1,000 行**，且给出「CodeAgent 比工具调用字典**少 30% 步数**」的硬数据（§3.5①） |
| **Letta** | 否决（**长期参照**） | 形态最接近（桌面 app + 本地 server + TS SDK），但它是**完整记忆服务器产品**；我们只需借它「agent 是 **stateful 系统**而非无状态循环」这一理念——这条路我们 `.workspace/` 已在走 |
| **Vercel AI SDK 7** | 备选 | 最轻（15 包/53MB）、provider-agnostic。但"你拥有这个 loop"——状态仍在自己手里，**不省事，只多一层** |
| **自建薄 harness** | **采纳** | Anthropic 一手即持此立场：**「Framework abstraction is an anti-pattern」**。引 vs 自建的判据（借 smolagents 原话）：**只有当框架替你省掉一段非平凡的一致性维护（system prompt / parser / execution 三处格式）时才引**——而本项目需要的 4 件套已自备 3.5 件 |

> **两条要改的口径**：
> ① `[纠正 v0.1]` 本项目**已有"预演资产"**——`a-tier-plan.md §2.4` 记载 **QuickJS WASM 沙箱已在 A1-5 落地并整体替换 Python 黑名单**。所以不是"从零自建"，而是**在已收官的 A1 上定向加固**。
> ② `[纠正 v0.3]` 原先"框架注入开销在 **4K 预算**下是实质成本"这条论证**只对本地档成立**；云端档的真实理由是**成本与可控性**（能精确约束每轮花多少、能随时换模型），这与框架抽象成本是**两笔不同的账**。

---

## 7. 目标架构（在已有资产上加固，不重建）

```
┌─ 渲染层 ────────────────────────────────────────────────┐
│  数字员工面板 · 任务卡 · 进度可见化 · 审批对话框 · 成本行   │ ← agentic laziness 的解药
│  档位选择器（☁ 云端 / 🔒 保密模式）· token 预算条         │ ← v0.4 新增
└───────────────▲────────────────────────────────────────┘
                │ 事件流（reduceBrainEvent，纯 reducer ✅已有）
┌───────────────┴────────────────────────────────────────┐
│ shared/agent/  protocol ✅ · brain ✅ · session ✅ · panel ✅│  ← 分层契约：保留原样不改名
│                 ⬆ 新增：budget.ts（成本/闸门/观测）        │     (shared-layering-design §2.1)
│                 ⬆ 新增：tier.ts（档位路由 + 降级策略）      │
└───────────────▲────────────────────────────────────────┘
┌───────────────┴────────────────────────────────────────┐
│ main/agent/  brainService · dispatcher · llm/client ✅     │
│               approvalBroker ✅ · operationLog ✅           │
│   ┌── Harness 加固（净新增 ~500–700 行）──────────────┐   │
│   │ 选档位 → 拼提示词(按档位预算) → 调模型 → 审批闸      │   │
│   │ → 执行 → 大结果落盘 → 计数闸 + token 预算闸          │   │
│   │ → 超预算则降级(只读工具/缩上下文) → 回灌 → 产出      │   │
│   └───────────────────────────────────────────────────┘   │
│   skills/  system.game_data ✅ · system.ceshu ✅ · system.code ✅(QuickJS) │
│            ask_user ❌(A1-4 遗留) · rollback ✅            │
└───────────────▲────────────────────────────────────────┘
┌───────────────┴────────────────────────────────────────┐
│ llm/client.ts ✅ 已支持 6 家（实测，见 §2.1）               │
│                                                              │
│  ☁ 云端主力（默认）：openai / doubao / qwen / claude / deepseek│
│      · OpenAI 兼容 → POST {baseUrl}/chat/completions         │
│      · Claude      → x-api-key + anthropic-version           │
│  🔒 本地兜底 / 保密：ollama → 原生 /api/generate（ollama SDK） │
│                                                              │
│  ⬆ 需改（G0）：默认档位——当前下拉 ollama 第一 + 未配置回落   │
│  ⬆ 需改（G1，仅本地档）：num_ctx——当前吃默认 4096           │
└──────────────────────────────────────────────────────────────┘

工作区（✅ 已有，方向正确，强化而非重写）：
data/libraries/<库>/.workspace/
  identity.md    SOUL 5 要素硬边界（✅ 已有，短提示词的载体）
  persona.md     小墨人格（✅）
  memory/MEMORY.md  长期记忆/用户偏好（✅ 活着）
  memory/capabilities/CAPABILITIES.md  ⚠️ 35 条扁平清单 → 改渐进披露（G7）
  memory/LEARNINGS.jsonl  反思经验（✅）
  ⬆ v0.4：保密模式下此处即「数据不出本机」的物理边界
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

格式：**问题 → 证据 → 决策 → 处置（复用/重做/不做）→ 适用档位 → 复盘条件**

| # | 问题 | 证据 | 决策 | 处置 | 档位 | 复盘条件 |
|---|---|---|---|---|---|---|
| **DD-0** | **默认档位** | G0 + 主理人裁定 | **默认走云端**（首次配置引导选服务商 + Key）；**未配置时不再静默回落 ollama**，而是**提示去设置**并**提供一键「启用保密模式」**（走本地） | 重做（`LLM_PROVIDER_ORDER` 顺序 + `resolveConfig` 回落策略 + `client.ts:144` 硬编码文案） | **两档** | 无（这是产品意志） |
| **DD-0b** ⭐**✅ 已实现（v0.9）** | **保密模式** | G9 `[推断]` | 新增**显式档位**：🔒 保密模式 = 强制本地 + 明确告知"数据不出本机"；与云端档在 UI 上**并列**而非隐藏在设置深处 | ✅ 已实现（`confidential` flag + `effectiveProvider()` 强制 ollama + `SettingsPanel` `llm-confidential` 开关；章节级/字段级粒度**未做**，见 §2.3） | 本地 | 章节级/字段级粒度（需 per-call tier） |
| **DD-1** | 上下文预算 | G1 | **仅本地档**：传输层显式下发 `num_ctx`（默认 16384，可调）。云端档不适用 | 重做（传输层字段） | **本地** | 无 |
| **DD-2** | 本地档模型 | G10 | **仅本地档**：默认提到 **`qwen3:8b`**（`llmConfig.ts:68` 已有预置，5.2GB 装得下 8GB 卡），保留 4B 为低配回退；设置里显式警告"溢出到系统 RAM 会大幅变慢"。**云端档不涉及** | 配置 | **本地** | 无 |
| **DD-3** | 工具面 | G2 | **协议层 12 个 `system.*` 槽位改为按场景分组**：本地档每次会话暴露 **≤8 个**；云端档可放宽到 **≤15 个**（上限更高但仍分组懒加载，不一次性注入） | 重做（`protocol.ts` 分组 + `CAPABILITIES.md` 改渐进披露） | **两档（上限不同）** | 云端实测工具挑选准确率显著优于本地档时可再放宽 |
| **DD-4** | 路由归谁 | 4.1 实测 2 | **本地档**：技能由**用户显式选定**，不做模型软路由。**云端档**：**可试模型软路由**（前沿模型有能力做），但**必须保留显式选择作为兜底与可解释性手段** | 重做（面板 + 路由前置 + 按档位开关） | **两档（策略不同）** | 云端实测软路由成功率 ≥90% 则默认开 |
| **DD-5** | 终止 | G4 + 4.1 实测 3 | 三道计数硬闸 `maxToolCalls`(8) / `maxTurns`(6) / `wallClockMs`(120s)，任一触发即**带部分产出 finalize**；**提示词里不写"出错就停"**。云端档的 `maxTurns` 可放宽（步数不再受上下文限制，但受成本限制 ⇒ 见 DD-5b） | 新增（`budget.ts`） | **两档（阈值不同）** | 无 |
| **DD-5b** ⭐**✅ 已实现（护栏级）** | **成本护栏** | G5 `[二手]` token 解释 80% 方差 | **仅云端档**：每任务 **token 预算**（按任务分档：快问快答 / 批量生成 / 整章重写）；**超预算降级**（收缩可见工具 → 缩短上下文 → 明确告知"已降级"）而非静默烧钱 | 新增（`budget.ts`：预算条 + 超限前二次确认；**真降级待补**） | **云端** | 真降级（DD-3/DD-8）落地后复盘 |
| **DD-6** | 提示词预算 | 4.1 实测 1 + 一手 | **两档都做，但理由不同**：本地档是**硬闸**（4B 读不完长提示词，≤30 行，构建期断言）；云端档是**优化项**（新模型有判断力、旧规则是过时的 casts ⇒ 同样砍到 ≤30 行，但按"精"而非"短"）。**实现共用一套断言** | 新增断言（两档同源） | **两档（本地=硬闸 / 云端=优化）** | 云端实测长提示词无质量损失则云端档放宽 |
| **DD-7** | 大结果 | 2.1 just-in-time | 工具返回 >2KB 落盘到 `<库>/.workspace/agent/run/<runId>/`，上下文只留**相对路径 + 摘要 + 行数**，可按路径取回 | 新增 | **两档** | 无 |
| **DD-8** | 压缩策略 | G6 | 从 `_sliding_window_compress`（Py 侧）改为 **context reset**：到达阈值时**带结构化交接摘要开新轮**（约束显式重述，防 goal drift）。**云端档因上下文宽裕，可只在超长任务时触发** | 新增（替代压缩） | **两档（阈值不同）** | 无 |
| **DD-9** | 评估器 | G8 + `[二手]` Outcomes | 先**核实** `auto_evaluator.py` 是否独立上下文；若否，改为独立调用。**云端档更值得开**（可真开独立调用，Outcomes 报 +8.4%/+10.1%）；本地档成本高、默认关 | 核实 + 可能重做 | **两档（默认不同）** | 用户反馈"AI 结果需反复手修"则**云端档默认开** |
| **DD-10** | 观测 | G3 + `[二手]` token 解释 80% 方差 | 复用 `operationLog`，**每轮追加**：档位、模型、输入/输出 token、耗时、工具调用序列、各闸计数、审批决定；面板加"本次消耗/预算/已用轮次"一行 | 新增（扩展已有 store） | **两档** | 无 |
| **DD-11** | 审批闸 | A1-4/A1-5 已验证 | **完全复用**（`approvalBroker` + `TOOL_RISK_MAP` + 拒绝路径断言沙箱未执行）；不新造。Deep Agents 的安全立场亦为"边界设在工具层" | **复用** | **两档** | 无 |
| **DD-12** | 沙箱 | `a-tier-plan §2.4` 已落地 | **完全复用** QuickJS WASM（零宿主能力 + CPU 超时 + 内存上限 + 参数夹取上限）；**不复刻** Python 黑名单 | **复用** | **两档** | 无 |
| **DD-13** | 多 agent | 4.1 实测 2（本地）/ 4.2（云端） | **分档**：**本地档不恢复** 5 Agent / 并行竞标 / 辩论共识 / 动态 sub-agent；**云端档把「评估器 + 只读复核 agent」列为候选**（不是 5 Agent 那种并列专家），待 M4 评估器验证后再定 | **本地=不做 / 云端=候选** | **两档（判定相反）** | 云端档实测 critic-refiner 模式有净收益则开 |
| **DD-14** | 协议 | 2.8 | 工具层按 MCP 的 schema 纪律（统一命名、清晰描述、声明式权限）；**不做 A2A** | 复用已有 `mcp.py` 思路 | **两档** | 要接外部 agent 时 |
| **DD-15** | 步数预算 | `[GitHub]` smolagents：**CodeAgent 比「工具调用字典」少 30% 步数** | **每个动作允许串联多个工具调用**；对高频组合**提供复合工具**（如 `batchUpdateItems`）。**两档都重要但理由不同**：本地档=上下文命门；**云端档=直接省钱** | 新增（协议层"批量动作"语义 + 复合工具） | **两档** | 无 |
| **DD-16** | 上下文注入 | `[GitHub]` atomic-agents 的 Context Providers | 用同一机制实现 DD-3/DD-4：把「本次会话可见的工具（按档位限量）+ 相关记忆片段 + 数据概览」做成**运行时注入的 context provider**，不静态拼进提示词 | 新增（对齐已验证范式） | **两档** | 无 |

---

## 9. 路线图 M0–M6（每期独立可交付，**都只是"加固"**）

| 期 | 目标 | 档位 | 出口（可验收） | 规模 |
|---|---|---|---|---|
| **M0 档位纠正** ⭐ | 修 **G0**（最高优先） | 两档 | 默认走云端；未配置**不再静默回落 ollama**而是引导配置 + 提供「一键启用保密模式」；`client.ts:144` 硬编码 `ollama pull` 文案按档位分别给出正确指引 | ~150 行 |
| **M0.5 本地档上下文与终止** | 修 G1 + G4 | 本地 | `num_ctx` 可配且有默认 16384；三道计数闸生效；触发后带部分产出 finalize 并诚实显示 | ~200 行 |
| **M1 观测先行** | 修 G3 | 两档 | 每轮有档位/模型/token/延迟/成本行；面板可见"已用轮次/上限"；**先有数据再调提示词** | ~150 行 |
| **M2 提示词瘦身** | 修 G7 + DD-6 | 两档 | `identity.md` ≤30 行断言转绿；`CAPABILITIES.md` 改渐进披露；单测跑 8 类典型请求，工具调用成功率 ≥80% | ~300 行 |
| **M2.5 步数预算** | 修 DD-15 | 两档 | 每个动作可串联多工具；补 ≥2 个高频**复合工具**；单跑同一任务**步数下降 ≥20%** | ~200 行 |
| **M3 工具面与路由** | 修 G2 + DD-3/4 | 两档 | 协议层分组、按档位限量（本地 ≤8 / 云端 ≤15）；本地=用户显式选技能、云端=软路由可选且保留显式兜底；成功率 ≥80% | ~250 行 |
| **M4 确定性评分门 + 产出契约** ⭐ | 修 G8 + **DD-19** | 两档 | agent 产出必须过 `validateCeshu`→`scoreCeshu`→`dataCountConstraint`/`assessBalance`；LLM judge 只补机器判不了的维度且权重远低于确定性门 | ~250 行 |
| **M5 成本护栏** ⭐ | 修 G5 | 云端 | token 预算按任务分档 + 预算条 + 超限前二次确认（**护栏级；真降级待补**）；面板显示预算条 | ✅ 已落地（v0.7，~200 行 + 单测 11 例） |
| **M6 保密模式** ✅**已完成（v0.9）** | 修 G9 | 本地 | 显式 🔒 开关 + "数据不出本机"告知 + 强制本地校验；与云端档在 UI 并列 | ~120 行 |

**建议先做 M0**：它把**产品意志（云端优先）落到代码**，是本轮唯一的**语义修正**而非能力增强；
且它是纯配置/文案/引导改动，零风险、无回归面。
M1 必须紧随其后——**没有成本数据，后面所有调优都是盲调**。
M0.5 只影响本地档，可与 M0 并行。

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
| **不恢复 5 Agent / 并行竞标 / 辩论共识 / 动态 sub-agent** | DD-13；**仅本地档**成立（4B 实测 + 协调税）。云端档只把「评估器 + 只读复核 agent」列为候选，**不是 5 Agent 那种并列专家** |
| **不做模型软路由** | DD-4；**仅本地档**成立（4B 实测失效）。云端档可试，但**必须保留用户显式选择作为兜底** |
| 不重写向量检索（`memory_vector` 271 + `memory_search` 231 行） | "能用就行"规模，且与"无 embedding 模型"现状匹配；DD-7 的文件检索已覆盖大部分 |
| 不做语音 / 视觉 | `speech_service.py` / `vision_capture.py` 属独立能力线 |
| 不把 `diagnostics/`（3,796 行）纳入 | 是**代码修复/自愈工具链**，与游戏设计数据编辑器是两个产品，要单独立项 |
| 不动 `shared/` 分层既有决策 | §7.1；`shared/agent/` 保留原样有 91% 测试直接 import 的取证支撑 |
| **不做 A2A**（agent 间网络协议） | DD-14；单机进程内通信用不上 |
| **不把「未发布设计稿」默认上传云端** | §2.3；保密模式必须是**显式可选档位**，不能只做"云端没配好时的回落" |

---

## 12. 需要主理人裁决的事

### 12.1 已由主理人裁定（不再讨论）

| 决策 | 裁定 | 落地位置 |
|---|---|---|
| **默认档位：云端优先、本地兜底** | ✅ 已裁定（2026-10-07） | **DD-0** / M0 / G0 —— 代码当前是本地优先，属迁移保真产物，需纠正 |
| **保密模式的定位** | ✅ 隐含裁定（本地档的真实价值） | **DD-0b** / G9 / M6 |

### 12.2 仍待裁决

| # | 决策 | 我的推荐 |
|---|---|---|
| **D1** | `LLM_PROVIDER_ORDER` 当前是**对齐 Python `MODEL_PRESETS` 声明顺序**（ollama 第一）。云端优先要改这个顺序，**属于"产品决策覆盖迁移保真"** —— 改吗？ | **改**，并在代码注释里记明「产品决策覆盖 Python 声明顺序」，避免后人误改回去 |
| **D2** | 未配置时**静默回落 ollama** 改成什么？ | **不再静默回落**。改为：弹引导（选云端服务商 / 或一键启用保密模式）。理由：静默回落会让人以为在用云端、实际数据没出去，或反之 |
| **D3** | Python `core/agent` 22,981 行的处置（§10）？ | **先不动 + 回写文档标注死代码**。删它会破坏审计基线，性价比极低。 |
| **D4** | 工具面按档位限量（DD-3）：本地 ≤8 / 云端 ≤15，这个上限对吗？ | 可先都设 **≤10** 跑一轮实测再分档；**上限本身要能用观测数据调**（M1 的产出正好用来定它） |
| **D5** | 起步范围 | **M0 + M1 先行**。M0 是语义修正（云端优先落码），M1 给数据；没有 M1 的数据，M2/M3 的调优是盲调 |

### 12.3 实现影响清单（若 D1/D2 获批，另立切片做代码）

| 文件:行 | 现状 | 要改成 |
|---|---|---|
| `shared/llmConfig.ts:109-116` | `LLM_PROVIDER_ORDER = ['ollama','openai','doubao','qwen','claude','deepseek']` | 云端在前（D1） |
| `main/llm/client.ts:43-44` | 「未配置时回落 ollama」 | 不静默回落，改引导（D2） |
| `main/llm/client.ts:144` | `请先执行 ollama pull（如 ollama pull qwen3:8b）` | 按档位给不同指引；云端档改为检查 Key/baseUrl |
| `main/agent/ollamaTransport.ts:19` | 写死默认 host | 增加**档位路由**（`tier.ts`）与 `num_ctx` 下发（仅本地档） |
| 新增 `shared/agent/tier.ts` | — | 档位定义 + 路由 + 降级策略 + 各档参数表 |
| 新增 `shared/agent/budget.ts` | — | token 预算 + 三道计数闸 + 观测写入 |

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
