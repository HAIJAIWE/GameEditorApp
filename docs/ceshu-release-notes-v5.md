# 策划书（GDD）系统 · 特性总览

> 📌 现役产品的 策划书（Ceshu）模块能力清单与实现说明。
> 设计源自 早期版本的工业级 GDD v5 框架，已在 `desktop/` 以 TypeScript 完整重实现（结构、档位、系统、评分、AI、导出一一对应）。
> 适用模块：`desktop/src/shared/ceshu*` + `desktop/src/main/ceshu/*` + `desktop/src/renderer/src/components/{CeshuHomePanel,CeshuView,...}`

## 一、能力盘点（先明确哪些是强项）

一屏之内同时具备：结构化策划书编辑（分区 + 章节 + 字段级校验 + AI 单章/整章/一键生成）、13 游戏系统配置与硬依赖、可视化数据编辑（列表 + schema 驱动动态表单 + 参考策划/AI 生成/关联）、AI 工作区（数字员工）、多库切换、自动保存/撤销重做。

### 与 早期版本的能力对照（重实现后）

| 能力 | 旧版 v5 | TS 版 | 备注 |
|---|---|---|---|
| 章节结构 | 18 章（含 worldview / characters 两章） | **16 编号章 + meta**（worldview 与 characters 合并为「世界观与角色」） | 5 分区，章号自动派生 |
| 档位 | lite / full | lite（核心 9 章）/ full（16 章） | 同 |
| 游戏系统 | 13 | 13 | 硬依赖同 `SYSTEM_DEPENDENCIES` |
| 导出格式 | 6 | 6（md/html/docx/pptx/pdf/excel） | 渲染器重写 |
| AI 动作 | 字段/整章/完整/审阅 | 字段/整章/完整/审阅/**数据生成** | 新增 AI 数据生成 |
| 校验规则 | 16+ | 沿用 `ceshuValidation` | 必填 + 系统依赖 |
| 完备性检查 | 50 | 沿用 `ceshuChecklist` | |
| 评分 | 三维 S/A/B/C/D | 沿用 `ceshuScorer` | 结构30/质量40/市场30 |
| 版本管理 | 派生/对比/时间线/变更日志 | 同（derive/diff/version timeline/changelog） | |
| 混合玩法预设 | 18 | 沿用 `ceshuPresets` | |
| 存储 | `<库>/ceshu/<id>.json` | 同（格式兼容，可互通） | 切库随库隔离 |

## 二、核心能力分述

### 1. 分区 + 章节结构（16 章 + meta + 5 区）
见 [`ceshu-user-guide.md`](./ceshu-user-guide.md) 的「章节结构」与 [`ceshuConstants.ts`](../../desktop/src/shared/ceshuConstants.ts)。顺序由 `CHAPTER_PARTS` 单点派生，重排不会漏改编号。

### 2. 游戏系统配置（13 个 + 硬依赖）
`SYSTEM_LABELS` / `SYSTEM_DEPENDENCIES` 与 早期版本一致；启用系统时校验硬依赖（`checkSystemDependencies`），确认后写入 `meta.system_confirmed` 并触发 `CeshuDataSync.syncSystemsToData` 把系统映射为游戏数据类型。

### 3. 评分与完备性
- `scoreCeshu`：三维（结构 30 + 质量 40 + 市场 30 = 100），S/A/B/C/D 五级 + 各章明细 + 改进建议。
- `runChecklist`：生产就绪检查（required 项全过才算 `is_production_ready`）。
- `validateCeshu`：必填字段 + 系统依赖一致性。

### 4. AI 辅助（5 类）
- **字段级填充**（`aiGenerateField`）：单字段定向生成，不套审批闸、不跑评分门，值回填表单不落盘。
- **整章生成**（`aiGenerateChapter`）：可「仅填空字段」；大范围云端调用需 `confirmed` 重发 + 预算确认。
- **一键完整生成**（`aiGenerateChapter` 带 `fullGenerate`）：整篇草稿，产出过确定性评分门 + 可选 LLM judge（judge 失败降级不阻断正文）。
- **智能审阅**（`aiReview`）：整篇审阅，给出改进建议，与进度/校验挂钩。
- **AI 数据生成**（`aiGenerateData`）：依据策划书数值/系统生成候选游戏数据 → 预览勾选 → 人工导入数据表。

### 5. 版本管理
- `derive`：从主策划派生新版本（保留版本链）。
- `versions` + `changelog`：版本列表与变更日志。
- `diff` + `exportDiffReport`：两版本字段级对比与报告。
- 版本时间线面板（`VersionTimelinePanel`）。

### 6. 导出（6 格式）
`exportCeshuDocument(doc, format, path)` 统一入口；`markdown/html/docx/pptx/pdf/excel` 各自渲染器；分区标题与章号由 `ceshu/export/common.ts` 统一生成。

### 7. 模板与笔记
- 自定义模板：`ceshu/templateStore.ts`，每分类一个 JSON，支持导入/导出。
- 章节笔记：`ceshu/notesStore.ts`，每策划书一个 JSON。

### 8. 字数统计与字段依赖
- `buildWordStatsReport`：分章节字数。
- `buildFieldDepsReport`：跨章节字段依赖（如「战斗公式」依赖「数值」章字段）。

## 三、技术实现要点
- 纯逻辑（`shared/ceshu*`）与主进程 IO（`main/ceshu/*`）分离，纯逻辑无 Electron 依赖、可独立单测。
- 持久化：每份策划书一个 JSON 文件 `<库>/ceshu/<id>.json`，与 早期版本格式兼容；`ceshuMigration.ts` 负责旧版（v4→v5）数据归一。
- 同步：`CeshuDataSync` 双向——systems → 数据类型结构；数据条目数 → `systems[key].config.actual_count`。
- 全链路经 typed IPC（`mbApi.ceshu.*` ↔ `ceshu:*`），入口 zod 校验、结果统一包裹。

## 四、已知限制（诚实边界）
- 章节草稿级保存：刻意不做「整文档 Ctrl+S 保存」（保存是章节级草稿），避免与 旧版 行为混淆。
- 云端调用成本：整章/完整/审阅/大量数据生成属大范围调用，需用户确认并受 token 预算闸约束。
- AI 生成质量依赖所配置模型与档位（本地 Ollama 4B 类与云端 DeepSeek 档能力差异显著）。

## 五、相关文档
- [策划书使用指南](./ceshu-user-guide.md)
- [策划书开发者指南](./ceshu-developer-guide.md)
- [总体架构](./architecture.md)
- 设计真源：`desktop/docs/agent-framework-design.md`（智能体/AI 部分）、`desktop/docs/migration-audit.md`、`desktop/docs/ts-migration-roadmap.md`
