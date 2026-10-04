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
| A2-1 库服务与路径迁移 | ⬜ 未开始 | — | — |
| A2-2 库条 UI 与切换联动 | ⬜ 未开始 | — | — |
| A1-1 技能协议 + 调度器 | ✅ 完成 | `<PENDING_HASH>` | `shared/agent/protocol.ts`（协议/风险策略/参数修正，单测 18）+ `main/agent/dispatcher.ts`（注册表/模糊解析/危险确认门，单测 15）+ 2 个 action-based 技能（`system.game_data` 读写数据表 / `system.ceshu` 只读策划书，单测 13）+ IPC `agent:listTools`/`agent:executeTool` + E2E `agent-execute-tool.spec.ts`（沙箱未实跑） |
| A1-2 Brain 循环 + 事件流 | ⬜ 未开始 | — | — |
| A1-3 会话与记忆 | ⬜ 未开始 | — | — |
| A1-4 数字员工面板 | ⬜ 未开始 | — | — |
| A1-5 业务技能接线 + 托盘/热键 | ⬜ 未开始 | — | — |

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

### 拍板结论（2026-10-04，用户已确认）

| # | 议题 | 结论 | 影响 |
|---|---|---|---|
| 1 | 执行顺序 | **先清 B 档小件，A 档整体后置** | §6 排期以 W31…W34（B 档）为先；A2-1 等 B 档清完再启动；本文 §4 的 A2→A1 排序仅在 A 档内部生效 |
| 2 | 自愈改码 | **完全不做自愈** | 删掉 A1 里的「参数自动修正 + 单步重试」设计；工具报错**直接回传 LLM 重新规划一次**，仍不做任何源文件改写 |
| 3 | 技能取舍 | **先不做**（按需再立项） | 只做 A1-1 的 3 个最小技能 + A1-5 把已有策划书/数据表能力注册进协议；`image_skill`/`pdf_parse_skill`/`audio_skill`/`vision_capture` 等暂缓 |
| 4 | 旧数据迁移 | **自动搬入「初始库」** | A2-1 需实现一次性搬迁：检测平铺文件（`mb-editor.db`/`ceshu`/`ceshu_notes`/`ceshu_templates`/`type_schema.json`/`attr_system.json`）且无 `libraries/` 时搬到 `libraries/初始库/`；失败保留原文件并给中文错误 |