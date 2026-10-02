# TS 迁移路线图与推进纪律（desktop/）

> 用途：跨会话/跨子代理的**唯一进度与计划事实来源**。每完成一片，回写本文件「进度台账」并同步 `project_memory.md`。
> 基线：Python 侧 299 文件 / 78,746 行；TS 侧 `desktop/src` 82 文件 / 17,871 行（≈23% 行数当量）。

## 1. 进度台账（已完成）

| 切片 | 范围 | Python 参照 | 主要 TS 产物 |
|---|---|---|---|
| Phase 0 | 骨架（Electron 44 + electron-vite + React 19 + TS 6 + typed IPC + DataService） | — | `main/index.ts`、`shared/ipc.ts`、`main/ipc.ts`、`preload/index.ts` |
| Phase 1 | 12 类型 schema + 存量导入 + SQLite 存储 | `core/type_schema.py`、`core/data_manager.py` | `shared/typeSchema.ts`、`main/data/*` |
| W1 / W2 | 动态表单 + 旧版 JSON 导出 | `ui/data_tab.py` | `components/ItemForm.tsx`、`main/data/legacyExport.ts` |
| W3 | 策划书模型 + 存储 + 最小 UI | `core/ceshu/ceshu_model.py` | `shared/ceshuModel.ts`、`main/ceshu/storage.ts` |
| W4 | 策划书 5 格式导出（md/html/docx/pptx/pdf） | `core/ceshu/ceshu_*_exporter.py` | `main/ceshu/export/*` |
| W5 | 版本链（派生/激活/changelog） | `core/ceshu/ceshu_changelog.py` | `shared/ceshuDiff.ts` |
| W6 | 校验 + 评分 | `ceshu_validation.py`、`ceshu_scorer.py` | `shared/ceshuValidation.ts`、`shared/ceshuScorer.ts` |
| W7-W11 | AI 生成本章/补空 + 一键生成 + 系统编辑器完善 | `core/agent/skills/*` | `shared/ceshuAi.ts`、`components/AiFullGeneratePanel.tsx` |
| W12/W13 | 条目属性列表（attrtable） | `core/attr_system.py`、`core/calc_engine.py` | `shared/attrList.ts`、`components/AttrTableEditor.tsx` |
| W14 | role/monster 属性面板（TS 自有 `attrpanel` 类型） | 同上 | `shared/attrPanel.ts`、`components/AttrPanelEditor.tsx` |
| W15 | 关系矩阵 + 导出游戏配置 | `ui/widgets/attr_system_editor.py` | `shared/attrSystem.ts`、`main/attr/attrGameConfigExport.ts` |
| W16 | 实时预览 | `live_preview.py` | `shared/attrPreview.ts`、`components/AttrLivePreview.tsx` |
| W17 | 装备预览 | `equipment_preview.py` | `shared/equipPreview.ts`、`components/EquipPreviewPanel.tsx` |
| W18 | AI 智能审阅（5 维度 + 报告） | `ai_review_dialog.py` | `shared/ceshuAi.ts`、`components/AiReviewPanel.tsx` |
| W19 | 完备性检查清单（50 项 + 一键修复） | `ceshu_checklist.py`、`ceshu_fill.py` | `shared/ceshuChecklist.ts`、`shared/ceshuFill.ts`、`components/ChecklistPanel.tsx` |
| W20 | 版本对比（章节级 Diff + 报告） | `version_diff_dialog.py` | `shared/ceshuDiff.ts`、`components/VersionDiffPanel.tsx` |
| W21 | 章节笔记（独立 JSON CRUD） | `chapter_notes.py` | `shared/ceshuNotes.ts`、`main/ceshu/notesStore.ts`、`components/ChapterNotesPanel.tsx` |
| W22 | 属性系统 JSON 导入/导出 | `attr_system_editor.py` | `main/attr/attrSystemJsonFile.ts` |
| W23 | 字数统计（18 章完成度 + 写作建议 + 面板） | `ui/ceshu/word_stats_dialog.py` | `shared/ceshuWordStats.ts`、`components/WordStatsPanel.tsx` |
| W24 | 字段/系统依赖检查（20 条依赖 + 两张依赖图 + 双视图面板） | `field_dependencies.py`、`field_dependency_graph.py`、`system_dependency_graph.py` | `shared/ceshuFieldDeps.ts`（单测 40）、`components/FieldDepsPanel.tsx`、E2E |
| W25 | Excel 导出（8 Sheet 工作簿，导出格式补满 6 种） | `ceshu_excel_exporter.py` | `main/ceshu/export/excel.ts`（exceljs ^4.4.0；预演见 `spikes/excel-spike.mjs`） |
| W26 | 版本时间线（横向 SVG 时间线 + 节点详情 + 切换版本；复用 `ceshu:versions`） | `ui/ceshu/version_timeline_dialog.py` | `shared/ceshuTimeline.ts`（单测 12）、`components/VersionTimelinePanel.tsx`、E2E |
| W27 | 章节模板库第一刀（18 章 34 个内置模板 + 搜索/预览 + 三应用模式 + 回填章节草稿） | `data/chapter_templates_data.py`、`ui/ceshu/chapter_templates.py`、`ui/ceshu/template_picker_dialog.py` | `shared/ceshuTemplateData.ts`（机械转换）、`shared/ceshuTemplates.ts`（单测 14）、`components/TemplatePickerPanel.tsx`、ChapterForm 集成、E2E |

## 2. 剩余工作清单（按体量分档）

### A 档（大块，需单独立项）
1. **AI/Agent 引擎**（≈27,500 行，占全域 35%）：`core/agent/` 97 文件（技能注册与调用、LLM 代码执行与自愈改码、`brain_llm`、`shell_skill` 白名单、向量检索、多智能体路由）+ `ui/digital_panel_*`(+`digital_employee`/`chat_renderer`/`ai_bridge` ≈2,900 行) + `src/features/` 2,827 行。**已预演**：quickjs-emscripten 沙箱、ollama 客户端、vectra 向量库（`main/security/jsSandbox.ts`、`main/llm/client.ts`）。
2. **库管理（多库）**（≈1,600 行）：`core/library_manager.py` 626 + `ui/widgets/library_bar` + `ui/library_controller.py` 39 + `ui/ceshu_controller.py` 337 + `ui/data_tab.py` 库联动。**影响**：数据层与策划书/笔记归属路径需按库隔离（当前为 `userData` 单库直存）。

### B 档（可独立成刀）
| 备选切片 | Python 参照（行数） | 备注 |
|---|---|---|
| ~~字数统计~~ | `ui/ceshu/word_stats_dialog.py` 237 | ✅ W23 已完成（备注：该文件自带基准表，与 `ceshu_scorer.py` 的表数值不同，未复用） |
| ~~Excel 导出（补满 6 种）~~ | `core/ceshu/ceshu_excel_exporter.py` 326 | ✅ W25 已完成（8 Sheet：概览/系统配置/数值表/角色/里程碑/风险/竞品/校验报告） |
| 依赖图（字段/系统） | `core/ceshu/field_dependencies.py` 233 + `ui/ceshu/field_dependency_graph.py` 403 + `system_dependency_graph.py` 307 | 纯逻辑（可用性/触发规则）+ 图渲染 |
| ~~版本时间线~~ | `ui/ceshu/version_timeline_dialog.py` 405 | ✅ W26 已完成（`shared/ceshuTimeline.ts` 布局/文案纯逻辑 + `VersionTimelinePanel` SVG 时间线 + E2E；`CeshuSummary` 增 `versionNote`） |
| 自定义模板 | `custom_template_manager.py` 380 + `template_editor_dialog.py` 514 + `template_picker_dialog.py` 439 + `chapter_templates.py` 133 | 拆三刀：① ✅ W27 内置模板库（`chapter_templates*` + `template_picker_dialog`）② W28 自定义模板存储与 IPC（`custom_template_manager` + 选择器内「另存为模板」）③ W29 模板编辑器（`template_editor_dialog`：编辑/迁移/导入导出） |
| AI 生成数据表 | `ui/ceshu/ai_data_generate_dialog.py` 305 | 复用 `shared/ceshuAi.ts` 提示词框架 |
| 预设市场 / 竞品图表 | `preset_market_dialog.py` 300 + `competitive_chart.py` 80 | 数据 + 简单图表 |
| 系统依赖确认 / 数据同步 | `system_confirm_dialog.py` 242 + `ceshu_data_sync.py` 248 | 与 systems 章、数据表联动 |
| 首页/卡片 | `home_view.py` 452 + `home_card.py` 136 | 需要多文档聚合视图 |
| 迁移工具 | `ceshu_migration.py` 111 | 旧版库迁移 |

### C 档（骨架/外围）
菜单与快捷键（`menus.py` 172 / `shortcuts_dialog.py` 93）、`tab_manager.py` 215、`window_state.py` 129、主题与特效（≈1,000）、设置面板、i18n、`src/security` 840（部分已由 `jsSandbox` 覆盖）、`src/common` 5,374 中尚未用到的工具。

### D 档（属性/数值域剩余）
`core/extended_formulas.py` 390（ExtendedFormula 未移植）、`style_manager.py` 236、`game_templates.py` 239、`editor_layout.py` 177、`operation_log.py` 123（撤销/操作日志）、`cedict.py` 58、公式构建器对话框、引擎代码导出（`ui/dialogs/engine_export.py` Unity/Unreal/Cocos）。

## 3. 每片执行流程（固定顺序）

1. **调研**：读 Python 源码，锁定语义与缺陷，写成「调研结论」（含精确数字）。
2. **共享纯逻辑** → `desktop/src/shared/*.ts`（可被单测覆盖；Python 缺陷在此修正并记录）。
3. **单测** → `desktop/tests/unit/*.test.ts`（Vitest；锁定精确数字）。
4. **IPC 接线（固定 5 处）**：`shared/ipc.ts` 契约 → `shared/schemas.ts`（zod）→ `main/ipc.ts`（`handle()`）→ `preload/index.ts` → `shared/api.ts`。
5. **渲染层**：`renderer/src/components/*.tsx` + `styles.css`（testid 约定：面板 `xxx-panel`，按钮 `xxx-action`）。
6. **E2E** → `desktop/tests/e2e/*.spec.ts`（IPC 精确断言 + UI 断言 + 磁盘回读）。
7. **全量验证**（见下）；**回写**本文件台账 + `project_memory.md`；**提交**。

### 验证命令（cwd = `d:\GameEditorApp\desktop`）
```
node_modules\.bin\eslint .
node_modules\.bin\tsc --noEmit -p tsconfig.node.json --composite false
node_modules\.bin\tsc --noEmit -p tsconfig.web.json
node_modules\.bin\vitest run
node_modules\.bin\electron-vite build
node_modules\.bin\playwright test          ← 必须 dangerouslyDisableSandbox=true
```

### 提交纪律
- **只 `git add desktop`**；绝不提交根 `CHANGELOG.md`、根 `docs/`、Python 侧 `src/**` 遗留改动。
- 提交信息格式：`feat: <中文简述>（<关键点>）`。

## 4. 编码约定（踩过的坑）

- ESLint `react-hooks`：effect 体内**不得同步 setState**（用 `.then` 回填）。
- 受控输入易出现空值问题 → 复杂表单用 `defaultValue + resetToken` 模式。
- 纯逻辑放 `shared/`（Node 环境单测可测）；`shared/` 不得引入 zod（zod 仅主进程/`schemas.ts`）。
- 空值语义有三套，按场景选：进度用 `isFilledValue`（`{}` 视为未填）、校验用 `isEmptyRequiredValue`（`{}` 不视为空）、清单用 `hasValue`（字符串 strip）。
- 存储写入：串行写队列（唯一写者）+「临时文件 + rename」原子写；每份文档一个 JSON 文件。
- 离线 LLM 测试：`MB_OLLAMA_HOST: 'http://127.0.0.1:1'`，错误文案须含 `Ollama` 与 `ollama serve`。
- 章节中文标签为「第一章·项目元信息」格式，测试断言按真实文案。
- **E2E 跑的是 `out/` 产物**：改渲染层后必须先 `electron-vite build` 再 `playwright test`，否则新按钮/面板在 E2E 中不可见（症状为定位器 30s 超时）。
- 单行 `<input>` 会丢弃换行（浏览器 value 净化，与 QLineEdit 同行为）：`append` 模式拼接的文本在输入框里显示为连写，但草稿数据仍含 `\n` → UI 断言用正则、落盘断言用精确值。

## 5. 子代理并行约定（重要）

并发冲突点是**接线文件**。因此：

- **禁止子代理修改**：`shared/ipc.ts`、`shared/schemas.ts`、`shared/api.ts`、`preload/index.ts`、`main/ipc.ts`、`main/index.ts`、`renderer/src/styles.css`、`renderer/src/components/CeshuView.tsx`、`renderer/src/App.tsx`。
- **子代理只做**：新增**互不重叠**的独立文件 —— `shared/<模块>.ts` + `tests/unit/<模块>.test.ts`，并自行跑 `vitest`/`tsc`/`eslint` 验证；**不得提交 git**。
- **父代理负责**：调研把关、IPC 接线、UI 集成、E2E、全量验证、提交、台账回写。
- 并行上限 **2–3 个子代理**；每个任务必须写清：目标文件路径、Python 参照与语义要点、精确数字要求、验证命令、禁止事项。
- 子代理交付时须附「语义对照」说明（Python 函数 ↔ TS 函数 + 有意偏离项），便于父代理复核。

## 6. 下一批分片排期（默认顺序）

| 编号 | 切片 | 说明 |
|---|---|---|
| ~~W23~~ | ~~字数统计~~ | ✅ 已完成（IPC `ceshu:wordStats` + `WordStatsPanel` + E2E） |
| ~~W24~~ | ~~依赖检查（字段/系统）~~ | ✅ 已完成（IPC `ceshu:fieldDeps` + `FieldDepsPanel` 双视图 + E2E 25-25） |
| ~~W25~~ | ~~Excel 导出（补满 6 种）~~ | ✅ 已完成：`main/ceshu/export/excel.ts`（`buildExcelWorkbook` + `renderCeshuExcel`，8 Sheet：概览/系统配置/数值表/角色/里程碑/风险/竞品/校验报告；标题行蓝底白字加粗 + 冻结首行 + 列宽自适应 + 数字型字符串转 int/float）→ 单测 7 + E2E（xlsx 魔数 + exceljs 回读 8 Sheet） |
| ~~W26~~ | ~~版本时间线~~ | ✅ 已完成：`shared/ceshuTimeline.ts`（尺寸/配色/文案/布局/默认选中/详情，单测 12）+ `VersionTimelinePanel`（SVG 主轴+节点+箭头、图例、节点详情、切换到此版本）+ E2E 26-26 |
| ~~W27~~ | ~~章节模板库（第一刀：内置模板 + 选择器）~~ | ✅ 已完成：`shared/ceshuTemplateData.ts`（18 章 34 模板，由 Python 数据池机械转换）+ `shared/ceshuTemplates.ts`（查询/三模式合并/预览树，单测 14）+ `TemplatePickerPanel`（筛选/搜索/预览/二次确认）+ ChapterForm「模板库」入口（回填章节草稿，需再点保存）+ E2E 27-27 |
| W28 | 自定义模板（第二刀：模型 + 存储 + IPC + 「另存为模板」） | `custom_template_manager.py` 380（分类文件 `custom_templates/<category>.json`、CRUD/search/import/export/count） |
| W29 | 模板编辑器（第三刀） | `template_editor_dialog.py` 514（列表含内置+自定义、编辑/迁移分类/删除/导入导出） |
| W30+ | AI 生成数据表 / 预设市场 / 竞品图表 / 首页卡片 … | 见 B 档 |
| 之后 | 库管理（多库） → AI/Agent 引擎（需方案设计） | A 档 |