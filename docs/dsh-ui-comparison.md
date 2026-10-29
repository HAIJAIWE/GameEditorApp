# dsh UI 对照：成熟做法与本项目可改造项

> **状态：活的对照文档。** 2026-10-28 初版是「只读调研 + 改造计划」；2026-10-29 更新为「已落地现状 + 逐组件改写地图」（§2 现状、§4 对照表），供后续整体重写 UI 时按图施工。
> dsh 源码：`D:/GameEditorApp/deepseek-harness-master/deepseek-harness-master/packages/client/`（`ui-*` 系列）。
> 本项目 UI：`desktop/src/renderer/src/components/digital/`（`DigitalPanel.tsx` 1062 行 + `digitalPanelViews.tsx` 553 行 + 3 个独立卡组件）与 `plugins/`（会话页签）。
>
> **先回答一个常见疑问**：仓库里**没有任何一行 dsh UI 代码在跑**。`package.json` 无 `deepseek-harness` / `cordis` / `typert` 依赖，`src` 无 dsh 包 import，`styles.css` 无 `dsh-` / `--dsh-` 前缀；全部 114 处「dsh」（37 个文件）都是注释里的**设计出处标注**。所以「重写 UI」不需要先拔掉任何 dsh 依赖，底子是干净的。

---

## 0. 一句话结论

dsh 的 UI 成熟在**两件事**：① **typed slot 组合**（父级声明扩展点、插件注册进去，类型推导 + 加载期冲突检测）；② **每关注点一个包**（聊天/工具/子智能体/审批/后台任务/输入触发各管一摊）。
最值得抄的不是它的框架，而是**「工具调用树 + 每工具自己的视图」**和**「轮次折叠 + token 用量」**这两条具体做法——这两条 2026-10-28 定的 P0，已在 Slice 37/42 落地（见 §2）。

---

## 1. dsh UI 的架构（client 包）

| 层 | 包 | 职责 |
|---|---|---|
| 组合内核 | `ui-slots` / `ui-renderer` | 类型化 slot（`single`/`list`/`keyed`/`chain`）+ Component Factory；插件注册进父级 slot，props 从声明合并推导；**声明即认领**，冲突在加载期抛错 |
| 状态 | `store` | 不依赖 React 的 observable + 快照原语 |
| 外壳 | `ui-layout` / `ui-dockkit` / `ui-sidebar` / `ui-sidebar-right` | 主区域、停靠、左右侧栏（右栏是 tab 容器：文档/浏览器/文件/子会话） |
| 对话 | `ui-conversation` / `ui-chat` | 输入区 + 会话记录渲染（流式、轮次折叠、token 用量、滚动归属、图片、Markdown 链接） |
| 工具 | `ui-tool` | **工具调用树** + keyed slot `tool.call.toolview`（按 wire 工具名分派到业务视图）+ 通用卡片 |
| 子智能体 | `ui-subagent` | 子会话目录（状态/token/耗时）、**续接对话**、`@` 引用 source |
| 后台任务 | `ui-jobs` | 会话头部 job 列表：运行/已结束分组、展开流式输出、**两击停止** |
| 交互 | `ui-approval` / `ui-user-questions` / `ui-permission-presets` | 审批卡片、结构化提问、默认权限与访问模式 |
| 输入 | `ui-commands` / `ui-input-trigger` / `ui-skill` / `ui-reference` | 会话感知命令发现、`/` 与 `@` 内联建议、技能/文件/会话引用 |
| 其他 | `ui-plan` / `ui-goal` / `ui-model-selection` / `ui-agent-preset` / `ui-secret-mask` / `ui-primitives` / `ui-theme` | 计划模式、目标、模型选择、预设、凭据遮挡、共享控件、主题 |

**关键设计**：
- `ui-tool` 的注释原话：「业务 UI 包只注册 wire 工具名称和原子视图——它们不配对会话事件、不重建 transcript、也不拥有 root/subcall 拓扑，因为**运行时对 call/result 配对、生命周期与递归 subCalls 投影拥有最终决定权**」。
- `ui-chat`：「本地 transcript 与 steering 提交会**立即显示并保留在原区域，在权威会话记录到达时原子地消失**」——本地回声 + 权威替换。
- `ui-jobs`：「`ctx.jobs` 镜像的 `job.list` 流是**唯一名册**」——单一数据源。

---

## 2. 我们现在的 UI（2026-10-29 更新）

> 下表是**当前真实状态**；括号里的 `Slice N` 对应仓库提交历史。

| 项 | 现状 |
|---|---|
| 体量 | `DigitalPanel.tsx` **1062 行**（含命令/引用/多问/审批分支）；`digitalPanelViews.tsx` 553 行；`DigitalMessageItem` 131、`DigitalChangeCard` 186、`DigitalRunPlan` 115 |
| 步骤展示 | **工具卡**（变体图标 + 摘要 + 状态，可折叠）+ **轮次分组** + **本轮进度条**（不再是一坨纯文本） |
| 工具视图 | ✅ keyed `tool.call.toolview`（Slice 42）：按工具名分派，未命中回退内置通用卡 |
| 轮次折叠 | ✅ 按连续 `step.order` 分组，每轮可折叠（Slice 37，锚点 `digital-turn`） |
| token / 耗时 | ✅ `state.runStats`（累计 token/耗时/模型）+ `digital-run-stats`；轨迹页概览也读它 |
| 子智能体 | ✅ 右栏面板列表 + 插话 + 停止（Slice 38/40）；✅ 「会话」页签看板可独立停止 |
| 后台任务 | ⚠️ 用子智能体看板承载，**没有**独立 jobs 面板（dsh 的「两击停止」未做） |
| 审批 / 提问 | ✅ 风险徽标（4 档配色）+ 参数 `<details>` 折叠 + 「拒绝回灌 `[STOP]`」（Slice 39）+ 结构化多问 |
| 输入触发 | ✅ `/` 命令（Slice 41）、`@` 引用（Slice 43） |
| 状态管理 | ✅ 根级 store `conversation.state`（Slice 46/47）+ `agent.conversation` 服务面（外部 bundle 用） |
| 主区页签 | ✅ 策划书 / 数据编辑 / 代码编辑 / 浏览器（**4 个业务窗口**）；「会话」见下一行 |
| 右栏（dsh 式停靠轨道） | ✅ `RightBarTabs`：内置「对话」（`app.rightPanel` slot，DigitalPanel 常驻）+ 插件右栏页签「会话」（`host: 'rightbar'`）；宽度默认 30%、上限 70%、主区保 480px |
| 凭据遮挡 | ❌ 未做（`ui-secret-mask`，低优先） |

---

## 3. 差距与改造清单（按价值/成本排序）

> **2026-10-29 补**：下表 P0 / P1 / P2 已**全部落地**（Slice 37–43），当前状态以 §2 为准；本表保留作「当初为什么这么排」的设计依据。剩余只有「凭据遮挡」（P3，低优先）与「独立 jobs 面板」（可选项）。

| 优先 | 改造项 | 抄谁 | 具体做法 | 成本 | 价值 |
|---|---|---|---|---|---|
| **P0** | **工具调用卡片 + 按工具视图** | `ui-tool` | 把扁平 `DigitalStepList` 升级成「调用卡片」：`step_start/step_done` 配对成一个可折叠卡片；再开一个 **keyed 视图表**（工具名 → 组件），ceshu/gameData/code/MCP 各自渲染；未注册的走通用卡片 | 中 | **最高**：现在所有工具结果都是一坨文本，用户看不出发生了什么 |
| **P0** | **轮次折叠 + token 用量** | `ui-chat` | 过程（思考/工具）折叠成一行「过程 · N 步」；最终答复常显；每轮结束显示可展开的 token/耗时行 | 中 | 高：长回合不再刷屏 |
| **P1** | **子智能体面板** | `ui-subagent` | 复用我们已有的异步子智能体（`onSubAgentSpawned`/inbox）：列出子任务（状态/token/耗时）、可「继续对话」（`inbox.push`）、可 Stop | 中 | 高：后端做了没入口，等于白做。**✅ Slice 38/40：列表 + 插话 + 停止已接通（IPC `agent:subagentSend`/`Stop`）** |
| **P1** | **后台任务面板** | `ui-jobs` | 把异步子智能体当 job：运行/已结束分组、展开输出、**两击停止** | 中 | 中高：与子智能体面板可合并 |
| **P1** | **审批/提问卡片升级** | `ui-approval` / `ui-user-questions` | 审批卡片显示工具名/参数/风险档；提问支持多问题、选项式 | 小 | 中：现在已有，缺细节 |
| **P2** | **输入触发（`/` 与 `@`）** | `ui-commands` / `ui-input-trigger` | `/` 触发命令（我们已有 command 系统）、`@` 引用会话/文件/技能 | 中 | 中：效率提升。**✅ Slice 41：`/` 已接通**（`parseDigitalCommands` + `DigitalCommandMenu`，↑↓/Enter/Esc；命令：新建/切换预设/草稿/能力/清空/帮助）。**✅ Slice 43：`@` 引用已接通**（`parseDigitalReferences` + `DigitalReferenceMenu`；首次 `@` 懒加载当前库数据表类型，选中插入 `@名称 `；`@名称 ` 带空格即收起菜单）。**边界**：只支持一个前置引用、且是「数据表名」提示而非后端硬引用 |
| **P2** | **keyed slot 机制** | `ui-slots` | 在我们的 `PluginHost` 上加一个「keyed slot」能力：业务插件可注册「某工具的视图」，与现有 panel/view/menu/sidebar 并列 | 中 | 中：让工具视图可插件化，和现有插件体系一致。**✅ Slice 42：`toolView` 能力 + `pluginHost.toolViews()` + 渲染层 `registerToolViewBinding` 已接通**（`DigitalStepList` 按工具名解析，未命中回退内置） |
| **P2** | **非 React store** | `store` | 把智能体状态从组件内 reducer 提到共享 observable（跨组件/跨面板可读） | 中 | 中：为子智能体面板/任务面板共享状态铺路。**暂缓**：当前仅 `DigitalPanel` 一个消费者，提到全局 store 无实际收益、徒增跨组件同步风险；待出现第二个消费者再做 |
| **P3** | **凭据遮挡** | `ui-secret-mask` | 发送前对用户文本里的疑似密钥打码 | 小 | 低 |

> **已落地（Slice 39，2026-10-28）**：**审批卡升级**——风险徽标（`resolveRiskLevel` → 只读/写数据/文件系统/网络/系统级，按档配色）+ 参数 `<details open>` 折叠 + 「拒绝回灌 [STOP]」说明。
>
> **已落地（Slice 38，2026-10-28）**：**P1 子智能体面板**——`BrainEvent` 增 `subagent_started`/`subagent_done`，面板状态增 `subagents[]`，渲染「子智能体（N）」列表（状态/结果摘要）。**「继续对话」入口未做**（需把运行中子智能体的 inbox 经 IPC 暴露给渲染层）。
>
> **已落地（Slice 37，2026-10-28）**：**P0 两项**——
> ① 工具调用卡片 + 按工具视图（`system.code` 等宽块、`system.game_data`/`mcp.*` JSON 美化、其余纯文本）；
> ② 轮次分组折叠（按 `step.order` 分轮，每轮可折叠；整体折叠与 token/耗时统计此前已有）。
> 保留 `digital-step` / `data-status` 等既有 e2e 锚点，新增 `digital-turn`。

### 不抄什么
- **40+ 个包的拆分**：我们规模不需要，拆太细反而难维护。
- **完整 cordis slot 运行时**：我们已有 `PluginHost`（panel/view/menu/sidebar/mainView）；只借「keyed slot」的思路，不引框架。
- **产品埋点 / 品牌包 / 官方模型角标**：与产品无关。

---

## 4. 逐组件改写对照表（2026-10-29）

> 用途：**整体重写 UI 时按图施工**。每条都写清「借了 dsh 什么设计 / 刻意没搬什么 / 数据从哪来 / 哪些 testid 不能丢」。
> 判断标准：dsh 只提供**信息架构与阅读节奏**，颜色、间距、字体、组件实现全是我们自己的（`styles.css` 用 `--ui-font-scale` 等自有变量）。

### 4.1 对话流（`components/digital/`）

| 组件 | dsh 出处 | 借了什么（只借设计） | 刻意没搬 | 数据来源 | testid 锚点 |
|---|---|---|---|---|---|
| `ToolStepCard`（`digitalPanelViews.tsx`，由 `DigitalStepList` 渲染） | `ui-tool` 的 ToolRow / ToolDetails | 变体图标 + 一行摘要 + 分段详情（**参数默认折叠**，避免长 JSON 顶掉结果） | `ui-primitives` 图标包（我们内联 SVG，零依赖） | `state.steps`（`step_start` / `step_done`） | `digital-step`、`digital-step-args`、`digital-step-diff` |
| `TurnGroup`（同上） | `ui-chat` 的「轮次过程折叠」 | 按**连续** `order` 分组、可折叠 | 本地回声 + 权威替换（我们是单一事件流，没有双源） | `state.steps` | `digital-turn` |
| `DigitalRunPlan` | `ui-plan` 的 PlanCard / PlanPreview | 图标 + 标题 + 计数 + 状态徽标；压成**分段进度条** | **plan 模式与审批流**（模型提交计划文档，我们没有后端） | `state.steps` + `state.status` | `digital-run-plan`、`-segment`、`-current`、`-count`、`-expand`、`-failed` |
| `DigitalMessageItem` | `ui-chat` 的 MessageItem | 角色分层与排版节奏 | — | `state.messages` | `digital-message-copy` |
| `DigitalChangeCard` | dsh deliverables 卡 | 折叠行数（对齐 `COLLAPSED_ROWS`）、**无改动不出卡** | 文件 diff 模型（我们数据在 SQLite，行级 diff 无从谈起） | 由 `DigitalPanel` 经 `agent.recentChanges` IPC 取；本组件**只收 props** | `digital-change-card`、`-row`、`-toggle` |
| `DigitalApproval` | `ui-approval` | 工具名 / 参数 / 风险档三层信息 + 拒绝回灌 `[STOP]` | — | `state.interaction`（单数，`DigitalInteraction \| null`） | `digital-approval`、`-risk`、`-approve`、`-reject` |
| `DigitalSubagentList` / `SubagentControls`（同上） | `ui-subagent` | 状态 + 结果摘要；运行中可插话 / 停止 | 子会话目录与续接的完整拓扑 | `state.subagents`（面板侧归约） | `digital-subagents`、`digital-subagent`、`-input`、`-send`、`-stop`、`-controls` |
| `DigitalCommandMenu` | `ui-commands` / `ui-input-trigger` | `/` 内联建议、↑↓ / Enter / Esc | — | `parseDigitalCommands` + `host` 的命令能力 | `digital-command-menu`、`-item` |
| `DigitalReferenceMenu` | `ui-reference` | `@` 引用、输入空格即收起 | 后端硬引用（只做到「数据表名提示」） | `parseDigitalReferences` + 当前库数据类型 | `digital-reference-menu`、`-item` |

### 4.2 主区页签与外壳

| 组件 | dsh 出处 | 借了什么 | 数据来源 | testid 锚点 |
|---|---|---|---|---|
| `sessionPlugin`（会话页签） | **无，自研合并** | — | `conversation.state`（只读状态） | `session`、`session-status`、`session-block-trajectory` |
| `RightBarTabs`（右栏页签容器） | `ui-layout` 右栏轨道 + `ui-sidebar-right` 的 tab 域 | 「对话」是**内置保留页签**（dsh 的 `selectPanel(null)`），插件视图靠 `host: 'rightbar'` 加进来；切页签只 `hidden` 不卸载 | `host.mainViews()` + `app.rightPanel` slot | `rightbar`、`rightbar-tabs`、`rightbar-tab-*`、`rightbar-pane-*` |
| `agentTeamSection`（主对话 + 子智能体看板） | `ui-subagent`（弱参考） | 状态 / 规模 / 最近回复一眼可见；看板可单独停止 | `conversation.state` + `agent/subagentStore.ts` | `agent-team-conversation`、`-status`、`-last` |
| `trajectorySection`（轨迹） | `ui-trajectory` | 按轮次事件表 + 概览（token / 耗时 / 模型）+ 行可展开 | `buildTrajectory(conversation.state)`（纯函数） | `trajectory`、`-overview`、`-turn`、`-row`、`-row-detail`、`-empty`、`-message` |
| `PluginsPanel`（插件中心） | dsh 的 Plugins 页 | 卡片清单 + 状态徽标（启用 / 禁用 / 错误 / 加载中） | `host.list()` | `plugins-count` 等 |
| `Sidebar`（左栏） | dsh Web 侧边栏 | 导航布局 | `host.sidebarItems()`（slot `list`） | — |
| `DigitalPanel` 外壳 | `ui-conversation` / `ui-agent-preset` | 预设「空态可选 → 开聊后只读」的会话级锁定 | `conversation.state`（**唯一写者**；`mbApi.agent.chat` 的流式事件在此归约） | `digital-panel`、`digital-status`、`digital-preset*`、`digital-tier-hint` |

### 4.3 为什么子智能体有两份订阅

`DigitalPanel` 里的 `state.subagents` 与 `agent/subagentStore.ts` 是**同一事件流的两个消费者**，不是两个数据源：

- 面板那份随 reducer 一起归约，服务对话内联（`digital-subagents`）；
- store 那份独立订阅，服务「会话」页签（跨插件、不改 DigitalPanel），避免动摇既有 e2e 锚点。

重写时若想合并成一份，必须保证两边都还能拿到 `running / done / failed` 与结果文本；否则不如维持两份。

### 4.4 三栏布局的落点（Slice 53）

对齐 dsh `ui-layout` 的三栏：左栏（`Sidebar`）+ 主区（业务窗口）+ 右栏（停靠轨道）。

| dsh | 我们 | 说明 |
|---|---|---|
| 右栏是**停靠轨道**，`selectPanel(id)` 选面板、`null` = 会话界面 | `RightBarTabs`：`conversation` 是**内置**页签，渲染 `app.rightPanel` slot | 对话不是插件面板，是保留 key——所以插件禁用不会把对话弄没 |
| 面板是**可选项**，注册进 `main` keyed slot | 插件 `mainView` 加 `host: 'rightbar'` | 复用同一套注册/懒挂/顺序，不新增能力种类 |
| 右栏首次打开 **45%**，上限 70%，主区保 400px | 默认 **30%**，上限 70%，主区保 480px | **有意偏离**：45% 实测把策划书工具条挤到换行（主区是密集表单，不是文档）。要更宽就直接拖，宽度会落 localStorage |
| 切页签不重挂载（普通/全屏共用同一棵内容树） | 切页签只 `hidden`，不卸载 | 对话的滚动位置、输入草稿、流式输出不能因切页签丢 |

**一个坑**：`.rightbar-pane` 用了 `display: flex`，会盖过原生 `[hidden]` 的 `display: none`，
必须显式写 `.rightbar-pane[hidden] { display: none }`，否则切页签看起来「没反应」（其实两个 pane 叠着）。

**为什么不把会话留在主区**：它和对话读同一份 `conversation.state`，放同一根轨道里
「看对话 → 看轨迹」不用跨区移动视线；主区腾给策划书/数据编辑这两个真正需要宽度的窗口。


---

## 5. 改写时的硬约束

1. **不 import dsh。** 它是 cordis + Typert 插件运行时，直接引组件等于换运行时（A 路线），已明确否掉；只能照设计重画。
2. **不复制 dsh CSS / 图标包。** 我们零依赖 + 内联 SVG；复制会带来主题变量耦合（`--ui-font-scale` 那套是我们自有的）。
3. **`data-testid` 是回归契约。** e2e 75 例依赖 §4 的锚点；要改名必须同步改 `tests/e2e/*.spec.ts`，否则宁可保留。
4. **数据层不动。** `shared/agent/*`（`panel.ts` 归约、`trajectory.ts`、`toolDetail.ts`、`conversationStore.ts`）与 UI 解耦，重画时原样复用；尤其 `toolDetail` 的 diff 判据**只能有一份**（工具卡与轨迹详情共用）。
5. **四道闸 + e2e 全绿**才算完（`npm run test` / `typecheck` / `lint` / `build` + `playwright test`），基线见 `.workbuddy-ai/memory/MEMORY.md`。
6. **单测偶发失败**：全量套件出现过「偶发 1 例失败、复跑全绿」，连跑 5 次未复现；按抖动处理，别据此改代码（要定位用 `npx vitest run --reporter=dot` 抓 test 名）。

---

## 6. 建议的落地顺序

> 2026-10-29：以下 1–4 **已全部落地**（对照 §2）。若重写，顺序建议反过来——**先定数据契约与 testid，再画界面**。

1. ~~**P0-a 工具调用卡片**（`DigitalStepList` → 卡片 + keyed 视图表）~~ ✅ Slice 37/42
2. ~~**P0-b 轮次折叠 + token 行**~~ ✅ Slice 37
3. ~~**P1 子智能体 / 后台任务面板**~~ ✅ Slice 38/40（jobs 面板未做，由看板承载）
4. ~~**P2 输入触发 + keyed slot**~~ ✅ Slice 41/42/43

> 每一片都要过四道闸 + e2e；P0 两片是「智能体看起来是否专业」的分水岭。

---

## 7. 来源（可复查）

- dsh：`packages/client/README.zh.md`（包地图）、`ui-slots/README.zh.md`（slot 架构）、`ui-chat/README.zh.md`（轮次折叠/token/滚动/本地回声）、`ui-tool/README.zh.md`（工具树 + keyed 视图）、`ui-subagent/README.zh.md`（子会话目录 + 续接）、`ui-jobs/README.zh.md`（后台任务 + 两击停止）、`ui-conversation/README.zh.md`。
- 本项目（2026-10-29 补）：
  - 外壳 / 对话流：`desktop/src/renderer/src/components/digital/{DigitalPanel,digitalPanelViews,DigitalMessageItem,DigitalChangeCard,DigitalRunPlan}.tsx`
  - 主区页签：`desktop/src/renderer/src/plugins/{sessionPlugin,agentTeamSection,trajectorySection}.tsx`
  - 数据与纯逻辑：`desktop/src/shared/agent/{panel,trajectory,toolDetail,conversationStore,commands,references}.ts`、`desktop/src/renderer/src/agent/subagentStore.ts`
  - 回归：`desktop/tests/e2e/*.spec.ts`、`desktop/tests/unit/**`
