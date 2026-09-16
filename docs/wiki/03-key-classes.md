# 03 — 关键类与函数说明

> 本文收录项目中最核心的类与函数，按系统分组，说明其职责、关键方法与使用场景。二次开发时优先查阅本节。

---

## 1. 数据层

### 1.1 `TypeSchema` / `TypeDef` / `TypeField` — `src/core/type_schema.py`

类型模式定义，是"有哪些数据类型、每种类型有哪些字段"的**权威数据源**。

| 类 | 职责 | 关键方法 |
|----|------|----------|
| `TypeField` | 单个字段定义 | `to_dict()` / `from_dict()` |
| `TypeDef` | 单个数据类型定义（含字段列表、显示字段、用户字段） | `get_field()` / `get_user_fields()` / `get_display_fields()` |
| `TypeSchema` | 全部类型的集合，可持久化/加载/升级 | `get_type()` / `get_type_by_plural()` / `save()` / `load()` / `needs_upgrade()` / `merge_with()` |

- 模块级函数 `create_default_rpg_schema()`：创建默认 RPG 类型模式（13 种类型）。

### 1.2 `OptimizedDataManager` — `src/core/data_manager.py`

游戏数据的核心管理器：内存缓存 + 磁盘 JSON 双轨。

| 方法 | 说明 |
|------|------|
| `open_file(path)` / `open_file_async(path, callback)` | 打开数据文件（同步/异步） |
| `save_file(path)` / `save_file_async(...)` | 保存数据文件（异步带进度回调） |
| `get_item(data_type, item_id)` | 读取单条（命中缓存优先） |
| `add_item(data_type, item)` | 新增，自动生成 ID，返回新 ID |
| `update_item(data_type, item_id, item)` | 更新 |
| `delete_item(data_type, item_id)` | 删除 |
| `search_items(data_type, query)` | 关键词搜索（带搜索缓存） |
| `generate_id(data_type)` | 按类型自增 ID 生成（`_parse_id_number` 解析现有 ID 最大值） |
| `reload_from_library()` / `rebuild_data_structure()` | 从当前库重载/重建数据与索引 |
| `clear_all()` | 清空全部数据 |
| `_cache_item` / `_get_cached_item` / `_invalidate_cache` | LRU 缓存控制 |
| `_rebuild_id_index` | 重建 ID 索引 |
| `shutdown()` / `close()` | 资源释放 |

### 1.3 `LibraryManager` / `LibraryInfo` — `src/core/library_manager.py`

多库管理：一个库 = 一套独立的游戏数据项目（含类型模式、数据文件、策划书目录）。

| 方法 | 说明 |
|------|------|
| `scan_libraries(force)` | 扫描可用库目录 |
| `create_library(name, description)` | 创建新库（含示例数据填充） |
| `switch_library(name)` / `restore_active_library()` | 切换/恢复活跃库 |
| `rename_library` / `delete_library` | 重命名 / 删除库 |
| `get_type_schema(library_name)` / `set_type_schema(...)` | 读取/设置库的类型模式 |
| `prepare_active_schema()` | 准备活跃库模式（含升级迁移） |
| `_upgrade_library_schema` | 库类型模式自动升级迁移 |
| `migrate_legacy_library(name)` | 旧版库迁移 |
| `copy_data_from_library(source, target)` | 库间数据复制 |

### 1.4 `AttributeCalcEngine` — `src/core/calc_engine.py`

Excel 风格属性公式计算引擎，支持依赖拓扑排序求值。

| 方法 | 说明 |
|------|------|
| `set_attr_def(name, attr_type, formula, min_val, max_val)` | 定义属性及其计算公式 |
| `set_base_value(name, value)` | 设置基础值 |
| `topological_sort()` | 按依赖关系拓扑排序 |
| `calculate_single(attr_name, context)` | 计算单个属性 |
| `calculate_all()` | 计算全部属性（按拓扑序） |
| `get_formula_string(attr_name)` | 生成公式字符串 |
| `export_to_json()` / `import_from_json(data)` | 公式配置导入导出 |

---

## 2. 配置层

### 2.1 `AppConfig` — `src/config/settings.py`

全局单例配置管理器。

| 方法/属性 | 说明 |
|-----------|------|
| `get_config()` | 模块级获取单例 |
| `library_manager`（属性） | 懒加载 `LibraryManager` |
| `get_type_schema()` | 获取活跃库类型模式 |
| `get_fields_config()` | 派生字段配置（type_schema 为准 + label 覆盖） |
| `save_api_config()` / `load_api_config()` | API 配置存取（Fernet 加密） |
| `save_template()` / `load_template()` / `delete_template()` | 模板 CRUD |
| `apply_template(name)` | 应用模板（更新字段 label） |
| `get_ai_prompt(data_type)` | 获取某类型的 AI 提示词模板 |
| `add_agent()` / `remove_agent()` / `get_agent()` | 智能体配置管理 |

辅助数据类：`FieldConfig`（字段配置）、`TemplateConfig`（模板配置），均支持 `to_dict/from_dict`。

### 2.2 `_TypeSchemaRegistry` — `src/config/constants.py`

线程安全的数据类型注册表（13 种类型的中英文名/复数/颜色），替代全局可变列表。模块级 `__getattr__` 兼容 `DATA_TYPES` 等旧式访问；`reload_from_type_schema()` 供库切换时更新。

---

## 3. 策划书系统

### 3.1 `CeshuModel` — `src/core/ceshu/ceshu_model.py`

18 章 GDD 数据模型。

| 方法 | 说明 |
|------|------|
| `to_dict()` / `from_dict()` / `from_json_file(path)` | 序列化/反序列化 |
| `get_chapter(key)` / `set_chapter(key, value)` | 章节读取/写入 |
| `get_system(name)` / `set_system(name, enabled, config)` / `add_system` / `remove_system` | 游戏系统配置管理 |
| `chapter_progress()` | 各章节完成进度统计 |
| `validate()` | 完备性校验（返回问题列表） |
| `auto_fill_required()` | 自动填充必填字段 |
| `compute_enabled_editors()` | 计算启用的编辑器列表 |
| `version_display()` | 版本号展示 |
| `touch()` | 标记变更（触发自动保存） |

### 3.2 `CeshuManager` — `src/core/ceshu/ceshu_manager.py`

策划书仓储层：CRUD + 版本 + 导出 + 导入。

| 方法 | 说明 |
|------|------|
| `list_ceshu(library, keyword)` | 列出策划书（目录扫描 + 缓存） |
| `get_ceshu(ceshu_id, library)` | 读取单个 |
| `create_ceshu(library, template_name, meta)` | 新建（可基于模板） |
| `save_ceshu(model, library)` | 保存（原子写入 + 临时备份） |
| `recover_ceshu(ceshu_id, library)` | 从最近临时备份恢复 |
| `delete_ceshu` / `rename_ceshu` / `duplicate_ceshu` | 删除/重命名/复制 |
| `derive_version(library, parent_ceshu_id, ...)` | 从父版本派生新版本 |
| `list_versions(library, root_ceshu_id)` | 版本树列表 |
| `set_active_version(library, ceshu_id)` | 切换主版本 |
| `export_ceshu(...)` 及其各格式方法 | `export_ceshu_markdown/html/docx/pdf/pptx/excel` 6 种导出 |
| `import_ceshu(filepath, library)` | 导入 |
| `get_recent_ceshus(library, count)` | 最近打开 |

### 3.3 评分 / 校验 / 同步

| 类/函数 | 位置 | 说明 |
|---------|------|------|
| `score_ceshu(model) -> ScoreReport` | `ceshu_scorer.py` | 三维评分（结构/质量/市场），输出 S/A/B/C/D 等级与改进建议 |
| `ChapterScore` / `ScoreReport` | `ceshu_scorer.py` | 章节分 / 综合评分报告（含行业基准 `_build_industry_benchmark`） |
| `CeshuChecklist` | `ceshu_checklist.py` | 50 项生产就绪检查 |
| `CeshuDataSync` | `ceshu_data_sync.py` | `sync_systems_to_data()` / `sync_data_progress_to_ceshu()` / `sync_both()` 双向同步，订阅 `data_changed` / `ceshu_changed` / `library_switched` 事件 |
| `CeshuTemplate` | `ceshu_template.py` | 单例模板引擎：`load_templates()` / `get_template(name)` / `list_template_names()` / `get_template_preview(name)` |

### 3.4 导出器（`ceshu_export_common.py` + 6 个具体导出器）

| 导出器 | 格式 | 说明 |
|--------|------|------|
| `ceshu_docx_exporter.py` | .docx | Word（python-docx） |
| `ceshu_pdf_exporter.py` | .pdf | PDF |
| `ceshu_pptx_exporter.py` | .pptx | PowerPoint |
| `ceshu_markdown_exporter.py` | .md | Markdown |
| `ceshu_html_exporter.py` | .html | 网页 |
| `ceshu_excel_exporter.py` | .xlsx | Excel（openpyxl） |

---

## 4. Agent 系统

### 4.1 `AgentBrain` — `src/core/agent/brain.py`

Agent 核心大脑，控制全局流程。方法按职责拆分在六个 mixin 中（`brain_session` 会话与配置 /
`brain_plan` 计划执行 / `brain_llm` LLM 迭代 / `brain_prompt` 提示词构建 /
`brain_reflect` 反思评估 / `brain_subagent` 子智能体），共享状态与签名见 `brain_state.py`。

| 方法 | 说明 |
|------|------|
| `process(user_input, callback)` | 主入口：接收用户指令并产出结果 |
| `boot()` / `configure(...)` / `reload_config()` | 初始化/配置/热更新 |
| `_agent_loop(user_input, callback, context, mode)` | ReAct 代理循环（auto/plan/manual 模式） |
| `_run_llm_iterations(...)` | LLM 多轮迭代（工具调用解析） |
| `_call_llm_stream(...)` / `_retry_llm_call(...)` | 流式调用 + 失败重试 |
| `_execute_plan(steps, context, callback, max_replan)` | 计划执行（含重新规划） |
| `_execute_and_reflect(...)` | 执行工具并反思 |
| `_execute_with_retry(...)` | 带重试的工具执行 |
| `_reflect_on_failures()` / `_categorize_failure_patterns()` | 失败反思与模式归类 |
| `_handle_subagent_call(...)` / `_spawn_subagent(...)` / `_multi_agent_debate(...)` | 子智能体调用 / 多智能体辩论 |
| `_check_dangerous(...)` / `_replan_step(...)` | 危险操作拦截与替代方案 |
| `_keyword_engine(...)` | 无 LLM 时的关键词引擎（离线兜底） |
| `_build_system_prompt(...)` | 系统提示词组装 |
| `_trim_messages(...)` / `_sliding_window_compress(...)` / `_estimate_tokens()` | 上下文窗口管理 |
| `health_check()` / `get_session_stats()` / `get_uptime()` | 健康与统计 |
| `undo_last(...)` | 撤销上一步操作 |
| `save_session()` / `load_pending_session()` / `clear_session()` | 会话持久化 |

### 4.2 `ToolDispatcher` — `src/core/agent/dispatcher.py`

技能注册与分发中心。

| 方法 | 说明 |
|------|------|
| `discover_skills(package_path)` | 自动发现技能（返回注册数） |
| `register_skill(skill)` / `register_mcp_tools()` | 注册技能 / MCP 工具 |
| `get(name)` / `fuzzy_match(name)` | 精确/模糊匹配技能 |
| `execute(tool_name, params, context)` | 执行单技能 |
| `execute_parallel(tool_requests, context)` | 并行执行（拓扑排序依赖） |
| `get_tools_description()` / `get_tools_json_schema()` | 生成 LLM 工具描述 |
| `_check_dangerous(tool_name, action)` | 危险操作检查 |
| `_fix_params(tool_name, params)` | 参数规范化修复 |
| `_execute_subagent(params, context)` | 子智能体执行 |

### 4.3 意图解析 / 记忆 / 工作区 / 学习

| 类 | 位置 | 关键方法 |
|----|------|----------|
| `IntentParser` | `intent.py` | `parse()`（快匹配或 `_deep_parse` LLM 深度解析）、历史反馈学习 |
| `Planner` | `intent.py` | `plan()` 生成结构化步骤 |
| `Memory` | `memory.py`（方法按职责拆到 `memory_store` / `_history` / `_context` / `_search` / `_vector` 各 mixin） | `save_long_term()` / `save_short_term()` / `semantic_search()` / `get_memory_context()` |
| `WorkspaceManager` | `workspace.py` | `create_workspace()` / `switch_workspace()` / `list_workspaces()` |
| `Learner` | `learner.py` | `observe()` / `refine()` / `get_personalized_prompt()` / `generate_skill_template()` |
| `SafetyGuard` | `safety_guard.py` | `check_dangerous()` / `trim_messages()` / `replan_step()` |
| `PluginSystem` | `plugin_system.py` | `discover()` / `load()` / `trigger_hook()` / `install_from_json()` |
| `ModelRegistry` | `model_registry.py` | `get_config()` / `set_model()` / `sync_from_app_config()` |
| `MCPRegistry` | `mcp.py` | `register_server()` / `call_tool()` / `discover_stdio_tools()` |
| `FrontendSnapshot` | `frontend_snapshot.py` | 前端状态快照（解耦 PyQt） |

### 4.4 技能协议 `BaseSkill` — `src/core/agent/skill_protocol.py`

所有技能的抽象基类，实现技能标准接口：

```
execute(params, context) -> dict      # 执行
rollback()                            # 回滚（可选）
to_json_schema()                      # 输出 LLM 工具 JSON Schema
get_tool_description()                # 工具描述
```

技能公共工具 `skills/common.py` 提供 `normalize_params()`：统一规范化 LLM 传入参数（action 中英文别名映射、keyword/path/url/content 字段归一化）。

### 4.5 多智能体团队 — `src/core/agent/agents/`

| 类 | 职责 |
|----|------|
| `AgentManager` | 智能体注册、委派、状态跟踪、任务分发 |
| `Collaboration` | 协作机制（黑板、任务状态、信息共享） |
| `IdentityManager` | 智能体身份与角色管理 |
| `SubAgentEngine` | 子智能体创建与并行执行 |

### 4.6 自愈诊断 — `src/core/agent/diagnostics/`

| 类 | 职责 |
|----|------|
| `ErrorHandler` | 错误捕获、友好提示、修复建议 |
| `RootCause` | 根因分析（历史上下文 + 模式匹配） |
| `FixMarket` | 预设修复策略/替代方案市场 |
| `LLMHealer` | 用大模型做自愈推理 |
| `PerfHealer` | 性能问题自愈 |
| `SecurityHealer` | 安全问题自愈 |
| `RepairReplay` | 修复重放与历史 |
| `ASTAnalyzer` | 语法树分析检测代码风险 |
| `DependencyGraph` | 依赖图分析 |
| `JsonRepair` | 损坏 JSON 修复 |
| `Predictive` | 预测性诊断 |
| `AbTester` | A/B 测试 |

---

## 5. UI 层

### 5.1 `MainWindow` — `src/ui/main_window.py`

主窗口（`QMainWindow`），统筹全局 UI。

| 方法 | 说明 |
|------|------|
| `setup_ui()` | 构建三栏布局 |
| `setup_menu()` / `setup_status_bar()` / `setup_shortcuts()` | 菜单/状态栏/快捷键 |
| `_setup_event_bus()` | 订阅事件总线 |
| `open_file()` / `save_file()` / `clear_all_data()` | 文件操作 |
| `export_game_data()` | 导出游戏数据 |
| `change_theme(name)` | 切换主题 |
| `start_auto_save()` / `auto_save()` / `toggle_auto_save()` | 自动保存 |
| `_do_undo()` / `_do_redo()` | 撤销/重做 |
| `_check_unsaved_changes()` / `_has_unsaved_changes` | 未保存检测 |
| `set_layout(mode)` / `_apply_current_layout()` | 布局切换 |
| `closeEvent()` | 关闭前保存状态 |
| `hot_reload_template()` | 模板热重载 |
| `_init_agent_brain()` / `_toggle_digital_panel()` | Agent 初始化/数字员工 |

### 5.2 标签页与控制器

| 类 | 位置 | 职责 |
|----|------|------|
| `TabManager` | `ui/tab_manager.py` | 标签页生命周期 |
| `LayoutBuilder` | `ui/layout_builder.py` | 三栏布局构建/恢复 |
| `WindowStateManager` | `ui/window_state.py` | 窗口状态持久化 |
| `DataEditorTab` | `ui/data_tab.py` | 数据编辑标签页 |
| `AIAssistantTab` | `ui/ai_assistant_tab.py` | AI 助手标签页（技能工具调用） |
| `AIBridge` | `ui/ai_bridge.py` | AgentBrain 初始化 + 面板控制 |
| `DigitalPanel` / `DigitalEmployee` / `DigitalEmployeePopup` | `ui/digital_employee.py`（方法按职责拆到 `ui/digital_panel_*.py` 各 mixin） | 数字员工面板/窗口/浮窗 |
| `CeshuController` | `ui/ceshu_controller.py` | 策划书打开、AI 上下文注入、系统同步、项目列表 |
| `LibraryController` | `ui/library_controller.py` | 库切换与刷新 |

### 5.3 策划书视图

| 类 | 职责 |
|----|------|
| `CeshuHomeView` | 首页：卡片列表/搜索/新建/模板/版本派生/AI 入口 |
| `CeshuEditorView` | 编辑器主视图（继承 6 Mixin） |
| `AIMixin` / `VersionMixin` / `ExportMixin` / `TemplateMixin` / `ReviewMixin` / `SystemMixin` | 六个能力混入（AI/版本/导出/模板/审阅/系统） |

### 5.4 可复用组件（`ui/widgets/`）

| 组件 | 职责 |
|------|------|
| `AttributePanel` | 属性展示与编辑 |
| `RelationTablePanel` | 数据项关系图可视化 |
| `LivePreviewWidget` | 实时数据预览 |
| `FormulaBuilder` | 公式构建器 |
| `AttrTable` / `AttrLibrary` / `AttrSystemEditor` | 属性表/属性库/属性系统编辑器 |
| `DynamicForm` | 动态表单 |
| `CollapsibleSection` / `CollapsibleTaskPanel` | 折叠面板 |
| `VirtualList` | 虚拟滚动列表 |
| `Toast` | 轻提示 |
| `ModelSelector` / `AgentSelector` / `AgentMonitor` | 模型/智能体选择与监控 |

---

## 6. AI 客户端

### 6.1 `src/common/ai_client.py`（函数式）

| 函数 | 说明 |
|------|------|
| `generate_text(config, prompt, ...)` | 文本生成 |
| `generate_text_stream(config, prompt, on_chunk, ...)` | 流式文本生成 |
| `generate_text_with_tools(config, messages, tools, ...)` | 带工具调用的文本生成 |
| `generate_text_stream_with_tools(...)` | 带工具流式生成 |
| `generate_vision(config, prompt, image_path, ...)` | 视觉理解 |
| `generate_image(config, prompt)` | 图像生成 |
| `test_api_connection(config)` | API 连通性测试 |

内部含 `_acquire_rate_limit`（限流）、`_request_with_retry`（重试）、`_sanitize_request_data`（脱敏）。

### 6.2 `src/common/llm_provider.py`（类式 Provider）

- `BaseLLMProvider`（ABC）：`chat()` / `chat_stream()` / `supports_vision()` / `supports_image_gen()`。
- 实现：`OpenAIProvider` / `QwenProvider` / `DoubaoProvider` / `DeepSeekProvider` / `OllamaProvider` / `GenericProvider`。
- 工厂：`create_provider(config)` / `get_provider_class(provider_name)`。

---

## 7. 安全层

| 类/模块 | 职责 |
|---------|------|
| `src/security/sandbox.py` | 代码沙箱（子进程隔离、路径防护、命令白名单） |
| `src/security/acl.py` | 访问控制列表（细粒度权限） |
| `src/security/encryption.py` | 敏感数据加密 |
| `src/security/guard.py` | 危险操作守卫 |
| `src/security/privacy.py` | 数据脱敏/隐私保护 |
| `src/security/rate_limiter.py` | 接口限流 |

---

## 8. 常用工具函数

| 函数 | 位置 | 说明 |
|------|------|------|
| `get_logger()` | `src/common/logger.py` | 获取全局日志器（单例） |
| `EventBus().emit/on/off` | `src/common/event_bus.py` | 事件总线 |
| `atomic_write_json(path, data, ...)` | `src/common/common.py` | 原子 JSON 写入 |
| `init_sentry()` / `capture_exception()` | `src/common/sentry_client.py` | 错误上报 |
| `get_config()` | `src/config/settings.py` | 获取配置单例 |
| `reload_from_type_schema(...)` | `src/config/constants.py` | 类型注册表更新 |
