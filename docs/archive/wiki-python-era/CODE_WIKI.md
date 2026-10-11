# Code Wiki — 墨白可视化编辑 (MB-KSHBJQ)

> ⚠️ **本目录是 Python / PyQt6 时代的历史归档，已不适用于当前代码库。**
>
> 当前技术栈为 **Electron 44 + React 19 + TypeScript**（`desktop/` 四层架构）。
> 权威架构说明见 [`docs/architecture.md`](../../architecture.md)；
> 分层契约见 [`desktop/src/shared/README.md`](../../../desktop/src/shared/README.md)。
> 本目录内容仅作历史参考，请勿据此理解现状。


> **项目代码知识库（Code Wiki）完整版**。本文件由 Wiki 各分册合并而成，系统性讲解项目架构、模块职责、关键类/函数、依赖关系与运行方式。
>
> 技术栈：Python 3.14+ · PyQt6 · SQLite/JSON · OpenAI 兼容接口 · pytest

---

## 目录

- [项目一句话简介](#项目一句话简介)
- [01 架构总览](#01-架构总览)
  - [技术选型](#1-技术选型)
  - [分层架构](#2-分层架构)
  - [启动流程](#3-启动流程)
  - [核心数据流](#4-核心数据流)
  - [事件总线](#5-事件总线解耦机制)
  - [主题系统](#6-主题系统)
  - [测试架构](#7-测试架构)
  - [设计约定](#8-设计约定开发时注意)
- [02 模块职责](#02-模块职责)
  - [入口层](#1-入口层)
  - [配置层](#2-配置层-srcconfig)
  - [通用层](#3-通用层-srccommon)
  - [核心层](#4-核心层-srccore)
  - [UI 层](#5-ui-层-srcui)
  - [安全层](#6-安全层-srcsecurity)
  - [功能层](#7-功能层-srcfeatures)
  - [部署层](#8-部署层-srcdeployment)
  - [测试层](#9-测试层-srctesting)
  - [测试目录](#10-测试目录-tests)
  - [资源与脚本](#11-资源与脚本)
- [03 关键类与函数](#03-关键类与函数说明)
  - [数据层](#1-数据层)
  - [配置层](#2-配置层)
  - [策划书系统](#3-策划书系统)
  - [Agent 系统](#4-agent-系统)
  - [UI 层](#5-ui-层)
  - [AI 客户端](#6-ai-客户端)
  - [安全层](#7-安全层)
  - [常用工具函数](#8-常用工具函数)
- [04 依赖关系](#04-依赖关系)
  - [第三方依赖](#1-第三方依赖pyprojecttoml)
  - [模块内部依赖](#2-模块内部依赖关系)
  - [数据依赖](#3-数据依赖关系)
  - [Agent 技能映射](#4-agent-技能--核心能力映射)
- [05 运行与构建](#05-运行与构建)
  - [环境要求](#1-环境要求)
  - [安装](#2-安装)
  - [运行](#3-运行)
  - [测试](#4-测试)
  - [代码质量](#5-代码质量)
  - [CI 流水线](#6-ci-流水线githubworkflowsciyml)
  - [打包发布](#7-打包发布windows)
  - [Docker 部署](#8-docker-部署)
  - [常见问题排查](#9-常见问题排查)

---

## 项目一句话简介

**墨白可视化编辑（MB-KSHBJQ）** 是一款专业的**游戏数据编辑与管理平台**，提供：

- 13 种内置游戏数据类型（职业/角色/怪物/装备/技能/天赋/道具/成就/Buff/称号/剧情/任务/对话）的可视化编辑
- Excel 风格属性公式计算（`AttributeCalcEngine`）
- 18 章工业级游戏设计文档（GDD）策划书系统，支持 AI 生成、审阅、评分、版本管理与 6 种格式导出
- 25 个技能的 AI Agent 智能体系统（ReAct 推理、多智能体协作、自愈诊断）
- 多引擎数据导出（JSON/CSV/Excel + Unity/Unreal/Godot/Cocos2d）

## 源码目录速览

```
GameEditorApp/
├── app.py                  # 根目录启动器（把 src/ 加入 sys.path 后调用 src.app.main）
├── src/
│   ├── app.py              # 应用入口（QApplication + MainWindow）
│   ├── config/             # 常量、类型注册表、AppConfig 单例配置
│   ├── common/             # 通用工具（日志、缓存、i18n、AI 客户端、事件总线等）
│   ├── core/               # 核心业务
│   │   ├── agent/          # AI Agent 系统（brain/dispatcher/skills/diagnostics/workflow）
│   │   ├── ceshu/          # 策划书系统（模型/管理器/评分/校验/6 导出器）
│   │   ├── data_manager.py # 数据 CRUD + 缓存 + 索引 + 搜索
│   │   ├── type_schema.py  # 13 种内置数据类型定义
│   │   └── ...             # 计算引擎、属性/增益/装备/等级系统、库管理、操作日志等
│   ├── ui/                 # PyQt6 界面（main_window/ceshu/widgets/dialogs/themes）
│   ├── security/           # 安全模块（沙箱/ACL/加密/隐私/限流）
│   ├── features/           # 功能模块（AI/导出/引擎导出/备份/统计）
│   ├── deployment/         # 部署运维（数据库/版本管理/配置中心/可观测性）
│   └── testing/            # 自动评测/基准测试/反馈仪表盘
├── tests/                  # unit / integration / e2e 三层测试
├── docs/                   # 文档（本 Wiki 位于 docs/wiki/）
├── scripts/                # launch.bat / build.bat / 模板脚本
├── assets/                 # 图标与 UI 图片资源
├── pyproject.toml          # 项目元数据与依赖
└── Dockerfile              # 多阶段容器化构建
```

## 三层架构速览

```
┌────────────────────────────────────────────────┐
│  UI 层  src/ui                                 │
│  MainWindow / CeshuHomeView / DataEditorTab ...│
├────────────────────────────────────────────────┤
│  核心层  src/core + src/features               │
│  data_manager / ceshu / agent / calc_engine ...│
├────────────────────────────────────────────────┤
│  支撑层  src/common + src/security + config    │
│  logger / event_bus / ai_client / sandbox ...  │
├────────────────────────────────────────────────┤
│  部署层  src/deployment + scripts + Dockerfile │
└────────────────────────────────────────────────┘
```

---

# 01 — 架构总览

> 本文说明项目整体架构、分层模型、启动流程与核心数据流。理解本页后即可把握"这个项目是怎么组织的、加新功能该放哪里"。

## 1. 技术选型

| 类别 | 技术 | 说明 |
|------|------|------|
| GUI 框架 | PyQt6 | Fusion 风格，微软雅黑字体 |
| 编程语言 | Python >= 3.14 | 全栈 Python |
| 数据存储 | SQLite / JSON | 游戏数据以 JSON 文件形式存于各库目录，元数据用 JSON |
| AI 接入 | openai + ollama | 兼容 OpenAI 协议，支持 OpenAI/Qwen/豆包/DeepSeek/Ollama/自定义 |
| 代码沙箱 | subprocess + 黑名单 | 隔离执行 LLM 生成的代码 |
| 向量检索 | chromadb（可选） | Agent 记忆系统可选依赖 |
| 测试 | pytest | unit/integration/e2e 三层 |
| 质量 | ruff（lint）+ mypy（类型） | CI 强制 |
| 打包 | PyInstaller + PyArmor | 发布版代码加密 |

## 2. 分层架构

项目采用清晰的分层架构，依赖方向为：**UI 层 → 核心层/功能层 → 支撑层（common/security/config）→ 部署层**。

```
┌────────────────────────────────────────────────────────────┐
│                    UI 层 (src/ui)                            │
│  main_window / tab_manager / menus / layout_builder         │
│  ceshu/ (home_view, editor_view, ...)                       │
│  widgets/ (属性面板、关系图、实时预览...)                    │
│  dialogs/ (设置、批量编辑、模板管理...)                      │
│  themes/ (10 套主题)                                        │
├────────────────────────────────────────────────────────────┤
│                    核心层 (src/core)                         │
│  data_manager   数据 CRUD/缓存/索引/搜索                     │
│  type_schema    13 种数据类型定义                            │
│  library_manager 多库管理（可切换的独立数据项目）            │
│  calc_engine    属性公式计算引擎                             │
│  attr/buff/equipment/level_scaling  数值系统                 │
│  ceshu/         策划书系统（18 章 GDD）                      │
│  agent/         AI Agent 系统（25 技能）                     │
│  operation_log  操作日志 / editor_layout 布局 / style_manager │
├────────────────────────────────────────────────────────────┤
│                    功能层 (src/features)                     │
│  ai / export / engine_export / backup / statistics / advanced│
├────────────────────────────────────────────────────────────┤
│                    支撑层                                     │
│  src/common    logger / event_bus / i18n / cache / ai_client │
│                llm_provider / auto_backup / auto_updater ... │
│  src/security  sandbox / acl / encryption / guard / privacy /│
│                rate_limiter                                  │
│  src/config    constants(类型注册表) / settings(AppConfig)   │
├────────────────────────────────────────────────────────────┤
│                    部署层                                     │
│  src/deployment  database / version_manager / config_center /│
│                  observability / message_queue / local_adapter│
│  scripts/       launch.bat / build.bat (PyArmor+PyInstaller) │
│  Dockerfile / .github/workflows                              │
└────────────────────────────────────────────────────────────┘
```

### 2.1 各层职责与依赖规则

- **UI 层**：只负责交互与展示，通过控制器（如 `CeshuController`、`LibraryController`、`AIBridge`）调用核心层，不直接操作文件。
- **核心层**：业务逻辑与数据模型，不依赖 PyQt（agent 层通过 `frontend_snapshot` 解耦对 UI 的依赖）。
- **支撑层**：被核心层与 UI 层共享的通用能力（日志、事件、AI 客户端、安全）。
- **部署层**：打包、发布、运行环境相关内容，不参与业务运行路径。

## 3. 启动流程

```
根目录 app.py
   └─ 将 src/ 加入 sys.path，chdir 到项目根
       └─ src/app.py
           ├─ 设置 Windows UTF-8 控制台编码
           ├─ 启用 faulthandler（segfault 写入 logs/crash.log）
           ├─ 注册 sys.excepthook（未捕获异常写 crash.log）
           ├─ init_sentry()                     # 可观测性初始化
           └─ main()
               ├─ QApplication（Fusion 风格 + 微软雅黑字体）
               ├─ MainWindow()                  # 主窗口（见下）
               ├─ window.show()
               └─ app.exec()                    # 进入事件循环
```

### MainWindow 初始化要点

1. 创建三栏布局（`LayoutBuilder`）：左侧项目列表 / 中间标签页（`TabManager`）/ 右侧辅助面板。
2. 初始化库管理器（`LibraryManager`），扫描/恢复上次活跃库，必要时自动迁移类型模式。
3. 初始化事件总线订阅（`EventBus`），主题切换、数据变更、重建通知等均通过事件解耦。
4. 检查启动模式（数据模式/策划书模式/完整模式），按需自动加载标签页。
5. 检查更新（`auto_updater`）、恢复窗口状态、启动自动保存定时器。

## 4. 核心数据流

### 4.1 游戏数据编辑流

```
用户操作（DataEditorTab）
  → OptimizedDataManager.add_item / update_item / delete_item
  → 数据校验（common/data_validator.py）
  → 写入 JSON 文件（原子写入 atomic_write_json）
  → 更新内存缓存 + 重建 ID 索引
  → EventBus.emit("data_changed") → 通知关联视图刷新
```

### 4.2 策划书工作流

```
用户输入 → CeshuManager.create_ceshu() → CeshuModel（18 章）
  → 编辑章节 → CeshuModel.set_chapter()
  → 校验 → CeshuModel.validate()（完备性检查）
  → 评分 → score_ceshu()（CeshuScorer，结构/质量/市场三维，S/A/B/C/D）
  → 保存 → CeshuManager.save_ceshu()（原子写入 + 临时备份）
  → 版本管理 → derive_version() / set_active_version()（版本树）
  → 导出 → export_ceshu_docx/pdf/pptx/markdown/html/excel（6 种）
  → 同步 → CeshuDataSync 双向同步到游戏数据（EventBus 驱动）
```

### 4.3 Agent 工作流

```
用户指令 → AgentBrain.process()
  → IntentParser.parse()（关键词快匹配 or LLM 深度解析）
  → Planner 生成计划 → ToolDispatcher.execute() / execute_parallel()
      → BaseSkill.execute()（25 技能之一）
  → 失败反思 _reflect_on_failures()（自愈诊断链路）
  → 结果回写 UI（DigitalPanel）
```

## 5. 事件总线（解耦机制）

`common/event_bus.py` 提供全局单例 `EventBus`，是 UI 与核心层、模块与模块之间的主要解耦手段。核心事件包括：

| 事件 | 触发方 | 消费方 |
|------|--------|--------|
| `data_changed` | DataManager / 各编辑器 | 相关标签页、CeshuDataSync |
| `ceshu_changed` | CeshuEditorView | CeshuDataSync、版本面板 |
| `library_switched` | LibraryController | MainWindow、全部标签页重建 |
| `theme_changed` | MainWindow.change_theme | 所有视图应用新主题 |
| `rebuild_needed` | 类型模式变更 | MainWindow 重建标签页 |

## 6. 主题系统

- `ui/themes/themes.py` 定义 10 套主题（深色/亮色自适应）。
- `ui/theme_effects.py`（`ThemeEffectsManager`）负责流光/脉冲等低端特效。
- `ui/effects.py` 提供灯效、动画等特效工厂。
- 切换流程：`MainWindow.change_theme(name)` → `EventBus.emit("theme_changed")` → 各视图订阅回调刷新样式。

## 7. 测试架构

```
tests/
├── unit/           # 单元测试（数据层/Agent/策划书模型/安全/配置等）
├── integration/    # 集成测试（GUI 冒烟、AI 对话集成、自愈评测）
├── e2e/            # 端到端测试（策划书工作流、数据工作流）
└── conftest.py     # 全局 fixtures
```

CI（`.github/workflows/ci.yml`）包含 lint（ruff）、typecheck（mypy）、test（pytest + 覆盖率 > 25%）、安全审计（pip-audit + bandit）、e2e 五个 Job。

## 8. 设计约定（开发时注意）

1. **数据以 JSON 文件为唯一事实源**，内存缓存仅为加速，任何修改后必须落盘。
2. **类型/字段定义统一由 `TypeSchema`（type_schema.py）管理**，`config/constants.py` 的类型注册表 `_TypeSchemaRegistry` 线程安全，禁止全局可变列表。
3. **模块间通信优先走 `EventBus`**，避免 UI 与核心层硬耦合。
4. **AI 能力统一走 `common/ai_client.py` + `common/llm_provider.py`**，业务代码不要直接 import openai。
5. **敏感配置（API Key）用 Fernet 加密存储**（`config/settings.py`）。
6. **新增 Agent 能力 = 新增一个继承 `BaseSkill` 的技能类**，放入 `src/core/agent/skills/`，`ToolDispatcher.discover_skills()` 自动发现。

---

# 02 — 模块职责

> 本文按目录逐层说明每个模块的职责边界、内部文件组成与对外接口。新增功能时先查此表确定放置位置。

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
| `brain.py` | `AgentBrain` 核心大脑：意图识别、计划执行、LLM 迭代、失败反思与自愈、子智能体调度、多智能体辩论、会话管理、危险操作拦截（方法按职责拆到 `brain_session` / `_plan` / `_llm` / `_prompt` / `_reflect` / `_subagent` 六个 mixin，共享状态见 `brain_state.py`） |
| `dispatcher.py` | `ToolDispatcher` 技能注册与分发中心：技能发现、模糊匹配、并行执行、拓扑排序、参数修复、MCP 工具注册 |
| `intent.py` | `IntentParser`（关键词/LLM 意图解析）+ `Planner`（结构化计划生成） |
| `mcp.py` | `MCPRegistry`：外部 MCP 服务注册、HTTP/STDIO 工具发现、代理调用 |
| `memory.py` | `Memory` 长期/短期记忆：向量索引、语义搜索、会话上下文（方法按职责拆到 `memory_store` / `_history` / `_context` / `_search` / `_vector` 五个 mixin，共享状态见 `memory_state.py`） |
| `memory_embedder.py` / `memory_index.py` | `VectorEmbedder`（ngram + TF-IDF）/ `MemoryIndex`（关键词索引文件读写） |
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
| `diagnostics/` | 自愈诊断：`ErrorHandler`、`RootCause`（根因分析）、`FixMarket`（修复市场）、`LLMHealer`、`PerfHealer`、`SecurityHealer`、`RepairReplay`、`ASTAnalyzer`、`DependencyGraph`、`Predictive`、`AbTester`、`JsonRepair`、`ProblemsAndDiagnostics` 等 |
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
| `ai_bridge.py` | `AIBridge` AgentBrain 初始化与数字员工面板控制 |
| `digital_employee.py` | `DigitalPanel` / `DigitalEmployee` / `DigitalEmployeePopup` 数字员工面板、独立窗口与浮窗 |
| `digital_panel_state.py` | `DigitalPanelState` 各 mixin 的共享状态与方法签名声明 |
| `digital_panel_ui.py` / `_workspace.py` / `_tasks.py` / `_input.py` / `_chat.py` / `_theme.py` | `DigitalPanel` 按职责拆分的六个 mixin（界面 / 工作区 / 任务 / 输入 / 对话 / 主题） |
| `digital_employee_workers.py` | 数字员工后台线程 |
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
| `widgets/` | 可复用组件：`AttributePanel`（属性面板）、`RelationGraph`（关系图）、`LivePreview`（实时预览）、`FormulaBuilder`、`AttrTable`、`DynamicForm`、`CollapsibleSection`、`VirtualList`、`ModelSelector`、`AgentMonitor`、`LibraryBar`、`Toast`、`HomeWidget` 等 |
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

## 8. 部署层 `src/deployment/`

| 文件 | 职责 |
|------|------|
| `database.py` | 数据库管理（抽象底层存储） |
| `version_manager.py` | 版本管理/升级 |
| `config_center/config_manager.py` | 配置中心（集中管理应用配置） |
| `observability/metrics.py` | 可观测性指标（与监控集成） |
| `local_adapter.py` | 本地文件/数据适配 |
| `message_queue.py` | 消息队列（异步任务分发） |

---

## 9. 测试层 `src/testing/`

| 文件 | 职责 |
|------|------|
| `auto_evaluator.py` | Agent 自动评测 |
| `benchmark_tests.py` | 基准性能测试 |
| `feedback_dashboard.py` | 反馈仪表盘 |
| `scenario_tester.py` | 场景化测试器 |

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

---

# 03 — 关键类与函数说明

> 本文收录项目中最核心的类与函数，按系统分组，说明其职责、关键方法与使用场景。二次开发时优先查阅本节。

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
| `ModelSelector` / `AgentMonitor` | 模型选择与智能体监控 |

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

---

# 04 — 依赖关系

> 本文包含两部分：① 第三方依赖（pip 包）及用途；② 项目内部模块间的依赖关系与数据依赖。

## 1. 第三方依赖（`pyproject.toml`）

### 1.1 运行时依赖

| 包 | 版本约束 | 用途 |
|----|----------|------|
| `PyQt6` | >=6.6.0,<7.0.0 | GUI 框架（全部界面） |
| `Pillow` | >=12.2.0,<13.0.0 | 图像处理（图标/图片加载） |
| `requests` | >=2.34.0,<3.0.0 | HTTP 请求（AI API 等） |
| `openai` | >=2.41.0,<3.0.0 | OpenAI 兼容接口调用 |
| `qtawesome` | >=1.4.2,<2.0.0 | Qt 图标库 |
| `markdown` | >=3.10.0,<4.0.0 | Markdown 渲染（策划书/聊天） |
| `cryptography` | >=48.0.0 | API Key 加密（Fernet） |
| `python-docx` | >=1.2.0 | 策划书导出 .docx |
| `python-pptx` | >=1.0.0 | 策划书导出 .pptx |
| `ollama` | >=0.6.0 | 本地 Ollama 模型接入 |
| `Pygments` | >=2.20.0 | 代码高亮 |
| `openpyxl` | >=3.1.0 | Excel 导出/导入（.xlsx） |

### 1.2 开发依赖（`[dev]`）

| 包 | 用途 |
|----|------|
| `pytest` | 测试框架 |
| `pytest-cov` | 覆盖率 |
| `pytest-timeout` | 测试超时控制 |
| `mypy` | 类型检查 |
| `ruff` | lint + 格式化 |

### 1.3 可选依赖（`[chromadb]`）

| 包 | 用途 |
|----|------|
| `chromadb` | Agent 语义记忆的向量检索（可选） |

### 1.4 打包/CI 工具依赖（非 pyproject 声明）

| 工具 | 用途 |
|------|------|
| `PyInstaller` | 打包 exe（`scripts/build.bat`） |
| `PyArmor` | 源码混淆加密（发布版） |
| `pip-audit` | CI 依赖安全审计 |
| `bandit` | CI SAST 扫描 |

---

## 2. 模块内部依赖关系

### 2.1 分层依赖（自顶向下）

```
src/ui (PyQt6)  ───────────┐
        │                  │
        ▼                  ▼
src/features ──► src/core (纯 Python，不依赖 PyQt)
        │                  │
        ▼                  ▼
src/common  ◄── src/core（logger/event_bus/ai_client 被核心层复用）
src/security ◄── src/core（sandbox/acl 被 Agent 层复用）
src/config    ◄── src/common、src/core（constants 被全项目引用）
src/deployment（打包/发布，运行时不参与）
```

### 2.2 关键模块依赖明细

| 模块 | 依赖的其它内部模块 |
|------|---------------------|
| `src/app.py` | `common.logger`、`common.sentry_client`、`ui.MainWindow` |
| `MainWindow` | `ui.*`（TabManager/LayoutBuilder/menus）、`config.AppConfig`、`core.library_manager`、`common.event_bus`、`ui.ceshu_controller`、`ui.library_controller` |
| `OptimizedDataManager` | `config.constants`、`config.settings(AppConfig)`、`core.type_schema`、`core.library_manager`、`common.common`（atomic_write_json） |
| `LibraryManager` | `core.type_schema`、`config.constants`、`core.defaults.rpg_schema`、`core.ceshu` |
| `CeshuManager` | `core.ceshu.ceshu_model`、`ceshu_template`、各 `*_exporter`、`ceshu_migration` |
| `CeshuModel` | `config.constants`（章节/系统常量） |
| `CeshuDataSync` | `common.event_bus`、`core.data_manager`、`core.type_schema` |
| `AgentBrain` | `core.agent.dispatcher`、`intent`、`memory`、`workspace`、`learner`、`model_registry`、`safety_guard`、`prompts`、`agents/*`、`diagnostics/*`、`workflow/*`、`common.ai_client`、`common.llm_provider` |
| `ToolDispatcher` | `core.agent.skills`（25 技能）、`skill_protocol.BaseSkill`、`mcp` |
| `各 Skill` | `core.agent.skills.common`（normalize_params）、`core.data_manager`、`core.ceshu`、`core.agent.brain`（子代理）等 |
| `ai_client` | `common.llm_provider`、`common.rate_limiter`、`config.settings` |
| `AppConfig` | `common.logger`、`config.constants`、`cryptography`（Fernet） |
| `features/export` | `core.data_manager`、`config.settings`、openpyxl/csv |
| `features/engine_export` | `core.data_manager`、`config.settings` |
| `ui/ceshu_controller` | `core.ceshu.*`、`core.data_manager`、`common.event_bus` |
| `security/sandbox` | subprocess、`config` |

### 2.3 循环依赖规避设计

- `AppConfig.library_manager` 使用**懒加载属性**（首次访问才 import `LibraryManager`），避免 config ↔ core 循环导入。
- `config/constants.py` 的 `_TypeSchemaRegistry` 通过**模块级 `__getattr__`** 兼容旧访问方式，同时保持线程安全。
- Agent 层通过 `frontend_snapshot.py` **解耦对 PyQt 的依赖**（核心层不 import PyQt）。

---

## 3. 数据依赖关系

### 3.1 文件/存储布局

```
项目根/
├── data/                       # 运行时数据（AppConfig.data_dir）
│   ├── default.json            # 默认数据文件
│   ├── settings/               # 配置目录
│   │   ├── api_config.json     # AI 配置（API Key 加密）
│   │   ├── fields_config.json  # 字段 label 覆盖
│   │   ├── agents.json         # 智能体配置
│   │   ├── relations.json / workflow_config.json / keyword_templates.json
│   │   └── preset_templates.json
│   ├── templates/              # 数据模板
│   ├── backups/                # 备份目录
│   └── libraries/              # 多库（每库含 type_schema.json、data、ceshu/）
├── exports/                    # 导出输出目录
├── logs/                       # 运行日志（含 crash.log）
└── assets/                     # 静态资源（图标/UI 图）
```

### 3.2 数据库文件（每库）

| 文件 | 说明 |
|------|------|
| `type_schema.json` | 库的类型模式（13 类型字段定义） |
| `data.json` / `default.json` | 游戏数据本体 |
| `ceshu/` | 策划书存储目录（每份策划书一个 JSON + 版本衍生） |
| `ceshu_templates.json` | 策划书模板定义（core/ceshu/data/） |
| `field_dependencies.json` | 字段依赖关系定义（core/ceshu/data/） |
| `editor_layouts.json` | 编辑器布局预设（src/data/） |
| `cedict.txt` | 中英词典数据（src/data/） |

### 3.3 数据类型依赖（13 种内置类型）

```
类型注册表（config/constants.py，_TypeSchemaRegistry）：
job(职业) role(角色) monster(怪物) equip(装备) skill(技能)
talent(天赋) item(道具) achievement(成就) buff(Buff) title(称号)
story(剧情) task(任务) dialog(对话)
```

- 各类型的字段定义由 `TypeSchema` 管理；`skills/common.py` 的 `_resolve_plural/_resolve_singular` 统一处理单复数映射。
- 类型与"库"解耦：每个库可拥有独立 schema，切换库时通过 `reload_from_type_schema()` 更新全局注册表。

### 3.4 事件依赖

| 事件 | 生产者 → 消费者 |
|------|-----------------|
| `data_changed` | DataManager/编辑器 → 各标签页、CeshuDataSync |
| `ceshu_changed` | CeshuEditorView → CeshuDataSync、版本/预览面板 |
| `library_switched` | LibraryController → MainWindow 全量重建 |
| `theme_changed` | MainWindow → 所有视图 |
| `rebuild_needed` | 类型模式变更 → MainWindow 重建标签页 |

---

## 4. Agent 技能 → 核心能力映射

| 技能 | 调用的核心能力 |
|------|----------------|
| `game_data_skill` | `DataManager` 增删改查 |
| `ceshu_skill` | `CeshuManager` / `CeshuModel` |
| `code_skill` / `shell_skill` | `code_sandbox` / subprocess |
| `batch_data_skill` | `DataManager` + `features/export` |
| `export_doc_skill` | `ceshu` 导出器 |
| `game_balance_skill` | `calc_engine` / `attr_system` |
| `editor_layout_skill` | `ui` 布局（经 FrontendSnapshot） |
| `schema_edit_skill` | `TypeSchema` / `TypeSchemaRegistry` |
| `web_search_skill` | 网络搜索 |
| `visualization_skill` | 图表可视化 |

---

# 05 — 运行与构建

> 本文说明环境准备、安装、运行、测试、代码质量、打包发布与容器化的完整流程。

## 1. 环境要求

| 项 | 要求 |
|----|------|
| Python | >= 3.14（实际开发/打包环境 3.14.5） |
| 操作系统 | Windows / macOS / Linux（Windows 下 PyQt6 体验最佳） |
| AI 能力 | 可选。OpenAI 兼容 API（OpenAI/Qwen/豆包/DeepSeek/Ollama） |

## 2. 安装

```bash
# 克隆项目
git clone <repository-url>
cd GameEditorApp

# 创建虚拟环境（推荐）
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS / Linux
source .venv/bin/activate

# 安装（含开发依赖）
pip install -e ".[dev]"
```

如需 Agent 语义记忆（可选）：

```bash
pip install -e ".[chromadb]"
```

## 3. 运行

有三种方式：

```bash
# 方式 1：入口命令（pyproject.toml [project.scripts]）
game-editor

# 方式 2：直接运行
python src/app.py

# 方式 3：Windows 启动脚本（优先使用 .venv，否则回退系统 python）
scripts\launch.bat
```

> 根目录 `app.py` 会先把 `src/` 加入 `sys.path` 再调用 `src.app.main()`，因此从任意目录 `python app.py` 均可启动。

### 首次使用配置 AI

「工具 → AI 设置」中配置：
- API Key（支持 OpenAI 兼容接口，加密存储于 `data/settings/api_config.json`）
- Provider / Base URL / Model（OpenAI、Qwen、豆包、DeepSeek、Ollama、自定义）
- 视觉模型与图像模型（可选）
- 启用/禁用 AI 功能

### 运行时数据目录

| 目录 | 用途 |
|------|------|
| `data/` | 游戏数据、配置、模板、备份、库 |
| `exports/` | 导出输出 |
| `logs/` | 运行日志 + `crash.log`（崩溃捕获） |

## 4. 测试

```bash
# 全部单元 + 集成测试
pytest tests/unit tests/integration -v --tb=short --timeout=60

# 单个测试文件
pytest tests/unit/test_brain.py -v

# 端到端测试
pytest tests/e2e -v --tb=short --timeout=120

# 覆盖率
pytest tests/ --cov=src --cov-report=term-missing
```

测试分层：`tests/unit`（单元）→ `tests/integration`（集成）→ `tests/e2e`（端到端）。

## 5. 代码质量

```bash
# Lint
ruff check src/ tests/

# 类型检查（mypy 严格检查 core/common/security）
mypy src/ --ignore-missing-imports

# 自动格式化
ruff format src/ tests/
```

`pyproject.toml` 关键质量配置：
- ruff：line-length=120，规则集 E/F/I/UP/B/W，target py314
- mypy：严格检查 `src.core.*` / `src.common.*` / `src.security.*`，排除 UI/测试
- 预提交钩子：`.pre-commit-config.yaml`

## 6. CI 流水线（`.github/workflows/ci.yml`）

| Job | 触发 | 内容 |
|-----|------|------|
| `lint` | push/PR 到 main/master | ruff check |
| `typecheck` | 同上 | mypy（dev 依赖安装） |
| `test` | 同上（Windows） | pytest（unit+integration，覆盖率 ≥ 25%）+ pip-audit + bandit |
| `e2e` | 同上（Windows） | pytest tests/e2e |

另有 `release.yml` 用于发布。

## 7. 打包发布（Windows）

```bat
scripts\build.bat
```

流程：
1. 检查/安装 `PyInstaller` 与 `PyArmor`（可选 UPX 压缩）。
2. **PyArmor 加密**：`pyarmor gen -O scripts\.pyarmor_obf -r src`（排除 `src/data` 等）。
3. **PyInstaller 打包**：`pyinstaller scripts\build.spec`（环境变量 `PYARMOR_SRC` 指向混淆目录，不改原始源码）。
4. 加密失败时可选回退普通打包。
5. 产物：`dist\墨白可视化编辑\墨白可视化编辑.exe`。

> 说明：`scripts/build.bat` 是 Windows 专用；`build.spec` 为 PyInstaller 规格文件，`build.py` 为构建辅助。

## 8. Docker 部署

`Dockerfile` 提供多阶段容器化构建：

```bash
docker build -t mobai-editor .
docker run mobai-editor
```

- 阶段 1（builder）：基于 `python:3.14-slim`，安装系统依赖（libGL/libglib 等）与 `requirements-lock.txt` 依赖到独立前缀。
- 阶段 2（runtime）：最小化镜像，非 root 用户 `appuser` 运行，`CMD ["python", "src/app.py"]`，含 HEALTHCHECK。
- 依赖锁文件：`requirements-lock.txt`（运行时）/ `requirements-dev-lock.txt`（开发）。

## 9. 常见问题排查

| 现象 | 排查方向 |
|------|----------|
| 启动崩溃无弹窗 | 查看 `logs/crash.log`（faulthandler + excepthook 写入） |
| AI 不工作 | 「工具 → AI 设置」检查 API Key/Base URL/模型，用 `test_api_connection` 连通性测试 |
| 库数据丢失/类型对不上 | 检查 `data/libraries/` 下 `type_schema.json`，`LibraryManager` 会自动升级迁移 |
| 打包后 exe 无法启动 | 确认 PyArmor runtime 正常、依赖齐全（`pip install -r requirements-lock.txt`） |
| 内存溢出 | 检查 `OptimizedDataManager` 缓存上限（`CACHE_SIZE=100`）与线程池大小 |

---

*本文档由代码分析生成，随代码演进建议定期更新。*
