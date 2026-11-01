# dsh 能力对齐状态表（墨白可视化编辑）

> **口径**：本表对齐的是 dsh（`D:/GameEditorApp/deepseek-harness-master`）的**能力**，不是 vendoring 它的代码。
> 我们走 B 路线：读 dsh 源码 → 抽设计 → 用 React/TS 重写；仓库**零 dsh 依赖**。
> 维护约定：新增/调整一个 dsh 能力时，**同步更新本表**（含 commit 与测试）。

## 结论

dsh 的 **52 个包组**里，与「agent 能力面」相关且**可移植、有价值**的项已全部落地；
宿主/基础设施类由本产品自有实现承载；**唯一有意不做的是 `computer-use`**（桌面 GUI 控制）。

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
| `document` | `system.document`（docx/pptx/xlsx/文本） | `1682029` |
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

## 二、agent 能力面 —— 部分 / 最小档

| dsh 包组 | 我们做到哪 | 差在哪 | 参考 |
|---|---|---|---|
| `browser-use` | `system.browser`（`open` 打开 URL） | 无 Playwright：不点击/不填表/不截图/不取文本 | `11f3e2e` |
| `schedule` | `system.schedule`（提醒：到点弹通知） | 不是 cron 调度器：**不自动跑 agent**（无头运行处理不了审批） | `11f3e2e` |
| `document`（PDF） | docx/pptx/xlsx/文本 | **PDF 明确 `EUNSUPPORTED`**（需额外库） | `1682029` |

## 三、有意不做

| dsh 包组 | 原因 |
|---|---|
| `computer-use` | 桌面 GUI 控制（截屏 + 鼠标键盘）：风险最高、单用户桌面产品收益不明 |
| `workflow`（完整引擎） | 只做有界步骤序列；完整 DAG 引擎与 agent 循环重复 |
| `schedule`（cron） | 需常驻调度器 + 持久化 + UI，属产品功能而非能力移植 |

## 四、宿主 / 基础设施（不搬 dsh 包，本产品自有实现）

`api`（IPC 契约 + preload）· `host` / `extensions` / `sdk`（插件宿主与契约）· `boot` / `bundle`（Electron + electron-vite）·
`client` / `core` / `util` / `subprocess` / `test-support` / `typert` / `identity` / `acp` —— 这些是 dsh 的宿主层，
本产品有自己的对应实现，**未逐项对照**，也不建议为了「对齐」而搬。

---

## 五、如何验证

```bash
cd desktop
npm run test        # 单测（基线：3706 通过 / 6 跳过）
npm run typecheck   # tsc ×3
npm run lint        # eslint（0 警告）
env -u NODE_OPTIONS npm run build
env -u ELECTRON_RUN_AS_NODE npx playwright test   # e2e
```

## 六、相关文档

- `docs/agent-dsh-comparison.md` —— 逐能力的设计取舍与有意差异
- `docs/batch3-feasibility.md` —— 重项（ptc/workflow/browser-use/computer-use/schedule）的可行性评估
- `docs/plugin-architecture.md` —— 插件化与 slot 内核
