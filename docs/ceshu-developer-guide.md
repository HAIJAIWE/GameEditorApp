# 策划书（Ceshu）开发者指南

> 📌 面向开发者：策划书模块的架构、核心数据结构、关键 API 与扩展方法。
> 适用：二次开发、加新章节/导出格式/AI 功能/校验规则、阅读源码。

> 核心模块：`desktop/src/shared/ceshu*`（纯逻辑） + `desktop/src/main/ceshu/*`（IO/持久化） + `desktop/src/renderer/src/components/{CeshuHomePanel,CeshuView,ChapterForm,...}`（UI）

## 一、架构概览

策划书模块遵循全仓的 **IPC 四层** 与 **shared 纯逻辑** 约定，UI 不直接碰存储：

```
┌─────────────────────────────────────────────────────────────┐
│  渲染层 (src/renderer/src/components/ceshu*)                  │
│  CeshuHomePanel / CeshuView / ChapterForm / SystemsEditor ... │
│  只调 window.mbApi.ceshu.*                                    │
├─────────────────────────────────────────────────────────────┤
│  桥接层 (src/preload/index.ts)                                │
│  contextBridge.exposeInMainWorld('mbApi', api)                │
├─────────────────────────────────────────────────────────────┤
│  主进程 (src/main/ipc.ts + src/main/ceshu/*)                  │
│  ceshu:* handler（zod 校验）→ CeshuManager / storage / export │
├─────────────────────────────────────────────────────────────┤
│  共享层 (src/shared/ceshu*)                                   │
│  纯函数：model / validation / scorer / checklist / diff /     │
│  fieldDeps / wordStats / systemConfirm / ai / dataGen /       │
│  presets / migration / constants —— 无 Electron、无 React     │
└─────────────────────────────────────────────────────────────┘
```

### 设计原则
1. **shared 零 Electron/React 依赖**：`ceshu*` 纯模块可独立单元测试，不 import `main/`。
2. **四层 IPC 契约**：新通道必登 `shared/schemas.ts`（zod）+ `shared/ipc.ts`（`IpcContract`）+ `shared/service/api.ts`（`MbApi`）+ `preload/index.ts`；漏任一层 tsc 报错。
3. **入口统一校验**：`ipc.ts` 的 `handle()` 在 `main/index.ts` 注入的 deps 上运行，先 zod 校验请求，结果包 `{ok,data}/{ok:false,error}`。
4. **存储与计算分离**：`storage.ts` 只管 JSON 读写；所有派生（进度/评分/校验/依赖）在 `shared/` 纯函数，便于复用与测试。

## 二、核心数据结构（`shared/ceshuConstants.ts` 等）

```ts
// 章节 key（meta 不编号；其余 16 个按章号顺序）
export const CHAPTER_KEYS = ['meta','vision','story','gameplay','systems','combat',
  'economy','numeric','art','audio','tech','resources','mvp','risk_handling',
  'market_analysis','monetization','accessibility'] as const
// 5 分区 = 章节顺序单一事实源
export const CHAPTER_PARTS = [
  {key:'product',label:'产品定义',chapters:['vision','story','gameplay']},
  {key:'systems',label:'游戏系统',chapters:['systems','combat','economy','numeric']},
  {key:'presentation',label:'表现设计',chapters:['art','audio']},
  {key:'tech',label:'技术方案',chapters:['tech']},
  {key:'production',label:'制作与发行',chapters:['resources','mvp','risk_handling',
    'market_analysis','monetization','accessibility']}
]
// 档位：lite = 核心 9 章前缀；full = 全部 16 章
export const LITE_CHAPTER_KEYS = ['vision','story','gameplay','systems','combat',
  'economy','numeric','art','audio']
// 13 系统 + 硬依赖
export const SYSTEM_LABELS: Record<string,string> = { battle:'战斗', character:'角色', ... }
export const SYSTEM_DEPENDENCIES: Record<string,string[]> = { battle:['character','skill'], ... }
// 文档类型
export interface CeshuDocument extends CeshuDocumentBase {
  [K in ChapterKey]: ChapterData   // 16 章平铺 + meta 字段
}
export type CeshuDocumentBase = { version, ceshu_id, created_at, updated_at,
  parent_id, version_label, is_active, version_note, style, moduleType,
  enabled_editors, editor_configs }
```

- `CeshuSummary`（首页卡片）：id / gameName / scope / versionLabel / updatedAt / progress / parentId / isActive 等，由 `ceshuHome.ts` 从文档派生。
- `CeshuFieldDef`（章节表单字段描述）：key / label / kind（text/textarea/number/combo/multiCombo/checkbox/stringList/pipeList/json）/ values / optionLabels / columns 等，渲染层 schema 驱动表单用。

## 三、关键模块与 API

### 3.1 CeshuManager（`main/ceshu/manager.ts`）
策划书 CRUD + 版本 + 评分 + 校验，全部落在内存文档上，由 `storage.ts` 持久化。
- `list()` / `create(req)` / `get(id)` / `saveChapter(id, chapter, data, {style,moduleType})`
- `versions(id)` / `derive(id, note)` / `changelog(id)`
- `applyPreset(id, presetKey)` / `confirmSystems(id, ...)` / `syncData(id)`
- `rename` / `remove` / `duplicate` / `setActive`
- `validate(doc)`（委托 `shared/ceshuValidation`）/ `score(doc)`（委托 `shared/ceshuScorer`）/ `autoFill(id)`

### 3.2 CeshuStorage（`main/ceshu/storage.ts`）
每份策划书一个独立 JSON 文件（`<库>/ceshu/<id>.json`，与 Python 版格式兼容）。原子写入（写临时文件再 rename）。切库随库隔离。

### 3.3 导出（`main/ceshu/export/*`）
- `exporter.ts`：`exportCeshuDocument(doc, format, path)` 统一入口，dispatch 到六个渲染器。
- `markdown.ts` / `html.ts` / `docx.ts`（`docx` 库）/ `pptx.ts`（`pptxgenjs`）/ `pdf.ts` / `excel.ts`（`exceljs`）。
- `common.ts`：分区标题、章号、字段值格式化、可见章节顺序（单一来源，避免各渲染器各写各的）。
- `reportExport.ts`：`exportTextReportFile` 供校验/评分/对比/审阅/变更日志报告导出。

### 3.4 CeshuDataSync（`main/ceshu/dataSync.ts`）
双向同步：`setCurrentCeshu` / `syncSystemsToData(doc)`（systems → 动态注册 game 数据类型）/ `syncBoth` / `onDataChanged`（数据变更后回写 `actual_count`）。

### 3.5 笔记 / 模板
- `notesStore.ts`：每策划书一个 JSON `<库>/ceshu_notes/<id>.json`。
- `templateStore.ts`：每分类一个 JSON `<库>/custom_templates/<category>.json`，支持 import/export。

### 3.6 shared 纯函数
`ceshuModel`（进度/派生）、`ceshuValidation`、`ceshuScorer`、`ceshuChecklist`、`ceshuDiff`、`ceshuFieldDeps`、`ceshuWordStats`、`ceshuSystemConfirm`、`ceshuAi`（提示词/解析/合并/过滤）、`ceshuDataGen`、`ceshuPresets`、`ceshuMigration`（v4→v5 归一）、`ceshuConstants`。

## 四、扩展指南

### 4.1 添加新章节
1. `ceshuConstants.ts`：`CHAPTER_PARTS` 的对应分区 `chapters` 里加 key；`CHAPTER_NAMES` 加中文名；`CHAPTER_REQUIRED_FIELDS` 加必填。章号与「第N章·」标签自动重编。
2. `ceshuModel.ts`：`computeChapterProgress` 已按 `CHAPTER_REQUIRED_FIELDS` 算，无需改。
3. 渲染层：`ChapterForm` 按 `CeshuFieldDef[]` schema 渲染，新章字段描述在对应章节配置文件里加。
4. 如需 AI 生成：在 `ceshuAi.ts` 的章节提示词映射里加新章字段白名单。
5. 导出：`common.ts` 的 `visibleChapterEntries` 已按 `CHAPTER_PARTS` 自动包含新章，无需改。

### 4.2 添加新导出格式
1. 在 `ceshu/export/` 新增 `xxx.ts`，实现 `renderCeshuXxx(doc): Promise<Buffer>`。
2. `exporter.ts` 的 dispatch 加分支；`ceshuConstants.ts` 的 `CESHU_EXPORT_FORMATS` / `CESHU_FORMAT_LABELS` / `CESHU_FORMAT_EXTENSIONS` 加一项。
3. `ipc.ts` 的 `ceshu:export` 已读取 `format` 字段透传，无需改 handler。

### 4.3 添加新 AI 功能
1. `shared/ipc.ts` 加通道；`shared/schemas.ts` 加 zod 入参；`shared/service/api.ts` 加 `MbApi` 方法。
2. 纯逻辑放 `shared/ceshu*`（提示词/解析）；主进程在 `ipc.ts` 加 `ceshu:xxx` handler 调用 `llmClient.generate`。
3. `preload/index.ts` 接 `mbApi.ceshu.xxx`。
4. 渲染层加面板（如 `AiXxxPanel`）。
5. ⚠️ 工具面下发给模型**必须**经理 `brainService.chat()` 的 `toFunctionCallingTools()` 包装（见 `desktop/docs/agent-framework-design.md` v1.7），漏包装云端 400。

### 4.4 添加新校验规则
在 `shared/ceshuValidation.ts` 的 `validateCeshu(doc)` 里加检查，返回 `{field, message}` 风格的错误数组即可（UI 自动展示）。

## 五、测试
- **单元测试（vitest）**：`shared/ceshu*.test.ts` 覆盖纯函数（评分/校验/依赖/迁移/导出渲染器用桩）；`tests/unit/` 覆盖 `main/ceshu/*` 与 `ipc.ts`（Ollama 桩）。
- **端到端（Playwright）**：`tests/e2e/` 构建后跑真实 Electron 窗口，覆盖新建/编辑/导出/AI 生成/版本等。
- **门禁**：`tsc --noEmit`（web+node 两份 tsconfig）+ `eslint` + `vitest` + `playwright` 四道；共享层的 `ceshuConstants.test.ts` 守卫锁定 `LITE_CHAPTER_KEYS` 必须是 `NUMBERED_CHAPTER_KEYS` 前缀等不变量。

## 六、相关文档
- [策划书使用指南](./ceshu-user-guide.md) · [特性总览](./ceshu-release-notes-v5.md) · [总体架构](./architecture.md) · [API 参考](./api-reference.md)
