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
  → 结果回写 UI（AIAssistantTab / DigitalPanel）
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
