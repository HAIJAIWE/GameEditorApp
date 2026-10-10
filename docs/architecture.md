> ⚠️ **本文档描述的是已移除的 Python 版（PyQt6），该版本已于 2026-10-10 整体退场。**
> 现役产品是 [`desktop/`](../desktop) 下的 TypeScript + Electron 版，设计文档在 [`desktop/docs/`](../desktop/docs)。
> 本文档仅作历史/考古参考：其中所有代码路径、类名、命令均指向已被删除的 Python 源码，**请勿据此开发**。
> Python 全量源码可从 git tag **`python-final`** 取回。

# 总体架构

> 📌 **这是什么**：项目代码结构的总览图，说明每层（UI/核心/公共/安全/部署）的分工和数据流。
> **什么时候用**：想理解整个项目怎么组织的、加新功能该放哪个目录。`

## 架构概览

GameEditorApp 是基于 PyQt6 的游戏数据编辑器，采用分层架构：

```
┌─────────────────────────────────────────┐
│              UI 层 (src/ui)              │
│   main_window / ceshu / data_tab / ...  │
├─────────────────────────────────────────┤
│            核心 层 (src/core)            │
│   ceshu / agent / type_schema / data    │
├─────────────────────────────────────────┤
│           公共 层 (src/common)           │
│   logger / i18n / cache / event_bus     │
├─────────────────────────────────────────┤
│          安全 层 (src/security)          │
│   sandbox / acl / encryption / guard    │
└─────────────────────────────────────────┘
```
> 注：早期独立的 `src/deployment/` 层已移除（孤儿模块清理），打包/发布统一由根目录 `scripts/build.bat` + PyInstaller/PyArmor 完成（见 [wiki/05-running](./wiki/05-running.md)）。

## 核心模块

### 1. 策划书系统 (src/core/ceshu/)

v5.0 工业级 GDD 系统，18 章结构 + 13 游戏系统配置 + 16 项新功能（详见 [ceshu-release-notes-v5.md](./ceshu-release-notes-v5.md)）。

- **CeshuModel**: 18 章 GDD 数据模型（meta/vision/worldview/gameplay/systems/numeric/art/tech/resources + v5 新增 9 章: market_analysis/characters/combat/economy/monetization/mvp/risk_handling/audio/accessibility）；支持 v4→v5 自动迁移
- **CeshuManager**: 策划书 CRUD + 版本管理（derive/list/set_active）+ 6 种导出（docx/pdf/pptx/md/html/xlsx）
- **CeshuDataSync**: 策划书↔游戏数据双向同步（基于 EventBus）
- **CeshuScorer** (N4): 3 维评分引擎（结构/质量/市场），S/A/B/C/D 五级
- **CeshuChecklist** (N11): 50 项生产就绪检查
- **FieldDependencies** (N14): 跨章节字段依赖图
- **CeshuChangelog** (N15): 版本变更日志
- **CustomTemplateManager** (N13): 自定义模板 CRUD
- **6 个 Exporter**: docx/pdf/pptx/markdown/html/excel，公用 `ceshu_export_common`
- **CeshuTemplate**: 参数化模板引擎；**CeshuSkill**: 章节→智能体路由 + 14 个动作（含 AI 整章/字段/审阅/一键生成/AI 数据生成）
- **档位（lite/full）**: `gdd_scope` 轻量（基础 9 章）/ 工业级（18 章），持久化在 `meta.gdd_scope`，按档位渲染章节与计算进度
- **AI 数据生成（N20）**: 依据策划书数值/系统章生成候选游戏数据 → 预览勾选 → 人工导入数据表（数据共同开发）

### 2. Agent 系统 (src/core/agent/)

- **ToolDispatcher**: 技能调度器
- **BaseSkill**: 技能基类（25 个技能，通过 discover_skills() 自动发现）
- **brain.py**: Agent 大脑（推理+决策）
- **diagnostics/**: 自愈与诊断（错误处理、根因分析、修复市场）
- **workflow/**: 工作流引擎与调度器

### 3. 配置表系统 (src/core/)

- **TypeSchema**: 12 种内置数据类型定义（角色/职业/怪物/装备/技能/天赋/道具/成就/Buff/剧情/任务/对话）
- **DataManager**: 数据 CRUD + 缓存 + 搜索
- **CalcEngine**: 数值公式计算引擎

### 4. 安全系统 (src/security/)

- **Sandbox**: 代码执行沙箱
- **ACL**: 访问控制列表
- **Encryption**: 数据加密
- **SafetyGuard**: 危险操作检测

## 数据流

### 策划书工作流

```
用户输入 → CeshuManager.create_ceshu() → CeshuModel
    → 用户编辑章节 → CeshuModel.set_chapter()
    → 校验 → CeshuModel.validate() (16 项一致性检查)
    → 评分 → score_ceshu() (N4) / run_checklist() (N11)
    → 保存 → CeshuManager.save_ceshu() (原子写入)
    → 版本管理 → derive_version() / generate_changelog() (N15)
    → 导出 → export_ceshu_docx/pdf/pptx/markdown/html/excel (6 格式)
    → 同步 → CeshuDataSync 双向同步到游戏数据
```

### Agent 工作流

```
用户指令 → ToolDispatcher.dispatch()
    → BaseSkill.execute()
    → 返回结果
    → UI 更新
```

### 数据编辑工作流

```
用户操作 → DataManager.add_item()
    → DataValidator.validate()
    → 写入 JSON 文件
    → 更新缓存
```

## 主题系统

10 套主题，通过 EventBus 实时切换：

```
用户选择主题 → apply_theme()
    → EventBus.emit("theme_changed")
    → 所有组件更新样式
```

## 测试架构

```
tests/
├── unit/           # 单元测试
├── integration/    # 集成测试
├── e2e/            # 端到端测试
└── conftest.py     # 全局 fixtures
```
