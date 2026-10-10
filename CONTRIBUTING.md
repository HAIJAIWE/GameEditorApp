# 贡献指南（TS + Electron 版）

感谢你考虑为墨白可视化编辑器贡献代码。本仓库的现役产品是 `desktop/` 下的 **TypeScript + Electron** 版本（Python 版已于 2026-10-10 移除）。

## 开发环境

1. 克隆仓库
2. 进入桌面端目录：`cd desktop`
3. 安装依赖：`npm install`（会下载 Electron 二进制并编译 `better-sqlite3` 原生模块，需要本机 Python 与 C++ 构建工具）
4. 启动开发：`npm run dev`

> 推荐 Node 22（与 CI 一致）。

## 代码规范

- 语言：TypeScript（严格模式）。所有公共 API 显式标注类型。
- 风格：ESLint 驱动（`npm run lint`）。遵循项目 `eslint.config.mjs`。
- 提交信息：Conventional Commits（`feat` / `fix` / `chore` / `docs` / `test` / `refactor`）。
- 命名：TypeScript 约定（变量/函数 camelCase，类型/类 PascalCase）。
- 大段改动后务必跑 `npm run lint` 与 `npm run typecheck`。

## 分层与 IPC 铁律

- `shared/` **不得** import `main/`（需要 Node 能力的代码应放在 `main/`）。
- **新增 IPC 通道必须登四层**，缺一层 `tsc` 即报错（这是好事）：
  1. `shared/schemas.ts` — zod 入参/出参 schema
  2. `shared/ipc.ts` — `IpcContract` 通道定义
  3. `shared/service/api.ts` — `MbApi` 渲染端接口
  4. `preload/index.ts` — 预加载桥
- zod **可选字段用 `.optional()` 而非 `.default()`**（`default` 会让输出变必填、调用点全报错）。
- `preload` 不要硬编码内联 config 类型，改用 `IpcContract['<channel>']['req']`，避免漏加字段被 zod 静默剥掉。

## 测试

- 新增功能必须有测试。
- 单元测试 / 集成测试用 **vitest**：`npm test`（`vitest run`）。
- 端到端测试用 **Playwright**：`npm run test:e2e`（会先 `npm run build`）。
- 渲染层样式缺陷用脚本而非肉眼核对：`node scripts/audit-renderer-css.mjs`（类名有但 CSS 无规则 = 裸文本）。

## git 约定（本仓库铁律）

- **只显式 `git add <路径>`，绝不 `git add -A`** —— 工作树长期存在大量与本次改动无关的 dirty 条目。
- 提交信息写入 `desktop/_cm.txt`，使用 `--no-verify` 提交（本仓 hook 已停用），保留未跟踪文件不强行清理。
- **删除 / 重写类提交前先打 tag 锚点**（`git tag -a <name> -m ... <sha>`，零成本），本地仓库是唯一历史副本。

## 提交 PR

1. 从 `master` 创建功能分支
2. 本地跑通 `npm run lint` + `npm run typecheck` + `npm test`
3. 提交（遵循上方 git 约定）
4. 创建 Pull Request，等待 CI（`desktop-ci.yml`）通过
5. Code Review 后合入

## 发版

打 `desktop-v<版本>` 形式的 tag 并推送，会自动触发 `release-desktop.yml` 跨平台出包并发布 GitHub Release 草稿。详见仓库根 [`README.md`](./README.md) 的 CI/CD 段。
