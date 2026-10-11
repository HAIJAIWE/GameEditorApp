# Code Wiki — 墨白可视化编辑 (MB-KSHBJQ)

> ⚠️ **本目录是 Python / PyQt6 时代的历史归档，已不适用于当前代码库。**
>
> 当前技术栈为 **Electron 44 + React 19 + TypeScript**（`desktop/` 四层架构）。
> 权威架构说明见 [`docs/architecture.md`](../../architecture.md)；
> 分层契约见 [`desktop/src/shared/README.md`](../../../desktop/src/shared/README.md)。
> 本目录内容仅作历史参考，请勿据此理解现状。


> 项目代码知识库（Code Wiki）首页。本 Wiki 面向开发者，系统性地讲解项目架构、模块职责、关键类/函数、依赖关系与运行方式。
>
> 技术栈：Python 3.14+ · PyQt6 · SQLite/JSON · OpenAI 兼容接口 · pytest

---

## 文档导航

| 文档 | 内容 | 适合阅读人群 |
|------|------|--------------|
| [01-架构总览](01-architecture.md) | 分层架构、模块划分、启动流程、数据流 | 所有开发者（入门必读） |
| [02-模块职责](02-modules.md) | 各目录/模块的职责边界与内部结构 | 所有开发者 |
| [03-关键类与函数](03-key-classes.md) | 核心类、关键函数、方法签名说明 | 需要二次开发的开发者 |
| [04-依赖关系](04-dependencies.md) | 第三方依赖、模块间依赖、数据流依赖 | 所有开发者 |
| [05-运行与构建](05-running.md) | 环境准备、运行方式、测试、打包、CI | 所有开发者 |

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

## 快速启动

```bash
pip install -e ".[dev]"
python src/app.py        # 或 game-editor / scripts\launch.bat
```

详细步骤见 [05-运行与构建](05-running.md)。

---

*本文档由代码分析生成，随代码演进建议定期更新。*
