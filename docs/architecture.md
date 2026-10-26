# 总体架构

> 📌 **这是什么**：项目代码结构的总览图，说明 `desktop/` 的每一层（`shared` / `main` / `preload` / `renderer`）分工与数据流。
> **什么时候用**：想理解整个产品怎么组织、加新功能该放哪个目录时查阅。

## 架构概览

墨白可视化编辑（`desktop/`）是基于 **Electron 44 + React 19 + TypeScript** 的游戏数据与策划书编辑器，采用四层清晰分工：

```
┌─────────────────────────────────────────────────────────────┐
│           渲染层 (src/renderer, React 19)                      │
│   App / CeshuHomePanel / CeshuView / DataEditorTab / ...      │
│   只通过 window.mbApi 调用能力，sandbox:true、无 Node 权限      │
├─────────────────────────────────────────────────────────────┤
│   桥接层 (src/preload, contextBridge)                          │
│   exposeInMainWorld('mbApi', api) —— typed IPC 门面            │
├─────────────────────────────────────────────────────────────┤
│    主进程 (src/main, Electron Main)                            │
│   ipc.ts 注册 handler → stores/services → SQLite(better-sqlite3)│
│   窗口 / 托盘 / 库管理 / 原生能力（文件选择、图片、密钥）       │
├─────────────────────────────────────────────────────────────┤
│   共享层 (src/shared, 纯逻辑 + 类型)                           │
│   schemas / ipc 契约 / ceshu* / agent* / typeSchema ...        │
│   无 Electron、无 React，可独立单测                            │
└─────────────────────────────────────────────────────────────┘
```

要点：
- `shared/` **不 import `main/`**，是纯逻辑与类型真源（`zod` schemas、`IpcContract` 契约、`MbApi` 门面、策划书/智能体纯函数）。
- 渲染层与主进程之间**只**经 `preload` 暴露的 `window.mbApi` 通信；渲染层 `sandbox: true`、无 Node 集成（`nodeIntegration: false`）。
- 所有主进程 handler 在 `ipc.ts` 统一入口做 zod 校验，结果统一包裹为 `{ ok, data }` / `{ ok:false, error:{code,message} }`。

## 核心模块

### 1. 策划书系统（GDD）
现役结构为 **16 个编号章节 + 文档信息段（meta，不编号）**，按 **5 个分区** 组织（`shared/ceshuConstants.ts` 单点派生）：

- 一、产品定义：产品愿景 / 世界观与角色 / 核心玩法
- 二、游戏系统：游戏系统设计 / 战斗系统设计 / 经济系统设计 / 数值设计
- 三、表现设计：美术设计 / 音频设计
- 四、技术方案：技术规格
- 五、制作与发行：资源规划 / MVP 规划 / 风险控制 / 市场分析 / 商业化设计 / 可访问性与本地化

档位（lite / full）：`lite` = 核心 9 章；`full` = 全部 16 章。章节顺序与「第N章·」编号全部由 `CHAPTER_PARTS` 自动派生，重排不会漏改。

实现位置：
- `shared/ceshu*`：纯逻辑 —— `ceshuModel`（进度/派生）、`ceshuValidation`、`ceshuScorer`（结构/质量/市场三维，S/A/B/C/D 五级）、`ceshuChecklist`、`ceshuDiff`、`ceshuFieldDeps`、`ceshuWordStats`、`ceshuSystemConfirm`、`ceshuAi`（章节提示词/解析/合并）、`ceshuDataGen`、`ceshuPresets`、`ceshuMigration`、`ceshuConstants` 等。
- `main/ceshu/*`：IO 与持久化 —— `manager.ts`（CRUD+版本+评分+校验）、`storage.ts`（每份策划书一个 JSON `<库>/ceshu/<id>.json`）、`notesStore.ts`、`templateStore.ts`、`dataSync.ts`（策划书↔游戏数据双向同步）、`export/*`（markdown/html/docx/pptx/pdf/excel 六格式 + 文本报告）。
- `preload` + `ipc.ts`：`mbApi.ceshu.*` 与 `ceshu:*` 通道一一对应。
- `renderer/src/components`：`CeshuHomePanel`（首页卡片）、`CeshuView`（编辑器，内嵌数据预览）、`ChapterForm`/`CeshuFieldControl`（schema 驱动表单）、`SystemsEditor`/`SystemConfirmPanel`、`AiFullGeneratePanel`/`AiFieldButton`/`AiReviewPanel`/`AiDataGenPanel`、`ChecklistPanel`/`VersionDiffPanel`/`VersionTimelinePanel`/`WordStatsPanel`/`FieldDepsPanel`/`ChapterNotesPanel`/`TemplateEditorPanel` 等。

### 2. 智能体系统（数字员工）
- `shared/agent/*`：纯逻辑 —— `brain`（推理循环）、`protocol`（工具协议/档位限量）、`prompts`、`budget`（token 预算与确认闸）、`qualityGate`（确定性评分门）、`session`/`memory`/`personalization`/`operationLog`/`observability`/`toolGroups`。
- `main/agent/*`：运行时 —— `dispatcher`（技能调度）、`brainService`（循环编排）、`agentTransport`/`ollamaTransport`/`openAiTransport`（本地 Ollama / 云端 OpenAI 兼容双传输层，按 `resolveLlmTier` 档位路由）、`approvalBroker`（危险操作审批）、`memoryStore`/`sessionStore`/`preferenceStore`/`qualityJudge`/`operationRecorder`。
- `main/agent/skills/*`：5 个技能 —— `askUserSkill`、`ceshuSkill`、`codeSkill`、`gameDataSkill`、`rollbackSkill`。
- 渲染层：`DigitalPanel`（右侧常驻停靠栏）+ `AgentEditorPanel`（可用能力管理）。

### 3. 配置表 / 数据系统
- `shared/typeSchema` / `typeTemplates` / `typeSchemaFile`：类型与字段定义（用户可在「字段结构编辑器」编辑并持久化）。
- `main/data/*`：`service`（DataService 统一 CRUD）、`repository`/`sqliteRepo`（SQLite 持久化）、`csvIO`/`excelIO`、`legacyImport`/`legacyExport`、`undoRecorder`（通用撤销/重做）。
- 渲染层：`DataEditorTab`/`ItemForm`/`TypeEditorPanel`/`AdvancedSearchPanel`/`DataDiffPanel`/`StatisticsPanel`/`BatchEditPanel` 等。

### 4. 属性系统
- `main/attr/*` + `shared/attrSystem`/`attrPanel` 等：属性系统编辑、`attrGameConfigExport`（导出游戏配置）、`attrSystemJsonFile`（JSON 导入导出）；渲染层 `AttrSystemPanel`/`AttrFormulaBuilder`/`AttrTableEditor`/`AttributeChartPanel`。

### 5. 引擎代码导出
- `main/engineExport/*`：`exporter`（取全量数据快照 + schema 渲染并原子落盘）、`engines`（Lua + Unity/Unreal/Godot/Cocos2d 四类目标）、`lua`/`luaLiteral`。渲染层 `EngineExportButton`。

### 6. 安全与钥匙串
- `main/security/jsSandbox`：QuickJS 沙箱（属性公式等用户表达式执行）。
- `main/settings/secretStore` + `shared/secretNames`：API Key 等敏感配置经 Electron `safeStorage` 加密落盘；渲染层永远拿不到明文（IPC 刻意只暴露 `has/set/delete`，无 `get`）。

### 7. 库管理
- `main/library/*`：多游戏库（`<userData>/libraries/<库>/`），`migrateFlatToLibraries` 负责把旧平铺存储一次性搬迁；切换库会重建全部 store 并广播 `library:changed`，渲染层整页重载。

### 8. AI 生图
- `shared/imageGen` + `main/imageGen/*`（client + save）；渲染层 `ImageGenPanel`。密钥同样走 `safeStorage`。

## 数据流

### 策划书工作流
```
用户在 CeshuView 编辑章节
  → renderer 调 window.mbApi.ceshu.saveChapter({id, chapter, data})
  → preload invoke('ceshu:saveChapter')
  → main ipc handler（zod 校验）→ CeshuManager.saveChapter → storage 写 JSON
  → 若 systems/meta 章：CeshuDataSync.syncSystemsToData → 动态注册数据类型
校验/评分/导出/同步 等均经同名 mbApi 通道，落到 shared 纯函数或 main 服务。
```

### Agent 工作流
```
用户在 DigitalPanel 输入
  → mbApi.agent.chat → agent:chat handler → brainService.chat
  → 需要工具时经 agent:event 把事件实时推回渲染层（流式）
  → 危险操作经 approvalBroker 暂停，等 mbApi.agent.respondApproval / respondInteraction
```

### 数据编辑工作流
```
DataEditorTab 操作 → mbApi.data.createItem / updateItem / ...
  → data:* handler → DataService → SQLite（better-sqlite3）
  → 变更后 CeshuDataSync.onDataChanged（若当前有活跃策划书则同步 actual_count）
  → 主进程 undoRecorder 记录可撤销
```

## 主题与界面
- 4 档主题（深/浅/暖调/暗夜），由 `shared/theme` + 渲染层 `loadTheme`/`applyTheme` 管理，持久化在 localStorage；状态栏一键快切深/浅。
- 信息架构：无左侧栏，所有能力走顶部菜单栏；中央单栈（首页卡片 ↔ 编辑器），右侧常驻数字员工停靠栏，底部状态栏；其余能力以互斥浮层（overlay）承载。详见 [`ux-simplification-plan.md`](./ux-simplification-plan.md)。

## 测试架构
```
desktop/
├── tests/unit/         # vitest 单元测试（shared 纯函数 + main 服务，含 Ollama 桩）
├── tests/e2e/          # Playwright 端到端（构建后跑真实 Electron 窗口）
└── 门禁：tsc --noEmit + eslint + vitest + playwright 四道
```
> 注：旧版 时代的 `tests/{unit,integration,e2e}` + `conftest` 已随 早期版本删除；现测试基座为 **vitest + Playwright**。
