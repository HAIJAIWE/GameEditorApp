# 墨白可视化编辑

> 游戏设计文档与实现文档工作台：可视化维护技能 / 角色 / 怪物 / 物品等游戏数据，用结构化策划书（GDD）把「设计」写成「可被编码 AI 直接执行的实现文档」，一键导出多种格式。

- 不是单纯的数据表编辑器：策划书章节带字段校验、阶段门禁和机读数据（状态机、数值参数表、数值断言、验收用例），编码 AI 拿到就能开工。
- 不是单纯的文档生成器：所有章节字段都绑定在结构化 schema 上，既能手填，也能 AI 逐章生成，导出时字段值直接渲染成表格。
- 桌面端本地运行：数据存在本地 SQLite，AI 可走本地 Ollama，也可接 OpenAI 兼容的云端接口。

## 它解决什么问题

游戏策划的常见断点：设计写在文档里，程序拿到的却是另一套东西；数值表散落在 Excel，实现时口径不一；AI 写的策划书看着完整，却没有状态机和参数表，落不了地。

这个项目把链路串成一条：

```
可视化维护游戏数据  →  结构化策划书（设计文档）  →  按卷/按岗位导出（实现文档）  →  编码 AI 照文档实现
```

## 功能

**数据编辑**

- 自定义数据类型与字段（文本 / 数值 / 引用 / 枚举 / 图片 / 公式等），支持字段模板、可见性控制、拼音 ID 生成
- 属性系统与公式编辑器：属性推导、公式校验、矩阵视图
- 数据导入导出：JSON / CSV / Excel 批量导入导出，批量修改、数据对比、引用关系预览、关系图
- 引擎格式导出：Lua / Unity / Unreal / Godot / Cocos2d
- 备份管理、统计、高级搜索、撤销重做

**策划书（GDD）**

- 分阶段章节编辑 + 「一页总览」只读摘要
- 字段必填门禁：没填齐的章节如实标「还差」，不假装完成
- AI 一键生成：填游戏名 / 类型 / 风格 / 平台 / 商业模型 + 一句话描述，逐章生成并保存；表单选择会以「关键词与硬约束」注入每章提示词，避免跑题
- 机读数据独立分区：状态机、数值参数表、数值断言、验收用例不计入正文完成度
- 模板与版本：内置多套题材模板、自定义模板、版本快照与差异对比、审核队列
- 导出：
  - 策划书：Markdown / Word / PDF / HTML / 演示文稿
  - 一页摘要、交付版（去掉内部过程信息）
  - 岗位任务清单（程序 / 美术 / 测试 / 数值 / 音频）
  - 开发交接包：6 卷 24+ 份实现文档（架构 / 核心玩法 / 内容 / 系统 / 界面 / 打磨），含工程脚手架

**AI 与协作**

- 本地档（Ollama，低上下文 + 保密护栏）优先，云端档（DeepSeek / 通义千问等 OpenAI 兼容接口）兜底
- Function Calling 受控工具：数据编辑、策划书生成、代码执行
- 插件体系（插件中心 / 插件市场）、AI 侧边栏、执行预审与自动审核

## 怎么打开

### 方式一：装好即用（推荐给非开发者）

1. 打开仓库的 **Releases** 页，下载对应系统的安装包（Windows `.exe` / macOS `.dmg` / Linux `.AppImage`）。
2. Windows 双击安装包，按向导装完，从开始菜单启动「墨白可视化编辑」。
3. 首次启动会自建本地数据库，直接进主界面。

> 发布包由 `.github/workflows/release-desktop.yml` 生成：推送 `desktop-v*` 标签后自动跨平台构建并发布为 Release 草稿，确认后即可公开下载。

### 方式二：从源码运行（开发者）

需要先装好 **Node.js 22**，以及 C++ 构建工具（Windows 装 Visual Studio Build Tools，macOS 装 Xcode Command Line Tools）和 Python，用于编译 `better-sqlite3` 原生模块。

```bash
git clone git@github.com:HAIJAIWE/GameEditorApp.git
cd GameEditorApp

# 安装依赖（monorepo，一次装齐 apps/* 与 packages/*；会下载 Electron 二进制）
npm install

# 开发模式：启动 Electron + 热重载
npm run dev
```

窗口起来后就是完整应用，改渲染层代码会热更新，改主进程代码会自动重启。

### 方式三：生产构建 / 自己打包

```bash
# 构建到 apps/desktop/out
npm run build

# 构建并打安装包到 apps/desktop/dist
cd apps/desktop
npm run dist
```

Windows 产物在 `apps/desktop/dist/`，其中 `win-unpacked/` 免安装，双击里面的 exe 即可运行。

### 首次使用

1. 左侧点「＋ 新建策划书」，填游戏名、类型、风格、平台、商业模式。
2. 要么逐章手填，要么点「AI 一键生成」逐章生成（未配置 AI 时走手填）。
3. 中间栏可切「一页总览」，先看全貌与缺口，再回逐章编辑。
4. 右侧导出：交付版策划书 / 岗位任务清单 / 开发交接包。
5. 需要维护技能、角色、怪物等数据时，从菜单「文件 → 打开」进入数据编辑，建类型、建字段、批量导入。

### AI 配置（可选）

- **本地**：安装 [Ollama](https://ollama.com) 并拉取模型后，在「设置 → AI」里选本地档。本地档有保密护栏，敏感项目内容不会出网。
- **云端**：在设置里填 OpenAI 兼容接口的 Base URL、模型名与 API Key（支持 DeepSeek、通义千问等）。
- API Key 用系统安全存储（Electron safeStorage）加密，不写进配置文件，也不会进仓库。

## 项目结构

```
GameEditorApp/
├── apps/
│   ├── desktop/                 # Electron 桌面应用（产品本体）
│   │   ├── src/main/            # 主进程：SQLite、IPC、AI 传输层、导出
│   │   ├── src/preload/         # 预加载桥（上下文隔离）
│   │   ├── src/renderer/        # React 前端
│   │   ├── docs/                # 设计文档（agent 框架、分层设计、GDD 结构等）
│   │   ├── tests/               # 单元 / 集成 / Playwright e2e
│   │   └── out/ dist/           # 构建产物（不入库）
│   └── docs/                    # 样例与生成产物
├── packages/
│   ├── shared/                  # 主/渲染共用：zod schema、IPC 契约、策划书模型、i18n
│   ├── agent-core/              # AI agent 内核
│   └── client-ui/               # 共享 UI 组件与主题
├── docs/                        # 策划书 / 架构 / 模板等专题文档
├── scripts/                     # 工程脚本（样式审计等）
└── .github/workflows/           # CI 与出包流水线
```

## 技术栈

| 类别 | 技术 |
| --- | --- |
| 桌面框架 | Electron 44 |
| 前端 | React 19 + TypeScript 6 |
| 构建 | electron-vite 5（Vite 7） |
| 契约与校验 | zod 4（主/渲染共用 schema） |
| 本地存储 | better-sqlite3 |
| 文档导出 | docx / pdfjs-dist / exceljs / pptxgenjs / jszip |
| AI 接入 | Ollama（本地）/ OpenAI 兼容接口（云端） |
| 语义检索 | vectra（可选） |
| 测试 | vitest + Playwright |

## 常用命令

在仓库根目录执行：

| 命令 | 作用 |
| --- | --- |
| `npm install` | 安装全部 workspace 依赖 |
| `npm run dev` | 开发模式（Electron + 热重载） |
| `npm run build` | 生产构建到 `apps/desktop/out` |
| `npm run typecheck` | `tsc --noEmit`（node / web / test-dom 三套配置） |
| `npm run lint` | ESLint |
| `npm test` | vitest 单元与集成测试 |
| `npm run e2e` | Playwright 端到端（先自动构建） |

在 `apps/desktop/` 下另有 `npm run dist`（打包安装包）、`npm run test:components`（仅 DOM 测试）、`npm run test:watch`。

## 持续集成

- **`.github/workflows/desktop-ci.yml`**：push / PR 改动 `apps/**`、`packages/**` 时跑 lint → typecheck → test → e2e。
- **`.github/workflows/release-desktop.yml`**：推送 `desktop-v*` 标签，三平台出包并发布 Release 草稿；也可手动触发只出产物。

## 文档

- [apps/desktop/docs](./apps/desktop/docs)：AI agent 框架设计、shared 分层设计、GDD 内容架构、迁移审计等
- [docs](./docs)：策划书写法、模板语料核对、交接包评审、导出专题
- [CONTRIBUTING.md](./CONTRIBUTING.md)：开发约定、IPC 分层铁律、提交规范
- [CHANGELOG.md](./CHANGELOG.md)：版本变更记录

## 贡献者

- **墨白（HAIJAIWE）**：项目发起、产品设计与维护

## 许可证

[MIT](./LICENSE)
