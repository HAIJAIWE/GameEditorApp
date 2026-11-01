# dsh 能力对齐状态表（墨白可视化编辑）

> **口径**：本表对齐的是 dsh（`D:/GameEditorApp/deepseek-harness-master`）的**能力**，不是 vendoring 它的代码。
> 主线仍是 B 路线：读 dsh 源码 → 抽设计 → 用 React/TS 重写。
> **2026-11-02 修订**：解除"零 dsh 依赖"——允许以 npm 依赖在其原生 cordis 运行时里**进程内**跑
> dsh 插件（首个：`guard/repeat-tool-reminder`，见 `packages/agent-core/src/dsh/`）。
> 维护约定：新增/调整一个 dsh 能力时，**同步更新本表**（含 commit 与测试）。

## 结论

dsh 的 **52 个包组**里，与「agent 能力面（后端）」相关且**可移植、有价值**的项已全部落地；
宿主/基础设施类由本产品自有实现承载。

**前端不是"对齐 dsh 的 66 个 `ui-*` 包"，而是按本产品需要自有实现**（详见 `docs/dsh-ui-comparison.md`）。
差异最大的三处，先在这里说清，免得读表时误判：

| 项 | 我们 | dsh | 性质 |
|---|---|---|---|
| `computer-use` | `system.computer` 仅 Windows 最小档（screenshot/click/type/key） | 完整桌面控制（含 drag/scroll/多屏） | 能力档位差，不是没做 |
| 前端覆盖面 | 对话/工具卡/改动卡/交付卡/运行计划/任务/子agent/审批/附件/轨迹/主题/消息反馈/插件市场 | 66 个 `ui-*` 子包（含 11 个 settings 分区、目录选择器、i18n 等） | 自有实现，非一一对应 |
| i18n | 无（仅中文） | 每个包 `.i18n.yaml` + 多语 README | 有意不做 |

> 校准时间：2026-11-01（A1/A1.5/A2/A3 之后）。表中数字以**代码**为准，不以旧表为准。

---

## 一、agent 能力面 —— 已对齐

| dsh 包组 | 我们的实现 | 参考 |
|---|---|---|
| `todo` | `system.todo_write` 任务清单 | `4bb63c5` |
| `plan` | `system.present_plan` 计划审阅（exit_plan_mode） | `b9df150` |
| `goal` | `system.goal` 目标生命周期 | `04be65d` |
| `compaction` | LLM 结构化 checkpoint（非仅截断） | `2d1ee42` |
| `context` | 项目约定 `AGENTS.md` 注入 + 当前时间块 | `f7556bc` / `9eff7fd` |
| `jobs` | `JobRegistry` + `system.job` + 面板（跨轮） | `54de836` / `ba0a3b2` |
| `fs` | `system.file_ops`（读写编辑）+ 路径围栏 | `1ed37ec` |
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
| `subagent` | `system.spawn_subagent` + 多 provider | 早期 Slice 31 |
| `skill` | `SkillDispatcher` / `SkillProtocol` | 早期 |
| `guard` | repeat-guard / 权限判定 | 早期 |
| `interaction` | `ask_user` + 审批 broker | 早期 |
| `deliverables` | 交付日志 + 内联交付卡 | 早期 |
| `feedback` | 评分 → 偏好库 | 早期 |
| `preset` | `AGENT_PRESETS` | 早期 |
| `storage` | SQLite（better-sqlite3）+ 文件 | 早期 |
| `settings` | 设置面板 | 早期 |
| `credentials` | `safeStorage` 钥匙串 | 早期 |
| `attachment` | 附件（name/mime/bytes，不落路径） | 早期 |
| `telemetry` | 操作日志（改动/交付） | 早期 |
| `experimental`（auto-review） | `preExecReview` LLM 预审 | 早期 |
| `spill` | 超长工具输出落盘 `.mb-spill/` + 头部预览 + 引用（可再用 `file_ops` 读） | 本轮 |
| `computer-use` | `system.computer`（Windows：screenshot / click / type / key，SYSTEM 每次审批） | 本轮 |
| `browser-use` | `system.browser`（open / read / eval / screenshot，隐藏 BrowserWindow 驱动，**不用 Playwright**） | 本轮 |
| `schedule` | `system.schedule`（提醒 + **cron 表达式**：`*/5 * * * *` 等，到点弹通知） | 本轮 |

## 二、agent 能力面 —— 部分 / 最小档

| dsh 包组 | 我们做到哪 | 差在哪 | 参考 |
|---|---|---|---|

## 三、有意不做

| dsh 包组 | 原因 |
|---|---|
| `workflow`（完整引擎） | 只做有界步骤序列；完整 DAG 引擎与 agent 循环重复 |

## 四、宿主 / 基础设施（不搬 dsh 包，本产品自有实现）

`api`（IPC 契约 + preload）· `host` / `extensions` / `sdk`（插件宿主与契约）· `boot` / `bundle`（Electron + electron-vite）·
`client` / `core` / `util` / `subprocess` / `test-support` / `typert` / `identity` / `acp` —— 这些是 dsh 的宿主层，
本产品有自己的对应实现，**未逐项对照**，也不建议为了「对齐」而搬。

---

## 五、如何验证

```bash
# 在仓库根
npm run test        # 单测（基线：3746 通过 / 6 跳过）
npm run typecheck   # tsc ×3
npm run lint        # eslint（0 警告，覆盖 app + shared + agent-core + client-ui）
env -u NODE_OPTIONS npm run build

# e2e 在 apps/desktop 下（别用 npx：会命中 npx 缓存里另一份 playwright）
cd apps/desktop && env -u ELECTRON_RUN_AS_NODE node node_modules/@playwright/test/cli.js test
```

技能总数以 `apps/desktop/src/main/stores.ts` 的 `dispatcher.register(...)` 段为准（当前 **25** 个）；
工具面在 e2e 里有两处写死清单（全量 25 / 本地档 8），加技能时两处都要改。

## 六、相关文档

- `docs/agent-dsh-comparison.md` —— 逐能力的设计取舍与有意差异
- `docs/batch3-feasibility.md` —— 重项（ptc/workflow/browser-use/computer-use/schedule）的可行性评估
- `docs/plugin-architecture.md` —— 插件化与 slot 内核
