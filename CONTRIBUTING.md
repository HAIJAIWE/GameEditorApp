# 贡献指南

感谢您考虑为墨白可视化编辑器贡献代码！

## 开发环境

1. 克隆仓库
2. 创建虚拟环境：`python -m venv .venv`
3. 激活环境：`.venv\Scripts\activate`（Windows）或 `source .venv/bin/activate`（macOS/Linux）
4. 安装依赖：`pip install -r requirements-lock.txt -r requirements-dev-lock.txt`

## 代码规范

- Python 版本：3.14+
- 类型注解：所有公共 API 必须包含类型注解
- 文档字符串：所有类和方法必须包含 docstring
- 命名规范：遵循 PEP 8（snake_case 函数/变量，PascalCase 类）
- 提交信息：遵循 Conventional Commits（feat/fix/chore/docs/test/refactor）

## 测试

- 新增功能必须包含测试
- 测试放在 `tests/unit/`（单元测试）、`tests/integration/`（集成测试）、`tests/e2e/`（端到端测试）
- 运行测试：`pytest tests/`
- 覆盖率：`pytest --cov=src tests/`

## 提交 PR

1. 从 main 分支创建功能分支
2. 提交代码
3. 运行测试确保全部通过
4. 创建 Pull Request
5. 等待 Code Review
