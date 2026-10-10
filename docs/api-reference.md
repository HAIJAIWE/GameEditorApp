# API 参考文档

> 📌 现役产品的「公开 API」是 preload 暴露的 **`window.mbApi`**（typed IPC 门面，定义在 `shared/service/api.ts` 与 `preload/index.ts`）。本文件列出其命名空间与高频通道，以及 `shared/` 中可被二次开发直接复用的纯函数。

## 一、调用约定

```ts
// 渲染层（React 组件内）调用示例
const list = await window.mbApi.ceshu.list()
const doc = await window.mbApi.ceshu.get({ id })
await window.mbApi.ceshu.saveChapter({
  id,
  chapter: 'combat',
  data: { combat_mode: 'turn_based', damage_formula: 'atk - def' },
  style: 'xianxia',
  moduleType: 'rpg'
})
```

- 所有调用返回 `Promise`；主进程失败统一抛 `IpcInvokeError`（含 `code`、`message`），渲染层 `try/catch` 即可拿到中文错误。
- 请求参数结构由 `shared/schemas.ts` 的 zod schema 强制校验（字段缺失/类型错会被主进程直接拒绝）。
- 推送类（非请求-响应）：`mbApi.agent.onEvent(cb)`、`mbApi.library.onChanged(cb)`，返回取消订阅函数。

## 二、mbApi 命名空间

| 命名空间 | 关键通道 | 说明 |
|---|---|---|
| `app` | `info` / `log` / `setWindowMode` | 应用信息、日志转发、窗口模式 |
| `schema` | `list` / `save` / `suggestFieldIds` / `listFieldTemplates` / `getFieldTemplate` / `saveFieldTemplate` / `deleteFieldTemplate` | 数据类型与字段模板 |
| `agent` | `listTools` / `executeTool` / `chat` / `respondApproval` / `respondInteraction` / `sessionInfo` / `sessionRestore` / `sessionClear` / `draftSave` / `draftList` / `draftLoad` / `feedback` / `onEvent` | 数字员工：工具、会话、草稿、审批、事件流 |
| `attrSystem` | `get` / `save` / `exportGameConfig` / `exportJson` / `importJson` | 属性系统 |
| `data` | `listItems` / `listAll` / `createItem` / `updateItem` / `deleteItem` / `batchUpdate` / `deleteMany` / `clearAll` / `undo` / `redo` / `undoState` / `references` / `importLegacy` / `exportLegacy` / `exportCsv` / `importCsv` / `exportExcel` / `importExcel` | 游戏数据 CRUD/搜索/导入导出/撤销重做 |
| `engine` | `exportData` | 引擎代码导出（Lua/Unity/Unreal/Godot/Cocos2d） |
| `image` | `generate` | AI 生图 |
| `settings` | `hasSecret` / `setSecret` / `deleteSecret` | 系统钥匙串（API Key 等，仅有 has/set/delete，无 get） |
| `backup` | `list` / `create` / `restore` / `remove` | 整库备份快照（存 `<库>/backups`） |
| `llm` | `generate` / `configure` / `status` / `testConnection` | 单次文本生成、配置镜像、连通性探测 |
| `images` | `listLibraryImages` / `readByPath` / `deleteImages` | 图片库扫描/预览/清理 |
| `dialog` | `chooseJsonFile` / `chooseEngineExportFile` / `chooseSaveJsonFile` / `chooseExportDir` / `chooseCsvFile` / `chooseExcelFile` / `chooseImageSaveDir` / `chooseImageFile` / `chooseCeshuExportFile` / `chooseReportFile` / `chooseAttrSystemJsonFile` / `chooseTemplateJsonFile` | 文件/目录选择（主进程代开） |
| `ceshu` | 见第三节 | 策划书全能力 |
| `library` | `list` / `create` / `rename` / `remove` / `switch` / `onChanged` | 多游戏库 |

## 三、ceshu 命名空间（策划书）

| 通道 | 说明 |
|---|---|
| `list` / `create` / `get` / `setActive` | 列表 / 新建 / 打开 / 设为主策划 |
| `saveChapter` | 保存单章（systems/meta 章额外触发数据同步） |
| `export` | 六格式导出（markdown/html/docx/pptx/pdf/excel） |
| `versions` / `derive` / `changelog` | 版本链 / 派生新版本 / 变更日志 |
| `applyPreset` | 应用混合玩法预设 |
| `confirmSystems` | 确认游戏系统（写入 `meta.system_confirmed` 并同步数据） |
| `syncData` | 策划书↔数据双向同步 |
| `rename` / `remove` / `duplicate` | 重命名 / 删除 / 复制 |
| `validate` / `score` | 一致性校验 / 三维评分 |
| `aiGenerateChapter` / `aiGenerateField` / `aiReview` / `aiGenerateData` | AI 整章 / 单字段 / 审阅 / 数据生成 |
| `checklist` / `autoFill` | 完备性检查 / 空必填自动补齐 |
| `diff` + `exportDiffReport` | 版本对比 + 报告导出 |
| `exportReviewReport` / `exportChecklistReport` / `exportScoreReport` / `exportValidationReport` / `exportChangelogReport` | 各类文本报告导出 |
| `notes.*`（list/add/update/remove） | 章节笔记 |
| `templates.*`（list/save/update/remove/exportAll/importAll） | 自定义模板 |
| `wordStats` / `fieldDeps` | 字数统计 / 字段依赖报告 |

## 四、shared 纯函数（可复用，无 Electron 依赖）

这些函数位于 `desktop/src/shared/`，可被测试、CLI 或二次开发直接 `import`，不依赖主进程：

- `scoreCeshu(doc)` → 三维评分（结构/质量/市场）与 S/A/B/C/D 等级（`ceshuScorer.ts`）
- `validateCeshu(doc)` → 一致性校验错误数组（`ceshuValidation.ts`）
- `runChecklist(doc)` → 完备性检查清单结果（`ceshuChecklist.ts`）
- `buildVersionDiff(a, b)` → 两版本字段级差异（`ceshuDiff.ts`）
- `buildFieldDepsReport(doc)` → 跨章节字段依赖（`ceshuFieldDeps.ts`）
- `buildWordStatsReport(doc)` → 字数统计（`ceshuWordStats.ts`）
- `buildSystemConfirmResult(...)` → 系统确认结果（`ceshuSystemConfirm.ts`）
- `computeChapterProgress(doc)` → 章节进度（`ceshuModel.ts`）
- `checkSystemDependencies(enabled)` → 系统硬依赖检查（`ceshuConstants.ts`）
- `visibleChapterKeys(scope)` / `CHAPTER_PARTS` / `CHAPTER_NAMES` / `LITE_CHAPTER_KEYS` → 章节与档位派生（`ceshuConstants.ts`）
- `buildChapterPrompt` / `parseLlmJson` / `mergeChapterDraft` / `filterGeneratedFields`（`ceshuAi.ts`）
- `resolveLlmTier(config)` → 档位路由（cloud / local / unconfigured）（`llmConfig.ts`）

## 五、Agent 技能 API（开发自定义技能）

新增技能：在 `main/agent/skills/` 实现一个技能模块，向 `SkillDispatcher` 注册（见 `desktop/docs/agent-framework-design.md` 的 v1.7 设计）。技能通过 `agent:executeTool` 走统一调度与安全门；工具面下发给模型时**必须**经 `brainService.chat()` 的 `toFunctionCallingTools()` 包装为 `{type:'function', function:{...}}`（漏包装会导致云端 `400 InvalidParameter`）。

## 六、相关文档
- [总体架构](./architecture.md) · [策划书使用指南](./ceshu-user-guide.md) · [策划书开发者指南](./ceshu-developer-guide.md)
- 智能体/AI 设计真源：`desktop/docs/agent-framework-design.md`
