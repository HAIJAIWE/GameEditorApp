# 墨白可视化编辑 (MB-KSHBJQ)

> ⚠️ **本文档描述的是已冻结并移除的 Python 版（PyQt6）。该版本已于 2026-10-10 整体退场。**
> **现役产品是 TypeScript + Electron 版，位于 [`desktop/`](./desktop)；设计文档在 `desktop/docs/`。**
> 下方「功能特性 / 环境要求 / 快速开始 / 项目结构 / CI」等内容**仅作历史参考，已不再适用**
> （例如「25 个技能的智能体系统 / ReAct / 多代理辩论 / 自愈机制」是 Python 版的实现，TS 版并非同一套）。
> 移除前的 Python 全量源码可从 tag **`python-final`** 取回。
>
> 📌 本文档本身的重写（改为描述 TS 版）是**待办项**，尚未完成。

> 专业游戏数据编辑与管理平台，支持技能/角色/怪物等 12 种内置数据类型的可视化编辑、AI 生成和多引擎导出。

## 功能特性

- **可视化数据编辑**: 12 种内置数据类型（技能、角色、怪物、道具、装备等），Excel 风格属性公式计算

- **策划书系统**: 18 章工业级 GDD 框架（9 基础章 + 9 工业级章），轻量/工业双档位，AI 自动生成与审阅、AI 数据生成（候选→人工导入）、评分引擎、完备性检查、版本管理，6 种格式导出（docx/pdf/pptx/md/html/xlsx）。详见 [策划书 v5.0 发布说明](docs/ceshu-release-notes-v5.md)

- **AI Agent 协作**: 25 个技能的智能体系统，ReAct 推理引擎，多代理辩论，自愈机制

- **AI 帮我填**: 字段级 AI 辅助，一键生成章节内容

- **填写路线图**: 6 Phase 可视化路线图，清晰展示创作进度与下一步

- **章节依赖关系**: depends\_on 标注，智能推荐下一章节

- **新手引导横幅**: 动态引导，降低上手门槛

- **工业级章节**: market\_analysis（市场分析）、characters（角色）、combat（战斗）、economy（经济）、monetization（商业化）、mvp（最小可行产品）、risk\_handling（风险）、audio（音频）、accessibility（无障碍）等 9 个专业章节

- **多引擎导出**: 支持 JSON/CSV/Excel + Unity/Unreal/Godot/Cocos2d 共 7 种格式导出

- **主题系统**: 10 套主题配置，深色/亮色自适应，实时切换

- **安全沙箱**: LLM 代码隔离执行，路径遍历防护，命令白名单

## 环境要求

- Python >= 3.14

- Windows / macOS / Linux

- 推荐 Python 3.14+

## 快速开始

### 安装

```bash
# 克隆项目
git clone <repository-url>
cd GameEditorApp

# 安装依赖（推荐使用虚拟环境）
python -m venv .venv
# Windows
.venv\Scripts\activate
# macOS/Linux
source .venv/bin/activate

pip install -e ".[dev]"
```

### 运行

```bash
# 方式 1: 通过入口命令
game-editor

# 方式 2: 直接运行
python src/app.py

# 方式 3: Windows 启动脚本
scripts\launch.bat
```

### 配置 AI

首次运行后，在「工具 → AI 设置」中配置：

- API Key（支持 OpenAI 兼容接口）

- 模型选择

- 启用/禁用 AI 功能

### 可选依赖与降级

| 可选依赖       | 提供能力                      | 未安装时的降级行为                                          |
| ---------- | ------------------------- | -------------------------------------------------- |
| `chromadb` | Agent 语义记忆（向量检索，相关会话精确召回） | 退化为内置文件型 Memory（`core/agent/memory.py`），基础记忆功能不受影响 |

安装可选依赖：

```bash
# 安装全部可选依赖
pip install -e ".[dev,chromadb]"

# 仅安装语义记忆支持
pip install -e ".[chromadb]"
```

> 说明：`ollama` 为必备依赖（本地模型接入），缺失时仍可使用 OpenAI 兼容的在线接口。

## 项目结构

```
GameEditorApp/
├── src/
│   ├── app.py                 # 应用入口
│   ├── common/                # 通用工具（日志、缓存、i18n、验证器等）
│   ├── config/                # 配置管理（设置、常量、模板）
│   ├── core/                  # 核心业务
│   │   ├── agent/             # AI Agent 系统
│   │   │   ├── skills/        # 25 个技能（代码、文件、搜索、策划书等）
│   │   │   ├── diagnostics/   # 自愈与诊断（错误处理、熔断器、根因分析）
│   │   │   └── workflow/      # 工作流引擎
│   │   ├── ceshu/             # 策划书系统（18 章模型、管理器、评分引擎、导出器、模板引擎）
│   │   ├── data_manager.py    # 数据管理（CRUD、缓存、索引）
│   │   └── type_schema.py     # 12 种内置数据类型定义
│   ├── ui/                    # PyQt6 界面
│   │   ├── main_window.py     # 主窗口
│   │   ├── widgets/           # 可复用组件（属性面板、折叠面板、关系图等）
│   │   ├── dialogs/           # 对话框（设置、类型编辑、批量编辑等）
│   │   ├── themes/            # 主题系统
│   │   └── ceshu/             # 策划书编辑器界面
│   ├── security/              # 安全模块（沙箱、ACL、加密、隐私）
│   ├── features/              # 功能模块（AI 对话、导出、备份、统计）
├── scripts/                   # 构建与启动脚本（build.bat / launch.bat）
├── tests/                     # 测试
│   ├── unit/                  # 单元测试
│   ├── integration/           # 集成测试
│   └── e2e/                   # 端到端测试
├── docs/                      # 文档
├── assets/                    # 资源文件（图标、UI 图片）
└── pyproject.toml             # 项目配置
```

## 开发

### 运行测试

```bash
# 运行所有单元测试和集成测试
pytest tests/unit tests/integration -v --tb=short --timeout=60

# 运行单个测试文件
pytest tests/unit/test_brain.py -v

# 运行并查看覆盖率
pytest tests/ --cov=src --cov-report=term-missing
```

### 代码检查

```bash
# Lint
ruff check src/ tests/

# 类型检查（MYPYPATH 使模块按 common/core/ui 解析，与运行时 sys.path 一致；
# Windows PowerShell 下为 $env:MYPYPATH="src"; mypy src/ ...）
MYPYPATH=src mypy src/ --ignore-missing-imports

# 自动格式化
ruff format src/ tests/
```

### CI

GitHub Actions CI 流水线（`.github/workflows/ci.yml`）在 push/PR 时自动运行：

- **lint**: ruff 代码检查

- **typecheck**: mypy 类型检查（覆盖全部 src/ 含 UI，0 错误）

- **test**: pytest 测试（覆盖率覆盖全部 src/（含 UI），门槛 30%，渐进目标 40% / 60%）

- **security**: bandit（SAST）+ pip-audit（依赖漏洞审计）

- **e2e**: 端到端工作流测试

## 文档

- [策划书 v5.0 发布说明](docs/ceshu-release-notes-v5.md) — 策划书模块最新版本功能说明

- [策划书用户指南](docs/ceshu-user-guide.md) — 策划书模块使用手册

- [策划书开发者指南](docs/ceshu-developer-guide.md) — 策划书模块二次开发

- [架构文档](docs/architecture.md) — 项目结构总览

- [API 参考](docs/api-reference.md) — 二次开发接口

- [游戏策划写作指南](docs/game-design-writing-guide.md) — AI 生成策划书规范

- 归档文档（已过时仅供参考）：[docs/archive/](docs/archive/)

## 技术栈

| 类别     | 技术                 |
| ------ | ------------------ |
| GUI 框架 | PyQt6              |
| AI 接入  | OpenAI / Ollama    |
| 数据存储   | SQLite / JSON      |
| 代码沙箱   | subprocess + 黑名单防护 |
| 测试框架   | pytest             |
| 类型检查   | mypy               |
| Lint   | ruff               |
| 向量检索   | chromadb（可选）       |

## 许可证

MIT
