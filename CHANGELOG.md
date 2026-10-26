# 更新日志

## [Unreleased] - 2026-09-16（按「策划书 → 数据」主线做可视化简化）

### 变更

- **主线导航打通（原为静默失败）**：按「先写策划书、再设计游戏数据」的主线，「帮助 → 快速入门」里的「编辑游戏数据 / 撰写策划书」两步原先调用 `tab_mgr.deferred_switch_tab(0/1)`——数据标签早已游离且不在 `_center_stack` 中，`indexOf(tab) >= 0` 恒为假，只打 warning 什么也不做。现改为 `_goto_data_design()` / `_goto_ceshu_home()`：能切就切到数据设计区并提示，切不了就明确提示「先在第五章勾选游戏系统」并回到策划书页
- **数据区空状态即下一步**：文案从「暂无启用的游戏系统…」改为「第二步：设计游戏数据 / 由策划书驱动 / 先在第五章勾选」，并新增按钮「去「第五章·游戏系统设计」勾选」→ 点击直接跳第五章（`EditorPreviewPanel.goto_systems_requested` → `editor_view.set_chapter("systems")`）
- **数据面板布局韧性**：左列（搜索 + 数据列表）加 `setMinimumWidth(200)` + splitter 初始 `[240, 720]`。此前无最小宽度保护，容器 ≤700px 时列表被压到 **80px** 细条（表单列固有最小宽约 516–706px），列表看不见、空状态文案被切成「击「新」。实测容器 400/520/700/900/1200px 下列表列稳定 ≥200px
- **数据区按钮精简**：底部一排 8 个平铺按钮 → 5 个（新建 / 保存 / 删除 / 复制 / AI生成）+「更多 ▾」（编辑当前类型字段结构 / 参考策划方案 · 模板 / 查看此项的引用关系）；三个按钮对象保留（状态与文案仍被逻辑引用）但不再占位
- **空状态文案缩短**：`"暂无数据，点击「新建」按钮添加"` → `"暂无数据，点「新建」添加"`（宽度需求 180 → 144px，不再被窄列表截断）
- **字段 AI 钮一致性**：第二章「主要用户」补 `ai_path="vision.user_personas.primary"`，与「次要用户 / 差异化优势」等文本字段一致地显示 AI 生成按钮（此前该字段唯独缺钮）

### 文档

- 新增 `docs/ux-simplification-plan.md`：能力盘点、4 条带代码级量化证据的问题（数据编辑三入口寄居 / 窄容器塌陷实测 / 5 条操作带重叠 / 一致性）、A/B/C 三档方案与风险，并记录本次用户决策（主线 = 策划书 → 数据）与已落地项

### 测试

- 本轮实况：**839 passed / 0 skipped**、ruff 全绿、mypy 299 文件 0 错误（空缓存）；offscreen 实测脚本覆盖：宽度扫描（5 档容器）、按钮可见性（5 + 更多 ▾ + 3 个已收起）、空状态信号触发与 `focus_first_editor()` 无系统时返回 False

## [Unreleased] - 2026-09-16（GUI 实测修复）

### 修复

- **主界面上有游离控件当覆盖层，遮挡内容并拦截点击**：旧三栏布局移除后，`HomeWidget`（快速入门 + 数据概览 + 快捷创建）与 `LibraryBarWidget` 容器都失去了布局归属，却仍以主窗口子控件的形式保持可见——`HomeWidget` 以最小 ~850px 的块面停在窗口左上角（手工 QA 反馈为「面板常驻、遮挡项目列表」），`LibraryBarWidget` 的残留「当前库:」标签停在菜单栏左上角，实测 `childAt(10, 15)` 命中链为 `QLabel < LibraryBarWidget`，即**菜单栏左侧被不可见控件吞掉点击**
  - `HomeWidget` 默认隐藏，改由「帮助 → 快速入门」装载进独立窗口显示（`QScrollArea` 承载 + 按屏幕自适应尺寸），关闭后重新隐藏
  - `LibraryBarWidget` 容器隐藏；其 `library_combo` / `lib_count_label` 本就被放入顶部工具条，功能不受影响
  - 新增回归测试 `test_no_floating_overlay_widgets`：断言窗口上不存在「可见且不属于任何布局」的子控件（经模拟修复前状态验证，该断言确会报出 `['LibraryBarWidget', 'HomeWidget']`）
- **快速入门的 ✕ 点不掉面板**：`_do_dismiss` 只折叠卡片区，标题栏（🚀 快速入门 / 进度 / ✕）仍占位，tooltip 却写着「关闭引导」→ 用户认为按钮失效。现改为真正关闭（隐藏整个引导区并持久化 `onboarding_dismissed`），「帮助 → 快速入门」可重新显示；「全部完成」仍只做折叠（保留标题栏，新增 `_collapse_cards`），两种语义分开
- **快速入门窗口被撑到 7000px 宽**：引导卡 5 张、概览卡 12 张全部单行横排，整页宽度需求 7072px（窗口绝大部分在屏幕外）。改为栅格换行（引导卡 3 列 / 概览卡 4 列）后，`HomeWidget` sizeHint 1350 → 867、最小宽 853 → 556；实测窗口 1030×768、无横向滚动条

### 测试

- 本轮实况：**795 passed / 0 skipped**（覆盖率 32.82%，门槛 30%）、e2e 44 passed、ruff 全绿、mypy 299 文件 0 错误（空缓存）
- 手工 QA（GUI 实机操作）复核：策划书「新建 → 编辑第 1 章 → 保存 → 校验报告」全通；数据「新增/编辑/删除技能条目」全通；修复后主界面无残留覆盖层、菜单可正常展开、快速入门窗口布局正常

## [Unreleased] - 2026-09-16

### 移除

- **删除 `src/ui/ai_assistant_tab`（1422 行）与 `tests/unit/test_ai_assistant_tab`**：该模块无 App 入口引用（`MainWindow` 的 AI 交互由 `DigitalPanel` + `AIBridge` 承担），且其构造依赖已被 Agent OS 重构移除的旧 `AgentManager` 接口，属不可运行的历史遗留。同步清理 `docs/wiki`（02-modules / 03-key-classes / CODE_WIKI 的模块与关键类条目）与架构图中的「结果回写 UI（AIAssistantTab / DigitalPanel）」表述
- 移除后回归：**794 passed / 0 skipped**（覆盖率 32.35%，门槛 30%）、e2e 44 passed、ruff 全绿、mypy 300 文件 0 错误；MainWindow 冒烟构造与标签页加载正常，`ui.ai_assistant_tab` 已不可导入（符合预期）
- **删除 `src/ui/widgets/agent_selector`（AgentSelectorWidget）**：其唯一消费者是上条删除的 `ai_assistant_tab`，删除后全仓库无代码/测试引用；核验还发现它切换的 `AgentManager._active_agent_id` 无任何消费方（`set_active_agent` / `get_active_agent` 的调用点仅在本组件内，Brain 用的是 `list_agents()` 与团队模式判定），属「无界面引用 + 状态无消费」的双重遗留。同步清理 `docs/wiki` 组件清单与关键类表中的 AgentSelector 条目

### 修复

- **`ceshu_pptx_exporter` 的可选依赖回退分支使 mypy 门禁失败（此前被增量缓存掩盖）**：模块级 `try: from pptx... except ImportError:` 回退里重定义了 `RGBColor` / `MSO_SHAPE` / `PP_ALIGN` / `Inches` / `Pt`，mypy 会同时分析两个分支，报 `assignment` / `no-redef` / `misc` 共 4 个错误——且结果随环境是否安装 python-pptx 而变（这正是此前为 `semantic_memory` 消除的那类环境相关 `type: ignore`）。改为 `if TYPE_CHECKING: <真实导入> / else: <try/except 回退>`：mypy 只分析真实依赖分支，运行时行为完全不变。验证：清空 mypy 缓存（`--cache-dir` 指向空目录）后 `mypy src/` **299 个源文件 0 错误**；回退分支用 meta_path 拦截器模拟「未安装 pptx」实测：`_PPTX_AVAILABLE=False`、占位常量可用、`export_ceshu_to_pptx` 仍抛出中文 ImportError 提示
- **注意（检查方法）**：mypy 增量缓存会沿用旧的「干净」结论，此前几轮「0 错误」结论均在缓存命中下得到；后续验证统一改用空 `--cache-dir` 复核，结论已更新为干净缓存下的 0 错误

### 清理

- **删除删除组件后遗留的孤儿符号（无任何调用点）**：
  - `ui/themes.get_agent_color()` 与 `_AGENT_TOKEN_MAP` / `_AGENT_FALLBACK_COLORS`（仅被已删除的 `AgentSelectorWidget` 调用），同步从 `ui.themes.__init__` 的导入与 `__all__` 移除；主题里的 `agent_*` 令牌本身仍被 `ai_panel` / `ceshu_theme` / `competitive_chart` 使用，故保留
  - `AgentManager.set_active_agent()` / `get_active_agent()`：其内部状态 `_active_agent_id` 从未在 `__init__` 初始化、除自身外无任何读写点（Brain 用 `list_agents()` + 团队模式判定），亦无持久化字段引用，一并删除

### 测试

- 本轮实况：**794 passed / 0 skipped**（覆盖率 32.81%，门槛 30%）、e2e 44 passed（合计 838 passed）、ruff 全绿、mypy 299 文件 0 错误（干净缓存）；冒烟确认 `ui.themes` 正常、`get_agent_color` / `set_active_agent` 已不可访问、`AgentManager` 仍能列出 10 个智能体

## [Unreleased] - 2026-09-15（大文件拆分）

### 重构

- **`src/ui/digital_employee` 2416 → 497 行**：`DigitalPanel` 的 77 个方法按职责拆到六个 mixin
  - `digital_panel_ui`（界面构建）/ `digital_panel_workspace`（工作区与草稿）/ `digital_panel_tasks`（任务面板与提问）/ `digital_panel_input`（输入与斜杠命令）/ `digital_panel_chat`（消息渲染与流式）/ `digital_panel_theme`（主题）
  - `digital_panel_state`：`DigitalPanelState(QWidget)` 集中声明跨 mixin 共享属性与 82 个方法签名（实现由各 mixin 提供，MRO 下真实实现优先），使 mypy 在 mixin 上下文仍能解析 `self.*`
  - 公开类 `DigitalPanel` / `DigitalEmployee` / `DigitalEmployeePopup` 仍从 `ui.digital_employee` 导出，所有导入方无需改动；独立启动改为在 `src/` 下执行 `python -m ui.digital_employee`（或设 `PYTHONPATH=src`）
- **等价性验证**：AST 逐函数比对重构前后全部 100 个函数，函数体逐字一致；唯一差异为 `_open_popup` 内新增的延迟导入（该名字原是同模块全局 `DigitalEmployeePopup`，拆分后须从 `ui.digital_employee` 延迟导入以避免循环导入）
- **回归**：805 passed / 0 skipped（覆盖率 32.20%，门槛 30%）、e2e 44 passed、ruff 全绿、mypy 274 文件 0 错误；MainWindow / DigitalPanel / DigitalEmployee / DigitalEmployeePopup 冒烟构造与方法调用通过
- **`src/core/agent/skills/ceshu_skill` 1595 → 142 行**：`CeshuSkill` 的 28 个方法拆到四个 mixin
  - `ceshu_skill_data`（CRUD 与导入导出）/ `ceshu_skill_generate`（AI 生成与描述分析）/ `ceshu_skill_prompt`（提示词构建与 LLM 输出解析）/ `ceshu_skill_review`（审阅、系统推荐与结果组装）
  - `ceshu_agent_router`（AgentRouter，含 18 章路由）与 `ceshu_style_helpers`（风格/模块关键词表与推断函数）独立成模块；二者在 `ceshu_skill` 用 `__all__` 再导出，UI（`ui/ceshu/ai_panel`）与测试的既有导入路径不受影响
  - `ceshu_skill_state` 声明 28 个跨 mixin 方法签名；`ceshu_skill` 只保留类属性、`PARAMS_SCHEMA` 与 `execute` 入口
  - 等价性验证：AST 比对 34 个函数，函数体逐字一致（0 差异）
  - 回归：805 passed / 0 skipped（覆盖率 32.26%）、技能发现 25 个且 `system.ceshu` 无重复注册、ruff 全绿、mypy 281 文件 0 错误
- **`src/ui/dialogs/type_editor_dialog` 1562 → 532 行**
  - `TypeEditorDialog` 的 4 个 AI 辅助方法（字段建议 / 已有数据分析 / 模板导入 / 网络参考）拆到 `type_editor_ai`（`TypeEditorAIMixin`）
  - 两个内部控件类独立成模块：`type_editor_field_widget`（FieldEditorWidget）、`type_editor_layout_widget`（LayoutEditorWidget）
  - 内置模板数据（`TYPE_TEMPLATES`，8 套）外置到 `src/data/type_editor_templates`，主类仍以同名类属性暴露
  - `type_editor_dialog_state` 声明共享属性与 25 个方法签名；`TypeEditorDialog` 仍从原路径导出，3 处调用方无需改动
  - 等价性验证：AST 比对 60 个函数，函数体逐字一致（0 差异）；`TYPE_TEMPLATES` 数据 AST 一致
  - 回归：805 passed / 0 skipped（覆盖率 32.19%）、e2e 44 passed、ruff 全绿、mypy 286 文件 0 错误
- **`src/core/agent/memory` 1243 → 83 行**
  - `Memory` 的 54 个方法拆到五个 mixin：`memory_store`（短期/长期/偏好/学习与反馈持久化）、`memory_history`（对话历史、整合与偏好学习）、`memory_context`（项目记忆与上下文注入）、`memory_search`（语义索引包装、关键词检索与摘要）、`memory_vector`（向量索引维护、语义检索与会话归档）
  - `VectorEmbedder` + `get_embedder` → `memory_embedder`；`MemoryIndex` → `memory_index`；三者连同 `Memory` 在本模块用 `__all__` 再导出，`brain` / `learner` / `semantic_memory` 与测试的既有导入路径不变
  - `memory_state` 声明共享状态、类常量（`MAX_SHORT_TERM` / `MAX_CONVERSATIONS` / `_CN_STOP_WORDS`）与 54 个方法签名；原文件末尾的 `SemanticMemory` 延迟导入（避免循环导入）按原样保留
  - 等价性验证：AST 比对 72 个函数，函数体逐字一致（0 差异）；模块级符号完整性检查通过（四轮拆分统一复核）
  - 回归：805 passed / 0 skipped（覆盖率 32.34%）、e2e 44 passed、ruff 全绿、mypy 294 文件 0 错误；Memory 的读写/偏好/关键词检索/语义索引冒烟通过
- **`src/core/agent/brain` 1603 → 133 行**
  - `AgentBrain` 的 64 个方法拆到六个 mixin：`brain_session`（会话生命周期、配置重载与统计）、`brain_plan`（意图处理、计划执行与撤销）、`brain_llm`（LLM 迭代循环、工具调用与上下文压缩）、`brain_prompt`（系统提示词与上下文块构建、意图解析）、`brain_reflect`（失败反思与轮次评估）、`brain_subagent`（子智能体调度、辩论与结果收尾）
  - `brain_state` 声明共享状态（29 个实例属性）、类常量（`_MAX_MESSAGE_CHARS` 等 5 项）与 64 个方法签名；AgentBrain 仍从原路径导出，`ai_bridge` / `ceshu_controller` 等调用方无需改动
  - 等价性验证：AST 比对 66 个函数，函数体逐字一致（0 差异）；模块级符号完整性检查通过（本轮补回切分窗口漏取的模块级 `logger`）
  - 回归：805 passed / 0 skipped（覆盖率 32.51%）、e2e 44 passed、ruff 全绿、mypy 301 文件 0 错误；AgentBrain 构造/健康检查/会话统计/token 估算/分发器装配冒烟通过

## [Unreleased] - 2026-09-15

### 修复

- **智能体选择器 / 助手标签页 API 漂移（构造即崩）**：`ui/widgets/agent_selector` 与 `ui/ai_assistant_tab` 仍在使用已被 Agent OS 重构移除的 AgentManager 旧接口（`active_agent_id` / `.agents` / `switch_agent()` / `.active_agent` / `display_name` / `get_tools_description()`），构造 `AgentSelectorWidget`/`AIAssistantTab` 直接抛 AttributeError。改接当前接口：`get_active_agent()` / `list_agents()` / `set_active_agent()` / `match_agent()`（后者按 ID/名称/关键词匹配），工具清单改由 `ToolDispatcher` 提供（与 Brain 相同装配方式）。两文件当前无 App 入口引用，按「保留并改接」处理
- **类型检查门禁不可用**：`src/security/`、`src/data/` 缺 `__init__`，`mypy src/` 报 `Source file found twice under different module names: "sandbox" / "security.sandbox"` 并中止全量检查（README/CI 声称的 0 错误无法复现）。补齐两个包声明 + 统一 `semantic_memory` 的 chromadb 相关类型为 Any（移除 8 处因环境而多余/缺失的 `type: ignore`）后，`MYPYPATH=src mypy src/ --ignore-missing-imports --warn-unused-ignores` 通过：267 个源文件 0 错误
- **UI 测试被误判为「旧版 3.14 + 旧版6 segfault」而整类跳过**：真实原因是这些测试构造 QWidget 前没有 QApplication（Qt 直接 abort，退出码 0xC0000409），且 `mock_qt` 把 旧版6 模块换成 MagicMock 后与真实 Qt 混用（真实 `QStyle.standardIcon` 收到 MagicMock 枚举报 TypeError）。修复测试装置而非继续跳过：
  - 新增会话级 `qapp` fixture（offscreen，全会话复用）
  - `mock_qt` 在真实 旧版6 可用时不再 mock，仅在 旧版6 缺失时才注入 MagicMock
  - `test_main_window` 把 `config_dir` 隔离到 tmp_path（`restore_ui_state()` 会读本机 `window_state.json`，否则断言随开发者本机主题漂移、且可能写回真实配置）
  - 结果：22 个用例恢复运行并通过，并顺带修复 `test_digital_employee` 构造参数（`DigitalPanel(None)` / `DigitalEmployee(brain=MagicMock())`）

### 测试

- 删除引用已删除模块的死测试（长期静默 skip = 假覆盖）：`tests/unit/test_subsystems`（SessionManager / ReflectionEngine / PlanCoordinator / ReactEngine 四个模块已不存在）、`tests/unit/test_agent_core`、`tests/unit/test_self_healing`、`tests/integration/test_ai_dialog_integration`、`tests/integration/test_self_healing_eval`（依赖已移除的 `core.agent.tool_executor` 等模块）
- 删除 `test_uncovered_skills` 中 ComputerUseSkill 一组（`computer_use_skill` 模块不存在）
- tests/ 全量 ruff 清理 462 → 0（304 处自动修复 + 51 处 unsafe 修复 + 手工拆分单行多语句），并把测试目录纳入 CI lint（`ruff check src/ tests/`）；`E402`（sys.path 注入后再导入）作为预期结构写入 per-file-ignores
- README 与 docs/wiki 中 `pytest tests/unit/test_agent_core` 示例改为现有文件 `test_brain`
- 测试实况：**805 passed / 0 skipped**（此前 780 passed / 108 skipped），覆盖率 31.98%（门槛 30%）；e2e 44 passed

## [Unreleased] - 2026-09-01

### 新增

- **「选择显示多少类型」功能**：首页数据概览区标题行新增「⚙ 管理显示类型」按钮，弹出勾选列表，可选择首页统计卡片 / 标签页只显示哪些数据类型（`config.visible_types` 持久化到 `data/settings/ui_prefs.json`，None=全部）
  - 界面问题根因：schema 里 91 个类型 → 首页渲染 91 张统计卡片（用户看到的"91 个标签"），数据本身并未损坏
  - 顺带修复了**从未生效的策划书上下文过滤**：`TabManager.is_type_allowed()` 此前无任何调用方（死代码），策划书「游戏系统勾选 → 只显示勾选类型」从未真正起作用。现在标签页创建与首页统计卡片均按 `is_type_allowed()` 过滤，优先级：策划书上下文 > 用户显示配置 > 全部显示；策划书关闭后自动恢复
- 新增 `ui/dialogs/type_visibility_dialog`（显示类型选择对话框）

### 修复

- **工作区删除后残留空库目录**：`WorkspaceManager.delete_workspace()` 只移除「库目录/.workspace/」，把空的库目录壳永久留在 `data/libraries/` 下（反复出现的 `test_project` 空目录即由此产生）。删除后若库目录已空则一并回收；仍含业务数据（如 `ceshu/`）的库不受影响
- **集成测试从不清理测试库**：`TestLibrarySwitch` 把 `_test_lib` / `_original_active` 等状态存在 `self` 上，而 unittest 为每个测试方法新建实例，导致 `test_03`（切回原库）永远被 skip、`test_04`（清理测试库）永远提前 return 空跑，`界面测试_*` 库永久残留。改为类属性共享状态，并新增磁盘残留断言
- **`test_workspace` 从未被执行**：该文件是脚本（模块级代码、无 `test_` 函数），pytest 收集结果为 0 tests，其中的断言一直未纳入 CI。已改写为 16 个正式用例，并通过 monkeypatch 把操作隔离到 tmp_path，不再污染 `data/libraries/`

### 测试

- 新增 `tests/unit/test_type_visibility`：10 个用例，覆盖 `is_type_allowed` 三级优先级（策划书上下文 > visible_types 配置 > 全部）、`TypeVisibilityDialog.result_types` 三种情况、首页统计卡片按配置过滤
- `tests/unit/test_workspace`：0 → 16 个用例，覆盖工作区创建/切换/列表/统计/删除、空壳回收、含数据保留，以及 Memory 提炼与偏好推断
- `tests/integration/test_frontend_critical`：修 lint 15 处（无占位符 f-string、歧义变量名 `l`）

## [Unreleased] - 2026-08-29

### 代码库重构（可读性与可维护性）

仅内部结构调整，外部行为不变。每处改动均通过等价验证（AST 快照比对 / 多场景冒烟对比）与全量回归（单测 667 + 集成 97）。

**数据外置**（逻辑与数据分离）
- `core/library_manager`：1840 → 737 行，初始样本数据外置到 `src/data/sample_data`
- `ui/ceshu/chapter_templates`：965 → 170 行，18 章模板数据外置到 `src/data/chapter_templates_data`

**巨型方法拆分**
- `core/defaults/rpg_schema`：748 行单函数 → 12 个类型构建函数
- `core/ceshu/ceshu_checklist`：235 行单方法 → 6 个分类构建函数
- `features/_ai_dialog`：`generate_content` 376 → 85 行（拆 6 个纯构造方法）
- `core/agent/skills/ceshu_skill`：`_ai_generate` 253 → 178 行（三批生成循环去重）
- `ui/dialogs/type_editor_dialog`：`setup_ui` 161 → 20 行（拆 4 个面板构建方法）
- `ui/ai_assistant_tab`：`_do_show_question` 139 → 62 行
- `core/agent/brain`：`_build_system_prompt` 117 → 28 行

**其他**
- 早期版本本要求统一为 3.14（pyproject / Dockerfile / 文档）
- 全量 ruff 清理：908 处 + `--unsafe-fixes` 284 处（lint 509 → 225）
- `.gitignore` 补充根目录临时文件与备份目录排除规则

### 修复

- **策划书章节表单防崩溃**：AI 生成的章节字段可能返回 dict/list（如 `characters.protagonist={}`），直接渲染会 TypeError 崩溃；新增 `_safe_text()` 并加固 67 处 UI 赋值（`chapter_forms/_base` 20 + `_industrial` 47），脏数据不再崩溃而是以 JSON 形式显示
- **活跃库回退**：`.active_library` 指向已删除的库时应用启动后无活跃库，现在自动回退到初始库并告警
- **导入索引修复**：`features/export` 四种导入统一走 `_finalize_import()`，修复 CSV / Excel 导入漏重建索引导致数据入库但查不到的问题

## [v5.0.0] - 2026-07-05

### 策划书系统工业级升级

从「九章基础 GDD」升级为「工业级 18 章 GDD」，覆盖立项定义→核心设计→数值与系统→制作规范→商业与项目→验证与运营完整链路。完整说明见 [策划书 v5.0 发布说明](docs/ceshu-release-notes-v5.md)。

#### 结构
- **18 章 GDD 结构**：9 基础章（meta/vision/worldview/gameplay/systems/numeric/art/tech/resources）+ 9 工业级章（market_analysis/characters/combat/economy/monetization/mvp/risk_handling/audio/accessibility）
- **13 种游戏系统配置** + 系统硬依赖检查（`SYSTEM_DEPENDENCIES`）
- **18 个混合玩法预设** + 12 模块系统推荐
- **v4→v5 自动迁移**：`CeshuModel.from_dict()` 检测 `version=="4.0"` 自动映射旧字段到新章节

#### 新功能（7 轮迭代）
- **N1 版本对比** / **N7 版本时间线** / **N15 变更日志**：版本管理闭环
- **N3 PPT 导出** / **F5 PDF 导出** / **N9 Markdown 导出** / **N12 HTML 导出** / **N16 Excel 导出**：共 6 种导出格式
- **N4 评分引擎**：3 维评分（结构 30 + 质量 40 + 市场 30 = 100），S/A/B/C/D 五级评级
- **N11 完备性清单**：6 大类 50 项生产就绪检查
- **N14 字段依赖图**：跨章节字段依赖（≥15 条），UI 节点着色显示违规
- **N6 AI 5 维评审** / **N10 AI 一键完整生成**：AI 动作扩展至 9 个
- **N13 自定义模板** / **N8 章节笔记** / 预设市场 / 依赖可视化 / 校验报告 / 章节进度条
- **双向同步**：CeshuDataSync 通过 EventBus 实现策划书↔游戏数据双向同步

#### 技术
- 核心层零 旧版6 依赖，可独立单元测试
- 原子文件写入（temp + os.replace）、路径校验、模板隔离
- mtime 缓存、QThread 异步 AI 调用、惰性校验

#### 测试
- 新增 tests/test_ceshu_v5（109 用例）：18 章结构、v4→v5 迁移、系统依赖（含反向）、混合玩法预设、章节一致性校验

## [v4.0.0] - 2026-06-23

### 工业级改进

#### 新增
- **18 章工业级 GDD 框架**：覆盖 6 个 Phase（立项定义→核心设计→数值与系统→制作规范→商业与项目→验证与运营），每章含字段定义、依赖关系和填写引导
- **AI 一句话生成策划书**：输入一句话想法，自动生成完整 GDD
- **填写路线图**：6 Phase 可视化路线图，显示每章状态和依赖关系
- **章节依赖关系**（depends_on）：标注每章前置依赖，指导正确填写顺序
- **新手引导横幅**：动态引导提示，告诉用户下一步该做什么
- **AI 帮我填按钮**：字段级 AI 辅助，点击即可让 LLM 填充当前字段
- **工业级章节**：market_analysis（市场分析）、characters（角色）、combat（战斗）、economy（经济）、monetization（商业化）、mvp（最小可行产品）、risk_handling（风险）、audio（音频）、accessibility（无障碍）

#### 安全
- ACL 默认风险级别从 SYSTEM 降为 FILE_SYSTEM
- SSRF 防护新增云元数据地址检查
- Shell 白名单收紧，移除 30+ 危险命令，git 改白名单模式
- subprocess 改为列表参数防注入
- 重建 security 模块（encryption/guard/rate_limiter/sandbox）
- 清理 178 处 except pass 异常静默吞噬

#### 测试
- 新增 type_schema/buff_system/equipment_system/security 单元测试（182 个）
- 新增策划书/数据 E2E 工作流测试（40 个）
- CI 新增 e2e job 和覆盖率阈值 40%

#### 部署
- 新增 PyInstaller 打包配置（build.spec + build）
- 新增 GitHub Release 工作流（release.yml）
- 新增 Dockerfile

#### 性能
- async_runner: time.sleep → threading.Event + TTL 清理
- rate_limiter: time.sleep → threading.Event
- image_loader: QThread 泄漏 → ThreadPoolExecutor

#### 国际化
- 新增 76 个 i18n 翻译键（中/英）
- main_window/home_view/data_tab 硬编码中文 → i18n.t()

#### 文档
- 新增 API 参考文档（docs/api-reference.md）
- 新增架构文档（docs/architecture.md）
- 更新 README（章节/技能数量说明）

#### 代码清理
- 中文标识符重命名（启动模式对话框 → StartupModeDialog）
- 根目录杂乱文件移到 scripts/ 和 docs/
- 3 个 UI 文件添加无障碍支持

### 修复
- 策划书章节结构不一致（24 错误章节名 → 22 正确）
- template_engine 章节数描述和预填字段错误
- PRD 文档数据结构与实际 CHAPTER_KEYS 不一致
- 新建对话框概念混乱（移除无效文档模式、添加解释文案）
- PyInstaller 打包脚本路径错误

## [v3.0.0] - 2026-05-xx

### 核心功能
- GDD 策划书系统（基础框架）
- Agent 技能系统
- 配置表系统（内置 RPG 数据类型）
- 旧版6 桌面应用框架
