# dsh 能力对齐状态表（墨白可视化编辑）

> **口径**：本表对齐的是 dsh（`D:/GameEditorApp/deepseek-harness-master`）的**能力**，不是 vendoring 它的代码。
> 主线仍是 B 路线：读 dsh 源码 → 抽设计 → 用 React/TS 重写。
> **2026-11-02 修订（二次）**：用户拍板"不搬 dsh 插件" → 已**退役** `packages/agent-core/src/dsh/`（cordis 适配器）；
> `repeat-tool-reminder` 改为**原生化**跑在我们的 `toolRuntime`（`createRepeatToolReminderGuard` 挂进 `ToolExecutionPipeline.usePostExecGuard`），
> 不再依赖 cordis 运行时。agent-core 第三方依赖清单同步移除 `@deepseek-ai/cordis` 与 `@deepseek-ai/dsh-repeat-tool-reminder`。
> 维护约定：新增/调整一个 dsh 能力时，**同步更新本表**（含 commit 与测试）。
> **2026-11-05 修订**：补齐 11-03～11-05 的全部增量（i18n 全量清零、agent 侧 A/B 组、
> C 组 UI 器物、样式守卫、密钥出口投影），修正此前「i18n 有意不做」等**过时结论**，
> 并把「OS 级内核沙箱」正式定为**不做**（见第三节，不再以「后续」悬置）。
> 验证基线也同步到当日实际数字。

## 结论

dsh 的 **52 个包组**里，与「agent 能力面（后端）」相关且**可移植、有价值**的项已全部落地；
宿主/基础设施类由本产品自有实现承载。

**前端不是"对齐 dsh 的 66 个 `ui-*` 包"，而是按本产品需要自有实现**（详见 `docs/dsh-ui-comparison.md`）。
差异最大的三处，先在这里说清，免得读表时误判：

| 项 | 我们 | dsh | 性质 |
|---|---|---|---|
| `computer-use` | `system.computer` 仅 Windows 最小档（screenshot/click/type/key） | 完整桌面控制（含 drag/scroll/多屏） | 能力档位差，不是没做 |
| 前端覆盖面 | 对话/工具卡/改动卡/交付卡/运行计划/任务/子agent/审批/附件/轨迹/主题/消息反馈/插件市场 | 66 个 `ui-*` 子包（含 11 个 settings 分区、目录选择器、i18n 等） | 自有实现，非一一对应 |
| i18n | **zh / en 双表全量清零**（`catalog.ts`，`en` 类型锁死缺键；`useT()` / `translate()` 统一入口），棘轮 `BASELINE=0` | 每个包 `.i18n.yaml` + 多语 README | 载体不同，能力已对齐 |
| 会话历史语义 | 「重新提问 / 编辑后重发」= 追加新问题 | dsh 是截断重放 | 有意差异：历史是 append-only 审计 jsonl |
| OS 级沙箱 | **权限档位 + 路径围栏 + 审批门**（应用级） | bwrap / landlock / seatbelt（内核级） | **明确不做**，见第三节 |

> 校准时间：**2026-11-05**。表中数字以**代码**为准，不以旧表为准。

---

## 一、agent 能力面 —— 已对齐

| dsh 包组 | 我们的实现 | 参考 |
|---|---|---|
| `todo` | `system.todo_write` 任务清单 | `4bb63c5` |
| `plan` | `system.present_plan` 计划审阅（exit_plan_mode） | `b9df150` |
| `goal` | `system.goal` 目标生命周期 | `04be65d` |
| `compaction` | LLM 结构化 checkpoint（非仅截断） | `2d1ee42` |
| `context` | 项目约定 `AGENTS.md` 注入 + 当前时间块 | `f7556bc` / `9eff7fd` |
| `jobs` | `JobRegistry` + `system.job`（list/status/**wait**/cancel）+ 面板；`wait` 靠 `onSubAgentSettled` 脱离 finalize 收量，避免死锁 | `54de836` / `ba0a3b2` / `75a3da93` |
| `fs` | `system.file_ops`（read/list/**grep**/**glob**/write/edit/delete/mkdir/copy/move）+ 路径围栏 + **读后写版本闸**（防覆盖用户手改）+ 三重检索上限 | `1ed37ec` / `449a6fae` / `f8df0255` |
| `fs-sandbox` | 工作区根可选 + 持久化（`cwd`） | `d14c2d7` |
| `shell` | `system.shell`（进程树终止 + 库保护） | `1ed37ec` / `e3f9c1b` |
| `sandbox` | `SandboxPolicy`（read-only / workspace-write）+ icacls | `e3f9c1b` |
| `terminal` | `system.terminal`（持久会话，非 PTY） | `6b7ab42` |
| `ssh` | `system.ssh`（薄包装） | `b62fba1` |
| `lsp` | `system.lsp`（definition/references/implementation/hover） | `e901459` |
| `web` | `system.web_fetch`（SSRF 防护 + HTML→文本）+ `system.web_search`（DuckDuckGo HTML，免 key） | `98fcce0` / 本轮 |
| `document` | `system.document`（docx/pptx/xlsx/**pdf**/文本） | `1682029` / 本轮 |
| `workflow` | `system.workflow`（有界步骤序列，每步过审批） | `53474b0` |
| `ptc-runtime` | `system.ptc`（QuickJS asyncify + `callTool`） | `812328d` |
| `mcp` | stdio + Streamable HTTP、Resources、连接监督、逐调用超时 | `3c159ef` / `1fd8e46` / `9d2057c` |
| `session` | `AgentSessionStore`（`turns.jsonl` 追加式） | 早期 Slice |
| `session-query` | `system.session_search`（FTS5，search/read/list） | `33f2b95` 等 |
| `subagent` | `system.spawn_subagent` + 多 provider + **structured_output**（schema 校验 + 一次修复重试）+ **跨轮冷恢复账本**（记录/对账/面板/重新派发预填） | Slice 31 / `d7e7b113` / `ec7dea36` / `a2f1e7c1` / `5fb7535d` |
| `skill` | `SkillDispatcher` / `SkillProtocol` | 早期 |
| `guard` | 原生 `ToolPostExecGuard`（`createRepeatToolReminderGuard`，按 sessionId 隔离、只提醒不否决）+ 权限判定 | 本轮（原生 post-exec 守卫） |
| `interaction` | `ask_user` + 审批 broker | 早期 |
| `ui-secret-mask` | `maskSecrets()` + DigitalPanel 发送前脱敏（密钥不进 LLM 上下文）+ **`agent:recentChanges` 出口投影**：`before/after` 回滚快照不出主进程、`itemName` 出口脱敏、存储原文不动 | 本轮 / `482c48be` |
| `deliverables` | 交付日志 + 内联交付卡 | 早期 |
| `feedback` | 评分 → 偏好库 | 早期 |
| `preset` | `AGENT_PRESETS` | 早期 |
| `storage` | SQLite（better-sqlite3）+ 文件 | 早期 |
| `settings` | 设置面板 | 早期 |
| `credentials` | `safeStorage` 钥匙串 | 早期 |
| `attachment` | 附件（name/mime/bytes，不落路径） | 早期 |
| `telemetry` | 操作日志（改动/交付） | 早期 |
| `experimental`（auto-review） | `preExecReview` LLM 预审 | 早期 |
| `spill` | 落盘 `.mb-spill/` + **头尾保留** + 单文件 400K 上限 + 数量(40)/时间(7天)双清理；落盘失败退化为内存截断 | 本轮 / `192f0601` |
| `computer-use` | `system.computer`（Windows：screenshot / click / type / key，SYSTEM 每次审批） | 本轮 |
| `llm-retry` | 模型请求**同 step 重放**（网络白名单 + 指数退避 + `stream_reset`），不重复 user 消息 | `a3521629` |
| `inbox` / `steer` | 运行中插话（主会话 inbox 接入；`accepted=false` 明确提示重发，不伪装成功） | `7d04e778` |
| `ui-jobs` / `ui-schedule` / 消息动作 | 后台任务看板、定时提醒分区、消息级「重新提问 / 编辑后重发」 | `42693a46` / `87a45f40` |
| `permission-presets` | 三档权限 + **切「完全访问」风险确认**（勾选才可提权）；运行中禁用 requery | `46d7ca0e` / `87a45f40` |
| `ui-tool` JSON 检查 | `JsonTree`：层级折叠 + 节点上限 200 + 原文切换（替代全量 stringify） | `b5966097` |
| `ui-theme` 样式守卫 | `styleRatchet` **15 项**（颜色/圆角/发丝线/字号档位/裸 px/焦点环…）、菜单材质与两条回落 | `f92ed369` / `46d7ca0e` / `9682c0fb` / `ed7ec281` |
| `browser-use` | `system.browser`（open / read / eval / screenshot，隐藏 BrowserWindow 驱动，**不用 Playwright**） | 本轮 |
| `schedule` | `system.schedule`（提醒 + cron）+ **会话页签提醒分区**（可见/可删；`fixParams` 别名改坏 `add` 的 bug 已修） | 本轮 / `42693a46` |

## 二、agent 能力面 —— 部分 / 最小档（诚实边界）

| dsh 包组 | 我们做到哪 | 差在哪 | 参考 |
|---|---|---|---|
| `sandbox`（内核级） | 应用级：`SandboxPolicy` + 路径围栏 + icacls 拒绝写 ACE + 审批门 | **没有 OS 级隔离**；主进程与工具执行共享同一 OS 身份。已定为不做，见三·补 | `e3f9c1b` |
| 子智能体 `structured_output` | 约束提示 + 父侧解析校验 + 一次修复重试 | dsh 在子作用域注册 `structured_output` 工具**强制**提交；我们是软约束，子级坚持输出散文时只能判失败 | `5fb7535d` |
| 子智能体跨轮冷恢复 | 记录留档 + 冷启动对账 + 面板可见 + 重新派发预填 | **不自动续跑**：远程/CLI provider 各有自己的 resume 协议，无统一抽象 | `d7e7b113` 等 |
| `computer-use` | Windows 最小档（screenshot / click / type / key） | 无 drag / scroll / 多屏 | 本轮 |

## 三、有意不做

| dsh 包组 | 原因 |
|---|---|
| `workflow`（完整引擎） | 只做有界步骤序列；完整 DAG 引擎与 agent 循环重复 |
| **OS 级内核沙箱** | 当前架构下不可行，正式定为不做（详见三·补），**不再列为「后续」** |
| `SettingsForm` staged 保存 | dsh 依赖「用户层作用域」，墨白是即时保存；照搬即假功能 |
| `ui-open-in-app` | Electron `shell.openPath` 已够 |
| 目录浏览选择器 | 桌面原生对话框够用 |
| session-projection 全量重放 | 会话是 append-only 审计日志，截断重放要重写 jsonl 且破坏审计 |
| `ReferenceChip`（@ 原子 token） | composer 是 textarea，做 chip 等于换 contenteditable 编辑器，不是小件 |
| Cordis 运行时 | 2026-11-02 已退役 `agent-core/src/dsh/`；守卫已原生化 |

### 三·补 OS 级沙箱：明确不做（2026-11-05 决策）

**现状（对外统一口径）**：墨白有的是**应用级约束**——`SandboxPolicy`（`read-only` / `workspace-write`）、
路径围栏（词法 + 文件身份双判定，防 `../` 与 Windows 8.3/大小写别名）、shell 期间对库目录加
「拒绝写入」ACE、权限档位审批门、`read-only` 下拒绝外部 CLI 子智能体。
主进程与工具执行**共享同一个 OS 身份**，所以这些都不是内核级隔离。
文档与界面一律称「权限档位 / 路径围栏」，**不宣称沙箱隔离**。

**为什么不能顺手补**：Linux 的 bwrap / landlock、macOS 的 seatbelt 都要求**在进程启动前**完成降权；
Windows 需要 AppContainer 或 Restricted Token，同样得是一个独立进程。而 Electron 主进程同时承担
UI、SQLite、IPC 与全局状态，无法对自己降权后继续工作。硬套只得到一个「看起来像」的假隔离。

**结论**：这不是「暂缓」，是**在当前架构下明确不做**。留着当「后续」会让人误判安全边界。

**若未来要重开**，前置条件是：把工具执行整体拆成独立受限子进程 → 全量 IPC 化 → 建立凭据与能力白名单，
属于架构改造 + 安全评审，必须单独立项，而不是加一个配置开关。

## 四、宿主 / 基础设施（不搬 dsh 包，本产品自有实现）

`api`（IPC 契约 + preload）· `host` / `extensions` / `sdk`（插件宿主与契约）· `boot` / `bundle`（Electron + electron-vite）·
`client` / `core` / `util` / `subprocess` / `test-support` / `typert` / `identity` / `acp` —— 这些是 dsh 的宿主层，
本产品有自己的对应实现，**未逐项对照**，也不建议为了「对齐」而搬。

---

## 五、如何验证

```bash
# 在仓库根
npm run test        # 单测（基线：3985 通过 / 6 跳过，361 个文件）
npm run typecheck   # tsc ×3
npm run lint        # eslint（0 警告，覆盖 app + shared + agent-core + client-ui）
env -u NODE_OPTIONS npm run build

# e2e 在 apps/desktop 下（别用 npx：会命中 npx 缓存里另一份 playwright）
cd apps/desktop && env -u ELECTRON_RUN_AS_NODE node node_modules/@playwright/test/cli.js test
```

技能总数以 `apps/desktop/src/main/stores.ts` 的 `dispatcher.register(...)` 段为准（当前 **25** 个）；
工具面在 e2e 里有两处写死清单（全量 25 / 本地档 8），**加技能时两处都要改**；
只给既有技能加 action（如 `file_ops grep` / `system.job wait`）不改数量。

其它当日基线：`e2e` **85 通过 / 2 跳过**；`styleRatchet` **15 项**恒 0；
`npm run test:components` 是组件层的秒级 inner loop。

## 六、相关文档

- `docs/agent-dsh-comparison.md` —— 逐能力的设计取舍与有意差异
- `docs/batch3-feasibility.md` —— 重项（ptc/workflow/browser-use/computer-use/schedule）的可行性评估
- `docs/plugin-architecture.md` —— 插件化与 slot 内核
