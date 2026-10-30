# 项目源码 vs dsh：全项目对照

> **本篇的定位**：仓库已有两份专项对照——
> - `agent-dsh-comparison.md`：智能体内核逐机制对照（循环/工具/子智能体/技能/guard/沙箱）
> - `dsh-ui-comparison.md`：UI 逐组件改写地图（含 §1.1 源码级结构核实）
>
> **本篇补「整个项目级」的那张全景图**：不在上述两份覆盖范围内的部分（产品应用层、工具族、上下文与压缩、持久化、宿主集成、以及**我们有而 dsh 没有的东西**）。具体机制仍以另两份为准，本篇只做索引与总账。
>
> dsh 源码：`D:/GameEditorApp/deepseek-harness-master/deepseek-harness-master/packages/`（50 个分类目录 / 二级能力包 130+ 个）。
> 本项目：`desktop/src/`（`main` 128 / `renderer` 175 / `shared` 236 / `preload` 1 个 `.ts`）。

---

## 0. 一句话结论

两边的**底座很不一样**：dsh 是可插拔的**智能体 SDK（monorepo，每包可独立发布，cordis 插件运行时）**；我们是**单机 Electron 应用（自研 slot 内核 + SQLite，IPC 而非 HTTP 网关）**。

但在「**做 Intelligent 产品的必要零件**」上，重合度高得意外：循环、工具、子智能体（含 ACP）、技能、审批、沙箱、会话检索、偏差/交付卡、附件、MCP、多 LLM 后端——这些我们**都自己实现过一遍了**，而且大多走通端到端。

真正的差距有两类，且性质不同：
1. **工程深度**（dsh 做得更系统）：后台任务/jobs、定时、PTC 程序化调工具、跨平台 shell/ssh/终端、以及 compaction 的 checkpoint 与影子计价协议。
   > **2026-10-31**：上下文压缩这一项已补齐（三条 model-free 策略落地，见 §2.2），不再是最大差距；剩余的是 checkpoint/影子计价与 `/compact` 命令。
2. **产品无关性**（不该抄）：ssh、lsp、terminal、浏览器代持、机械全empowerment——我们是**游戏策划编辑器**，这些与产品无关。

而**我们有、dsh 完全没有的**，恰恰是产品本体：策划书 24 章 351 字段体系、属性/装备/公式系统、数据表编辑与版本 diff、引擎导出、图像生成——这部分占我们代码的大头，也是 dsh 无法提供答案的地方。

---

## 1. 架构层面对比

| 维度 | dsh | 本项目 |
|---|---|---|
| 形态 | monorepo，**每包自带 `package.json` 可独立发布**（`@deepseek-ai/dsh-*`） | 单体 Electron 应用，无包发布需求 |
| 插件机制 | **cordis + Typert** 运行时，slot 声明即认领 | **自研 `PluginHost` + `slotRegistry`**（single/list/keyed/chain 四类） |
| 进程间通信 | HTTP gateway / controller（`api/session-controller` 95 文件） | Electron **IPC**（18 个 `*Ipc.ts`，一域一个） |
| 持久化 | `storage/`（domain / json / sqlite 三种实现） | SQLite（`mb-editor.db`）+ 每游戏一个文件夹（`config.json` + `design/*.md` + `data/*.json`） |
| UI | `client/` 下 60+ 个 `ui-*` 包，**CSS Modules** 逐组件 | `renderer/src/components/` 10 个子包 + `plugins/` 6 个子包，全局 `styles.css` + 自有令牌 |
| 测试 | 包内 `tests/*.spec.ts(x)` | 集中 `desktop/tests/unit/`（300 文件 / 3432 例）+ `tests/e2e/`（Playwright） |
| 包的粒度 | 2–1925 文件，**无上限**（见 `dsh-ui-comparison.md` §1.1） | 拆后最大子包 15 文件（比 dsh 还细） |

> 结构性差异（每包 `package.json`、`src`/`src/client` 双层出口、CSS Modules）均为**有意不照搬**，理由见 `dsh-ui-comparison.md` §3「不抄什么」与 §5 硬约束。

---

## 2. 能力对照总账

图例：✅ 有且端到端可用 ｜ ⚠️ 有但更薄/形态不同 ｜ ❌ 无 ｜ ➖ 产品无关（不该有）

### 2.1 智能体内核

| dsh | 本项目 | 状态 |
|---|---|---|
| `core/agent-loop` (36) | `shared/agent/brain/loop.ts`（注入式传输/执行器，可纯逻辑单测） | ✅ |
| `core/agent` (15) | `main/agent/brain/brainService.ts` | ✅ |
| `core/session` (32) | `shared/agent/conversation/session.ts`（`turns.jsonl`/`events.jsonl` 只追加） | ✅ |
| `core/system-prompt` (4) | `brain/context.ts` 的 `extraBlocks` 注入（目标/首选项/历史附件/共用 Passage） | ✅ |
| `core/tools` (21) | `shared/agent/tools/toolGroups.ts`（`ceshu`/`data`/`system` 三组） | ⚠️ 规模小得多 |
| `core/tool-executor-native` | 原生工具执行（dispatcher） | ✅ |
| `core/tool-executor-ptc` (14) | — | ❌ **PTC（程序化调工具）无** |
| `subagent/*` 9 个包 (123) | `main/agent/subagent/{subagentAcp, subagentCli, subagentRemote}` + `subAgentSkill` | ⚠️ 3 后端 vs dsh 6+；`depth≤1`、`MAX_ACTIVE 8` |
| `skill/*` 5 个包 | `main/agent/skills/` 7 个（ceshu/code/gameData/rollback/askUser/sessionSearch/subAgent） | ✅ 产品化的 |
| `guard/repeat-tool-reminder` | **2026-10-31 落地** `shared/agent/guard/repeatCall.ts`：advisory（只提醒不否决）、阈值 [3,5,8] 递进、链键用**完整规范化参数**（深度 key 排序）、提醒里参数预览截断到 500 字 | ✅ |
| `guard/timeout-policy` | 墙钟闸 + 取消信号（`wallClockMs` / `controller.signal`） | ✅ |

### 2.2 上下文与压缩（2026-10-31 已补齐三条策略）

> **2026-10-31 更新**：读完 dsh `compaction` 源码后，已落地 `shared/agent/compaction/` 子包
> （`prune` / `pressure` / `pairing` / `compact`），下表按**现状**重写。仍是 **model-free**（不调 LLM）。

| dsh | 本项目 | 状态 |
|---|---|---|
| `context/*` 8 个包（file/session/time/tmux-reference、agent-instructions） | `context.ts` 简化的 context blocks | ✅ 简化版 |
| `compaction-basic`（按模型窗口推导阈值） | `pressure.ts`：`threshold = min(档位阈值, floor(模型窗口 × 0.8))`，窗口取 `MODEL_CONTEXT_WINDOWS`。常规档位数值**等于改造前**（local 6000 / cloud 30000）零回归，仅小窗口模型提前压（gpt-4 8192 → 6553） | ✅ |
| `compaction-tool-result-pruner` | `prune.ts`：保留 **head + 中段标记 + tail**，按 **Unicode 码点**切分（不劈代理对）。修正了旧实现「只截头部、丢掉尾部」——错误与结论常在结尾 | ✅ |
| `compaction/tool-pairing` | `pairing.ts`：assistant 的 `tool_calls` 开 N、tool 关 1，计数为 0 才是安全切点；尾部保留「至少 2 条，为闭合配对可多留」，**宁可不压也不制造悬空 tool_call** | ✅ |
| `compaction`（checkpoint / shadow-price / tool-pairing 完整协议） | 我们无 checkpoint 与影子计价（会话是 jsonl 追加，非可重放 surface） | ⚠️ 有意识简化 |
| `compaction-image-offload` | 历史图片按最近 4 张重发（`hydratePriorImages`），非卸载策略；图片本就不落盘 | ❌ |
| `command-compact`（`/compact` 命令） | — | ❌ |
| LLM 摘要（`summarizationModel`） | 仍用模板摘要（零额外成本、零失败面） | ➖ 暂无需求 |

### 2.3 工具族（大部分 ➖，与产品无关）

| dsh | 本项目 | 状态 |
|---|---|---|
| `fs/tool-fs` / `tool-fs-search` / `tool-str-replace-editor` | `codeSkill` 只读 + 篡改单文件 | ⚠️ 非独立工具脸 |
| `shell/tool-bash` / `tool-pwsh`（+persistent） | — | ➖ 单机应用，不给模型执行 shell |
| `terminal`(13) / `ssh`(43) / `lsp`(28) | — | ➖ 产品无关 |
| `web/*`（fetch / 三个 search 后端） | — | ➖ 无联网检索不形态 |
| `browser-use` / `computer-use` | 有 `BrowserPanel`（webview 展示） | ➖ 非代持 |
| `workflow/*`(29) / `plan` / `todo/tool-todo` / `schedule` | — | ❌ 无工作流/计划模式/待办/定时 |
| `jobs` | 子智能体看板承载；**「两击停止」已落地**（`DigitalPanel` 的 `stopArmed` 防误触 + `data-armed`，e2e 连点两次） | ⚠️ 仅缺独立 jobs 面板 |
| `goal/*`(21，含 `goal-round-driver`) | GoalBar 注入提示词 | ⚠️ 无 round driver |
| `spill/*`（溢出/卸载） | — | ❌ |

### 2.4 持久化 / 会话 / 观测

| dsh | 本项目 | 状态 |
|---|---|---|
| `storage/*`（domain/json/sqlite，24） | SQLite + 文件夹即项目 | ✅ |
| `session-query` (48) | `SessionSearchIndex`（内存 FTS5，**CJK 逐字 segment + 短语查询**） | ✅ |
| `session` (232) | session store + `turns.jsonl` + `resumeHistory` | ✅ |
| `telemetry/otel` | `shared/agent/observability/trajectory.ts` + 轨迹页 | ⚠️ 无 OpenTelemetry |
| `feedback/*`(9) | `agent:feedback` + 消息 👍/👎 → 偏好库 | ✅ |

### 2.5 交付 / 附件 / 凭据

| dsh | 本项目 | 状态 |
|---|---|---|
| `deliverables/*`(23，含 `workspace-changes`) | 交付卡 + 操作改动卡 + 正文内联可点链接 | ✅ 有意差异（源为 export 结果，非 present 事件） |
| `attachment`(28) | `main/attachments.ts` + 附件 chip/缩略图/lightbox/拖拽 | ✅ 有意差异（只给名称+路径，不内联内容） |
| `credentials`(31，含 DeepSeek 账户 OAuth) | `config/secrets`（`secretStore`/`secretMigration`/`secretNames`） | ⚠️ 仅本地密钥，无账户体系 |
| `settings`(12) | `shared/config/settings`（含主题/引导/中栏页签） | ✅ |
| `document/office-to-pdf`(10) | 导出族 `main/ceshu/export/doc/`（docx/xlsx/html/pdf/pptx/md） | ✅ 我们更全 |

### 2.6 宿主 / 集成

| dsh | 本项目 | 状态 |
|---|---|---|
| `boot/plugin-manager`(35) + `plugin-market`(24) + `hmr` | `PluginHost` + `pluginMarketPlugin` + `installedPluginStore` + 运行时加载（`factory:`/`link:`/`file:`/`registry:`） | ✅ 机制不同（自研 vs cordis） |
| `api/*`（gateway/controllers，含 `session-controller` 95） | 18 个 `*Ipc.ts` | ⚠️ 形态不同（本地 IPC vs HTTP） |
| `extensions/*`（cordis runners） | — | ➖ 不引 cordis |
| `mcp` | stdio + Streamable HTTP，id 前缀 `mcp.<server>.<tool>` | ✅ |
| `llm` | 多后端 + vision 判定（`resolveVisionSupport`，auto/on/off） | ✅ |
| `guard/*`（repeat-tool-reminder、timeout-policy） | `preExecReview` 预审 + 取消/超时 | ⚠️ 无循环卫生提示 |

---

## 3. 我们有、dsh 完全没有的（产品本体）

这部分是 dsh 给不了答案的，占我们代码大头，也是对照里最容易被忽略的一半：

| 能力 | 位置 | 说明 |
|---|---|---|
| **策划书体系** | `shared/ceshu/`（9 子包）+ `shared/ceshuSchema/`（5 子包） | 24 章 / 351 字段单源 + 守卫测试；完备度 `ceshuReadiness`、参照库 `ceshuReferenceGdd`（attribution 必带） |
| **字段/章节编辑** | `renderer/components/ceshuField/`、`ceshuType/` | ChapterForm、字段控件、RefTable、关系图、模板/类型/可见性 |
| **属性 / 装备 / 公式** | `shared/attrSystem.ts` + `shared/domain/attr/` | 属性是**伤害公式唯一真源**；含拓扑排序、实时预览、装备预览、属性图表 |
| **数据表编辑** | `renderer/components/data/`、`main/data/` | csvIO、DataTableOps、批量编辑、导入预览、**版本 diff/时间线**、关系图 |
| **引擎导出** | `main/engineExport/` | 游戏引擎产物导出 |
| **图像 / 图像生成** | `main/imageGen/`、`util/io/image*` | 生成、导入、缓存、预览、清理 |
| **大纲与提示词体系** | `shared/ceshu/prompts/` | aiSeed / bundle / clone / demo / task / systemConfirm 多套提示词，规模远超 dsh `system-prompt`(4) |
| **词条 / 术语** | `shared/ceshu/reference/` | glossaryTerms、terminology、customTemplates |
| **交付物：交接包** | `main/ceshu/export/delivery/` | README + index.json 同源派生、并行度/耦合缺口分析 |

---

## 4. dsh 有而我们没有的：要不要补？

| 项 | 判断 |
|---|---|
| **多策略上下文压缩**（工具结果剪枝、图片卸载、`/compact`） | ~~值得对标~~ **已落地**（2026-10-31，见 §2.2）：工具结果剪枝 + 按模型窗口推导阈值 + 工具配对安全切点。仍缺图片卸载与 `/compact` 命令 |
| **PTC（程序化调工具）** | 暂时不需要。我们工具面很小（本地 8/15、云端 24），批处理的收益不抵复杂度 |
| **后台任务面板 + 两击停止** | ~~可做~~ **已落地**：「两击停止」（防误触）早已在 `DigitalPanel` 实现（`stopArmed` + 3s 自动解除，e2e 覆盖）。**仅剩独立 jobs 面板**，价值不高，跳过 |
| **计划模式 / 待办 / 定时 / 工作流** | 与游戏策划编辑器无关，跳过 |
| **guard 循环卫生**（重复工具提醒、超时策略） | ~~缺~~ **已落地**（2026-10-31）：`shared/agent/guard/repeatCall.ts`，与既有 `failCount`（连续失败硬转向）互补，专管「同工具 + 同参数连续重复（哪怕次次成功）」 |
| **OpenTelemetry** | 单机应用没必要。我们已有轨迹 + 操作日志 + 交付日志三层，够用 |
| **账户 / OAuth 凭据** | 我们用本地密钥，单机场景足够 |
| **HTTP gateway / controller** | 我们是 IPC，形态不同不改。除非要远程访问（无此需求） |

---

## 5. 来源与统计口径（可复查）

- **dsh**：对 `packages/` 递归统计 `.ts/.tsx` 得 [规模分布](dsh-ui-comparison.md#11-源码级结构核实2026-10-30含一条订正)；二级能力包清单由 `find` 遍历「分类目录/子包/」得到；`ui-*` 的计数同理。
- **本项目**：`desktop/src/{main,renderer,shared,preload}` 分别计数（128/175/236/1）；分层约束详见 `desktop/src/shared/README.md`。
- 本篇所有「✅/⚠️/❌」结论均以上述实时统计 + 关键文件抽查（`context.ts:53-62`、`toolGroups.ts`、`main/agent/skills/`、`sessionSearchIndex`）为准，**未采用任何未经核对的概括**。发现过期请直接订正本篇，并在改动处标注日期与订正原因。
