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
| `ToolStepCard`（`digitalPanelViews.tsx`，由 `DigitalStepList` 渲染） | `ui-tool` 的 ToolRow / ToolDetails | 变体图标 + 一行摘要 + 分段详情（**参数默认折叠**，避免长 JSON 顶掉结果）；**行头 diff 增删数 `+N −M`**（折叠态灰、悬停/展开着色，同 dsh 的 diffAdded/diffRemoved）；**运行态文字扫光**（对齐 `TextShimmer`：1.5s + `steps(48)` 阶梯、0.3s 延迟、`prefers-reduced-motion` 关闭）；**失败行摘要取错误行**（先剔 `exit code` / `command failed` / 堆栈噪音，再找错误词，取不到退回首行） | `ui-primitives` 图标包（我们内联 SVG，零依赖）；dsh 用装饰副本叠层做扫光，我们用 `background-clip`（摘要带 ellipsis，副本宽度算不准会错位）；dsh 用 `sr-only` 藏状态字，我们**保留可见的状态字**（面向策划，不是终端用户） | `state.steps`（`step_start` / `step_done`） | `digital-step`、`digital-step-args`、`digital-step-diff`、`digital-step-diff-total` |
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
| 侧栏 280px（264–420）、`padding: 6px 8px`、字号 14px、行高 36px、图标↔文字 6px | `.sidebar` 同值；收起 56px（`padding: 18px 10px 6px`） | 度量取自 `ui-sidebar/SidebarRoot.module.css`；`Mod+B` 切换；<1024px 自动收起、变宽不强行展开（同 dsh） |
| 侧栏右边界 `border-l3` = `rgba(0,0,0,.12)`、0.5px | 同值（只有侧栏用这个；其余仍是我们的 `--border`） | 未做全局 token 对齐（见下） |
| 右栏是**停靠轨道**，`selectPanel(id)` 选面板、`null` = 会话界面 | `RightBarTabs`：`conversation` 是**内置**页签，渲染 `app.rightPanel` slot | 对话不是插件面板，是保留 key——所以插件禁用不会把对话弄没 |
| 面板是**可选项**，注册进 `main` keyed slot | 插件 `mainView` 加 `host: 'rightbar'` | 复用同一套注册/懒挂/顺序，不新增能力种类 |
| 右栏首次打开 **45%**，上限 70%，主区保 400px | 默认 **30%**，上限 70%，主区保 480px | **有意偏离**：45% 实测把策划书工具条挤到换行（主区是密集表单，不是文档）。要更宽就直接拖，宽度会落 localStorage |
| 切页签不重挂载（普通/全屏共用同一棵内容树） | 切页签只 `hidden`，不卸载 | 对话的滚动位置、输入草稿、流式输出不能因切页签丢 |
| 两种呈现形态：普通 / 全屏（`openRightbar(track, fullscreen)`） | `.ai-dock.is-fullscreen`（flex 吃掉主区）+ 页签条右端开关 + Esc 退出 | 主区用 `hidden` 隐藏而非卸载（草稿/滚动不丢）；**左侧导航保留**（dsh 会连侧栏一起盖，我们留着便于边看边切窗口） |

**又一个 `[hidden]` 坑**：`.main-area` 是 `display: flex`，同样会盖过 `[hidden]` 的 `display: none`，
全屏时必须写 `.main-area[hidden] { display: none }`，否则「全屏」看起来没生效（右栏变宽了、主区还在挤）。
这和 `.rightbar-pane[hidden]` 是同一个陷阱，写隐藏态时先看目标元素有没有 `display` 声明。

**一个坑**：`.rightbar-pane` 用了 `display: flex`，会盖过原生 `[hidden]` 的 `display: none`，
必须显式写 `.rightbar-pane[hidden] { display: none }`，否则切页签看起来「没反应」（其实两个 pane 叠着）。

### 4.5 做到哪一步了（2026-10-29）

**已对齐 dsh 的**：
- 三栏结构、右栏页签轨道（对话是内置保留页签）、右栏全屏；
- 侧栏 280px / 收起 56px、14px 标签、行高 36px、`border-l3` 边界；
- **色阶**（`ui-theme` 浅色别名）：画布与卡片都是纯白（dsh 的 `bg-base` 与 `bg-layer-1..3` 同值），层级靠 0.5px 发丝线（`border-l2` = rgba(0,0,0,.1)）而不是灰底；hover = `rgba(38,49,72,.06)`；文字三级 `#0f1115 / #61666b / #81858c`；强调色 = `deepseek-500` `#4176e6`；侧栏/顶栏用 `specific-sidebar-fill` `#f9fafb`（画面上唯一有底色的区域）。四套主题（默认/深色/暖调/夜色）都补了 `--sidebar-fill`，避免深色主题继承浅灰。
- **图标**：侧栏 12 项从 emoji 换成 `LucideIcon` 单色线稿（16px）；`Sidebar` 用 `resolveIconName()` 判定，解析得到就渲染 SVG、解析不到回退原字符串（插件仍可传 emoji，不会瞎掉）。首页标题、右栏「智能体」标题、搜索占位里的 emoji 一并清掉。
- **控件形态**（`ui-primitives`）：
  - 按钮 md = **36px 高 / 14px 字 / 12px 圆角 / 0 14 内距**，默认 outline（0.5px inset `border-l3` + hover `rgba(38,49,72,.06)`）；主按钮 = **近黑 `#0f1115`**（dsh 的 brand-primary 不是品牌蓝）；紧凑按钮 = sm（28px / 12px / 8px 圆角）；
  - 输入框/下拉 = **32px 高 / 14px 字 / 12px 圆角 / 0.5px `border-l4`**，聚焦换品牌色描边。

**本轮已补齐（2026-10-30）**：
- **模型下拉做成真功能**：`DigitalPanel` 的「模型」chip 现为真实下拉（`digital-composer-model` + `digital-model-menu`），选项取自 `LLM_PROVIDER_PRESETS[provider].models`，并用 `llm:status` 探 Ollama 本机模型叠加；选中写回 `saveLlmConfig` + `llm:configure`，agent 每次调用重读即生效（纯渲染胶水，不动后端）。
- **「完全权限」/ 语音入口**：dsh 的权限是 `conversation.input.permission` slot、语音是独立采集链路，我们主智能体无对应后端（SandboxPolicy 只管子智能体、无音频链路）→ 改为**静态展示**（去假箭头、加 `dsh-composer-chip-static`），不做假按钮。
- **对话/智能体 UI 内 emoji 全清**：运行统计区的 💾/📂、云端/本地/未配置的 ☁🖥⚙、步骤的 🧠📦🔧、审批/子智能体/任务列表的 ⚠️❓✅❌ 全部换成 `LucideIcon` 单色线稿（`alert-triangle`/`brain`/`package`/`wrench`/`check`/`x`/`info`/`cloud`/`database`/`settings`…）。唯一残留是**全局顶部主题切换 🌙/☀️**——`lucideIcons` 暂无 sun/moon，且那是主窗口控件、不在「数字员工 UI」范围内，按 §4.5 既有结论保留。
- `sessionPlugin` 的 `icon: '💬'` → `book-open`；`.form-label > svg` 加 `vertical-align:-2px;margin-right:3px` 让图标与文字基线对齐。
- **浮层遮罩 + 轻玻璃（第二轮）**：模型菜单 / ＋ 菜单打开时盖一层极淡 scrim（`digital-composer-overlay`，点它即关），浮层本身改成 `color-mix` 半透 + `backdrop-filter: blur(8px)` 的轻玻璃（`dsh-composer-menu`）；之前是裸定位 div 缺遮罩。
- **ContextMeter 令牌环（第二轮）**：输入区统计行行首嵌圆环，用 `AgentRunStats` 里**真实累计**的 `prompt/completion/total` 画「已用 / 上下文上限」，hover 浮出分解卡；上限取 `MODEL_CONTEXT_WINDOWS`（各模型**公开发布规格**，非运行时假探测），不在表里回落默认值。`data-testid: digital-context-meter`。
- **「新建对话」危险确认（第二轮，对齐 dsh RiskConfirmation）**：删按钮（trash）直接弹确认框（清空并新建 / 取消），误触不再丢活跃会话。说明：agent 工具执行的风险审批（`DigitalApproval` + `TOOL_RISK_MAP`/`RISK_LEVEL`）之前就已存在；本次补的是**用户侧破坏性动作**的确认（我们的命令集全是良性 UI 动作，没有可映射的高危命令，故不做假风险徽标）。`data-testid: digital-newchat-confirm(-overlay/-cancel)`。

**第三轮（本次，对齐 dsh 之前「后端依赖」误判的项）**：
- **本轮目标栏（GoalBar）** —— 之前误判为「无 `goal` 字段、做出来必是假」。实际可以诚实做：渲染层在输入框上方放一条可编辑目标（`digital-goal-input`），每次发送随 `agent:chat` 的 `goal` 字段上送；IPC 收到后转交 `AgentBrainService.chat({ goal })`，`service.ts` 把非空目标作为一段「【本轮目标】…」注入系统提示词（`extraBlocks`）。目标跨轮持续生效，新建对话才清空。dsh 的 `GoalSnapshot{id,revision,objective,...}` 完整版我们没做（无后端持久化），但「填一句话当意图锚点」这个**核心能力是真的**。`data-testid: digital-goal-bar / digital-goal-input`。
- **「停止」二次确认（两段式 kill）** —— 之前误判为「无 `killJob`/`jobId` 概念」。其实我们的取消通道（`window.mbApi.task.cancel`）是真实存在的，缺的只是**前端防误触的二次确认**。做法对齐 dsh JobView 的 `KillState`：第一次点只把停止按钮切到「再点一次确认」（`data-armed="true"`、图标转方块、描边转红），3 秒内不点自动解除；第二次点才真正调 `handleStop` → `task.cancel`。运行结束（stop/完成/出错）自动解除 armed，避免下一轮带着旧态。全部走既有真实取消链路，无假按钮。`data-testid: digital-stop`（`data-armed` 属性）。
- **发送中 spinner** —— 运行中停止按钮内显示旋转 spinner（对应 dsh `InputState.phase: 'sending'`），明确「本轮在跑、不是卡死」。只读态之前已有（输入框 `disabled={running}`），本次补的是视觉旋转指示。纯 CSS 动画，无新增数据依赖。`data-testid: digital-stop` 内含 `.dsh-composer-spinner`。
- **结构化问题 composer** —— 经核查，`DigitalPanel.tsx` 里**早已实现**（`interaction_required` 事件 → `digital-interaction` 渲染确认按钮与多问题表单 `digital-multi-form`/`digital-multi-option`/`digital-multi-input`，数据模型 `SkillInteraction.questions` 端到端存在），不属 gap，移出列表。

**第四轮（对齐 dsh `ui-message-feedback`）**：
- **助手消息 Like/Dislike** —— 之前漏了这条：dsh 在定稿助手消息的动作行有 Like/Dislike（点开收集分类+说明再记录）。我们后端 `agent:feedback`（`FeedbackStore.record(rating, comment)`，≥4 分且说明非空时提炼偏好写偏好库）**早已完整**，只是**渲染层从未消费**。本次补 UI：助手消息动作行加 `digital-feedback-up`（rating=5）/ `digital-feedback-down`（rating=1），点任一个展开可选补充说明框（`digital-feedback-form`/`digital-feedback-comment`，图标按钮 `-submit`/`-cancel`，均 aria-label 无可见文字，避免污染 e2e 的 `innerText` 断言），提交走真实 `api.feedback`；成功标记 `data-active`（对齐 dsh recorded rating 常显），失败就地报错不静默。只有**定稿**助手消息挂载（流式半截不挂，同 dsh）。DOM 测试 `digitalMessageFeedback.test.tsx` 覆盖评分/说明/失败/取消四条路径。
- 说明：dsh 的 7 类 category chips、retract、per-message id 我们没做（schema 只有 1–5 + comment，无分类/无 retract 通道）——不做假分类，只做**真实存在**的评分+说明。

**第五轮（会话附件 `ui-attachment` 的诚实子集）**：
- **做了什么**：`＋ → 上传文件` 选文件 → 主进程复制进 `<活跃库>/attachments/`（重名加 `-2`，与图片入库同策略）→ 返回 `{name,path,mime,bytes}`；用户消息气泡下渲染附件：**图片类**（`image/*`）走 `attachments:readImage`（主进程读成 data URL，**仅限库内附件目录 + 8MB 上限**）渲染缩略图（单图 240px 长边 / 多图 64px 方块），点开**原图 lightbox**（Esc / 点遮罩 / 关闭按钮，焦点归还缩略图）；**非图片**走文件 chip（点开 `shell.openPath`）。发送时元数据随 `agent:chat` 上送，`service.ts` 注入系统提示词「【附件】…（名称/路径/大小）」，让智能体知道有这些文件、能用文件工具按绝对路径读取。新通道 `dialog:chooseAttachmentFile` / `attachments:add` / `attachments:open` / `attachments:readImage`，主进程 `main/attachments.ts` + `ipc/attachmentsIpc.ts`。`data-testid: composer-upload-file / digital-attachments / digital-attachment-chip / digital-message-attachment / digital-message-image / digital-lightbox(-close)`。
- **composer 待发送区（对齐 dsh draft rail 的诚实子集）**：图片附件显示**真实缩略图**（24px 嵌在 chip 里），其它显示文件 chip；读图失败回退文件 chip。读图逻辑抽成共享 hook `useAttachmentImage`（消息缩略图与 composer 缩略图同一份，避免重复）。刻意不做 dsh 的边缘翻页箭头 / 滚轮横向滚动（窄 composer 用不上，做了是空转）。
- **刻意不做**：上传进度条（无流式上传链路）、拖拽上传（无 drag-drop 数据链路）。按「宁缺毋假」留白，而不是画假进度。~~图片 lightbox~~ 已做（有真实读图链路）。
- 测试：`libraryAttachments.test.ts`（命名/MIME/大小）、`panelReducer`（消息携带附件）、`agentBrainService`（提示词注入）、`digitalMessageAttachments.test.tsx`（文件 chip / 图片缩略图 / lightbox 开关 / Esc / 读图失败回退 / 助手不显示）。

**第六轮（`ui-deliverables` 第三块：正文内联文件引用 → 代码面板）**：
- **做了什么**：助手正文里**像文件路径的内联代码**（含分隔符 + 已知代码扩展名、单行、≤200 字）渲染成可点链接（`chat-file-link`），点击 → `requestCodeView(path)` 发请求 + `host.openMainView('code.mainView')` 切到代码页签；`CodePanel` 订阅该请求并 `openFile(path)` 定位。**围栏代码块内不链接化**（用 `InFenceContext` 标记，避免把代码内容当路径）。`fs:readFile`/`fs:listDir` 补了**相对路径按 appRoot 解析**，所以正文里的 `src/main/ipc.ts` 也能打开。
- 通道 `renderer/src/plugins/codeViewRequest.ts`（单例请求 + 挂载前暂存）；`data-testid: chat-file-link`。
- 测试：`chatMarkdownFileLink.test.tsx`（内联路径链接化 / 围栏内不链接 / 非路径不链接 / 无回调不链接）、`codeViewRequest.test.ts`（请求/取一次/取消订阅）。

**第七轮（交付卡 + 导入进度 + 快捷键参考）**：
- **交付卡（`ui-deliverables` delivery cards）** —— 之前说「无数据链路」不成立：`system.ceshu` 的 `export` 动作成功后返回 `data.filePath`，这就是真实交付。新增**独立交付日志**（`shared/agent/deliveryLog.ts` + `main/agent/deliveryLogStore.ts`，与操作日志分开——交付不可回滚，混进去会污染回滚计划）；`operationRecorder` 在导出成功时记一条（非导出/失败/无 `filePath` 都不记，不造假）；通道 `agent:deliveries`；`DigitalPanel` 运行结束并行拉改动 + 交付；`DigitalDeliveryCard` 渲染文件行（名称/大小），点开走系统程序。`data-testid: digital-delivery-card / digital-delivery-file`。
- **导入进度** —— `attachments:add` 改异步（`fs/promises`），复制期间渲染层显示「导入中…」chip（**不确定进度**，不画假百分比——拷贝没有流式回调）。`data-testid: digital-attachment-adding`。
- **快捷键参考（`ui-shortcuts` 只读子集）** —— `shortcutsData.ts` 是快捷键**单一事实来源**（只收录代码里真实存在的：Enter/Shift+Enter/`/`/`@`/Esc/Ctrl+B/Ctrl+Z/Ctrl+Shift+Z），`ShortcutsDialog` 只读它渲染分组列表，Esc/遮罩/关闭收起。**不做** dsh 的录制/清除/恢复绑定（我们没有可改写的键位注册表，做录制就是假按钮）。入口在智能体面板头部（`digital-shortcuts`）。
- **拖拽上传（`ui-attachment` drop 目标）** —— 输入框接 `dragover/drop`，经 preload 暴露的 `webUtils.getPathForFile` 取本地路径（Electron 32+ 已移除 `File.path`）→ 与原生选择共用 `addAttachmentPath`（复制进库 + 「导入中…」）。拖入时输入框虚线高亮（`.is-drag-active`）。
- **附件只给路径（对齐 dsh `FileAttachmentRef`）** —— 消息里**只存 `{ name, mime, bytes }`**（叶子名，**不含路径**；dsh 明确要求 durable events 排除本机路径）；提示词里给智能体一行「名称 + 按活跃库解析的绝对路径 + 大小」，**不内联内容**（dsh：models read them on demand through saved read-only paths instead of receiving their bytes）。`attachments:open` / `readImage` 按 `name` 解析 `<库>/attachments/<name>`（防目录穿越）；交付文件（导出产物，不在 attachments 目录）走新的通用 `shell:openPath`。早期版本的「文本内容内联」已按 dsh 撤回。
- **图片 vision（对齐 dsh，按模型能力 gate）** —— 消息加可选 `images`（data URL，**不落盘**）；Ollama / OpenAI 传输层**只在生效判定为「支持视觉」时**下发（Ollama 转裸 base64、OpenAI 转 `content` parts）；不支持时**丢弃图片**，提示词如实说明「当前模型未启用视觉输入，N 张图片仅提供路径」。上限 4 张 / 20MB。**恢复会话时**，历史里最近 4 张图片也会从 `<库>/attachments/` 重读并重发（同样 4 张/20MB 上限，对齐 dsh 的「later turns 也发」）；非视觉模型不读图。这样「按 dsh 发图」与「不把图发给文本模型」两头都守住。
- **视觉判定可配置（`vision: 'auto' | 'on' | 'off'`）** —— 模型能力没有元数据来源，只能按模型名启发式判断，**新模型 / 自建模型必然漏判**；漏判时用户只能改代码。故在设置「模型」下方加**视觉输入**下拉：`auto`（按 allowlist，默认）/ `on`（强制发图）/ `off`（强制不发，用于「自称支持但实际 400」）。判定单点真源 `resolveVisionSupport(model, mode)`（`shared/util/visionSupport.ts`），**service（是否读图/是否提示）与两条传输层（是否下发）都走它**，避免「service 发了图、传输层又丢掉」的两侧不一致。设置里实时显示当前判定结果（会发图 / 只给路径）。
- **附件重放** —— 会话落盘时把附件元数据挂到**本轮** user 消息（`service.chat` 的 `plain[newUserIndex]`，同时进 `active_session.json` 快照与 `turns.jsonl`），恢复时 `hydrateFromSession` 解析回 chip（坏条目逐条丢弃）。此前附件只活在当轮系统提示词里，历史一恢复就丢。恢复后新一轮对话再注入「【历史附件】」**路径清单**（只给路径、不内联内容，按路径去重、上限 20 条），让智能体能按路径重读旧附件而不炸上下文。

**源码级复核（补真读）**：真读了 `ui-deliverables` 的 `turn-deliverables.ts` / `Deliverables.tsx` / `PresentedFileCard.tsx` / `ChangedFiles.tsx` / `presented.ts` / `changes.ts` / `changes-diff.ts` / `file-actions.ts`，以及 `ui-shortcuts` 的 `Reference.tsx` / `fixed.ts`。据此对齐三处：**交付卡 4 行折叠 + 扩展名标签**（`COLLAPSED_PRESENTED_COUNT` / `fileExtension`）；**快捷键弹窗加搜索**（对齐 `Reference.tsx` 按动作/按键过滤、打开聚焦搜索框）；**交付文件主点击=应用内预览**（对齐 `file-actions`：文本类进代码面板，二进制 docx/pptx/pdf 才走系统程序）。**有意保留的差异**（不是漏读，是数据模型不同）：① dsh 的 deliveries 来自 `deliverables/presented` 事件（agent 显式 present 一个文件），我们没有 present 工具，交付改从 `export` 结果派生；② dsh 的内联文件链接只解析「本轮 produced/delivered 的路径」且需唯一命中，我们的 agent 不写源码文件，按 dsh 规则几乎无链接可用，故保留「像路径即可点」；③ dsh 的改动卡单文件只出卡头，我们的单条行还带 dataType/时间（卡头没有），保留该行；④ dsh 的改动卡统计是 **git 快照的 +/- 行数**（`changes.ts` 的 `WorkspaceChangesSummary`），我们是 SQLite 数据变更、没有 diff，故用新建/修改/删除计数——这条**无法照搬**。另读了 `ui-attachment` 的 `FileCard.tsx` / `client/drop-events.ts`，再对齐两处：待发送 chip 的**扩展名 + 大小**标签（对齐 `FileCard` 的 `[extension, size]`）；拖拽改为**文档级投放**（整页任意位置可拖入 + `dragenter/dragleave` 嵌套深度计数防闪烁，对齐 `installDocumentDropEvents`）。再读 `DropOverlay.tsx`，补**全屏投放邀请**：拖入时覆盖整页（`pointer-events:none` 让拖拽事件继续到达页面、`createPortal` 到 body、毛玻璃 + 插图/标题/限制说明；运行中显示 disabled 态）——对齐 dsh 的 DragMask。

**还没对齐的（下一步候选，按成本/价值分层）**：
- **纯视觉 / 低成本（优先）**：
  - ~~轨迹表格无斑马纹 → 补 hover / 选中中性填充~~ ✅ 已对齐：hover 用 `--bg-hover`（第二轮），**选中态**（第三轮）= 正在查看详情的那一行（`<details>` 展开态）用 `--bg-selected` 中性填充、文字保持 `--text`（不用蓝色文字），且选择器特异性高于 `:hover` ⇒ 展开时鼠标划过不闪（对齐 dsh `tr[data-selected='true']` 抑制 hover）。DOM 测试钉住 `<details> > <summary.trajectory-row>` 结构，防止 CSS 静默失效。
- **数据/后端依赖**：
  - ~~附件~~ ✅ 已完整落地诚实子集（第五/七轮：图片缩略图 + 原图 lightbox + 导入进度 + 拖拽上传）。
  - ~~正文内联文件引用~~ ✅ 已落地（第六轮）。
  - ~~交付卡~~ ✅ 已落地（第七轮，真实数据来自 export 结果）。
  - ~~快捷键参考~~ ✅ 已落地只读子集（第七轮）；可编辑键位注册表未做（超范围）。
- **刻意保留（非视觉）**：
  - 顶部菜单栏：dsh 是 Web GUI 没有桌面菜单栏；我们保留。
  - 消息卡 hover 显形图标操作行：已对齐（`DigitalMessageItem` 自带 hover/focus-within 显隐，见其文件注释），不列入 gap。

**顺手修的两个布局 bug**：
1. 顶部「当前库」在窄条里换行，掉出一个孤零零的「库」字 —— 紧凑角部件里 `select` 已显示库名，`item-meta` 是重复信息，收起。
2. 策划书首页头部在 800px 主区里裁掉最后一个按钮 —— 头部改为可换行，并去掉首页误用的「列表页脚」样式（`padding: 12px 16px` + `border-top`）。

**为什么不把会话留在主区**：它和对话读同一份 `conversation.state`，放同一根轨道里
「看对话 → 看轨迹」不用跨区移动视线；主区腾给策划书/数据编辑这两个真正需要宽度的窗口。


---

## 5. 改写时的硬约束

1. **不 import dsh。** 它是 cordis + Typert 插件运行时，直接引组件等于换运行时（A 路线），已明确否掉；只能照设计重画。
2. **不复制 dsh CSS / 图标包。** 我们零依赖 + 内联 SVG；复制会带来主题变量耦合（`--ui-font-scale` 那套是我们自有的）。
3. **`data-testid` 是回归契约。** e2e 83 例依赖 §4 的锚点；要改名必须同步改 `tests/e2e/*.spec.ts`，否则宁可保留。
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
