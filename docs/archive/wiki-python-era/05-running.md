# 05 — 运行与构建

> ⚠️ **本目录是 Python / PyQt6 时代的历史归档，已不适用于当前代码库。**
>
> 当前技术栈为 **Electron 44 + React 19 + TypeScript**（`desktop/` 四层架构）。
> 权威架构说明见 [`docs/architecture.md`](../../architecture.md)；
> 分层契约见 [`desktop/src/shared/README.md`](../../../desktop/src/shared/README.md)。
> 本目录内容仅作历史参考，请勿据此理解现状。


> 本文说明环境准备、安装、运行、测试、代码质量、打包发布与容器化的完整流程。

---

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
