# 04 — 依赖关系

> ⚠️ **本目录是 Python / PyQt6 时代的历史归档，已不适用于当前代码库。**
>
> 当前技术栈为 **Electron 44 + React 19 + TypeScript**（`desktop/` 四层架构）。
> 权威架构说明见 [`docs/architecture.md`](../../architecture.md)；
> 分层契约见 [`desktop/src/shared/README.md`](../../../desktop/src/shared/README.md)。
> 本目录内容仅作历史参考，请勿据此理解现状。


> 本文包含两部分：① 第三方依赖（pip 包）及用途；② 项目内部模块间的依赖关系与数据依赖。

---

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
