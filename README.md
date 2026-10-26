# 墨白可视化编辑 (MB-KSHBJQ)

> 专业游戏数据编辑与管理平台：可视化编辑技能 / 角色 / 怪物等内置数据类型，配套工业级策划书（GDD）框架与 AI 智能体协作，支持多格式导出。

**现役版本是 TypeScript + Electron 重写版**，源码位于 [`desktop/`](./desktop)，设计文档在 [`desktop/docs/`](./desktop/docs)。

> 历史说明：本仓库曾有一个基于 Qt 的旧版桌面实现（含 25 技能智能体、ReAct、多代理辩论等），已于 **2026-10-10** 整体退场并移除。其源码可从历史 git tag 取回，仅作考古参考；其架构文档留存在根 [`docs/`](./docs) 并标注为「已移除的旧版」。

## 技术栈

| 类别 | 技术 |
| --- | --- |
| 桌面框架 | Electron 44 |
| 前端 | React 19 + TypeScript 6 |
| 构建 | electron-vite 5（Vite 7） |
| 类型/IPC 契约 | zod 4（运行时校验，主/渲染进程共用 schema） |
| 本地存储 | better-sqlite3（SQLite） |
| AI 接入 | Ollama（本地）/ OpenAI 兼容（DeepSeek、通义千问等云端） |
| 语义检索 | vectra（向量库，可选） |
| 测试 | vitest 5 + Playwright（e2e） |

## 快速开始

```bash
# 克隆
git clone <repository-url>
cd GameEditorApp/desktop

# 安装依赖（会触发 electron 二进制下载与 better-sqlite3 原生编译）
npm install

# 开发模式（热重载）
npm run dev

# 生产构建（输出到 desktop/out/）
npm run build

# 打包为安装包（Windows nsis/zip、macOS dmg/zip、Linux AppImage/deb）
npm run dist
```

> 首次 `npm install` 会编译 `better-sqlite3` 原生模块，需要本机有 Python 与 C++ 构建工具（Windows 需 Visual Studio Build Tools）。

## 项目结构

```
GameEditorApp/
├── desktop/                 # 现役 TS + Electron 产品（一切开发的入口）
│   ├── src/
│   │   ├── main/            # 主进程（Node 侧）：数据库、IPC 处理、AI 传输层
│   │   ├── preload/         # 预加载脚本（上下文隔离桥）
│   │   ├── renderer/        # React 前端 UI
│   │   └── shared/          # 主/渲染进程共用：zod schema、IPC 契约、agent 协议、类型
│   ├── docs/                # TS 版设计文档（agent 框架 / 迁移审计 / 分层设计 …）
│   ├── tests/               # 单元 / 集成 / e2e
│   ├── out/                 # 构建产物（gitignore）
│   └── package.json
├── docs/                    # 历史文档（描述已移除的旧版，仅供参考）
├── assets/                  # 图标等资源
├── data/                    # 用户本地数据（gitignore，不入库）
└── scripts/                 # 工程脚本（如渲染层 CSS 审计 audit-renderer-css.mjs）
```

## 开发

### 常用脚本

| 命令 | 作用 |
| --- | --- |
| `npm run dev` | 开发模式（热重载） |
| `npm run build` | 生产构建到 `out/` |
| `npm run dist` | 构建并打包为安装包（electron-builder） |
| `npm run lint` | ESLint 检查 |
| `npm run typecheck` | `tsc --noEmit`（node + web 两套配置） |
| `npm test` | vitest 单元测试 |
| `npm run test:e2e` | Playwright 端到端（含构建） |

### 类型检查 / 构建 / 测试（CI 同款命令）

仓库 CI 在 Ubuntu 上以自带的 Electron 作为 Node 运行时跑门禁。本机若需等价复现：

```bash
cd desktop
unset NODE_OPTIONS && export ELECTRON_RUN_AS_NODE=1
E=./node_modules/electron/dist/electron.exe
$E node_modules/typescript/bin/tsc --noEmit -p tsconfig.node.json --composite false
$E node_modules/typescript/bin/tsc --noEmit -p tsconfig.web.json  --composite false
$E node_modules/vitest/vitest.mjs run
```

> 说明：`unset NODE_OPTIONS` 是必须的——本仓的安全删除垫片会拦截 `rmSync`/`emptyDir`。e2e 在 CI 用 `xvfb-run` 跑无头 Electron；本机直接 `npm run test:e2e` 即可。

### 开发模式起不来时（可选 workaround）

`npm run dev` 在部分 Windows + 显卡驱动组合上会在 vite 依赖预优化阶段拉起 Electron，导致 GPU 进程 100% 访问冲突崩溃（根因未定位到 Electron 层）。此时可改用「渲染层与 Electron 分开启动」：

```bash
# 终端 1：只起渲染层 dev 服务器
cd desktop && npx vite --config vite.renderer.config.ts

# 终端 2：等上面打出 ready 后，手动起 Electron 指向它
cd desktop && env -u ELECTRON_RUN_AS_NODE -u NODE_OPTIONS \
  ELECTRON_RENDERER_URL=http://localhost:5173 NODE_ENV_ELECTRON_VITE=development \
  node_modules/.bin/electron . --disable-gpu --no-sandbox
```

两个坑：① 宿主若设了 `ELECTRON_RUN_AS_NODE=1`，Electron 会退化成「用 node 跑主进程」，必须先 `env -u` 清掉；② 应用有单例锁，第二个实例会秒退——排查问题前先确认没有残留进程。该配置只是复用 `electron.vite.config.ts` 的 renderer 段，**不是官方开发入口**，日常开发仍用 `npm run dev`。

## CI / CD

- **`.github/workflows/desktop-ci.yml`** — 验证流水线。push/PR 改动 `desktop/**` 时自动运行 `lint` → `typecheck` → `test` → `test:e2e`。
- **`.github/workflows/release-desktop.yml`** — 出包流水线（替代已被移除的旧版 `release.yml`）。打 `desktop-v*` tag 并推送会跨平台（Windows / macOS / Linux）构建安装包并发布为 GitHub Release 草稿；也可手动 `workflow_dispatch` 仅出产物。

## AI 智能体

TS 版内置一个**分层 LLM 架构**的 AI 智能体：本地档（Ollama，4K 上下文硬约束，保密护栏在传输层强制本地）优先，云端档（DeepSeek / 通义千问等 OpenAI 兼容接口）兜底；通过 **Function Calling** 调用一组受控工具完成数据编辑、策划书生成、代码执行等任务。完整设计见 [`desktop/docs/agent-framework-design.md`](./desktop/docs/agent-framework-design.md)。

## 文档

- **现役（TS 版）**：[`desktop/docs/`](./desktop/docs) — agent 框架设计、TS 迁移审计、shared 分层设计、PRD 等。
- **历史（旧版，已移除）**：[`docs/`](./docs) — 顶部均标注「已移除的旧版」，仅作考古参考。

## 许可证

MIT
