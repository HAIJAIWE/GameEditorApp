# 02 — 模块职责

> 本文按目录逐层说明每个模块的职责边界、内部文件组成与对外接口。新增功能时先查此表确定放置位置。

---

## 1. 入口层

### 1.1 根目录 `app.py`
- **职责**：启动器。把 `src/` 加入 `sys.path`，`chdir` 到项目根，然后调用 `src.app.main()`。
- **注意**：真正的入口逻辑在 `src/app.py`。

### 1.2 `src/app.py`
- **职责**：创建 `QApplication` 与 `MainWindow`，注册崩溃日志（faulthandler + excepthook），初始化 Sentry，进入 Qt 事件循环。
- **关键函数**：`main()`。

---

## 2. 配置层 `src/config/`

| 文件 | 职责 |
|------|------|
| `constants.py` | 全局常量：窗口标题、13 种数据类型注册表（`_TypeSchemaRegistry`，线程安全）、字段类型 `FIELD_TYPE_MAP`、RPG 属性分类、策划书（Ceshu）常量、自动保存参数等 |
| `settings.py` | `AppConfig` 单例：目录路径、AI 配置（文本/视觉/图像三套）、模板管理、智能体配置、字段配置、平台预设；API Key 用 Fernet 加解密（`_obscure`/`_clarify`） |
| `__init__.py` | 包导出 |

**AppConfig 关键点**
- 单例（线程安全 `__new__` + 锁），通过 `get_config()` 获取。
- 目录布局：`data_dir = 项目根/data`，`config_dir = data/settings`，`export_dir = exports`。
- `library_manager` 属性懒加载（避免循环导入）。
- `get_type_schema()` / `get_fields_config()`：字段定义统一由 type_schema 派生，fields_config 仅存 label 覆盖。

---

## 3. 通用层 `src/common/`

| 文件 | 职责 |
|------|------|
| `logger.py` | `AppLogger` 单例 + `LogCaptureHandler`（内存环形缓冲，供 UI 显示最近日志），`get_logger()` 获取 |
| `event_bus.py` | `EventBus` 全局单例事件总线：`on/off/emit/has_listeners/clear`，支持弱引用回调 |
| `i18n.py` | 国际化资源管理 |
| `cache.py` | 通用缓存工具 |
| `ai_client.py` | AI 能力统一入口：`generate_text` / `generate_text_stream` / `generate_text_with_tools` / `generate_vision` / `generate_image` / `test_api_connection`；内置速率限制、请求重试、数据脱敏（`_sanitize_request_data`） |
| `llm_provider.py` | LLM Provider 抽象：`BaseLLMProvider`（ABC）+ 具体实现 `OpenAIProvider` / `QwenProvider` / `DoubaoProvider` / `DeepSeekProvider` / `OllamaProvider` / `GenericProvider`；工厂 `create_provider(config)` |
| `async_runner.py` | 后台线程安全任务调度 |
| `auto_backup.py` | 自动保存/备份逻辑 |
| `auto_updater.py` | 启动时检查更新 |
| `data_validator.py` | 数据字段/格式校验 |
| `data_importer.py` / `data_ref.py` / `data_diff.py` | 数据导入、引用解析、差异比较 |
| `metrics.py` | 性能与使用指标收集 |
| `sentry_client.py` | Sentry 错误上报（`init_sentry` / `capture_exception`） |
| `graph.py` | 图结构工具（依赖图等） |
| `shortcuts.py` / `text.py` / `icons.py` / `lucide_icon.py` | 快捷键、文本工具、图标 |
| `exceptions.py` | 自定义异常类型 |
| `interfaces.py` | 通用接口定义 |
| `config_schema.py` / `validator.py` / `rate_limiter.py` / `lazy_loader.py` / `path_utils.py` / `text_game_export.py` | 配置模式、通用校验、限流、懒加载、路径、文本游戏导出 |

---

## 4. 核心层 `src/core/`

### 4.1 数据模型与存储

| 文件 | 职责 |
|------|------|
| `type_schema.py` | 数据类型定义：`TypeField`（字段）、`TypeDef`（类型定义）、`TypeSchema`（类型集合，支持保存/加载/升级合并/`create_default_rpg_schema()`） |
| `data_manager.py` | `OptimizedDataManager`：数据 CRUD、LRU 缓存、ID 索引、自增计数器、搜索缓存、异步打开/保存、ID 生成、未保存变更跟踪 |
| `library_manager.py` | 多库管理：`LibraryManager`（扫描/创建/切换/重命名/删除库、类型模式升级迁移、示例数据填充、策划书目录管理）、`LibraryInfo` |
| `defaults/rpg_schema.py` | 默认 RPG 类型模式初始化数据 |
| `operation_log.py` | 操作日志（撤销/重做数据源） |

### 4.2 数值系统

| 文件 | 职责 |
|------|------|
| `calc_engine.py` | `AttributeCalcEngine` 属性公式引擎：拓扑排序求值依赖、`calculate_single/calculate_all`、公式字符串化、JSON 导入导出 |
| `attr_system.py` | 属性系统（基础/派生/战斗属性定义与联动） |
| `buff_system.py` | Buff 增益系统 |
| `equipment_system.py` | 装备系统 |
| `level_scaling.py` | 等级成长曲线与数值缩放 |
| `extended_formulas.py` | 扩展公式库 |
| `cedict.py` | 中英词典工具（AI 润色辅助） |

### 4.3 策划书系统 `core/ceshu/`

| 文件 | 职责 |
|------|------|
| `ceshu_model.py` | `CeshuModel`：18 章 GDD 数据模型（meta/vision/worldview/gameplay/systems/numeric/art/tech/resources + v5 的 market_analysis/characters/combat/economy/monetization/mvp/risk_handling/audio/accessibility），章节 get/set、系统启用开关、进度统计、校验、自动填充 |
| `ceshu_manager.py` | `CeshuManager`：策划书 CRUD、目录扫描缓存、版本派生/列表/切换、6 种格式导出、导入、最近打开、临时备份恢复 |
| `ceshu_template.py` | `CeshuTemplate` 单例模板引擎：加载/查找/预览模板（数据文件 `ceshu_templates.json`） |
| `ceshu_scorer.py` | 评分引擎：`ChapterScore` / `ScoreReport`，`score_ceshu()` 三维评分（结构/质量/市场），S/A/B/C/D 五级，含行业基准与改进建议 |
| `ceshu_checklist.py` | 50 项生产就绪检查清单 |
| `ceshu_validation.py` | 策划书数据校验规则 |
| `ceshu_fill.py` | 章节自动填充 |
| `ceshu_changelog.py` | 版本变更日志 |
| `ceshu_migration.py` | v4→v5 数据迁移 |
| `ceshu_data_sync.py` | `CeshuDataSync`：策划书 ↔ 游戏数据双向同步（订阅 EventBus） |
| `ceshu_export_common.py` | 导出公共逻辑（样式、页码、封面等） |
| `ceshu_docx/pdf/pptx/markdown/html/excel_exporter.py` | 6 种格式导出器 |
| `custom_template_manager.py` | 自定义模板 CRUD |
| `field_dependencies.py` | 跨章节字段依赖关系（数据 `field_dependencies.json`） |
| `ceshu_constants.py` | 策划书常量 |

### 4.4 Agent 系统 `core/agent/`

| 文件 | 职责 |
|------|------|
| `brain.py` | `AgentBrain` 核心大脑：意图识别、计划执行、LLM 迭代、失败反思与自愈、子智能体调度、多智能体辩论、会话管理、危险操作拦截 |
| `dispatcher.py` | `ToolDispatcher` 技能注册与分发中心：技能发现、模糊匹配、并行执行、拓扑排序、参数修复、MCP 工具注册 |
| `intent.py` | `IntentParser`（关键词/LLM 意图解析）+ `Planner`（结构化计划生成） |
| `mcp.py` | `MCPRegistry`：外部 MCP 服务注册、HTTP/STDIO 工具发现、代理调用 |
| `memory.py` | `Memory` 长期/短期记忆：向量索引、语义搜索、会话上下文 |
| `workspace.py` | `WorkspaceManager` 多工作区：独立身份/记忆/策划方案存储 |
| `learner.py` | `Learner` 历史经验学习：意图增强、模式挖掘、个性化提示、技能模板生成 |
| `prompts.py` | 所有用户面智能体提示词与团队系统提示词 |
| `safety_guard.py` | `SafetyGuard` 危险工具识别、令牌裁剪、替换建议 |
| `plugin_system.py` | `PluginSystem` 插件发现/加载/卸载/钩子 |
| `model_registry.py` | `ModelRegistry` 文本/视觉/图像模型配置统一管理 |
| `models.py` | 数据模型：`Intent` / `SkillResult` / `MemoryEntry` / `ExecutionContext` / `FeedbackRecord` |
| `skill_protocol.py` | `BaseSkill` 抽象基类（技能标准接口：execute/rollback/to_json_schema/get_tool_description） |
| `code_sandbox.py` | 代码沙箱（子进程隔离执行） |
| `frontend_snapshot.py` | `FrontendSnapshot` 前端状态快照（解耦 AI 与 PyQt） |
| `speech_service.py` / `vision_capture.py` / `perf_dashboard.py` / `semantic_memory.py` | 语音/视觉/性能面板/语义记忆 |
| `agents/` | `AgentManager`（多智能体团队管理）、`Collaboration`（协作黑板）、`IdentityManager`（身份管理）、`SubAgentEngine`（子智能体并行执行） |
| `skills/` | 25 个技能（见下节） |
| `diagnostics/` | 自愈诊断：`ErrorHandler`、`RootCause`（根因分析）、`FixMarket`（修复市场）、`LLMHealer`、`PerfHealer`、`SecurityHealer`、`RepairReplay`、`ASTAnalyzer`、`DependencyGraph`、`Predictive`、`AbTester`、`JsonRepair`、`ProblemsAndDiagnostics`、`RootCause` 等 |
| `workflow/` | `WorkflowEngine`（工作流引擎）+ `Scheduler`（任务调度/执行队列） |

**25 个技能清单**（`skills/`，`common.py` 提供参数规范化 `normalize_params`）：

`ask_user` · `audio` · `batch_data` · `ceshu` · `code` · `delegate` · `diagnosis` · `editor_layout` · `export_doc` · `game_balance` · `game_data` · `git_tool` · `image` · `model` · `pdf_parse` · `scheduler` · `schema_edit` · `shell` · `system` · `todo` · `ui_control` · `ui_preview` · `visualization` · `web_search` · `workflow`

### 4.5 其他核心模块

| 文件 | 职责 |
|------|------|
| `game_templates.py` | 游戏数据模板（技能/角色等描述模板） |
| `editor_layout.py` | 编辑器布局定义与恢复（`editor_layouts.json`） |
| `style_manager.py` | UI 样式管理 |
| `type_schema.py` | 见 4.1 |

---

## 5. UI 层 `src/ui/`

| 文件 | 职责 |
|------|------|
| `main_window.py` | `MainWindow` 主窗口：布局构建、菜单、状态栏、快捷键、自动保存、事件总线订阅、库切换、撤销/重做 |
| `tab_manager.py` | `TabManager` 标签页生命周期/延迟加载/重建 |
| `menus.py` | 菜单配置 |
| `layout_builder.py` | `LayoutBuilder` 三栏布局构建/恢复/分割比例持久化 |
| `window_state.py` | `WindowStateManager` 窗口几何/主题/布局状态持久化 |
| `effects.py` / `theme_effects.py` / `text_glow_effect.py` | UI 特效（灯效/流光/文字辉光） |
| `data_tab.py` | `DataEditorTab` 数据编辑标签页（列表 + 表单） |
| `ai_assistant_tab.py` | `AIAssistantTab` AI 助手标签页（多技能工具调用 + 对话） |
| `ai_bridge.py` | `AIBridge` AgentBrain 初始化与数字员工面板控制 |
| `digital_employee.py` | `DigitalPanel` / `DigitalEmployee` 数字员工面板/独立窗口 |
| `digital_employee_dialogs.py` / `digital_employee_workers.py` | 数字员工对话框与后台线程 |
| `ceshu_controller.py` | `CeshuController` 策划书控制器：打开/上下文注入/系统同步/项目列表 |
| `library_controller.py` | `LibraryController` 库切换与刷新 |
| `field_config.py` | 字段配置对话框 |
| `chat_renderer.py` | 聊天渲染 |
| `shortcuts_dialog.py` | 快捷键参考对话框 |
| `ceshu/` | 策划书子界面（见下） |

### 5.1 策划书 UI `src/ui/ceshu/`

| 文件 | 职责 |
|------|------|
| `home_view.py` | `CeshuHomeView` 首页：策划书卡片列表、最近打开、搜索、新建/模板/版本派生、AI 快速生成入口 |
| `editor_view.py` | `CeshuEditorView`（多继承 6 个 Mixin）编辑器视图：章节切换、自动保存、表单渲染 |
| `editor_view_mixins.py` | `AIMixin` / `VersionMixin` / `ExportMixin` / `TemplateMixin` / `ReviewMixin` / `SystemMixin` 六个能力 Mixin |
| `editor_view_workers.py` | 编辑器后台线程 |
| `chapter_panel.py` | 章节面板 |
| `chapter_forms/` | 章节表单组件（`_base`/`_common`/`_industrial`） |
| `chapter_templates.py` / `chapter_notes.py` | 章节模板 / 章节笔记 |
| `systems_editor.py` | 系统配置编辑器（13 游戏系统） |
| `preview_panel.py` | 实时预览面板 |
| `ai_panel.py` / `ai_field_button.py` / `ai_full_generate_dialog.py` / `ai_review_dialog.py` | AI 面板/字段级 AI 按钮/全文生成/审阅 |
| `checklist_dialog.py` / `validation_dialog.py` / `score_report_dialog.py` | 检查清单/校验/评分报告对话框 |
| `version_diff_dialog.py` / `version_timeline_dialog.py` / `changelog_dialog.py` | 版本差异/时间线/变更日志 |
| `field_dependency_graph.py` / `system_dependency_graph.py` | 字段/系统依赖关系图 |
| `competitive_chart.py` | 竞品对比图表 |
| `home_card.py` | 首页卡片组件 |
| `ceshu_theme.py` | 策划书主题 |
| `template_editor_dialog.py` / `template_picker_dialog.py` | 模板编辑/选择 |
| `preset_market_dialog.py` | 预设市场 |
| `word_stats_dialog.py` | 字数统计 |

### 5.2 组件/对话框/主题

| 目录 | 职责 |
|------|------|
| `widgets/` | 可复用组件：`AttributePanel`（属性面板）、`RelationGraph`（关系图）、`LivePreview`（实时预览）、`FormulaBuilder`、`AttrTable`、`DynamicForm`、`CollapsibleSection`、`VirtualList`、`ModelSelector`、`AgentSelector`、`AgentMonitor`、`LibraryBar`、`Toast`、`HomeWidget` 等 |
| `dialogs/` | 对话框：`SettingsDialog`（设置）、`ApiConfig`、`TypeEditorDialog`、`BatchEdit`、`AdvancedSearch`、`DataDiffDialog`、`BackupManager`、`EngineExport`、`QuickCreate`、`ReferencePanel`、`Statistics`、`TemplateManager`、`AutoInputDialog`、`StartupModeDialog` |
| `themes/themes.py` | 10 套主题配置 |

---

## 6. 安全层 `src/security/`

| 文件 | 职责 |
|------|------|
| `sandbox.py` | 代码执行沙箱（路径遍历防护、命令白名单/黑名单） |
| `acl.py` | 访问控制列表（细粒度权限） |
| `encryption.py` | 敏感数据加密 |
| `guard.py` | 安全守卫（危险操作检测） |
| `privacy.py` | 数据脱敏/隐私保护 |
| `rate_limiter.py` | 接口访问频率限制 |

---

## 7. 功能层 `src/features/`

| 文件 | 职责 |
|------|------|
| `ai.py` | AI 生成能力封装 |
| `_ai_dialog.py` / `_ai_image.py` | AI 对话框 / AI 图像生成 |
| `export.py` | JSON/CSV/Excel 导入导出、批量导入导出、批量编辑 |
| `engine_export.py` | 引擎导出：`export_to_unity` / `export_to_unreal` / `export_to_godot` / `export_to_cocos2d` / `show_game_data_preview` |
| `backup.py` | 配置备份与回滚 |
| `statistics.py` | 数据统计与图表 |
| `advanced.py` | 高级功能（可视化、关联分析） |

---

## 8. 部署 / 构建（原 `src/deployment/` 已移除）

> `src/deployment/`（database/version_manager/config_center/observability/message_queue/local_adapter）在引用核验中属于**零引用的孤儿模块**，已整体删除；打包、发布能力保留在 `scripts/` 与 CI：

| 路径 | 职责 |
|------|------|
| `scripts/launch.bat` | Windows 启动脚本（优先使用 `.venv`） |
| `scripts/build.bat` | Windows 打包脚本（PyArmor 加密 + PyInstaller） |
| `.github/workflows/` | CI（`ci.yml`：ruff/mypy/pytest 覆盖率 30% 门槛/安全性审计/e2e）+ 发布（`release.yml`） |

---

## 9. 产品内测试工具（原 `src/testing/` 已移除）

> `src/testing/`（benchmark_tests/auto_evaluator/feedback_dashboard/scenario_tester）同样为孤儿模块（仅被硬编码同名测试文件引用、无产品入口），已删除；Agent/自愈相关的行为评测由 `tests/integration/` 覆盖。

---

## 10. 测试目录 `tests/`

| 目录 | 职责 |
|------|------|
| `unit/` | 单元测试（50+ 文件，覆盖数据层/Agent/策划书/安全/配置/主题等） |
| `integration/` | 集成测试（GUI 冒烟、AI 对话、自愈评测、前端关键路径） |
| `e2e/` | 端到端测试（`test_ceshu_workflow`、`test_data_workflow`） |
| `conftest.py` | 全局 fixtures |

---

## 11. 资源与脚本

| 路径 | 职责 |
|------|------|
| `assets/icons/` | Lucide 风格 SVG 图标 |
| `assets/ui/` | 按钮/面板/标题栏贴图 |
| `scripts/launch.bat` | Windows 启动脚本（优先使用 `.venv`） |
| `scripts/build.bat` | Windows 打包脚本（PyArmor 加密 + PyInstaller） |
| `scripts/build_ceshu_templates.py` | 策划书模板生成 |
| `scripts/migrate_planning_to_ceshu.py` | 旧策划案迁移 |
| `config/mcp.json` | MCP 服务配置 |
| `.github/workflows/` | CI（`ci.yml`）+ 发布（`release.yml`） |
