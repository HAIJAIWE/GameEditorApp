# dsh UI 对照：成熟做法与本项目可改造项

> 状态：**只读调研**（2026-10-28）。目的：在改数字员工/主界面 UI 之前，先看清 dsh 的 UI 架构，给出「抄什么、不抄什么、按什么顺序」。
> dsh 源码：`D:/GameEditorApp/deepseek-harness-master/deepseek-harness-master/packages/client/`（`ui-*` 系列）。
> 本项目 UI：`desktop/src/renderer/src/components/digital/`（`DigitalPanel.tsx` 802 行 + `digitalPanelViews.tsx` + `ChatMarkdown.tsx`）。

---

## 0. 一句话结论

dsh 的 UI 成熟在**两件事**：① **typed slot 组合**（父级声明扩展点、插件注册进去，类型推导 + 加载期冲突检测）；② **每关注点一个包**（聊天/工具/子智能体/审批/后台任务/输入触发各管一摊）。
我们现在的数字员工是**一个大组件 + 扁平步骤列表**。最值得抄的不是它的框架，而是**「工具调用树 + 每工具自己的视图」**和**「轮次折叠 + token 用量」**这两条具体做法。

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

## 2. 我们现在的 UI（准确现状）

| 项 | 现状 |
|---|---|
| 体量 | `DigitalPanel.tsx` **802 行**，单组件；`digitalPanelViews.tsx` 放视图 |
| 步骤展示 | `DigitalStepList`：**扁平列表**，每行 `工具名 + 状态图标 + 原始结果文本` |
| 工具视图 | ❌ 无按工具定制的卡片（ceshu/gameData/code/MCP 都长一样） |
| 轮次折叠 | ❌ 无（过程与最终答复混在一起） |
| token 用量 | ⚠️ 有 `turn_stats` 事件与档位标识，但没做「每轮可展开用量行」 |
| 子智能体 | ❌ 后端已做（异步 + 完成通知 + inbox），**UI 完全没露** |
| 后台任务 | ❌ 无独立面板（异步子智能体其实算 job） |
| 审批/提问 | ✅ 有 `DigitalApproval`（结构化程度可再提升） |
| 输入触发 | ❌ 无 `/` 命令、`@` 引用 |
| 状态管理 | React `useReducer` + 局部 state（无跨组件 observable store） |
| 凭据遮挡 | ❌ 无 |

---

## 3. 差距与改造清单（按价值/成本排序）

| 优先 | 改造项 | 抄谁 | 具体做法 | 成本 | 价值 |
|---|---|---|---|---|---|
| **P0** | **工具调用卡片 + 按工具视图** | `ui-tool` | 把扁平 `DigitalStepList` 升级成「调用卡片」：`step_start/step_done` 配对成一个可折叠卡片；再开一个 **keyed 视图表**（工具名 → 组件），ceshu/gameData/code/MCP 各自渲染；未注册的走通用卡片 | 中 | **最高**：现在所有工具结果都是一坨文本，用户看不出发生了什么 |
| **P0** | **轮次折叠 + token 用量** | `ui-chat` | 过程（思考/工具）折叠成一行「过程 · N 步」；最终答复常显；每轮结束显示可展开的 token/耗时行 | 中 | 高：长回合不再刷屏 |
| **P1** | **子智能体面板** | `ui-subagent` | 复用我们已有的异步子智能体（`onSubAgentSpawned`/inbox）：列出子任务（状态/token/耗时）、可「继续对话」（`inbox.push`）、可 Stop | 中 | 高：后端做了没入口，等于白做 |
| **P1** | **后台任务面板** | `ui-jobs` | 把异步子智能体当 job：运行/已结束分组、展开输出、**两击停止** | 中 | 中高：与子智能体面板可合并 |
| **P1** | **审批/提问卡片升级** | `ui-approval` / `ui-user-questions` | 审批卡片显示工具名/参数/风险档；提问支持多问题、选项式 | 小 | 中：现在已有，缺细节 |
| **P2** | **输入触发（`/` 与 `@`）** | `ui-commands` / `ui-input-trigger` | `/` 触发命令（我们已有 command 系统）、`@` 引用会话/文件/技能 | 中 | 中：效率提升 |
| **P2** | **keyed slot 机制** | `ui-slots` | 在我们的 `PluginHost` 上加一个「keyed slot」能力：业务插件可注册「某工具的视图」，与现有 panel/view/menu/sidebar 并列 | 中 | 中：让工具视图可插件化，和现有插件体系一致 |
| **P2** | **非 React store** | `store` | 把数字员工状态从组件内 reducer 提到共享 observable（跨组件/跨面板可读） | 中 | 中：为子智能体面板/任务面板共享状态铺路 |
| **P3** | **凭据遮挡** | `ui-secret-mask` | 发送前对用户文本里的疑似密钥打码 | 小 | 低 |

### 不抄什么
- **40+ 个包的拆分**：我们规模不需要，拆太细反而难维护。
- **完整 cordis slot 运行时**：我们已有 `PluginHost`（panel/view/menu/sidebar/mainView）；只借「keyed slot」的思路，不引框架。
- **产品埋点 / 品牌包 / 官方模型角标**：与产品无关。

---

## 4. 建议的落地顺序

1. **P0-a 工具调用卡片**（把 `DigitalStepList` 换成卡片 + keyed 视图表）—— 先做通用卡片，再逐个补 ceshu/gameData/code 的定制视图。
2. **P0-b 轮次折叠 + token 行**。
3. **P1 子智能体/后台任务面板**（两者可合成一个「任务」面板）。
4. **P2 输入触发 + keyed slot**。

> 每一片都要过四道闸 + e2e；P0 两片是「数字员工看起来是否专业」的分水岭。

---

## 5. 来源（可复查）

- dsh：`packages/client/README.zh.md`（包地图）、`ui-slots/README.zh.md`（slot 架构）、`ui-chat/README.zh.md`（轮次折叠/token/滚动/本地回声）、`ui-tool/README.zh.md`（工具树 + keyed 视图）、`ui-subagent/README.zh.md`（子会话目录 + 续接）、`ui-jobs/README.zh.md`（后台任务 + 两击停止）、`ui-conversation/README.zh.md`。
- 本项目：`desktop/src/renderer/src/components/digital/DigitalPanel.tsx`、`digitalPanelViews.tsx`、`shared/agent/panel.ts`。
