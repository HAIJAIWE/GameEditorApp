# A 档立项方案（AI/Agent 引擎 + 库管理）

> 用途：A 档（迁移剩余量中最大的一块）的**方案设计事实来源**。开工前先读本文，完成一期回写本文进度并同步 `ts-migration-roadmap.md` 与 `project_memory.md`。
> 调研基线：Python 侧 299 文件 / 78,746 行（本文行数据均为**非空行**计数，与路线图口径一致）；TS 侧 `desktop/src` 87 文件 / 19,884 行（≈25%）。
> 调研方式：3 个只读子代理并行盘点（core/agent、数字员工 UI + features、库管理），关键结论均带 `文件:行号` 证据。

---

## 0. 结论先行：**不需要 1:1 复刻 21,669 行**

把 A 档 21,669 行（core/agent，实测 97 文件）按「迁移价值」三分：

| 分类 | 行数当量 | 处置 | 判据 |
|---|---|---|---|
| **必修：核心契约** | ≈6,000–8,000 | 逐函数语义迁移 | 技能注册/调度协议、LLM 循环与提示词骨架、SafetyGuard 语义、会话/记忆持久化 schema、工具白名单 |
| **重设计：用 TS 生态替代** | ≈7,000–8,000 | 只保留对外契约，内部重写 | 代码执行沙箱、自研向量检索、MCP、诊断/自愈（4.5k 行） |
| **砍掉：死代码/胶水/命名不符实** | ≈3,000–4,000 | 不移植 | 有 `文件:行号` 证据（见 §2.2） |
| 其余 | ≈3,000 | 按需 | 与业务无关的实验/预览类技能 |

**核心理由**：这 21,669 行有三大块「Python 专有」成分，照搬过来在 TS 里既无意义也不可能——
1. **PyQt 胶水**：`frontend_snapshot.py`(431) 大半是内省 `main_window`；`digital_panel_theme.py`(318) 是 QSS 样式注入；`ai_bridge.py`(103) 只是初始化；`digital_panel_state.py`(222) 全是类型桩。
2. **被黑名单兜底的假安全**：执行沙箱并非自造解释器，而是 `subprocess.run([sys.executable, script])`（`security/sandbox.py:166`）+ 正则黑名单（`:36` 含 `eval/exec/open/importlib`）——**黑名单可绕**，且 `_SAFE_COMMANDS`(`shell_skill.py:14`) 与沙箱规则两套并存。TS 侧已有 quickjs-emscripten WASM 沙箱（默认零宿主能力 + 超时 + 内存上限，实测可终止死循环/内存炸弹），**应整体替换而非复刻**。
3. **自研替代品**：向量检索是 ngram + TF-IDF 哈希自研（`memory_embedder.py:11`），TS 侧已选定 vectra 0.15（纯 TS + 文件持久化）。

另外，**没有任何一处用 `exec/eval` 执行 LLM 生成的 Python**（`security_healer.py:79-87` 只是字符串检测），所以「LLM 代码执行」这块的真实复杂度低于想象；真正的风险点是**自愈改码会直接改写源文件**（`tool_repair.py:786-792`：`content.replace` 后 `open(w)` 写回，无原子回滚），这个能力在 TS 里要么重设计成「结构化错误 → 单步重试」，要么明确不做。

---

## 1. 能力域地图（core/agent，97 文件 / 21,669 行）

| 分组 | 文件数 | 行数 | 代表文件 | 迁移判定 |
|---|---|---|---|---|
| 顶层杂项 | 19 | 4,775 | `dispatcher`、`brain`、`intent`、`prompts`、`safety_guard`、`mcp`、`workspace`、`frontend_snapshot` | dispatcher/prompts/safety_guard 必修；frontend_snapshot/mcp 重设计 |
| `brain*` | 8 | 1,637 | `brain_llm`(415)、`brain_plan`、`brain_session`、`brain_state` | 必修（LLM 循环 + 会话状态机） |
| `memory*` | 9 | 1,311 | `memory_vector`、`memory_embedder`、`semantic_memory` | 重设计（→ vectra） |
| `skills/` | 34 | 7,490 | `game_data_skill`(903)、`system_skill`(564)、`image_skill`(425)、`pdf_parse_skill`(415) | 按业务择需迁移（见 §2.3） |
| `diagnostics/` | 14 | 3,566 | `error_handler`(815)、`problems_and_diagnostics`(661)、`predictive`(359) | 重设计（降级为「错误分类 + 单步重试」） |
| `tools/` | 4 | 1,749 | `tool_repair`(1,011)、`tool_advanced`(729) | 重设计/部分砍 |
| `agents/` | 5 | 656 | `agent_manager`(277)、`subagent_engine`(185) | 必修（多智能体路由的最小内核） |
| `workflow/` | 3 | 484 | `workflow_engine`(274) | 延后（无 UI 消费者则不做） |

**外部消费者只有 UI 一处**：`ui/ai_bridge.py:16`（构造 `AgentBrain` 并 `boot()`）、`ui/digital_employee.py:45/86/280`、`ui/digital_panel_tasks.py:187/197`、`ui/ceshu/*`（`CeshuSkill`）、`ui/widgets/team_dialog.py:30`。→ 迁移只需重实现这些入口，不必关心 UI 内部细节。

---

## 2. A1：AI/Agent 引擎

### 2.1 迁移策略总纲

**保留「契约」，替换「实现」**：TS 侧重新定义 4 个稳定接口，Python 的具体实现只作为语义参考。

```
1) SkillProtocol   : { id, name, description, parameters(JSON Schema), requiresMainThread?, execute(params, ctx) }
2) Dispatcher      : execute(toolId, params) → 危险操作二次确认 + 结构化错误
3) Brain           : process(input, ctx) → 事件流（step_start / stream_chunk / step_done / done / error）
4) SessionStore    : 会话与记忆持久化（JSON/SQLite + 原子写 + 串行队列，沿用既有存储纪律）
```

### 2.2 明确「不移植」清单（带证据）

| 目标 | 行数 | 证据 | 理由 |
|---|---|---|---|
| `core/agent/code_sandbox.py` | 202 | 全项目零 `import`（仅自身命中），且与 `security/sandbox.py:29` 的 `CodeSandbox` 重复实现 | 死代码，直接删 |
| `diagnostics/llm_healer.py` | 148 | `:45 suggest()` 内部只走 `:65 _heuristic_fix()` 的 if-else，**从不调 LLM** | 名不符实；只保留启发式规则表 |
| `ui/digital_panel_state.py` | 222 | `:69-232` 全是类型桩，零业务 | Python 类型胶水 |
| `ui/digital_panel_theme.py` | 318 | QSS/文档样式注入 | 换成 Tailwind/CSS 变量 |
| `ui/ai_bridge.py` | 103 | `:16-117` 初始化 + 窗口定位 | 由 Electron 主进程吸收 |
| `frontend_snapshot.py` 的内省部分 | ≈300 | `:100/275` QMessageBox/QApplication、`:166 generate_maps_text` | PyQt 内省胶水 |
| `brain_llm.py:299-300` 的放行分支 | — | `reply is None` 时**直接放行危险操作** | 缺陷，不复刻（TS 侧改为默认拒绝） |
| `plan_ready` 分支 | — | `ui/digital_panel_chat.py:43`，全 `src` 无发射方 | 死分支 |

### 2.3 分期切片（每期独立可验证）

| 期 | 范围 | 主要产物 | 验收（可与现有验证命令合并） |
|---|---|---|---|
| **A1-1** | 技能协议 + 调度器内核：`SkillProtocol`、注册表、`Dispatcher.execute`（含危险操作确认、结构化错误）、3 个最小内置技能（读数据表 / 写数据表 / 读策划书） | `shared/agent/protocol.ts`、`main/agent/dispatcher.ts` + 单测（注册/解析/危险确认/错误分类） | 单测锁定「未知技能 / 参数缺失 / 危险未确认」三类文案；E2E 走 IPC 执行一个只读技能 |
| **A1-2** | Brain 循环 + 事件流 + LLM 工具调用：`process()` 事件流（step/stream/done/error）、ollama 工具调用协议、提示词骨架（`prompts.py` 语义） | `shared/agent/brain.ts`、`main/agent/brain*.ts` + **Ollama 桩服务 E2E**（沿用 W30 技法） | 桩服务返回工具调用 → 断言 step 事件序列与最终文本 |
| **A1-3** | 会话与记忆：会话持久化（原子写 + 串行队列）、工作区目录、vectra 语义检索接入 | `main/agent/sessionStore.ts`、`main/agent/memory.ts` + 单测 | 落盘结构断言；检索命中/未命中；损坏文件抛中文错误（沿用既有纪律） |
| **A1-4** | 数字员工面板（UI 主线）：对话气泡 + 流式文本 + 折叠步骤 + 任务列表 + 三类确认（危险确认 / 参数澄清 / 删除确认） | `renderer/src/components/digital/*`（markdown 渲染、步骤折叠、任务面板、审批模态） | E2E：桩服务驱动一轮「思考→工具→结果」，含危险操作确认拦截 |
| **A1-5** | 业务技能接线（按现有域择需）：策划书技能（已散落在 `ceshuAi`/`ceshuDataGen`，改为走统一协议注册）、数据表技能、导出技能；托盘/全局热键（Electron `Tray` + `globalShortcut`） | `main/agent/skills/*`、`main/tray.ts` | 每个技能一条 E2E；托盘/热键仅在 smoke 层断言存在 |

**切片原则**：A1-1/A1-2 是地基（先做，且能用桩服务端到端验证）；A1-3 独立；A1-4 依赖 A1-2；A1-5 是「把已有能力注册进新协议」的收口，不新增业务语义。

### 2.4 技术选型（已有预演资产，直接复用）

| 需求 | 选型 | 现状 |
|---|---|---|
| 安全执行不可信代码 | `quickjs-emscripten`（WASM） | ✅ `main/security/jsSandbox.ts` 已预演（死循环/内存炸弹被终止） |
| 本地 LLM | `ollama` JS 客户端 | ✅ `main/llm/client.ts`（未启动给中文可操作提示） |
| 语义检索 | `vectra` 0.15 | ✅ 已预演；替代自研 ngram/TF-IDF |
| 托盘 / 全局热键 | Electron `Tray` + `globalShortcut` | 待接 |
| Markdown / 代码高亮 | react-markdown + 高亮库 | 待接（替代 QTextDocument + Pygments） |

### 2.5 风险与缓解

| 风险 | 缓解 |
|---|---|
| 「自愈改码」能力缺失导致体验回退 | **拍板：完全不做自愈**（见 §6 拍板结论）——工具报错直接回传 LLM 让其重新规划一次；**不做参数自动修正重试、不做自动改写源文件**（Python 那套无原子回滚，属危险设计） |
| 技能数量多（34 个）导致范围失控 | 按业务择需迁移，先只做 A1-1 的 3 个最小技能；其余按「有 UI 入口才做」筛选 |
| 富文本/草稿格式与 Python 不兼容 | 草稿序列化改为 markdown 源文（Python 存的是 `content_html`，`digital_panel_workspace.py:200/257`）；**旧草稿不迁移**（明确声明） |
| 线程模型差异（QThread → 事件流） | 用「主进程事件推送 + 渲染层订阅」替代跨线程信号；取消 = 中断 LLM 请求 + 丢弃后续事件 |
| 与已迁移的 AI 能力重复 | 现有 `ceshuAi.ts` / `ceshuDataGen.ts` 的提示词与解析逻辑**保留为纯函数**，A1-5 只做「注册进协议」，不搬家 |

---

## 3. A2：库管理（多库）

### 3.1 Python 语义（要点，带证据）

- **布局**：`data/libraries/<库名>/` 下含 `default.json`（游戏数据，顶层复数键 + metadata）、`type_schema.json`、`library.json`（元数据：`name/path/created_at/description/data_count/is_initial`，`library_manager.py:32-40`）、`planning/…`、`ceshu/<id>.json`、`ceshu_notes/<id>.json`、`attr_system.json`、`.workspace/`。
- **活跃库指针**：`data/libraries/.active_library` 纯文本（`:439`），启动 `restore_active_library`（`:448`）失败回退 `初始库`（`INITIAL_LIBRARY_NAME`，`:14`）。
- **生命周期**：`scan_libraries:148` / `create_library:392` / `rename_library:487` / `delete_library:508`（**初始库禁删** `:515` + UI 锁 `library_bar.py:267`；**至少留一库** `:271`；**非空库无保护**）/ `switch_library:425` / `copy_data_from_library:618`（UI 侧只一处入口）。
- **切换联动顺序**（`library_controller.py:14-45`）：重载数据 → 更新 id 计数器 → 失效缓存 → 重载各 tab → 切换 Agent 工作区 → 刷新数字员工面板 → 刷新库条；schema 变更广播 `schema_changed`（`library_manager.py:118/144`）。
- **迁移难点（全局态）**：`AppConfig` 单例持有 manager（`settings.py:140/171/257`）、`LibraryManager._active_library` 可变全局态（`:59/430`）、`DATA_TYPES` 进程级常量被**就地改写**（`:108-114`）、`AgentWorkspace` 单例自带硬编码 `data/libraries` 根（`workspace.py:37/39`，与 manager 双源）、`brain._session_dir` 构造时定死（`brain.py:82-84`）。

### 3.2 TS 目标设计

```
userData/
  libraries.json            # 库注册表：{ activeLibrary: "初始库", libraries: [{ name, createdAt, description, isInitial }] }
  libraries/
    <库名>/
      mb-editor.db          # 数据表（SQLite，WAL）
      type_schema.json
      ceshu/                # 策划书
      ceshu_notes/          # 章节笔记
      ceshu_templates/      # 自定义模板
      attr_system.json      # 属性系统
```

- **库服务**（主进程）：`list / create / rename / remove / switch / active`，规则与 Python 对齐：初始库禁删、至少留一库、重命名时同步目录。
- **切换广播**：新增 `library:changed` 事件（主进程 → 渲染层），渲染层收到后清缓存并重载全部视图；**主进程内各 store 不再持路径，改为持「库服务 + 相对路径」**，避免 Python 那种双源全局态。
- **IPC**：`library:list/create/rename/remove/switch`（5 处接线纪律照旧）。

### 3.3 最小改动清单

1. `main/index.ts:64-73`：各 store 构造参数由平铺路径改为 `libraries/<active>/…`（db / ceshu / ceshu_notes / ceshu_templates / type_schema / attr_system **六处**统一前缀）。
2. 新增 `main/library/manager.ts` + `main/library/store.ts`（注册表 + 原子写）。
3. 新增 `library:*` IPC 与 `library:changed` 广播；渲染层加库选择条（新建/重命名/删除/切换 + 初始库禁用删除）。
4. 启动恢复活跃库；首次启动自动建 `初始库`。

### 3.4 明确「不做」清单（带证据）

| 目标 | 证据 | 理由 |
|---|---|---|
| schema 自动升级/旧库迁移三件套（`_upgrade_library_schema` / `_add_new_type_data` / `migrate_legacy_library` / `force_upgrade_all_schemas`，`:196-280`、`:566-605`） | 占 manager 近半代码 | 纯向后兼容；TS 是全新存储，无历史包袱 |
| 整库「导入数据」`copy_data_from_library`（`:618` 起） | UI 仅 `library_bar.py:289-378` 一处入口，去重逻辑复杂 | 低价值，先不做 |
| 初始库示例数据填充（`:341-389`）、`samples/` | 仅初始库存在样本 | 不迁移样本数据 |
| `data/custom_templates/`（全局而非按库） | `custom_template_manager.py:3/31` | TS 改为**按库**（更正确，属有意偏离） |

### 3.5 分期

| 期 | 范围 | 验收 |
|---|---|---|
| **A2-1** | 库服务 + 注册表 + 存储路径迁移到 `libraries/<库>/` + 启动恢复 | 单测（创建/重命名/删除保护/切换持久化）+ E2E（新建库 → 切换 → 数据与策划书互相隔离 → 重启保持活跃库） |
| **A2-2** | 渲染层库条（新建/重命名/删除/切换）+ `library:changed` 重载 + 现有 E2E 回归 | E2E 全量回归（既有 31 条不得回归）+ 新增库条用例 |

### 3.6 风险

| 风险 | 缓解 |
|---|---|
| 现有单库用户数据需要搬迁 | 提供一次性迁移：若发现 `userData/mb-editor.db` 等平铺文件且无 `libraries/`，自动搬到 `libraries/初始库/`；失败则保留原文件并给中文错误 |
| 切换库时渲染层状态残留 | 统一走 `library:changed` 广播 → 各视图 `key` 或显式重载；E2E 断言「切换后旧库条目不可见」 |
| 路径变更触及 6 个 store 与全部既有 E2E | A2-1 只改路径不改业务；先跑通全量 31 条 E2E 再进 A2-2 |

---

## 4. 建议执行顺序（**已拍板：A 档整体后置，先清 B 档小件**）

> 拍板结论（2026-10-04）：**先清 B 档小件（W31 预设市场/竞品图表 → 系统依赖确认/数据同步 → 首页卡片 → 迁移工具），A 档整体后置**。因此下面「先 A2 后 A1」的排序改为 A 档内部排序建议，等 B 档清完再启动 A2-1。

**A 档内部：先 A2 后 A1**，理由：
1. A2 改动集中（6 处 store 前缀 + 一个库服务），**越早做越省事**——现在只有单库数据要搬，A1 做完再改路径会把 AI 会话/记忆也拖进来。
2. A2 完成后能给 A1 提供「按库隔离的 Agent 工作区与会话目录」，避免 A1 里再做一次路径改造。
3. A1 体量大且需分期（5 期），适合在存储地基稳定后连续推进。

> 若更希望先看到 AI 能力，可改为「A1-1/A1-2 先行（纯逻辑 + 桩服务可验证，不碰存储路径），随后 A2，再回 A1-3 起的会话/记忆」。此路线风险是 A1-3 的会话目录要跟着 A2 改一次。

---

## 5. 与现有迁移纪律的衔接

- 每一期仍走固定流程：调研 → `shared/` 纯逻辑 → 单测 → IPC 5 处接线 → UI → E2E → 全量验证 → 回写台账/记忆 → 提交（只 `git add desktop`）。
- 子代理并行约定照旧：接线文件禁止子代理改；子代理只新增互不重叠的 `shared/<模块>.ts` + 单测。
- **LLM 相关 E2E 一律用 Ollama 桩服务**（W30 已验证可行：`node:http` 假 `/api/tags` + `/api/generate`，并收集 prompt 断言提示词组装）。
- 每期完成必须回写：本文对应期次状态 + `ts-migration-roadmap.md` §1 台账与 §6 排期。

---

## 6. 进度（回写区）

| 期次 | 状态 | 提交 | 备注 |
|---|---|---|---|
| 调研（本文） | ✅ 完成 | — | 3 子代理并行盘点；核验 `core/agent` 97 文件 / 21,669 行、`library_manager.py` 626 行 |
| A2-1 库服务与路径迁移 | ✅ 完成（**降级验证**） | `bd9d2d9` | `main/library/{store,manager,migrate}.ts`（注册表 + 库服务 + 一次性搬迁，单测 15）+ 六处 store 统一改为 `libraries/<活跃库>/…` + `main/index.ts` 抽出 `buildStores()`/`activateLibrary()` + IPC `library:list/create/rename/remove/switch` + `disposeIpcHandlers()` 支持切换后重建 + `library:changed` 广播；**E2E 未写**（见落地记录） |
| A2-2 库条 UI 与切换联动 | ✅ 完成（**降级验证**） | `<PENDING_HASH>` | `components/LibraryBar.tsx`（新建/重命名/删除/切换 + 初始库禁删 + 中文错误展示）+ App 侧栏挂载 + `library:changed` → 整页重载 + E2E `library-bar.spec.ts`（3 例，沙箱未实跑） |
| A1-1 技能协议 + 调度器 | ✅ 完成 | `20ec1ff` | `shared/agent/protocol.ts`（协议/风险策略/参数修正，单测 18）+ `main/agent/dispatcher.ts`（注册表/模糊解析/危险确认门，单测 15）+ 2 个 action-based 技能（`system.game_data` 读写数据表 / `system.ceshu` 只读策划书，单测 13）+ IPC `agent:listTools`/`agent:executeTool` + E2E `agent-execute-tool.spec.ts`（沙箱未实跑） |
| A1-2 Brain 循环 + 事件流 | ✅ 完成 | `a377e3c` | `shared/agent/brain.ts`（事件流 + 循环纯逻辑，单测 19）+ `shared/agent/prompts.ts`（提示词骨架）+ `main/agent/ollamaTransport.ts`（`/api/chat` NDJSON 流式 + tool_calls）+ `main/agent/brainService.ts`（调度器适配）+ IPC `agent:chat` + E2E `agent-brain-chat.spec.ts`（`/api/chat` 桩两轮，沙箱未实跑） |
| A1-3 会话与记忆 | ✅ 完成 | `7794a84` | `shared/agent/session.ts`（快照/截断纯逻辑）+ `main/agent/sessionStore.ts`（原子写 + 串行队列 + 严格/容错两档读取 + metrics.jsonl）+ `shared/agent/memory.ts`（确定性 n-gram 嵌入）+ `main/agent/memoryStore.ts`（vectra 索引）；接入 `AgentBrainService`（记忆注入 + 会话落盘 + 问答回写）；单测 22 |
| A1-4 数字员工面板 | ✅ 完成 | `c38199b` | `shared/agent/panel.ts`（事件流 → 面板视图模型纯归约，单测 13）+ `main/agent/approvalBroker.ts`（审批中转，单测 6）+ `renderer/src/components/digital/DigitalPanel.tsx` + App 第三模式 `mode-digital` + IPC `agent:approvalResponse`/`agent:sessionInfo|Restore|Clear` + 主进程 `agent:event` 推送 + E2E `agent-digital-panel.spec.ts`（2 例，沙箱未实跑） |
| A1-5 业务技能接线 + 托盘/热键 | ✅ 完成 | `26b217f` |
| A1-4b 交互通道补完（参数澄清 + 删除确认） | ✅ 完成 | `ac2c6ec` |
| A1-5b 收尾三项（策划书删/导出 + 交互超时 + 托盘图标资源） | ✅ 完成 | `b7a0a47` | `system.ceshu` 补 `delete`（confirm 交互）/`export`（导出到默认目录并回报路径）+ 交互**超时保护**（默认 120s，超时按未答复回落）+ `resources/tray-icon.png` 正式图标（脚本生成 + 位图兜底）；单测 +8 | 统一 `SkillResult.interaction`（`confirm`/`question`）→ Brain `interaction_required` 事件 + 复用审批 broker 回传答复；生产者：`system.game_data.delete`（confirm，批准后带 `confirm:true` 重执行）+ `tool.ask_user`（question，答复回灌为工具结果）；面板交互模态；单测 +17 | `system.code`（jsSandbox，**SYSTEM 级**，单测 9）+ `system.ceshu` 补 `create`/`update`（单测 3）+ `main/tray.ts`（Tray + `Ctrl+Shift+M`，防御式）+ **补齐 A1-4 遗留的审批端到端拦截 E2E**（拒绝→不执行 / 批准→真执行，见 `agent-digital-panel.spec.ts`） |

### A2-2 落地记录（2026-10-04）· A 档收官

**产物**：`components/LibraryBar.tsx`（`library-select` 切换 + 新建/重命名/删除 + 初始库禁删 + 错误展示）、App 侧栏挂载、`library:changed` → **整页重载**、E2E `library-bar.spec.ts`（3 例：切换隔离 / 重启保持活跃库 / 非法名被拒）。

**有意偏离 / 关键决策**：
1. **校验口径：主进程是唯一权威**。渲染层只做「非空 + ≤40 字」的按钮启用预检（UX），真正的拒绝理由一律展示主进程返回的中文错误——**刻意不做两份校验规则**（漂移风险大于收益）。
2. **切换后整页重载**（`window.location.reload()`）而非逐视图刷新：主进程此时已重建全部 store，整页重载让数据表/策划书/属性系统/数字员工都从新库重新拉取，**零刷新逻辑**且不可能漏掉某个视图。代价是丢失 UI 局部状态（当前页签/滚动位置）——但切库本身就是上下文切换，可接受。方案原文写的是「清缓存并重载全部视图」，此处取最朴素实现。
3. 初始库删除按钮 `disabled` + `title` 说明，同时主进程仍会拒绝（**UI 禁用只是不给无效入口，服务端才是防线**）。

**降级验证说明**：3 例 E2E 已写但**沙箱 Electron 起不来**（`Process failed to launch!`），故端到端未验；A2-2 本身无新增纯逻辑单测（组件行为依赖真实 IPC）。

### A2-1 落地记录（2026-10-04）· 降级验证

**🎯 验证口径（重要）**：本沙箱 Electron 起不来（全部既有 E2E 都报 `Process failed to launch!`），故本刀按**降级验证**交付：**存储布局/生命周期/搬迁逻辑全部由单测覆盖**（15 例），E2E 断言留待 CI。**这不是「已验证完成」，是「逻辑已验证、端到端未验」**。

**产物**：
- `main/library/store.ts`：`LibraryRegistryStore`（`libraries.json` 原子写 + 串行队列；`readStrict` 抛中文错误 / `read` 容错回落默认）；`INITIAL_LIBRARY_NAME`。
- `main/library/manager.ts`：`LibraryManager`（list/active/activeDir/dirOf/ensureReady/create/rename/remove/switch）+ `validateLibraryName`。
- `main/library/migrate.ts`：`migrateFlatToLibraries`（平铺 → `libraries/<初始库>/`，幂等、可回退）。
- `main/index.ts`：抽出 `buildStores(libDir)` + `activateLibrary()`；**六处 store 统一改前缀**（db / ceshu / ceshu_notes / ceshu_templates / type_schema / attr_system），并**顺势把 Agent 会话与记忆也落到库内**（`<库>/agent`，A1-3 预留的那一处注入点兑现）。
- `main/ipc.ts`：新增 `disposeIpcHandlers()`（记录已注册通道并统一注销）——切换库需重建 store，而 handler 闭包捕获了 deps，**无法就地替换，只能注销后重注册**。
- IPC `library:list/create/rename/remove/switch` 五处接线 + 主进程 `library:changed` 广播。

**有意偏离 / 设计决策**：
1. **路径只由库服务产出**，各 store 不再自己算路径（Python 是 manager + workspace 双源全局态）。
2. **库名参与拼路径 → 强校验**：非空、≤40 字、禁 `\ / : * ? " < > |`、禁 `..`、禁点开头。这既是可用性也是**删除目录的越界防护**（保证删除目标必落在 `libraries/` 之内）。
3. **删活跃库先切回初始库再删**（Python 无此分支）：不隐式删掉用户当前所在的库。
4. **switch 采用「注销并重注册 IPC」**而非可变全局 deps：与「避免全局可变态」的取向一致，代价是切换时重建全部 store（本地场景开销可接受）。
5. **搬迁失败不阻塞启动**：抛中文错误并保留原文件，以新结构空库启动 + 控制台留因（搬一半比不搬更糟，但也不该让应用起不来）。
6. 未移植（§3.4 已列）：schema 升级三件套、整库导入、初始库样本数据、全局模板目录（TS 改为按库，属有意偏离）。

**未完成（明示）**：
- **A2-1 的 E2E 未写**（「新建库 → 切换 → 数据/策划书互相隔离 → 重启保持活跃库」）：逻辑层已有单测，端到端用例待 CI 环境。
- **A2-2（渲染层库条 UI）未开始**：`library:*` IPC 已就绪，但界面还没有入口——**当前用户无法在 UI 上切库**，只能用 IPC。

### A1-5b 落地记录（2026-10-04）· 收尾三项

**1. `system.ceshu` 补 `delete` / `export`**
- `delete`：与 `system.game_data.delete` 同一取向——未带 `confirm: true` 时返回 **confirm 交互**，批准后重执行（复用 A1-4b 通道）。
- `export`：注入导出管道（`exportCeshuDocument`）+ 默认导出目录 `userData/exports`，**Agent 场景无人点「另存为」**，故导出到默认目录并回报绝对路径与字节数；文件名做安全化（去路径分隔符/Windows 非法字符），扩展名交由导出管道按格式补全。未注入管道时明确报「导出功能未启用」。

**2. 交互超时保护**（`DEFAULT_INTERACTION_TIMEOUT_MS = 120_000`，对齐 Python `ask_user` 的 `timeout=120`）
危险确认与技能交互的 `await` 都过一层超时：**超时按「未确认/未答复」回落**（不隐式放行），避免无人值守时循环永久挂住。置 0 表示不超时。

**3. 托盘正式图标资源**
新增 `scripts/gen-tray-icon.cjs`（手写 PNG：zlib + CRC32 拼合法 RGBA，避免为 32x32 图标引入 `sharp`/`canvas` 原生依赖），产物 `resources/tray-icon.png` 入库；`tray.ts` 优先 `nativeImage.createFromPath`，**打包后资源未分发时回落到现场位图**（托盘仍能创建）。eslint 为 `scripts/**/*.cjs` 增 Node/CommonJS override。

**仍未做（明示，附理由）**：
- `ask_user` 的**多问题**（Python 的 `questions` 数组 + `multiSelect`）：需要多字段模态 UI（面板侧改动量大于本批其余项之和），单个提问已覆盖 LLM 的主流需求。
- `system.ceshu` 的 **`import`**：导入是文件选择器驱动的（UI 已有入口），Agent 侧需要「源路径」语义，价值低于导出。
- **`ai_*` 动作**：涉及一个**架构决策而非实现**——技能内自行调 LLM（需把 transport 注入技能，形成第二条 LLM 通路）vs 由 Brain 直接用现有 LLM 生成。建议保持单条 LLM 通路（由 Brain 负责），故 `ai_*` 不应做成技能。

### A1-4b 落地记录（2026-10-04）· 三类确认补齐

**背景**：A1-4 只做完了「危险确认」（risk ≥ SYSTEM 的审批门），方案里点名的另两类——**参数澄清**与**删除确认**——当时是缺口。

**关键发现**：Python 的删除确认是**死路**——`game_data_skill.py:414` 产出 `needs_confirm: True`，但**全项目没有任何消费者**（grep 只命中产出那一行），循环只把错误文案回灌给 LLM，标志位无人处理。

**设计（统一交互通道，复用 A1-4 已建成的审批链路）**：
`SkillResult.interaction: { kind: 'confirm' | 'question', prompt, options? }`
→ Brain 发 `interaction_required` 事件（带 requestId）→ 经同一 broker 等渲染层答复 →
- `confirm`：批准后带 `confirm: true` **重执行一次**（显式不做多次重试，避免自旋）；拒绝记 `[STOP]`
- `question`：答复作为 `用户回答：…` 回灌为工具结果（不重执行）

**生产者**：`system.game_data.delete`（未带 `confirm: true` 时返回 confirm 交互，DATA_WRITE 风险 + 交互确认双重保护）、`tool.ask_user`（question，可带候选选项；`TOOL_RISK_MAP` 补 `tool.ask_user: READ_ONLY`，模糊别名补「提问/询问/澄清」）。

**未答复即拒绝**：无答复通道 / 用户未答复 → 一律 `[STOP]`，与危险确认门同一取向（不做隐式放行）。

**新增单测 +17**（循环层 6：批准重执行 / 取消 / 无通道 / 二次确认停止 / 提问回灌 / 空答复；面板层 5；技能层 6）。E2E 补 2 例（删除确认、ask_user 提问）。

### A1-5 落地记录（2026-10-04）· **A1（AI/Agent 引擎）全部收官**

**产物**：
- `main/agent/skills/codeSkill.ts`：`system.code`（QuickJS WASM 沙箱执行不可信 JS）。**实现整体替换** Python 的 `subprocess + 正则黑名单`（可绕）——用已预演的 `runInSandbox`（零宿主能力 + CPU 超时 + 内存上限）；超时/内存参数被夹到安全上限，不接受 LLM 传超大值。单测 9。
- `main/agent/skills/ceshuSkill.ts` 补 `create` / `update`（章节写入，`isChapterKey` 校验 + 中文错误），把已有策划书能力接进统一协议。单测 +3。
- `main/tray.ts`：`Tray`（上下文菜单：显示主窗口/退出）+ `globalShortcut` `CommandOrControl+Shift+M`；**全部防御式包装**（无桌面会话/热键被占用/图标缺失都不阻塞启动），图标用原始位图现场生成（避免引入打包资产）。
- **A1-4 遗留项已补齐**：`agent-digital-panel.spec.ts` 增 2 例审批端到端——**拒绝路径断言沙箱没有被执行**、批准路径断言代码真跑了（`执行成功: 42`）。

**有意偏离 / 说明**：
1. `system.code` 风险等级沿用 `TOOL_RISK_MAP` 的 `SYSTEM` → 每次调用都过审批门；这也是补齐「审批端到端拦截」的关键前提。
2. `system.ceshu` 的 `delete` / `export` / `import` **未移植**：UI 已有完整入口（首页卡片删除、导出面板），再经 Agent 暴露会与既有交互重复且更难确认；`ai_*` 动作的返回是「待应用字段」而非落盘结果，需要一层「应用」语义，同样留后立项。
3. 托盘/热键按方案仅在smoke 层验证（本沙箱无法实跑）；正式托盘图标资源待补。
4. **A1-4 遗留的另两类确认（参数澄清 / 删除确认）仍未做**：本批次只把「危险确认」打通到端到端。参数澄清需要「暂停循环 → 向用户提问 → 回灌答案」的交互（`ask_user` 技能族），与 A1-4 已建立的审批通道同构，可后续按需立项。

**未验证项**：E2E（4 例）仍受沙箱 Electron 启动限制，待 CI 跑。

### A1-4 落地记录（2026-10-04）

**产物**：`shared/agent/panel.ts`（`DigitalPanelState` + `reduceBrainEvent` 归约：气泡/流式/步骤/任务/审批/状态）、`main/agent/approvalBroker.ts`（按 requestId 登记 promise 并兑现）、`renderer/src/components/digital/DigitalPanel.tsx`、App 第三模式 `mode-digital`（`mode: 'data' | 'ceshu' | 'digital'`）、IPC：`agent:approvalResponse` + `agent:sessionInfo/sessionRestore/sessionClear` + 主进程 `agent:event` 事件推送、E2E `agent-digital-panel.spec.ts`（面板流程 / 会话恢复 2 例）。

**有意偏离 / 关键实现决策（逐条有据）**：
1. **行为全在纯归约里**：Python 的面板是 PyQt widget 树 + `digital_panel_state.py` 类型桩（无法脱离 GUI 测试）；TS 把「事件 → 状态」提成纯函数，组件退化为 `useReducer` 薄壳。
2. **`handle()` 包装器扩展为可把 `event` 传给 handler**（既有单参 handler 不受影响，TS 允许少参函数赋给多参签名），这样 `agent:chat` 才能 `event.sender.send('agent:event', …)` 推事件流。
3. **审批竞态**：`runBrainLoop` 先 emit `approval_required` 再 `await requestApproval`，用户可能「秒点」批准；故 IPC 层**在分配 requestId 时就登记**待审批 promise（`newRequestId` 里 register），`requestApproval` 只取回它——否则决定会因「id 未登记」被丢弃。
4. **审批的端到端拦截待补**：需要 SYSTEM 级（risk ≥ 4）技能，本批次只注册了 DATA_WRITE 级 `system.game_data` / `system.ceshu`，故审批链路由**单测三层覆盖**（`agentBrain` 循环门 / `agentPanel` 归约 / `agentApprovalBroker` 中转）；E2E 拦截用例待 **A1-5** 接入 SYSTEM 级技能（如 jsSandbox 代码技能）后补。
5. **未移植**：markdown 渲染 + 代码高亮（§2.4 待接 react-markdown）、Python 独立的 `digital_panel_tasks` 后端（TS 的任务列表由工具步骤派生）、富文本草稿（§2.5 已声明旧草稿不迁移）。

**未验证项**：2 例 E2E 仍受沙箱 Electron 启动限制（`Process failed to launch!`），待 CI 跑。

### A1-3 落地记录（2026-10-04）

**产物**：`shared/agent/session.ts`（`truncateSessionMessage`/`buildSessionSnapshot`/`isSessionSnapshot`/`sessionInfoFromSnapshot`）、`main/agent/sessionStore.ts`（`AgentSessionStore`：save/readActive/tryRestore/info/clear/recordMetric）、`shared/agent/memory.ts`（`embedText`，32 维确定性 bigram 哈希 + L2 归一）、`main/agent/memoryStore.ts`（`AgentMemoryStore`：vectra `LocalIndex` 的 add/search/count）、接入 `AgentBrainService`（检索注入 `## 相关记忆` + 每轮落盘会话 + 问答回写记忆）、单测 `agentSession`(12)/`agentMemory`(10)。

**有意偏离 Python / 本方案（逐条有据）**：
1. **截断规则与「只留最近 50 条」提为常量并单测锁定**：Python 内联在 `_save_session` 的闭包与 `messages[-50:]` 切片里，无法单测。
2. **读取分两档**：`readActive()` 严格（损坏抛中文错误，便于排障）+ `tryRestore()` 容错（任何异常视为无会话，对齐 Python `_try_restore_session`）。本方案 §A1-3 验收要求「损坏文件抛中文错误」，Python 实际是静默吞掉——两档并存兼顾。
3. **会话目录暂为 `userData/agent/`**（Python 是库内 `<workspace>/memory/`）：A2-1 引入多库后**只改 `main/index.ts` 一处注入点**，本模块不感知库结构。
4. **记忆检索用 vectra 替代 Python 自研 ngram/TF-IDF**（§2.5 选型）；嵌入保持**确定性**以便单测锁死「命中/未命中」排序。Python 的 ngram bug（`memory_embedder.py:11`）不复刻。
5. **不移植**：persona/identity/user 文件工作区、多 workspace 切换、项目记忆提炼、黑板上下文、perf 面板——归 A1-5 业务接线。
6. **会话恢复（restore / takePending / clear）暂未接 IPC**：需要「是否恢复上次会话」的交互，归 A1-4 面板；本批次已验证 store 层语义。

**未验证项**：无新增 E2E（本方案 §A1-3 验收为单测口径）；既有 E2E 仍受沙箱 Electron 启动限制。

### A1-1 落地记录（2026-10-04）

**产物**：`shared/agent/protocol.ts`、`main/agent/dispatcher.ts`、`main/agent/skills/{gameDataSkill,ceshuSkill}.ts`、IPC `agent:listTools`/`agent:executeTool`、单测 `agentProtocol`(18)/`agentDispatcher`(15)/`agentSkills`(13)、E2E `agent-execute-tool.spec.ts`。

**有意偏离 Python / 本方案（逐条有据）**：
1. **实现为 2 个 action-based 技能**（`system.game_data` / `system.ceshu`）而非「3 个独立技能」。理由：Python 的安全策略 `TOOL_RISK_MAP` 是「工具 + action」**二维**风险（同一工具 `list` 只读、`create/update` 写），拆成 3 个工具会丢掉按 action 分级的能力，也破坏 `_fix_params` 的 action 推断。
2. **模糊别名表只保留已注册技能相关条目**：Python 那张约 200 行的表里大量映射指向本批次未注册的工具（`system.file_system` 等），照搬会产出指向不存在技能的映射（反而有害）。同理 `inferAction` 只覆盖 game_data/ceshu，shell/file_ops/code/ui_control 的推断待其技能接线时再补。
3. **action 别名在调度器层统一归一**（Python 是在各技能内部调 `normalize_params`）。单一归一化点更稳，副作用是「高危操作需用户确认: 工具/操作」与危险令牌里的操作名是**规范动作名**（`exec` → `execute`）。
4. **结果不再产出 Python 的内部字段 `_raw`**（实现细节泄漏）。
5. **不移植**：MCP 注册、SubAgent 通道、`execute_parallel`（拓扑排序 + 线程池，PyQt/QThread 专有；TS 线程模型改为事件流，见 §2.5）；`REQUIRES_MAIN_THREAD` 降级为语义标记 `requiresMainThread`。
6. 技能最小集只做「读数据表 / 写数据表（list_types/list/query/create/update）+ 读策划书（list/get）」；`delete`/`batch_*`/`switch_*` 与 `system.ceshu` 的 `create/update/delete/export/ai_*` 留到 A1-5 接线。

**顺带修复的真 Bug（W32 遗留）**：`main/ceshu/dataSync.ts::syncDataProgressToCeshu` 原本用 `pluralKey`（`roles`）查数据条目数，但 **TS 数据表以单数 `DataTypeDef.id`（`role`）为键**（`items.type` 由 `legacyImport` 把旧复数键映射为 `typeDef.id`，渲染层也用 `activeType = type.id`）→ 该计数**恒为 0**。已改为按单数 id 查询，`ensuredKeys` 同步改为单数键口径，并更新 W32 单测期望。

**未验证项**：E2E 仍受沙箱 Electron 启动限制（`Process failed to launch!`，与既有全部 E2E 同源），待 CI 跑。

### A1-2 落地记录（2026-10-04）

**产物**：`shared/agent/brain.ts`（`BrainEvent` 事件流 + `runBrainLoop`，注入 `BrainLlmTransport`/`BrainToolRunner` 故可纯单测）、`shared/agent/prompts.ts`（身份 + `## 规则` + 工具描述骨架）、`main/agent/ollamaTransport.ts`、`main/agent/brainService.ts`、IPC `agent:chat`、单测 `agentBrain`（19）、E2E `agent-brain-chat.spec.ts`。

**事件流**：`step_start(llm_think)` → `stream_chunk*` → `stream_done` →（有工具时）`step_start(并行N工具)` → `approval_required?` → `step_done*` → … → `done`。

**有意偏离 Python / 本方案（逐条有据）**：
1. **无确认即拒绝**：Python `_check_dangerous` 在「无法弹出对话框」时的注释写「回落文本确认（允许继续）」但代码实为拦截；TS 统一明确为「未拿到显式批准一律不执行」，并把 `[STOP]` 结果回灌给 LLM。
2. **每个 tool_call 都产出 tool 消息**：Python 在用户取消时 `_execute_and_reflect` 直接 `return`，会留下「assistant 带 tool_calls 却无对应 tool 结果」的**非法消息序列**（OpenAI/Ollama 协议要求一一对应），下一轮请求可能报错；TS 一律补齐。
3. **不走 `ollama` npm 客户端，直接 `fetch /api/chat`**：需完全控制 `tool_calls[].function.arguments` 的形状（不同客户端版本为对象或 JSON 字符串）与 NDJSON 流式解析，也让桩服务契约显式可读。
4. **不移植**：滑动窗口压缩、会话持久化/恢复、插件钩子（`on_agent_start`/`on_tool_call`/`on_agent_finish`）、性能统计、团队模式工具白名单、计划驱动执行（`_plan`/`_execute_plan`）——分别归 A1-3（会话与记忆）与 A1-5（业务接线）。提示词也**只移植骨架**（persona 文件、用户画像、长期记忆、黑板上下文、个性化学习块均未移植）。
5. **A1-2 无审批 UI** → 危险操作（risk ≥ SYSTEM）一律拒绝；审批交互归 A1-4 面板。

**未验证项**：E2E 仍受沙箱 Electron 启动限制（与既有全部 E2E 同源），待 CI 跑。

### 拍板结论（2026-10-04，用户已确认）

| # | 议题 | 结论 | 影响 |
|---|---|---|---|
| 1 | 执行顺序 | **先清 B 档小件，A 档整体后置** | §6 排期以 W31…W34（B 档）为先；A2-1 等 B 档清完再启动；本文 §4 的 A2→A1 排序仅在 A 档内部生效 |
| 2 | 自愈改码 | **完全不做自愈** | 删掉 A1 里的「参数自动修正 + 单步重试」设计；工具报错**直接回传 LLM 重新规划一次**，仍不做任何源文件改写 |
| 3 | 技能取舍 | **先不做**（按需再立项） | 只做 A1-1 的 3 个最小技能 + A1-5 把已有策划书/数据表能力注册进协议；`image_skill`/`pdf_parse_skill`/`audio_skill`/`vision_capture` 等暂缓 |
| 4 | 旧数据迁移 | **自动搬入「初始库」** | A2-1 需实现一次性搬迁：检测平铺文件（`mb-editor.db`/`ceshu`/`ceshu_notes`/`ceshu_templates`/`type_schema.json`/`attr_system.json`）且无 `libraries/` 时搬到 `libraries/初始库/`；失败保留原文件并给中文错误 |