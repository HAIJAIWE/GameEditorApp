# TS 迁移路线图与推进纪律（desktop/）

> 用途：跨会话/跨子代理的**唯一进度与计划事实来源**。每完成一片，回写本文件「进度台账」并同步 `project_memory.md`。  
> 基线：Python 侧 299 文件 / 78,746 行；TS 侧 `desktop/src` 91 文件 / 20,568 行（≈26% 行数当量，`*.ts|*.tsx` 非空行口径）。


## 1. 进度台账（已完成）

| 切片        | 范围                                                                                                 | Python 参照                                                                                                                          | 主要 TS 产物                                                                                                                                                                                                                                                                                                                           |
| --------- | -------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Phase 0   | 骨架（Electron 44 + electron-vite + React 19 + TS 6 + typed IPC + DataService）                        | —                                                                                                                                  | `main/index.ts`、`shared/ipc.ts`、`main/ipc.ts`、`preload/index.ts`                                                                                                                                                                                                                                                                   |
| Phase 1   | 12 类型 schema + 存量导入 + SQLite 存储                                                                    | `core/type_schema.py`、`core/data_manager.py`                                                                                       | `shared/typeSchema.ts`、`main/data/*`                                                                                                                                                                                                                                                                                               |
| W1 / W2   | 动态表单 + 旧版 JSON 导出                                                                                  | `ui/data_tab.py`                                                                                                                   | `components/ItemForm.tsx`、`main/data/legacyExport.ts`                                                                                                                                                                                                                                                                              |
| W3        | 策划书模型 + 存储 + 最小 UI                                                                                 | `core/ceshu/ceshu_model.py`                                                                                                        | `shared/ceshuModel.ts`、`main/ceshu/storage.ts`                                                                                                                                                                                                                                                                                     |
| W4        | 策划书 5 格式导出（md/html/docx/pptx/pdf）                                                                  | `core/ceshu/ceshu_*_exporter.py`                                                                                                   | `main/ceshu/export/*`                                                                                                                                                                                                                                                                                                              |
| W5        | 版本链（派生/激活/changelog）                                                                               | `core/ceshu/ceshu_changelog.py`                                                                                                    | `shared/ceshuDiff.ts`                                                                                                                                                                                                                                                                                                              |
| W6        | 校验 + 评分                                                                                            | `ceshu_validation.py`、`ceshu_scorer.py`                                                                                            | `shared/ceshuValidation.ts`、`shared/ceshuScorer.ts`                                                                                                                                                                                                                                                                                |
| W7-W11    | AI 生成本章/补空 + 一键生成 + 系统编辑器完善                                                                        | `core/agent/skills/*`                                                                                                              | `shared/ceshuAi.ts`、`components/AiFullGeneratePanel.tsx`                                                                                                                                                                                                                                                                           |
| W12/W13   | 条目属性列表（attrtable）                                                                                  | `core/attr_system.py`、`core/calc_engine.py`                                                                                        | `shared/attrList.ts`、`components/AttrTableEditor.tsx`                                                                                                                                                                                                                                                                              |
| W14       | role/monster 属性面板（TS 自有 `attrpanel` 类型）                                                            | 同上                                                                                                                                 | `shared/attrPanel.ts`、`components/AttrPanelEditor.tsx`                                                                                                                                                                                                                                                                             |
| W15       | 关系矩阵 + 导出游戏配置                                                                                      | `ui/widgets/attr_system_editor.py`                                                                                                 | `shared/attrSystem.ts`、`main/attr/attrGameConfigExport.ts`                                                                                                                                                                                                                                                                         |
| W16       | 实时预览                                                                                               | `live_preview.py`                                                                                                                  | `shared/attrPreview.ts`、`components/AttrLivePreview.tsx`                                                                                                                                                                                                                                                                           |
| W17       | 装备预览                                                                                               | `equipment_preview.py`                                                                                                             | `shared/equipPreview.ts`、`components/EquipPreviewPanel.tsx`                                                                                                                                                                                                                                                                        |
| W18       | AI 智能审阅（5 维度 + 报告）                                                                                 | `ai_review_dialog.py`                                                                                                              | `shared/ceshuAi.ts`、`components/AiReviewPanel.tsx`                                                                                                                                                                                                                                                                                 |
| W19       | 完备性检查清单（50 项 + 一键修复）                                                                               | `ceshu_checklist.py`、`ceshu_fill.py`                                                                                               | `shared/ceshuChecklist.ts`、`shared/ceshuFill.ts`、`components/ChecklistPanel.tsx`                                                                                                                                                                                                                                                   |
| W20       | 版本对比（章节级 Diff + 报告）                                                                                | `version_diff_dialog.py`                                                                                                           | `shared/ceshuDiff.ts`、`components/VersionDiffPanel.tsx`                                                                                                                                                                                                                                                                            |
| W21       | 章节笔记（独立 JSON CRUD）                                                                                 | `chapter_notes.py`                                                                                                                 | `shared/ceshuNotes.ts`、`main/ceshu/notesStore.ts`、`components/ChapterNotesPanel.tsx`                                                                                                                                                                                                                                               |
| W22       | 属性系统 JSON 导入/导出                                                                                    | `attr_system_editor.py`                                                                                                            | `main/attr/attrSystemJsonFile.ts`                                                                                                                                                                                                                                                                                                  |
| W23       | 字数统计（18 章完成度 + 写作建议 + 面板）                                                                          | `ui/ceshu/word_stats_dialog.py`                                                                                                    | `shared/ceshuWordStats.ts`、`components/WordStatsPanel.tsx`                                                                                                                                                                                                                                                                         |
| W24       | 字段/系统依赖检查（20 条依赖 + 两张依赖图 + 双视图面板）                                                                  | `field_dependencies.py`、`field_dependency_graph.py`、`system_dependency_graph.py`                                                   | `shared/ceshuFieldDeps.ts`（单测 40）、`components/FieldDepsPanel.tsx`、E2E                                                                                                                                                                                                                                                              |
| W25       | Excel 导出（8 Sheet 工作簿，导出格式补满 6 种）                                                                   | `ceshu_excel_exporter.py`                                                                                                          | `main/ceshu/export/excel.ts`（exceljs ^4.4.0；预演见 `spikes/excel-spike.mjs`）                                                                                                                                                                                                                                                          |
| W26       | 版本时间线（横向 SVG 时间线 + 节点详情 + 切换版本；复用 `ceshu:versions`）                                                | `ui/ceshu/version_timeline_dialog.py`                                                                                              | `shared/ceshuTimeline.ts`（单测 12）、`components/VersionTimelinePanel.tsx`、E2E                                                                                                                                                                                                                                                         |
| W27       | 章节模板库第一刀（18 章 34 个内置模板 + 搜索/预览 + 三应用模式 + 回填章节草稿）                                                   | `data/chapter_templates_data.py`、`ui/ceshu/chapter_templates.py`、`ui/ceshu/template_picker_dialog.py`                              | `shared/ceshuTemplateData.ts`（机械转换）、`shared/ceshuTemplates.ts`（单测 14）、`components/TemplatePickerPanel.tsx`、ChapterForm 集成、E2E                                                                                                                                                                                                      |
| W28       | 自定义模板第二刀（分类文件存储 + 另存为模板（章节/全局）+ 来源筛选 + 删除）                                                         | `core/ceshu/custom_template_manager.py`                                                                                            | `shared/ceshuCustomTemplates.ts`（单测 12）、`main/ceshu/templateStore.ts`（单测 6）、IPC `ceshu:templates:*`、选择器内另存/删除 + E2E                                                                                                                                                                                                                |
| W29       | 模板编辑器第三刀（内置+自定义列表/编辑/迁移分类/应用到章节/删除/导出/导入）                                                          | `ui/ceshu/template_editor_dialog.py`                                                                                               | `shared/ceshuCustomTemplates.ts`（+update/export/import 纯逻辑，单测 20）、`templateStore.ts`（+update/exportAll/importFrom，单测 10）、IPC `ceshu:templates:update/export/import` + `dialog:chooseTemplateJsonFile`、`components/TemplateEditorPanel.tsx`、E2E                                                                                     |
| W30       | AI 生成数据表（策划书设定 → 候选 → 人工勾选 → 导入数据表）                                                                | `core/agent/skills/ceshu_skill_generate.py::_ai_generate_data`、`ui/ceshu/ai_data_generate_dialog.py`                               | `shared/ceshuDataGen.ts`（类型/条数/背景/提示词/归一化，单测 14）、IPC `ceshu:aiGenerateData`、`components/AiDataGenPanel.tsx`、E2E（含 **Ollama 桩服务**全链路）                                                                                                                                                                                               |
| W31       | 混合玩法预设市场 + 竞品象限图（18 预设卡片/搜索/一键应用；vision 章散点图）                                                      | `core/ceshu/ceshu_constants.py::HYBRID_GAMEPLAY_PRESETS`、`ui/ceshu/preset_market_dialog.py` 300、`ui/ceshu/competitive_chart.py` 80 | `shared/ceshuPresets.ts`（18 预设逐字搬运 + 搜索 + 应用语义，单测 14）、`shared/ceshuCompetitiveChart.ts`（几何/归一化，单测 12）、IPC `ceshu:applyPreset`（manager 一次写 systems+meta）、`components/PresetMarketPanel.tsx`、`components/CompetitiveChart.tsx`（vision 章内嵌）、E2E（应用落盘 + 散点渲染 2 条）                                                                      |
| W32       | 系统依赖确认 + 数据同步（AI 生成策划书后确认启用系统 / 增删自定义系统 / 写回 systems 章；双向同步注册启用系统的 data_type 类型 + 回填 actual_count） | `system_confirm_dialog.py` 242 + `ceshu_data_sync.py` 248                                                                          | `shared/ceshuSystemConfirm.ts`（字段预览 / 确认结果纯逻辑，单测 10）、`main/ceshu/dataSync.ts`（`CeshuDataSync` 双向同步协调器，单测 11）、IPC `ceshu:confirmSystems` / `ceshu:syncData`、`components/SystemConfirmPanel.tsx`（勾选 / 字段架构预览 / 自定义系统）、E2E `ceshu-system-confirm.spec.ts`（确认落盘 + 双向同步注册类型）                                                            |
| W33       | 迁移工具（v4.0 旧策划书加载时自动迁移到 v5.0：补新 9 章默认值 + 从旧章节派生新章节字段 + 版本升级）                                        | `ceshu_migration.py` 124（原注「111」为口径差异）                                                                                             | `shared/ceshuMigration.ts`（`needsV4Migration` + `migrateV4ToV5` 纯函数，单测 21）、接入 `ceshuModel.normalizeCeshu` 加载路径、E2E `ceshu-migration.spec.ts`（磁盘预置 v4 → 加载验证派生）                                                                                                                                                                     |
| W34       | 策划书首页卡片视图（卡片网格：名称/类型/状态/版本徽章/日期/进度 + 搜索 + 最近打开 + 新建（空白/从已有复制）+ 卡片操作：重命名/复制/派生/删除）                  | `home_view.py` 513 + `home_card.py` 161（原注 452/136 为口径差异）                                                                          | `shared/ceshuHome.ts`（状态标签/卡片视图模型/搜索/最近/复制命名，单测 11）、`CeshuSummary` 增 `gameType`/`status`、`CeshuManager` 增 `rename`/`remove`/`duplicate` + `CeshuStorage.remove`（单测 7）、IPC `ceshu:rename`/`ceshu:delete`/`ceshu:duplicate`、`components/CeshuHomePanel.tsx`、E2E `ceshu-home-cards.spec.ts`                                           |
| **A1-1**  | Agent 技能协议 + 调度器内核（注册表 / 名称解析 / 危险操作确认门 / 结构化错误；数据表读写 + 策划书只读技能）                                   | `core/agent/skill_protocol.py` 107、`dispatcher.py` 585、`security/acl.py` 141、`skills/{game_data,ceshu}_skill.py`                   | `shared/agent/protocol.ts`（协议 + 风险策略 + 参数修正，单测 18）、`main/agent/dispatcher.ts`（注册表 + 模糊解析 + 危险确认门，单测 15）、`main/agent/skills/{gameDataSkill,ceshuSkill}.ts`（单测 13）、IPC `agent:listTools`/`agent:executeTool`、E2E `agent-execute-tool.spec.ts`；**顺带修复 W32 `CeshuDataSync` 用复数键查数据的真 bug**（详见 [`a-tier-plan.md`](./a-tier-plan.md) §6） |
| **A1-2**  | Agent Brain 循环 + 事件流 + LLM 工具调用（step/stream/done/error 事件、tool_calls 协议、危险操作审批点、提示词骨架）             | `core/agent/brain_llm.py` 474、`brain_prompt.py` 294、`brain_subagent.py`（fallback）                                                  | `shared/agent/brain.ts`（事件流 + `runBrainLoop`，注入传输层/工具执行器故可纯单测 19）、`shared/agent/prompts.ts`（骨架）、`main/agent/ollamaTransport.ts`（`/api/chat` NDJSON 流式 + tool_calls）、`main/agent/brainService.ts`（调度器适配）、IPC `agent:chat`、E2E `agent-brain-chat.spec.ts`（**Ollama 桩服务两轮**：工具调用 → 流式终稿）                                              |
| **A1-3**  | Agent 会话与记忆（会话快照持久化：原子写 + 串行队列 + 超长截断；语义记忆检索：vectra 索引 + 确定性嵌入）                                    | `core/agent/brain_session.py` 248、`memory_embedder.py`、`memory_vector.py`                                                          | `shared/agent/session.ts`（快照/截断纯逻辑）、`main/agent/sessionStore.ts`（严格/容错两档读取 + metrics.jsonl）、`shared/agent/memory.ts`（32 维确定性嵌入）、`main/agent/memoryStore.ts`（vectra）；接入 `AgentBrainService`（记忆注入 + 会话落盘 + 问答回写）；单测 22                                                                                                               |
| **A1-4**  | 数字员工面板（对话气泡 + 流式文本 + 折叠步骤 + 任务列表 + 危险操作审批模态 + 会话恢复入口）                                              | `ui/digital_panel_*`（PyQt 面板语义）、`digital_panel_tasks.py`                                                                           | `shared/agent/panel.ts`（事件流 → 面板视图模型纯归约，单测 13）、`main/agent/approvalBroker.ts`（审批中转，单测 6）、`components/digital/DigitalPanel.tsx`、App 第三模式 `mode-digital`、IPC `agent:approvalResponse`+`agent:sessionInfo/Restore/Clear`+`agent:event` 推送、E2E `agent-digital-panel.spec.ts`（4 例）                                                      |
| **A1-5**  | 业务技能接线 + 托盘/热键（`system.code` 沙箱技能 / 策划书写操作 / Tray + 全局热键）                                          | `skills/code_skill.py`、`skills/ceshu_skill.py`、`ui/digital_employee.py`（常驻入口）                                                      | `main/agent/skills/codeSkill.ts`（QuickJS 沙箱，**SYSTEM 级**，单测 9）、`ceshuSkill` 补 `create`/`update`（单测 3）、`main/tray.ts`（Tray + `Ctrl+Shift+M`，防御式）；**补齐审批端到端拦截 E2E**（拒绝→不执行 / 批准→真执行）                                                                                                                                                 |
| **A1-4b** | 三类确认补齐（**参数澄清** + **删除确认**）：统一 `SkillResult.interaction` 交互通道                                      | `skills/ask_user_skill.py`（阻塞式提问）、`game_data_skill.py:414`（`needs_confirm`，**Python 无消费者=死路**）                                     | `system.game_data.delete`（confirm 交互 → 批准后 `confirm:true` 重执行）+ `tool.ask_user`（question 交互 → 答复回灌）；面板交互模态 + `agent:interactionResponse`；单测 +17、E2E +2                                                                                                                                                                             |

| **E1** | **引擎代码导出（全量数据 → Lua 数据模块）** | ✅ 完成（`b7a2b9f`，D 档首刀）。团队交付：PM 定范围（`docs/prd/engine-export-prd.md`）→ 工程师实现 → QA 独立验证（路由 **NoOne**）。新增 `src/main/engineExport/{luaLiteral,lua,exporter}.ts` + IPC `engine:exportData`；单测 11 + 对抗性 13 + 集成 2；**未碰** `main/library`/数据增删改/既有导出管道。**E2 ✅ 渲染层入口已补**（数据视图工具条「导出引擎代码（Lua）」+ `dialog:chooseEngineExportFile` 保存对话框 + `EngineExportButton` 独立状态组件；用户取消静默返回）。**遗留**：产物未经真实 Lua 解析器校验（本机无 lua/luac）；原生保存对话框 + 按钮点击属 Electron-only，本沙箱无法验证 |

## 2. 剩余工作清单（按体量分档）

> ### ⚠️ 先看这个：真实剩余量已被**文件级审计**确定（2026-10-04）
>
> **审计单一事实源：[`migration-audit.md`](./migration-audit.md)**（299 行逐文件明细 + 依据 + 对账）。
>
> | 判定 | 文件 | 行数 | 占比 |
> |---|---|---|---|
> | ✅ 已迁 | 95 | 35,125 | 38.5% |
> | ◐ 部分已迁 | 59 | 22,489 | 24.7% |
> | ⛔ 有意不迁（决策，非欠债） | 92 | 19,858 | 21.8% |
> | ⚠️ **未迁（整块没做）** | **53** | **13,692** | **15.0%** |
>
> 对账 PASS：`95+59+92+53 = 299` 文件、`35125+22489+19858+13692 = 91,164` 行。
>
> **结论：真实剩余 ≈ 2.4–2.8 万行（26–31%）** —— 而不是早前口头估算的「3.5–4.5k 行（4–5%）」。那句估算**口径过窄**（把 `ui/widgets`/`ui/dialogs`/`features` 三个混合态域当成了基本迁完）且未做文件级核实，**已被本审计推翻**。
> 三个最意外的数字：**① `core/agent`（最大域 24,670 行）只有 1,689 行是完整已迁**（A 档做的是核心闭环，不是整个 Agent 引擎）；**② `ui/` 顶层+主题 9,883 行里仅 917 行完整已迁**；**③ `features` 9 文件完整已迁为 0**。
> **本审计同时纠正了 3 条错误的「已迁」映射线索**（`ui/dialogs/template_manager.py`、`statistics.py`、`data_diff_dialog.py` 都不是策划书那套的同名对应物，实为未迁），并查明 `common/` 不可整体按「用不到」处理（`logger.py` 被引用 **142 处**、`event_bus.py` 18 处等，属未迁而非设计不迁）。

### A 档（大块，需单独立项）—— **已立项，方案见 [`a-tier-plan.md`](./a-tier-plan.md)**

> 立项调研结论（3 子代理并行盘点）：**不需要 1:1 复刻 21,669 行**。按迁移价值三分——必修核心契约 ≈6–8k 行（技能协议/调度/LLM 循环/SafetyGuard/会话持久化）、重设计 ≈7–8k 行（执行沙箱→quickjs、向量→vectra、MCP、诊断自愈 4.5k 降级）、**砍掉 ≈3–4k 行**（`code_sandbox.py` 202 行死代码重复、`llm_healer` 名不符实 148 行、`digital_panel_state.py` 类型桩 222 行、PyQt 内省/QSS 胶水 ≈700 行、库管理 schema 自动升级与整库导入占 manager 近半）。关键发现：**没有任何 `exec/eval` 执行 LLM 生成代码**；Python 沙箱实为 `subprocess` + 可绕的正则黑名单（`security/sandbox.py:36/166`）；自愈改码会无原子回滚地改写源文件（`tool_repair.py:786-792`），**TS 侧明确不做**。

1. **AI/Agent 引擎**（≈27,500 行，占全域 35%）：`core/agent/` 97 文件 / 21,669 行 + `ui/digital_panel_*`(+`digital_employee`/`chat_renderer`/`ai_bridge` ≈2,834 行) + `src/features/` 2,827 行（经查**与 core/agent 零耦合**，是旧 AI 通道与导出/统计等杂项，按各自域迁）。**已预演**：quickjs-emscripten 沙箱、ollama 客户端、vectra 向量库（`main/security/jsSandbox.ts`、`main/llm/client.ts`）。**分期**：A1-1 技能协议+调度器 → A1-2 Brain 循环+事件流 → A1-3 会话与记忆 → A1-4 数字员工面板 → A1-5 业务技能接线+托盘/热键。
2. **库管理（多库）**（≈1,600 行）：`core/library_manager.py` 626 + `ui/widgets/library_bar` 356 + `ui/library_controller.py` 39 + `ui/ceshu_controller.py` 337 + `ui/data_tab.py` 库联动。**影响**：数据层与策划书/笔记/模板/属性/schema 归属路径需按库隔离（当前为 `userData` 单库直存，**6 处 store 前缀 + 库注册表 + `library:changed` 广播**即可，不涉业务重写）。**分期**：A2-1 库服务与路径迁移 → A2-2 库条 UI 与切换联动。

### B 档（可独立成刀）

| 备选切片                 | Python 参照（行数）                                                                                                                     | 备注                                                                                                                                                                                                                           |
| -------------------- | --------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~字数统计~~             | `ui/ceshu/word_stats_dialog.py` 237                                                                                               | ✅ W23 已完成（备注：该文件自带基准表，与 `ceshu_scorer.py` 的表数值不同，未复用）                                                                                                                                                                        |
| ~~Excel 导出（补满 6 种）~~ | `core/ceshu/ceshu_excel_exporter.py` 326                                                                                          | ✅ W25 已完成（8 Sheet：概览/系统配置/数值表/角色/里程碑/风险/竞品/校验报告）                                                                                                                                                                             |
| 依赖图（字段/系统）           | `core/ceshu/field_dependencies.py` 233 + `ui/ceshu/field_dependency_graph.py` 403 + `system_dependency_graph.py` 307              | 纯逻辑（可用性/触发规则）+ 图渲染                                                                                                                                                                                                           |
| ~~版本时间线~~            | `ui/ceshu/version_timeline_dialog.py` 405                                                                                         | ✅ W26 已完成（`shared/ceshuTimeline.ts` 布局/文案纯逻辑 + `VersionTimelinePanel` SVG 时间线 + E2E；`CeshuSummary` 增 `versionNote`）                                                                                                          |
| ~~自定义模板~~            | `custom_template_manager.py` 380 + `template_editor_dialog.py` 514 + `template_picker_dialog.py` 439 + `chapter_templates.py` 133 | ✅ 三刀全部完成（W27 内置模板库 / W28 自定义存储与选择器 / W29 模板编辑器）。**有意未移植**：`count_all`/`count_by_chapter`（UI 端按已加载列表计数即可，避免死代码）；`import_templates` 的 `overwrite` 已在 W29 以「覆盖同 ID」开关暴露                                                         |
| ~~AI 生成数据表~~         | `ui/ceshu/ai_data_generate_dialog.py` 305 + `ceshu_skill_generate.py::_ai_generate_data` 152                                      | ✅ W30 已完成（提示词逐句匹平；候选项 `id` 剥离后由数据层生成；E2E 用 Ollama 桩服务打通「生成→勾选→导入」）                                                                                                                                                           |
| ~~预设市场 / 竞品图表~~      | `preset_market_dialog.py` 300 + `competitive_chart.py` 80                                                                         | ✅ W31 已完成（`shared/ceshuPresets.ts` + `shared/ceshuCompetitiveChart.ts` 纯逻辑；IPC `ceshu:applyPreset` 一次写 systems+meta；`PresetMarketPanel` 卡片/搜索/确认框；`CompetitiveChart` 内嵌 vision 章）                                            |
| ~~系统依赖确认 / 数据同步~~    | `system_confirm_dialog.py` 242 + `ceshu_data_sync.py` 248                                                                         | ✅ W32 已完成（`shared/ceshuSystemConfirm.ts` + `main/ceshu/dataSync.ts` + IPC `ceshu:confirmSystems`/`ceshu:syncData` + `SystemConfirmPanel`；E2E 已写，本沙箱 Electron 启动受限未跑，与既有 E2E 同源受限）                                            |
| ~~首页/卡片~~            | `home_view.py` 513 + `home_card.py` 161                                                                                           | ✅ W34 已完成——**B 档至此全部收官**。`shared/ceshuHome.ts` + `CeshuHomePanel` + IPC 3 通道；E2E 已写，本沙箱 Electron 启动受限未跑。有意未移植：PyQt 右键 `QMenu`（改为卡片内联按钮）、「从模板新建」（Python `CeshuTemplate` 是整文档模板，TS 模板为章节级，非同一概念）、首页 AI 入口卡（TS AI 一键生成已在编辑器内可达） |
| ~~迁移工具~~             | `ceshu_migration.py` 124                                                                                                          | ✅ W33 已完成。**勘误**：该文件实为 **v4.0→v5.0 策划书数据迁移**（9→18 章派生），原描述「旧版库迁移」有误（「旧版库」是 `library_manager.migrate_legacy_library` 的另一件事）。E2E 已写，本沙箱 Electron 启动受限未跑                                                                        |

### C 档（骨架/外围）

菜单与快捷键（`menus.py` 172 / `shortcuts_dialog.py` 93）、`tab_manager.py` 215、`window_state.py` 129、主题与特效（≈1,000）、设置面板、i18n、`src/security` 840（部分已由 `jsSandbox` 覆盖）、`src/common` 5,374 中尚未用到的工具。

### D 档（属性/数值域剩余）

`core/extended_formulas.py` **456 行 —— 实证死代码，已列「有意不迁」**（见 E4）、`core/game_templates.py` **326 行 —— 实证死代码**（仅 `core/__init__.py` re-export）、`core/editor_layout.py` **208 行 —— 实证「能写、没人读、且已过期」的配置，已列「有意不迁」**（见 E5）、`core/style_manager.py` **289 行（活的，被 dynamic_form 用）**、`core/cedict.py` **72 行 —— 评估后「有意不迁」**（见 E6：实测会产出垃圾 ID、且该层几乎必然空转）、引擎代码导出（`ui/dialogs/engine_export.py` Unity/Unreal/Cocos）。**已交付**：`operation_log.py`（会话级回滚，E3）、`ui/widgets/formula_builder.py` 486（系数公式编辑器，E4）、`ui/widgets/dynamic_form.py::FIELD_GROUPS`（条目编辑器分区，E5）、`ui/dialogs/type_editor_field_widget.py` 的字段 ID 生成（E6）。

> ✅ **D 档「引擎代码导出」已交付首刀（见 §1 台账 E1，提交 `b7a2b9f`）**：只做 **Lua**，且只做「全量数据 → 单个 Lua 数据模块」。  
> **与 Python 参考版的有意偏离**：Python 支持 Unity/Unreal/Godot/Cocos 骨架，**反而没有 Lua**——本刀补的是它缺的那条主路径，其余引擎按 P1/P2 待排。  
> **已补 E2**：渲染层 UI 入口（数据视图工具条按钮 + 原生保存对话框）已就绪，界面上可点了。  
> **未做**：Godot/Cocos、Unity/Unreal 数据填充；产物未经真实 Lua 解析器校验（本机无 `lua`/`luac`）；保存对话框与按钮点击属 Electron-only，本沙箱无法验证。  
> D 档**仍活着的**剩余项：`style_manager.py` 289（游戏风格术语替换）。**已判死代码/不迁**：`extended_formulas` 456、`game_templates` 326、`editor_layout` 208、`cedict` 72（详见 E4/E5/E6）。C 档（菜单快捷键/窗口状态/主题/设置/i18n）仍待排。

> ✅ **D 档「会话级回滚」（`core/operation_log.py` 154 行）已完整交付**：**E3-1** 核心（`8ff0b0d`：`buildRollbackPlan` 纯函数 + 内存环形日志 5000/批清 500 + `executeRollbackPlan` 单步失败不中断，单测 11）+ **E3-2** 接线（`7478c43`：`operationRecorder` 包在 runner 上记录 + `tool.rollback_ai_changes` 技能复用 confirm 交互，单测 15）。
> **语义澄清（勿按名字臆测）**：这不是通用撤销，而是 **AI 会话级安全网**——Python 原实现只记 AI 会话内的数据变更（`if not conv_id: return`），不记手动编辑。
> **回滚范围 = 单次对话轮次**（一次 `chat()` 内的全部数据变更），**有意取最小爆炸半径**；跨轮次会话级回滚需会话 id 持久化，**未做**。
> **宁缺勿错**：只记成功操作；update/delete 的 before 定位不到或同名歧义 → `before=null` → 归入 `skipped` 并给中文原因，**绝不伪造快照**（伪造会在回滚时写坏用户数据）。**未验证**：Electron 内端到端「说一句撤销 → 真的回滚」链路（E2E 沙箱不可用）。

> ✅ **E4（2026-10-04）：系数公式编辑器 —— `ui/widgets/formula_builder.py` 486 行，提交 `3988b92`**。
> **本轮先做了调研纠偏，结论与排期相反，必须记下来**：
> - `core/extended_formulas.py`（台账原记「390 行」，实测 **456 行**）**是死代码**：全仓 `grep ExtendedFormula|FormulaType.` 仅命中 `core/__init__.py` 的 re-export，**UI 上不可达、无任何消费者** → 从「待迁」改列 **「有意不迁」**（与 `diagnostics`/`tool_repair` 同类，是决策不是欠债）。**不 1:1 复刻、不造第二套公式系统**。
> - 真正有缺口的是 `formula_builder.py`（**活代码**：`attribute_panel.py:498`、`dynamic_form.py:481` 都在调），且 TS 侧 `AttrPanelEditor.tsx` 原本就显式记录了「明确推迟：公式构建器对话框」→ 本轮补它。
> - **四个 Python 缺陷（均为 offscreen 实跑取证，非阅读推断）**：
>   **A.** 打开编辑器**不回填** `current_formula`（`__init__` 只赋值、从不解析）→ 实测传 `=智力*5` 时对话框显示 `=力量*2+敏捷*1`，**点确定即覆盖用户原公式**（调用方确实传了该参数，属真数据丢失风险）。
>   **B1.** 调用方传入的 `available_attrs` **从未被使用** → 实测传 5 个属性（含「幸运」）时表格恒显示硬编码四项。
>   **B2.** 生成/返回公式时迭代**类常量** `BASE_ATTRS` 而非实例列表 `base_attrs` → 实测「幸运」系数设 7 后 `get_formula()` 仍返回 `=力量*2+敏捷*1`（**新增属性系数被静默丢弃**）。
>   **C.** `_refresh_coeff_table` 的 `clear()` 连带清掉表头 → 实测刷新后 `horizontalHeaderItem(0/1)` 均为 `None`（此项 TS 无对应物，因 React 重渲染天然不会丢表头）。
> - **交付**：`shared/formulaBuilder.ts`（系数 ⇄ legacy 公式字符串纯逻辑：`buildFormulaFromCoeffs` 按传入 entries 顺序输出修 B2；`parseFormulaToCoeffs` 只接受可**无损表示**的线性式、其余明确拒绝并给中文原因；`initialEntries` 回填修 A、不可回填时归零+警告原文；`resolveBuilderAttrs` 以调用方列表为权威修 B1）+ `components/AttrFormulaBuilder.tsx`（内联展开：渲染层无模态约定，沿用 `.attr-panel-error` 的 `flex-basis:100%` 先例）+ 每行公式框旁 `ƒx` 入口 + 单测 23 + E2E 2 例。
> - **有意不迁**：Python「＋添加属性」按钮（属性集合应由面板行提供＝单一真源；在编辑器里凭空造属性名，产物必被求值器判「未定义的属性名」，是陷阱非功能）、`desc_label`（死 UI，建了空 QLabel 从未 `setText`）、4 个只定义未使用的样式常量。
> - **一个已实证并写进模块文档的行为**：重建后**项顺序按属性列表归一**，不保留原文书写顺序（Python 同此：实跑 HP → `=力量*10+敏捷*5+体质*20`）。数值等价，但**不保证逐字一致**。
> - **未验证**：Electron 内的点击链路（E2E 沙箱不可用；`playwright --list` 已确认新 E2E 被收集，非静默排除）。
> - **本轮自纠**：3 个单测首跑失败，根因是**我的期望写错**（照默认系数 dict 顺序而非属性列表顺序），代码本身与 Python 一致；已用 Python 实跑取证后修正期望并把该实证串锁进测试。

> ✅ **E5（2026-10-04）：条目编辑器分区布局 —— `ui/widgets/dynamic_form.py` 的 `FIELD_GROUPS` 迁移，提交 `dbfe391`**。
> **本轮又把一个排期项判为「不该做」，结论与台账相反**：
> - 台账列的是 `core/editor_layout.py`（原记 177 行，实测 **208 行**）。它**不该 1:1 迁**，因为它是一套**「能写、没人读、且已经过期」**的配置，三项实证：
>   ① `dynamic_form.py:262` 用的是**硬编码常量** `FIELD_GROUPS`，而 `FIELD_GROUPS = {` 是该名字**唯一**的赋值处（`grep` 全命中即此），**从不读 JSON**；
>   ② `data/editor_layouts.json` 只被 `EditorLayout` 读写，其消费者只有布局编辑器 `type_editor_layout_widget.py` 与 Agent 技能 `editor_layout_skill.py`——**条目编辑器从不读它**；
>   ③ 两者**已漂移**（AST 实测对比）：`FIELD_GROUPS` 的 `skill`/`equip`/`item` 有「关联 Buff」分区、`job` 有「属性列表」分区，**JSON 都没有**；`role`/`monster`「技能 & 天赋」字段数 **3 vs 2**；`STAT_HINTS` 亦不一致。
>   → 按权威（用户在界面上真正看到的）`FIELD_GROUPS` 迁移；JSON + 布局编辑器 + Agent 技能整套列 **「有意不迁」**。
> - 顺带实证 **`STAT_HINTS` + `_create_stat_hint`/`_update_stat_hints` 是死代码**：`_create_stat_hint()` **只在 `layout == 'grid'` 分支**被调用，而有 grid 分区的类型是 `{job, skill, talent, equip, item}`，`STAT_HINTS` 的键却是 `{role, monster}`——**交集为 ∅**，提示标签永不会被创建，`_update_stat_hints()` 必然早退。→ 不迁。
> - **有意不迁 `style_manager` 术语替换**（`_styled_label`）：它是独立的 D 档项（289 行），且唯一触发是 `ceshu_controller.py` 加载策划书时设置**全局单例**活跃风格——TS 刻意无全局可变态。默认无活跃风格时 Python 亦原样返回 label（`resolve_label`：`if not sid: return label`），故**默认行为等价**。
> **交付**：`shared/formSections.ts`（`FORM_GROUPS` 照抄：7 类型 / 124 个字段名 + `STAT_LABELS` 8 条 + `buildFormLayout` 纯函数）+ `components/FormSectionCard.tsx`（图标+标题+受控折叠）+ `ItemForm.tsx` 改为按分区渲染 + 单测 18 + E2E 2 例。
> **对 Python 的两处有意修正**：① Python 的 `attribute_panel` 分区不把字段计入 `grouped_fields`，而 `role`/`monster` schema 里又有 `attr_list` → 它会再走兜底**重复渲染**（同一数据两个控件、保存互相覆盖）；TS 绑定到 `attrpanel` 字段并只渲染一次。② 渲染不出内容的分区不产出（Python 会留一张空折叠卡片）。
> **schema 差异（本刀不修，留下确切清单）**：`FIELD_GROUPS` 引用的字段名有 **6 个在 TS schema 中不存在** —— `monster.generic_drops`、`talent` 的 `multiplier`/`cd`/`damage_type`/`consume`/`effect`。故 `talent` 的「数值配置」在 TS 下只剩 `value`，其 5 个字段（`owner`/`level`/`rarity`/`effect_type`/`unlock_condition`）走兜底平铺，**一个都没丢**。属 schema 平移差异，需单独核对。
> **不变式测试**：12 个内置类型「分区字段 + 未归组字段**恰好覆盖每个字段一次**（无遗漏、无重复）」——可捕获未来的 schema 改名与重复渲染。
> **未验证**：Electron 内点击链路（E2E 沙箱不可用；`playwright --list` 已确认新 E2E 被收集）。**已核对既有 E2E 引用的 `field-*` 无一位于默认折叠分区**，不会破坏既有用例。
> - **本轮自纠**：1 个单测首跑失败，同样是**我的期望写错**（`desc` 属「描述 & 图片」而非「基础信息」），代码正确。

> ✅ **E6（2026-10-04）：字段 ID 生成（中文显示名 → 英文字段 ID），提交 `e59ba0e`**。
> **先实跑取证，炸出两个真缺陷**（用 offscreen 起真控件跑 `FieldEditorWidget._translate_game_terms`，非阅读推断）：
>
> | 输入 | Python 实测输出 | TS 现产出 |
> |---|---|---|
> | `HP上限` | `h_p_max` | `hp_max` |
> | `HP` | `h_p` | `hp` |
> | `hp_max`（**本身已是合法 ID**） | `h_p_m_a_x` | `hp_max` |
> | `ATK加成` | `a_t_k_canada_surname` | `atk_bonus` |
> | `斗能`（**Python 文档自己举的示例词**） | `abbr_surname` | 明确报「未收录」 |
> | `物防` | `protect` | 明确报「未收录」 |
>
> 1. **ASCII 被逐字打碎**：Python 的 ASCII 分支每读一个字符就 `append`，最后用 `_` 拼接 → `HP` → `h_p`，连本就合法的 `hp_max` 都被打成 `h_p_m_a_x`。TS 把**连续字母数字累积为一个 token**。
> 2. **未收录的中文交给词典 → 产出垃圾**：`斗能 → abbr_surname`。TS **不接词典**，未收录段落记入 `skipped` 并如实提示，**绝不产出看起来像答案的垃圾**。
>
> **决策：CEDICT 词典不迁（`cedict.py` 72 行）**，实证支撑：压缩包实测 **3.8MB**（`Content-Length: 3978521`；`11MB` 是解压后 `data/cedict.txt`）、Python **在 UI 线程同步下载**（首次阻塞最多 30s）、失败静默吞掉；实测前缀 1555 行只保留「简体 + 首个释义」，**丢弃 717 个额外释义与 4954 个拼音音节**；它能答的通用词已被 143 条术语表覆盖，唯一会落到它的自造词它又查不到 → **该层几乎必然空转**。
> **决策纠正：不加 Lua 保留字黑名单**（原计划有）。查证后判为不需要：导出器 `main/engineExport/luaLiteral.ts::toLuaKey` 对保留字已自动降级为 `["key"]`，JS 侧字段名只作对象键，两处都安全；新加一张黑名单既与导出器不一致，又会误伤 `class`/`level`/`order` 这类常用游戏字段名。
> **术语表口径**：Python `GAME_TERMS_CN` 实测 **143 条**（此前台账所说的「63 条」是错的——那是在数行数）。用 **AST 提取**生成 `shared/glossaryTerms.ts`（沿用本项目 `sample_data.py` 的「零转写误差」先例，可随 Python 侧更新重新生成，脚本 `scripts/extract_glossary.py`）。
> **补充术语只有一条**：`加成 → bonus`，依据是**代码库自身**的 `hp_bonus`/`mp_bonus`/`atk_bonus`/`def_bonus`（`typeSchema.ts:62-65`）。
> **已知缺口（故意不补）**：`物防`/`物攻`/`魔防` 未收录 → 如实报「未收录」。补的前提是**先定命名**（`phys_def`? `pdef`?），代码库无先例，凭空补就是发明。
> **交付**：`shared/fieldId.ts`（`suggestFieldIds`/`validateFieldId`/`uniquifyFieldId`）+ `TypeEditorPanel` 字段名旁「生成」按钮 + 行内候选条 + 单测 21 + E2E 1。（UI 把候选面板放在**行内末位 + `flex-basis:100%`** 独占一行，沿用既有先例。）
> **未做（明示）**：① ~~AI 候选~~ → **已由 E7 补齐**；② **拼音兜底**——需新增依赖 `pinyin-pro`（npm 已验证可达 3.29.4），未做期间未收录词一律走「如实提示」。
> **未验证**：Electron 内点击链路（E2E 沙箱不可用；`playwright --list` 已确认新 E2E 被收集）。
> ⚠️ **事故记录**：`e59ba0e` 提交时误将**被静默回退的旧版** `ts-migration-roadmap.md` 一并提交，导致 E5 台账与 D 档更新被删。已从 `5737477` 恢复并核实（`grep -c` 为 2）；代码文件经核查未受影响。

> ✅ **E7（2026-10-04）：字段 ID 的 AI 候选（E6 遗留项补齐），提交 `ff08fc3`**。
> **补的是 E6 那个真空缺**：规则层只覆盖术语表内与标签里已有的英文，而真正落到第二级的恰恰是**自造词**（如「斗能」）——Python 拿 CEDICT 处理它得到 `abbr_surname` 这种垃圾，AI 能给 `combat_energy`。
> **架构：沿用既有先例，不新开通路**。「UI 触发式 AI 生成」本项目已有**三处先例**（`main/ipc.ts:370/382/407` 的 ceshu AI 三通道），照同一形状做：**提示词构建（纯函数）→ main 侧 `llmClient.generate` → 响应解析（纯函数）**。
> 关于 A1-5b 那条「技能内调 LLM 会形成第二条通路，应由 Brain 单通路负责」：它针对的是 **Agent 技能绕过 Brain**；本处是**用户显式点击**触发的辅助生成，与 W30「AI 生成数据表」同性质，故不冲突。
> **交付**：`shared/fieldIdAi.ts`（`buildFieldIdPrompt`：中文提示词，含显示名 / 已有字段名 / 命名规范「语义优先、不要用拼音」/ 候选数 / 输出格式示例；`parseFieldIdCandidates`：复用 `ceshuAi.parseLlmJson` 的容错——markdown 围栏、前后多余文字、尾逗号、换键名、裸数组兜底）+ IPC `schema:suggestFieldIds` 五处接线 + 候选条新增「AI 候选」按钮（**未点选前不写入**，加载中/错误态可见）+ 候选按钮加 `data-source` 以区分规则候选与 AI 候选。
> **铁律**：AI **只提案**；候选一律过 `validateFieldId`，不合法的一律丢弃而非"修一修凑合用" —— 与规则层同理，**绝不产出垃圾**。
> **重名分两种（处理不同）**：与**既有字段名**冲突 → 加后缀（AI 可能没看到全部已有字段名，直接丢太浪费）；与**本次响应里前面的候选**重复 → **丢弃**（换个说法还是同一个词，不该变成 `_2`）。
> **单测首跑暴露并修掉我自己的两个实现 bug**（这次不是测试期望写错）：① `String(非字符串项)` 会把 `{"x":1}` 变成 `'[object Object]'` → 产出 `object_object` 垃圾，改为只接受字符串；② 同一响应内的重复候选被误加 `_2` 后缀，改为重复即丢。
> **测试**：单测 15 + E2E 2（桩服务：未收录 → AI 候选出现 → **点选才写入** + 断言发出去的提示词内容；离线：中文错误提示、不静默失败）。**未验证**：Electron 内点击链路（E2E 沙箱不可用；`playwright --list` 已确认 2 条新 E2E 被收集）。
> **E6/E7 之后，D 档「中文字段名 → 英文 ID」这条线只剩可选的一步**：拼音兜底（`pinyin-pro` 依赖）。

> ✅ **E8（2026-10-04）：TS 文件日志（迁移 `common/logger.py`，Python 侧被 142 处引用），提交 `d0b923e`**。
> **为什么做**：审计里 `common/logger.py` 被引用 **142 处**，但 TS 侧当时只有 `console.*`，无落盘日志 —— 排障基础设施缺位。
> **范围（刻意克制，防过度开发）**：① 主进程轮转文件日志（`main/logger.ts`，10MB×5 备份，对齐 Python RotatingFileHandler）；② 统一入口 `shared/logger.ts`（渲染层经 `app:log` IPC 转发到主进程写文件，绝不渲染层直写）；③ 接线 `initLogger`（启动即落盘到 `userData/logs`）。
> **明确不做**：Python 版的「环形缓冲供 LLM 注入上下文」在 TS 侧**当前无消费者**（agent/brain 上下文来自 memory 不来自日志），按「无消费者不预建」原则暂不实现；待 LLM 上下文注入需求出现再补 `app:recentLogs` + 环形缓冲。
> **验证**：单测 12（`formatLogLine` 对齐 Python Formatter / `needsRotate` / `rotateLogFile` 轮转语义 / `initLogger` 写文件与超限轮转 / 渲染层转发与桥接异常降级）+ eslint/双端 tsc/build 全绿 + 全量 vitest 70 文件/756 用例。

> ✅ **E9（2026-10-04）：Agent 偏好/反馈（迁移 `core/agent/learner.py` 的偏好/反馈子集），提交 `e273254`**。
> **为什么做**：`core/agent` 是最大域（24,670 行，34 文件整块未迁），其中 `learner.py`（543 行）是**唯一小而自成闭环**的一刀 —— 它的偏好/反馈能直接接进**已存在**的消费点 `buildSystemPrompts({ extraBlocks })`，不必先迁 Brain 大块。
> **范围（刻意克制，防过度开发）**：① `shared/agent/personalization.ts` —— `extractPreferences`（关键词→偏好键值，纯函数）+ `buildPersonalizedContext`（拼提示词片段；**键排序**保证输出与输入顺序无关）；② `main/agent/preferenceStore.ts` —— `PreferenceStore`/`FeedbackStore`（JSON 落盘，**随库隔离**在 `<库>/agent`）；③ `brainService.ts` 每次 `chat()` 实时读偏好并注入；④ `agent:feedback` IPC 五处接线。
> **明确不做**：Python 的动作计数/转移矩阵、下一步建议、时间峰值预测、技能模板自动生成 —— 依赖 TS 没有的 `Intent`/`BrainState`，属过度设计，**有意不迁**（写在审计「◐部分已迁」的缺口里）。冷启动偏好为空（与 Python Learner 一致），**不伪造**初始偏好。
> **诚实说明（避免自欺）**：`agent:feedback` 目前**无 UI 调用方**（渲染层现只调 `agent:chat`）。之所以仍接：它是偏好库**唯一的写入路径**，缺了它偏好库恒为空、`brainService` 的消费链就永远不生效 —— 它属于「让已有消费者真正可产出」的生产者接缝，不是凭空预建。**UI 评分入口属后续步骤**。
> **验证**：单测 22（extractPreferences 命中/大小写/未命中不发明 + buildPersonalizedContext 空/单/多/顺序无关 + PreferenceStore 读写落盘/损坏文件兜底 + FeedbackStore 高评分提炼/负评不提炼/空评论不提炼/重建恢复）+ eslint/双端 tsc 全绿 + 全量 vitest 71 文件/778 用例。

> ✅ **E10（2026-10-04）：快速创建向导（迁移 `ui/dialogs/quick_create.py`，543 行），提交 `a744b27`**。
> **为什么做**：审计 #3 批（`ui/dialogs` 未迁 7 件 ≈1,930 行）里**体量最大且日常可达**的一件 —— 用户每建一条数据都可能用到。
> **交付**：`shared/quickCreate.ts`（`TEMPLATE_DEFS` 12 类型 / 61 模板 + `DATA_TYPE_LABELS` + `filterQuickCreateTypes`）+ `QuickCreatePanel.tsx`（类型下拉 → 卡片网格 → 初始值预览 → 创建）+ 工具栏「快速创建」入口（与批量操作/引用互斥）。
> **刻意修正的两处 Python 问题（不是漏迁）**：① `_on_create` 里 `plural = get_type_schema(); data_type + "s"` 是**死代码**（拼接结果被丢弃、后续 `for...break` 也无效），不复制；② Python 类型下拉取自 schema，但 TS `DataService.createItem` **不校验 type** —— 若直接列静态 12 类型会造出**无类型定义的孤儿条目**，故新增 `filterQuickCreateTypes` 与 schema 求交（默认 schema 恰含 12 类型，视觉无差异，**换 schema 后才显出差别**）。
> **不开新 IPC**：模板是静态常量（渲染层直引 `shared/*`，同 `ceshuConstants`）；落库复用既有 `data:createItem`，id 由主进程 `randomUUID()` 生成（对应 Python `generate_id`）。
> **验证**：单测 12（12 类型 / 61 模板 / 每个带 name+desc+非空 defaults / 值皆字符串 / 键为单数 / 同类型无重名 + 求交过滤）+ E2E 1（**未实跑**，Electron 沙箱不可用；已用 `playwright test --list` 确认被收集）+ eslint/双端 tsc/build 全绿 + 全量 vitest 72 文件/790 用例。

> ✅ **E11（2026-10-04）：数据统计与平衡性分析（迁移 `ui/dialogs/statistics.py`，374 行），提交 `2f77c32`**。
> **为什么做**：审计 #3 批第 2 件。统计是「看全局」的入口，且能验证前面几刀造的数据。
> **交付**：`shared/dataStats.ts`（`mean` / **样本**标准差对齐 `statistics.stdev` / 平衡性判定阈值 0.3 / 按类型计数与占比 / `summarizeNumeric`）+ `StatisticsPanel.tsx`（概览柱条 + 平衡性分析）+ IPC `data:listAll`（跨类型全量，避免逐类型 N 次往返）。
> **关键接地结论（直译会变死代码，故改设计）**：Python `_analyze_roles`/`_analyze_monsters` 读扁平字段 `hp`/`atk`/`def`，但 TS schema 里 **`role` 与 `monster` 根本没有这些字段** —— 属性存在 `attr_list`（`attrpanel`）。硬编码字段名会让这两块永远只输出「总数 N」。故改为**按 schema 的 `spinbox` 字段自动发现**（skill→value/cd，monster→level，job→4 个加成%；**role 无数值字段，因此不出现在分析列表**），换 schema 也成立。
> **明确不迁**：Python 的「📈 图表」标签页是 **matplotlib 占位符**（只输出「需要 matplotlib」+ ASCII 柱条），不复制，改用 CSS 柱条真实渲染分布。
> **判定为 ◐ 而非 ✅**：上面两条缺失是真实的（角色/怪物的 hp/atk/def 分析、图表页），故计入「◐部分已迁」，不自封完成。
> **验证**：单测 15（均值/样本标准差 n-1 与总体区分 / 阈值边界 3 与 10 / 均值≤0 不谎报良好 / 孤儿条目不计入类型列但计入总量 / 字符串数字识别与脏数据跳过 / 全脏数据返回 null）+ E2E 1（**未实跑**，已确认被收集）+ eslint/双端 tsc/build 全绿 + 全量 vitest 73 文件/805 用例。

> ✅ **E12（2026-10-04）：自定义字段模板（迁移 `ui/dialogs/template_manager.py` 的模板存取，411 行），提交 `cf5cd51`**。
> **先做的判定（避免重复造）**：`template_manager.py` 的**字段编辑**部分（增/删/上移/下移 + 名称·标签·类型·可编辑·可选值·数值范围）**早已由 `TypeEditorPanel` 覆盖** —— 本刀**不重做第二套**，也不把它重复计入「已迁」。真正缺的只有**模板存取**。
> **Python 的模板语义是残废的（实证）**：`save_current_as_template` 只写 `fields[type][field.name] = field.label`；`apply_template`（`settings.py:780-786`）**只覆盖 label** —— 字段类型/可选值/数值范围/可编辑**全部丢失**。故**刻意不复制**：TS 改存**完整 `TypeFieldDef[]`**，应用即整体还原（比 Python 强）。
> **交付**：`main/schema/fieldTemplateStore.ts`（单文件 `<库>/field_templates.json` 键名即模板名，**天然免疫路径分隔**；原子写 tmp+rename，与 `TypeSchemaStore` 同构；校验名称/非空/字段类型/重名）+ 4 条 IPC + `TypeEditorPanel` 内置/自定义模板同下拉（optgroup 分组，内置不可删）。
> **验证**：单测 16（存完整定义而非只标签 / 落盘重载 / 覆盖 / 删除存在性 / 副本不污染 / 空名·路径分隔·超长·空字段·重名·坏类型全部报错 / 坏 JSON 抛中文错 / 坏条目丢弃好条目保留）+ E2E 1（**未实跑**，已确认被收集）+ eslint/双端 tsc/build 全绿 + 全量 vitest 74 文件/821 用例。
> **顺带修掉一个已提交的 tsc 错误**：E11 的 `statistics.spec.ts:40` 误用 `getByTestId(id, { hasText })`（该重载不存在），改为 `.filter({ hasText })`。教训：**每刀都要跑双端 tsc** —— E11 那批只跑了 eslint/vitest/build，正好漏掉它。

> ✅ **E13（2026-10-04）：高级搜索（迁移 `ui/dialogs/advanced_search.py`，172 行），提交 `a985b15`**。
> **先做的更正（有实证）**：审计原写「已迁单类型关键字过滤；**缺跨类型搜索**/按字段选择/结果跳转」。读源码后发现后两项 Python **本来就有**（`field_combo`＝名称/ID/类型/描述、结果**双击跳转**），而「跨类型搜索」Python **压根没有**（只有 `type_combo` 单类型）。故本刀是**把 Python 真实能力补齐**，并把「全部类型/全部字段」作为 **TS 增强**（Python 只能单选）——不是补一个 Python 本就有的缺口。
> **口径提醒（易错）**：Python 的 `item['type']` 指**条目自己的字段**（如技能的「攻击/治疗」），对应 TS `item.data['type']`，**不是** `item.type`（schema 类型 id，如 `skill`）。
> **交付**：`shared/advancedSearch.ts`（`searchItems`＝类型+字段+关键词过滤、`resolveSearchValue`、`SEARCH_FIELD_OPTIONS` 对齐 Python 四项、`truncateMatch`）+ `AdvancedSearchPanel.tsx`（类型/字段下拉 + 关键词 + 结果列表 + 点击跳转）+ 工具栏「高级搜索」入口（与引用/批量/快速创建/统计互斥）+ 单测 12 + E2E 1。
> **不开新 IPC**：数据复用 E11 已有的 `data:listAll`，跳转复用 App 既有 `handleJump`。
> **语义对齐**：关键词为空返回空数组（Python 是弹窗提示「请输入搜索关键词」，**不返回全量**）；空格拆分多词**全部命中**（与列表过滤 `filterItemRecords` 同约定）。
> **验证**：单测 12（字段口径 id 取记录 id / 数字转串 / 空关键词空数组 / 大小写不敏感 / 限定类型 / 全部类型跨类型 / 按 desc 字段 / 全部字段 / AND 分词 / 无结果不抛 / truncateMatch）+ E2E 1（**未实跑**，已确认被收集）+ eslint/双端 tsc/build 全绿 + 全量 vitest 75 文件/833 用例。
> **顺带修掉审计文档的两处内部不一致**：① §2 域表「合计」行原本（82/32,295…）与各域行相加不符，已按域行改为 84/33,010…；② 「三个最值得注意的域」里 `core/agent`（34 文件/8,962 行）与 `ui/dialogs`（573 行/8 文件 3,115 行）两处 prose 数字是 E10–E12 前的旧值，已改正为 33/8,419 与 1,288/5 文件 1,787 行。域表合计与 §1 结论表仍有 **±1 文件/155 行** 的差异（个别文件归类不同），已加注说明**以 §1 为准**，待逐文件复核。
> **事故记录（本会话再次发生，非假想）**：提交前 `git status` 发现工作区的 `ts-migration-roadmap.md` 是**静默回退的旧快照** —— 缺整段 E12 台账、§2 数字退回 `64/23,203` + `67/18,117`、表格被重排为旧格式、且多出两个空行。已 `cp` 备份损坏版到 `/tmp`、`git checkout HEAD --` 还原后重做本刀台账。**又一次印证**：提交前必看 `git status`，提交后必复核。

> ✅ **E14（2026-10-05）：侧栏类型可见性（迁移 `ui/dialogs/type_visibility_dialog.py`，121 行），提交 `7ea64fa`**。
> **交付**：`shared/visibleTypes.ts`（语义：`null`=全部显示、`[]`=全隐藏、数组=白名单；`isTypeVisible`/`normalizeVisibleTypes`/`resolveVisibilityResult`/`load`+`save`）+ `TypeVisibilityPanel.tsx` + 侧栏「⚙ 管理显示类型」入口。
> **不开新 IPC**：纯渲染层 + `localStorage`（项目此前**零** localStorage 使用）；偏好不进主进程文件，故**不动** 5 个共享接线文件。
> **刻意修 Python 缺陷**：`settings.py:650` 用 `if isinstance(vt, list) and vt:` 判空 → `[]` 为 falsy → **「全不选」重启即失效**；TS 以「键是否存在」区分（只有 `null` 才 `removeItem`）。
> **语义收敛（有意）**：Python 对话框文案说只影响「首页概览卡片」，实际还经 `tab_manager.is_type_allowed` 隐藏**整个侧栏页签**（文案与行为不符）；TS 明确收敛到**侧栏类型列表**。
> **最大风险已规避**：**7 个既有 E2E 断言侧栏 `type-tab` 计数 = 12** → 默认（未设偏好）必须显示全部；且这些 E2E 每个都用全新 `MB_USER_DATA_DIR`（localStorage 干净）。
> **验证**：单测 22 + E2E 1（**未实跑**，已确认被收集）。

> ✅ **E15（2026-10-05）：数据对比（迁移 `common/data_diff.py` 197 行 + `ui/dialogs/data_diff_dialog.py` 154 行），提交 `7ea64fa`**。
> **先核实的判定**：审计「`data_diff_dialog.py` ≠ `ceshuDiff.ts`」**成立**（后者是**策划书版本**对比，数据模型完全不同）；但审计把「缺什么」写得不准 —— Python 的 data_diff **本来就是残废的**，不是「有功能没迁」。
> **Python 的致命缺陷（故不照搬其 UI 行为）**：`data_diff_dialog.py:141` 执行 `DataDiff.compare({}, {"count":N,"items":[...]})` —— 拿**空 dict** 与当前数据比，**永远只输出「全部新增」**、从不做真正的双侧对比（文件头却自称「对比备份/历史版本」）。照搬=把残废语义搬过来。
> **交付**：`shared/itemDiff.ts`（`diffValues`/`diffItems`/`diffLibraries`/`collectLeaves`/`summarizeDiff`）+ `DataDiffPanel.tsx`（**当前 vs 用户手动设定的基线**，基线缓存在 localStorage）+ 工具条「数据对比」入口。
> **修 Python 三处缺陷**：① 数组元素**不递归**（`_compare_list` 整块标 MODIFIED，缺陷 C）→ 递归进嵌套；② `compare_items_by_id` 新增/删除**只塞 `name` 一个标量**（缺陷 D）→ 携带 `data` 全量；③ 从不产出的 `UNCHANGED` 死枚举 → 无变化即不产出。另**排除 `createdAt`/`updatedAt`**（否则每次保存全条目恒判「已改」）。
> **有意保留**：数组按**下标**对齐（与 Python 一致），已在源码注释标注「插入/删除会错位」的局限。
> **不开新 IPC**：纯函数 + 既有 `data:listAll`。
> **验证**：单测 29 + E2E 1（**未实跑**，已确认被收集）。

> ✅ **E16（2026-10-05）：数据备份（迁移 `ui/dialogs/backup_manager.py` 155 行 + `features/backup.py` 42 行），提交 `7ea64fa`**。
> **本批唯一必须新开 IPC 的一件**（列表/创建/恢复/删除都要访问主进程受管目录）。备份单位 = **整个活跃库**；目录由主进程固定为 `<活跃库>/backups`（**不沿用** Python 的仓库内 `data/backups`，也**刻意不引入第三套**：Python 侧另有 `tool_advanced.py` 的 AI 工具备份与**死代码** `auto_backup.py`，不合并、不迁）。目录在**每次注册 handler 时**由 `libraryManager.activeDir()` 派生 → 切库会 dispose+重注册 → **天然随库隔离**。
> **交付**：`shared/backup.ts`（命名/时间戳/`BackupEntry`/`RestoreOutcome`）+ `main/backup/backupStore.ts`（纯 fs，不依赖 electron）+ `main/backup/restore.ts`（编排）+ 4 条 IPC 五处接线 + `BackupPanel.tsx`。
> **安全护栏（逐条对应 Python 缺陷）**：① **恢复前自动生成 `pre-restore` 快照**（Python 对话框路径没有；快照失败则**中止恢复**，宁可不动）；② **精确还原** = 先按 id 差集 `deleteMany` 再 `importRecords` upsert（**只 upsert 无法删除「备份没有、当前却有」的条目**；Python 是整体替换内存字典，TS 是 SQLite —— 这是本刀**核心设计差异**）；③ **软删除**（改名 `.deleted`）而非 Python 的 `unlink` 永久删；④ **原子写**（tmp+rename）而非 `open('w')`；⑤ **路径包含校验**（正则 + `startsWith(root+sep)`）拒绝目录穿越（Python 用 `backup_dir / name` 直拼、还用 `split(' - ')[1]` 从显示文本反推文件名）；⑥ **主进程再校验 `confirm: true`**（渲染层确认可被脚本绕过）。
> **修 Python 的「假成功」**：Python 恢复**只改内存不落盘**（`backup_manager.py:117-122` 未更新 `_data_version`/`current_file`），提示成功但重启即丢；TS 数据本就在 SQLite 落盘，且 `importRecords` **保留原 id** → 引用关系不会因恢复而错乱。
> **验证**：单测 23（命名/时间戳/拒非法名/拒目录穿越/原子写/忽略 tmp·deleted/软删撞名递推）+ **恢复测试 7（真 SQLite + 真文件系统）**（精确还原=删多余+还原值+保留 id、pre-restore 快照存在、恢复到空库、坏名不误伤数据）+ E2E 1（**未实跑**，已确认被收集）。

> ⚙️ **本批的推进方式（E14–E16 同批交付）**：因为三个切片都要改**同一批共享接线文件**（`App.tsx`/`styles.css`/5 个 IPC 文件/文档），真并行写码必然互相覆盖，故采用「**并行做互不冲突的调研 + 各自只写新文件，共享接线由主代理串行收口**」：3 个只读子代理并行摸清三个 Python 文件的语义/消费者/TS 覆盖/是否需新 IPC；再由 3 个实现子代理并行产出**各自的新文件**（共享逻辑 + 面板 + 单测 + E2E，**禁止触碰 App.tsx/styles.css/IPC/文档**）；最后由主代理串行完成全部接线、恢复编排、4 条 IPC、文档与提交。**教训**：`type_visibility`/`data_diff` 都能**不开新 IPC**（前者 localStorage、后者纯函数），只有 backup 必须开 —— 若一开始就并行改共享文件，会白做大量冲突调解。
> **事故记录（本会话第 4 次静默回退）**：子代理跑完后 `git status` 发现 `ts-migration-roadmap.md` **再次**被退成更旧的快照（**E12 与 E13 台账同时消失**、§2 数字退回 `64/23,203`+`67/18,117`）。处置同上：备份损坏版 → `git checkout HEAD --` 还原 → 重做台账。**缓解措施维持不变**：提交前 `git status`、`git add` 后核对 `--cached --name-only`、提交后 `grep -c` + `git diff --quiet`。

> ✅ **E17（2026-10-05）：引用表字段编辑器（迁移 `ui/widgets/multi_select.py`，258 行），提交 `92b29ed`**。
> **交付**：`shared/refTable.ts`（`ReferenceEntry`/`clampRefLevel`/`resolveRefTypeId`/`refTypeDisplayName`/`canParseAsRefTable`/`normalizeRefEntries`/`serializeRefEntries`）+ `RefTableEditor.tsx`（名称/等级两列 + 内联选库面板）+ `ItemForm` 接线（`types` prop 传入）。
> **替换的降级**：原 `multiselect` 是逗号分隔串或 JSON 文本框；现为专用表格编辑器。**不再有 JSON 降级**，仅当值无法归一（结构异常）才回退 JSON（防丢数据）。
> **键口径修正**：Python `_get_name_by_id` 用 **复数键** 查 `data_manager.data[pluralKey]`；TS 用单数 type id 经 `DataService.listItems` 查（`resolveRefTypeId` 双向命中 `id`/`pluralKey`，schema 的 `refType` 是复数，而存储用单数）。
> **修 Python 缺陷**：SQL 式「名称解析」改由候选表内存映射解析；删除按「选中行」与 Python 一致。
> **E2E 影响**：`references.spec.ts` 原 `fill('field-skills', id)` 依赖文本框行为 → 已改为内联选库流程（点 `+ 添加技能` → 选选项 → 确定）。
> **验证**：单测 35 + E2E（并入 ref-drop-editors.spec，**未实跑**，已确认被收集）。

> ✅ **E18（2026-10-05）：掉落表字段编辑器（迁移 `ui/widgets/drop_table.py`，225 行），提交 `92b29ed`**。
> **交付**：`shared/dropTable.ts`（`DropEntry`/`clampDropRate`/`clampDropCount`/`normalizeDropRange`/`dropSourceTypeId`/`dropSourceLabel`/`canParseAsDropTable`/`normalizeDropEntries`/`serializeDropEntries`）+ `DropTableEditor.tsx`（名称/掉率% / 最小/最大四列 + 内联选库）+ `ItemForm` 接线。
> **替换的降级**：原 `droptable` **恒为 JSON 文本框**；现为专用表格编辑器。
> **存储格式逐字照搬**：`[{name, rate, count_min, count_max}]` —— **仅 name、无 id**。这是 Python 既有数据模型（存量数据无 id），保持格式兼容优先；**已知局限**（照搬不修）：来源条目改名后掉落引用会失配，已在源码注释标注，如需改 id 引用应作为独立设计变更并迁移存量数据。
> **选库口径**：照搬 Python —— `equip_drops` → 装备库（`equip`）/ 标签「装备」；**其余（含 `item_drops`/`title_drops`）→ 道具库（`item`）/ 标签「道具」**（Python 的真实行为，`title_drops` 落到道具是其既有瑕疵，注释已写明）。
> **验证**：单测 40 + E2E（并入 ref-drop-editors.spec，**未实跑**，已确认被收集）。

> ⚙️ **本批的推进方式（E17–E18 同批交付）**：两个切片都要改 `ItemForm.tsx`/`App.tsx`/`styles.css`（共享接线），故沿用 E14–E16 的模式：2 个实现子代理并行产出**互不冲突的新文件**（`shared/refTable.ts`+单测、`shared/dropTable.ts`+单测，禁止触碰共享文件），两个 React 编辑器组件与全部接线（`ItemForm`/`App`/样式/E2E/文档）由主代理串行完成。**教训延续**：先钉死 shared 接口再并行，可零冲突合并（本次 2 份 shared 文件导出与调用方逐字吻合，无需返工）。

> ✅ **E19（2026-10-05）：游戏数据 CSV 导入导出（迁移 `features/export.py` 的 `export_csv`/`import_csv`），提交 `da320b6`**。
> **交付**：`main/data/csvIO.ts`（`serializeCsvCell`/`collectHeaders`/`buildCsvText`/`parseCsvText`/`decodeCsvCell`/`rowsToImportRecords`/`exportCsvFiles`/`importCsvFile`）+ 4 条 IPC（`data:exportCsv`/`importCsv` + `dialog:chooseExportDir`/`chooseCsvFile`）+ 工具栏入口。
> **两处修正 Python**：① 表头取**全部条目键的并集（保序）**——Python 只取 `items[0].keys()`，异质条目会丢列/崩；② 复杂值（数组/对象）导出为**真 JSON**（导入侧还原）——Python 直接 str() 出单引号伪 JSON，往返必坏。
> **落盘**：文件名用 `pluralKey`（与 Python 兼容，导入侧 `getTypeByLegacyKey` 双向命中单/复数）；**UTF-8 BOM**（Excel 中文友好）；**原子写**（tmp+rename）。
> **导入语义**：走既有的 `service.importRecords` **upsert**（同 id 更新、缺 id 生成 UUID）——与 `data:importLegacy` 一致；**有意偏离** Python 的「always 重生成 id」既有行为（那会导致导出→导入原地重复）。

> ✅ **E20（2026-10-05）：游戏数据 Excel 导入导出（迁移 `features/export.py` 的 `export_excel`/`import_excel`），提交 `da320b6`**。
> **交付**：`main/data/excelIO.ts`（`buildDataWorkbook`/`renderDataExcel`/`exportExcelFile`/`importExcelFile`）+ 4 条 IPC（`data:exportExcel`/`importExcel` + `dialog:chooseExcelFile`）+ 工具栏入口。
> **复用既有 exceljs 基建**：样式照抄 `main/ceshu/export/excel.ts`（表头 `FF4472C4`+白字加粗、细边框、偶数据行底 `FFF2F2F2`、冻结 `A2`、自动筛选、列宽 clamp 8~60）。**exceljs 本就是依赖，无新增**。单文件 `game_data.xlsx`。
> **工作表名用 `def.name`（中文）**——**有意偏离** Python 的硬编码 `EXCEL_TYPE_LABELS`（那份表漏了 story/task/dialog/job 四类；用 `def.name` 覆盖全部 12 类且与 schema 永不脱节，且与 Python 文件的 sheet 名兼容）。导入侧按 `def.name` → `getTypeByLegacyKey` → 小写键 三级解析。
> **验证**：单测 28（含真实文件往返：导出→空库导入、JSON 单元格还原、数字/布尔类型保持、未知 sheet 落 unknownTypes、原子写不残留 `.tmp`）。

> ⚙️ **本批的推进方式（E19–E20 同批交付）**：同 E17–E18 —— 2 个实现子代理并行产出互不冲突的新文件（`main/data/csvIO.ts`+单测、`main/data/excelIO.ts`+单测），全部共享接线（7 条 IPC 五处接线 + `App.tsx` 工具栏 + E2E + 文档）由主代理串行完成。**教训**：本批主代理在插入 dialog handler 时**误删了相邻的 `data:listItems` handler**，靠 eslint 的 `no-unused-vars`（`listItemsInputSchema` 未用）**当场抓出** —— 大段 Edit 后必看 lint，别只信 tsc。

> ✅ **E21（2026-10-05）：术语风格 —— 按游戏风格替换字段标签（迁移 `core/style_manager.py`），提交 `82a59c9`**。
> **交付**：`shared/gameStyle.ts`（`GAME_STYLES` 内联 6 风格×**46** 概念 + `CONCEPT_ALIASES` 23 条；纯函数 `resolveLabel`/`resolveFieldLabel`/`inferStyleFromText`/`buildCrossStyleMap`/`buildReplacementPairs`/`getTerminology`/`listStyleNames`/`normalizeGameStyleId`/`loadGameStyle`/`saveGameStyle`）、`ceshuModel.ts::resolveDocGameStyle`、`fieldLabelFor(field, layout, styleId)`、`ItemForm.gameStyle` prop、工具栏 `game-style` 下拉（localStorage `mb.gameStyle`）。
> **口径照抄 Python**：`STAT_LABELS.get(fname, _styled_label(label))` —— **命中 `STAT_LABELS` 时不参与术语替换**（顺序不可颠倒，已单测钉死）；替换是 **`str.replace` 全部替换**语义（用 `split/join` 而非 `String.replace`）。
> **有意偏离（4 条，均已记档）**：① 无全局可变单例 —— `styleId` 由 `App` state 显式传入（Python 用模块级 `_active_style`）；② 活跃风格**落 localStorage**（Python 不持久化，重启即丢）；③ `resolveDocGameStyle` **优先 `doc.style`**（用户在 AI 一键生成/预设里显式选过）再回退关键词推断，Python 完全忽略 `doc.style`；④ 工具栏新增**手工入口**（Python 只能靠推断，推断不出时无从设置）。**有意不迁**：`get_styles`（≡ `GAME_STYLES` 常量）、`get_active_style_name`（TS 里活跃风格是参数不是状态）。
> **忠实保留的 Python 缺陷**：连锁二次替换 —— `resolve_label('内力','fantasy')` = **`'生命值值'`**（先 `内力→生命值`，再 `生命→生命值`）。**未修**：修了会与 Python 输出不一致；真实 schema 标签不受影响（已实测全量标签 × 6 风格走不到该路径）。已钉死用例，防将来被当成"顺手 bug"改掉。
> **验证**：单测 **64**（`gameStyle.test.ts`）+ `formSections` +5（`STAT_LABELS` 命中不替换 / grid 未命中走替换 / 省略 styleId 不替换）+ `ceshuModel` +6；eslint 0 / 双端 tsc 0 / vitest **84 文件 1130 测试全绿** / `electron-vite build` OK / E2E 收集 **65** 例（新增 `game-style.spec.ts`：仙侠下 `生命加成%:`→`气血加成%:`、`法力加成%:`→`灵力加成%:`、`技能列表:`→`功法列表:` + 重载持久化）。
> **实证方法（关键，避免自我循环）**：另写**一次性差分测试**——按 Python 源码**独立重实现** `_build_cross_style_map`/`_build_replacement_pairs`/`resolve_label`/`infer_style_from_text`，与 TS 实现在 **300+ 标签（含全部 schema 字段标签/STAT_LABELS/术语值/别名/对抗串）× 10 个 styleId** 上逐条比对，四个函数**全部一致**；再逐字段比对确认 `GAME_STYLES` 内联数据与 `game_styles.json` **完全一致（6 风格 × 46 键，无抄写错误）**。两个一次性测试跑完即删，不进仓库。
> **本批纠正的子代理错误汇报**：实现子代理口头汇报称「47 个概念，只有 34 个六风格全覆盖，3 个别名键从未出现在任何术语表」。**实测全部为假**：概念 **46** 个、**46 个在 6 风格中全覆盖**、**0 个失效别名键**（这些错数字**未写进代码**）。教训：子代理的"实证数字"必须自己复算一遍。

> ✅ **E22（2026-10-05）：AI 生图子系统（补齐 §4 #7 能力缺口），提交 `9294a8a`**。
> **背景反转**：#7 原经双源调研（只读子代理 + 主代理独立 grep）判定「有意不迁/待决策」并记档（`5b455d6`）——因 Python 侧 `_ai_image.py` 本身是死壳、且真引擎依赖云付费 API。后**用户决策「都做了」→ 立项补齐**。这正是「有意不迁 vs 能力缺口」两种处置的差别：前者是设计决策，后者等用户拍板后可作新功能补齐。
> **交付**：`shared/imageGen.ts`（前置校验 `checkImageConfig` + `resolveImageConfig` image 维度覆盖 + `buildImageRequest` 四 provider + `extractImageUrl`，单测 52）、`main/imageGen/client.ts`（fetch + 重试 2 次 + 进程内限流 2s）、`main/imageGen/save.ts`（stream 落盘 + tmp→rename 原子写 + 文件名 basename 防穿越）、`shared/imageGenConfig.ts`（面板配置 localStorage，复用 `visibleTypes` 的 `StorageLike`）、`ImageGenPanel.tsx` + 工具栏「AI 生图」入口；5 处 IPC 接线（`image:generate` + `dialog:chooseImageSaveDir`）。
> **四 provider**（照 Python `generate_image`）：OpenAI `dall-e-3`、`Qwen` dashscope `qwen-vl`（响应走 `output.results[0].url`）、`豆包` Ark、`Generic` 自定义 base_url。响应解析：openai/doubao/generic 走 `data[0].url ?? data[0].b64_json`。
> **有意偏离**：① 限流用**进程内最小间隔**（2s ≈ 0.5 QPS）近似 Python `image_gen` 桶，而非跨模块 `RateLimiter`（Electron 主进程单实例足够）；② 配置落 **localStorage**（Python 存 `config.json`，本仓尚无设置存储基座 → 属 #8 待建）；③ 面板按 `show_ai_image_dialog` 的**设计意图**做成真正可用版（Python 该入口是死桩，只弹「需配置 Key」）。
> **验证**：单测 90（imageGen 52 + client/save 21 + config 17）；eslint 0 / 双端 tsc 0 / vitest **87 文件 1220 测试全绿**（上批 84/1130）/ `electron-vite build` OK / E2E 已收集（`image-gen.spec.ts`，本沙箱无 Electron 未实跑）。**已知限制**：真实云调用需 API Key + 计费，E2E 只覆盖面板/前置校验/配置持久化，**未实跑云端链路**。
> **踩坑**：① 两个子代理（`main`/`panel`）因 **429 频率限制**中途失败 → 主代理接手自写这两块 + 修它们已落盘的半成品测试（`imageGenClient.test.ts` 按旧松散签名写、断言「保存图像失败」但实现是「下载图像失败」——**实现对、断言错**，改断言而非改实现）。② 纯逻辑助手原放 `renderer/components/` → 被 node 端 tsc 拒绝（`tsconfig.node.json` 只 include `main|preload|shared`）→ **移到 `src/shared/`**（既符合本仓「可单测纯逻辑都在 shared」约定，又自然被两套 tsc 覆盖；**不要**为它给 node 配置加 renderer）。③ `ImageGenPanel` 标 `: JSX.Element` 报 TS2503（React 19 新 jsx runtime 无全局 JSX 命名空间）→ 去掉返回标注，与既有组件一致。

> ✅ **E23（2026-10-05）：统一设置存储基座（#8 C 档外围第一项），提交 `5e5b0b0`**。
> **动因（实证，非臆测）**：全量 grep 发现 TS 侧 localStorage 有 **4 处散点、3 种写法**——`visibleTypes`/`gameStyle`/`imageGenConfig` 各有 `StorageLike`（后两者已复用），但 `DataDiffPanel.tsx` 用**裸 `window.localStorage` + 组件内 try/catch**；且**无一支持枚举/导出/重置**。`ImageGenPanel.tsx` 注释早已标注「本仓尚无设置存储基座，属 #8 待建」。
> **交付**：`shared/settingsStore.ts`（单测 25）——`StorageLike` 收敛为**唯一真源**（`visibleTypes.ts` 改 re-export，既有 104 测试未破）；统一 `readSetting`/`writeSetting`（空串视为清除）/`removeSetting`/`readJsonSetting`/`writeJsonSetting`；`listSettingKeys`（只列 `mb.` 前缀）+ `exportSettings`/`importSettings`（只接受带前缀键，防塞入任意键）/`resetAllSettings`；`SETTINGS_KEYS` 单一清单。收拢第 4 处散点（`DataDiffPanel` 改走基座，行为等价）。
> **有意不迁（本刀决策，已记审计）**：**i18n** 从 ⚠️ 改判 ⛔ —— `common/i18n.py` 是**全局翻译框架**，而 TS 侧 UI 文案 100% 硬编码中文，接入需翻译全部组件（数十文件、上千字符串），属**独立立项**而非存储基座职责。（注意 `core/agent/i18n.py::AgentI18n` 早已是死代码，勿与前者混淆。）
> **审计数字**：i18n 改判使 §1 变为 ⛔85/17,252、⚠️59/16,024（对账仍 299/91,164）。
> **验证**：eslint 0 / 双端 tsc 0 / vitest **88 文件 1245 测试全绿**（+1 文件 +25 用例）/ `electron-vite build` OK。
> **本批推进方式**：2 个只读调研子代理（主题/特效、设置/i18n/菜单窗口）并行摸底，主代理**不空等**——先独立 grep 实证 4 处散点，再自写基座 + 单测 + 收拢接线（子代理只调研、不碰代码）。

> ✅ **E24（2026-10-05）：收敛重复 storage 助手 + 窗口状态持久化（#8 第二项），提交 `c11ed5f`**。
> **两项内容**：① E23 收尾未彻底——`StorageLike` 类型虽已收敛，但 **`defaultStorage()` 函数体仍有三份逐字重复**（`visibleTypes`/`gameStyle`/`imageGenConfig`），本刀全改为调用 `settingsStore.defaultSettingsStorage()`（多一层 try/cash 更健壮），并修正两处「真源是 visibleTypes」的过期注释；② 迁移 `ui/window_state.py`（154 行）→ `main/windowState.ts`（单测 23）+ `app:setWindowMode` IPC（5 处接线）。
> **窗口状态逐字段取舍**（读源码后定，非按名字臆测）：**迁** `window_x/y/w/h`、`is_maximized`、`last_tab_index→lastMode`；**不迁** `theme`（TS 无多主题）、`layout_mode`（Python 硬编码 `"three_column"`，**常量无信息**）、`splitter_ratio`（TS 侧栏是 CSS Grid，**无 QSplitter 等价物**）、`auto_save_*`（TS 是条目级即时落库，无此机制）；**`has_unsaved_changes`/`compute_data_hash`/`check_data_changed` 刻意不迁**——读源码确认 Python 靠内存态 `_data_version` vs `_saved_version` 判脏，而 TS 每次保存直接落 SQLite，**不存在内存脏状态**，这套机制在 TS 是无源之水（不造空壳）。
> **关键实现细节**：用 **`getNormalBounds()`** 而非 `getBounds()`（最大化时后者被系统改写，存它会导致「取消最大化后窗口恢复成全屏尺寸」）；`resize`/`move` **防抖 500ms** 落盘 + `close` 时强制落一次；写盘**原子写**（tmp+rename）；`setWindowMode` 经 `registerIpcHandlers` **依赖注入**传入（`index.ts` 已 import `ipc.ts`，顶层 export 会**循环依赖**）。
> **#8 主题/特效整块判定为 ⛔ 有意不迁**（调研 + 逐条实证）：`themes/themes.py`(1,097) + `effects/theme_effects/text_glow_effect`(808) 共 1,905 行里 **86% 是 Qt QSS/hex 字面量**（Web 端不可用），且**实证为死代码**——`Glow*` 控件 `src/` 内零引用、`apply_text_glow` 遍历的 `glow_widgets` 恒为空（初始化 `[]` 后从未 append）、`generate_digital_panel_qss` 无真正调用者。唯一有价值的 33 行设计令牌（`FONT_SIZE_*`/`SPACING_*`）已作为 CSS 自定义属性覆盖。多主题切换属**独立立项**（`[data-theme]` 覆写 ~80-100 行），不搭车。
> **审计数字大幅改善**：⛔85→**89**（+1,905 行主题 + 401 行 i18n 转为决策）、⚠️59→**54**、✅94→**95**；**真实剩余从「2.7–3.1 万行（30–34%）」降到「2.4–2.8 万行（26–31%）」**（对账仍 299/91,164）。
> **验证**：eslint 0 / 双端 tsc 0 / vitest **89 文件 1268 测试全绿**（+1 文件 +23 用例）/ `electron-vite build` OK。
> **踩坑**：写 `windowState.ts` 时 `clampDim()` 只用了 `MIN_WIDTH` 漏了 `MIN_HEIGHT`——**eslint 的 `no-unused-vars` 当场抓出**（tsc 不报未使用的局部 const），说明「大段 Edit 后必看 lint」这条铁律继续有效。另：`WindowModeInput` 一度被误加进 `shared/ipc.ts` 的 `./types` 导入块（实际定义在 `./schemas`），tsc TS2305 抓出。

> ✅ **E25（2026-10-05）：API Key 迁 Electron safeStorage（修一次安全性退步），提交 `10887fa`**。
> **退步事实**：E22 把 AI 生图 apiKey 明文存 localStorage（`mb.imageGenConfig`），而 Python `config/settings.py` 用 Fernet 加密存 key。`shared/secretNames.ts` 仅登记 `imageGen.apiKey`（不进 `ItemRecord`，快照无密钥泄漏）。
> **核心设计（渲染层永远拿不到明文）**：渲染层 `sandbox:true`+`contextIsolation:true` 本就无 `safeStorage`；写入=明文经 IPC 交主进程 `secretStore` 加密落 `userData/secrets.enc`，成功即清空输入框；读取=**刻意不提供取明文 IPC**（`MbApi.settings` 仅 has/set/delete，preload 同），`image:generate` 传空 key、主进程 `secretStore.get()` 本地解密自用。**safeStorage 不可用 → 拒绝写入，绝不降级明文**。
> **一次性迁移**：E22 旧明文 → 搬进钥匙串 → **无论成败都无条件抹掉 localStorage 该字段**（失败保留明文=给攻击者无限重试窗口，取舍认可）。`StoredImageGenConfig` 的 apiKey 字段**整个删除** + `saveImageGenConfig` 改显式白名单（硬塞也写不出去）。
> **验证**：eslint 0 / 双端 tsc 0 / vitest **91 文件 1313 测试全绿**（+2 文件 +43）/ build OK。主代理独立复算并另验 4 条安全属性（无取明文通道 / preload 无 get 桥 / imageGenConfig 零引用 apiKey / 主进程本地解密），非采信自报。**审计数字不变（TS 侧安全加固，非 Python 迁移）**。

> ✅ **E26（2026-10-05）：`shared/` 分层最小整理（方案 C），提交 `3a0c469`**。
> **背景**：架构师调研 + 主代理独立复算后否决「全量重排 shared/（66 文件/17,011 行）」——跨业务域违规仅 2 条（`agent/session.ts`→`ceshuModel.formatLocalTimestamp`、`attrSystem.ts`→`ceshuModel.isPlainObject`）；`ipc.ts` 19 个内部依赖全 `import type`（运行时零耦合）；TS6307 硬红线（58/66 文件被测试直接 import，下放 renderer 即报错）。全量拆分=手改 354 处 import 无兜底。
> **采纳方案 C（成本全量 1/38）**：`shared/README.md` 分区契约（contract/domain/config/service/util + 放置决策树 + 预挂规则说明）+ 4 条 ESLint `no-restricted-imports` 边界规则（零新依赖，**自动阻止混装继续累积**）；定向移出 5 个零内部依赖叶子文件（`ceshuDefaults`/`ceshuFields`/`ceshuTemplateData` → `domain/ceshu/`，`api` → `service/api`）+ 消除 2 条真跨域边（`isPlainObject`/`formatLocalTimestamp` 下沉 `util/` 并 re-export 兼容 ~60 调用方）。
> **验证**：eslint 0 / 双端 tsc 0 / vitest 全绿 / build OK。规则经 ESLint Node API 探针实证 4 条全 FIRES（非死规则）。**审计数字不变（TS 侧重构，非 Python 迁移）**。

> ✅ **E27（2026-10-05）：通用撤销/重做（undo/redo）"安全子集"，提交 `581c64c`**。
> **动因（读源码后定，非按名字）**：TS 侧**完全没有**用户手动操作撤销/重做，误删/误改无法回退，是唯一数据安全缺口。Python `brain_plan.py:225-260` 的 `_undo_stack`（深度 50）**只服务 AI plan**、只处理 create/delete 且 delete 撤销不了、update 未记录 → 不能照搬；TS `operationLog.ts::buildRollbackPlan` 逆向能力更全（缺快照进 `skipped` 附中文原因）但仅限 AI 会话。**本刀=把逆向能力改造成持久可交互的 undo/redo 栈，服务对象扩到用户手动操作**。
> **两点设计决策（诚实 scope）**：① **栈进主进程 `AppStores`**（`stores.ts` 每库重建 → 切换库物理清空，零额外代码，E7 结构性保证；不用模块级单例——违反零全局可变状态）；② **记录点在 `DataService` 漏斗**（7 个渲染层调用点 + AI `gameDataSkill` 全部经此，一次覆盖）；复用 `operationLog` 的中文原因纪律但新写纯栈逻辑于 `shared/util/undoStack.ts`（双端 tsc 覆盖，且不 import `agent/` 业务层以守分层）。**排除** importRecords（靠 backup）、持久化、跨库 redo。
> **fail-soft 铁律（宁缺勿错）**：compare-and-skip 防覆盖（撤销 create/update 时条目被改过 → 跳过，绝不丢用户后续编辑；E2/E3 最值钱）、E4 撤销 delete 时 id 冲突 → 跳过绝不盲覆盖、E8 peek-then-commit（写失败保留 entry、历史不丢）、E10 经 `restoreItem` 写回完整快照（含 createdAt，恢复被删项不丢排序）、重入防护（undo/redo 只走 `restoreItem`/`deleteById` 非记录原语，不自记录成环）。
> **交付**：`shared/util/undoStack.ts`（224）+ `main/data/undoRecorder.ts`（220）+ `main/data/service.ts`（+147，5 个 mutator 记录 + 非记录原语 `restoreItem`/`deleteById`/`runAtomicTask`/`getItem`/`exists`）+ `main/stores.ts`（+7）+ `shared/ipc.ts`（+27，3 通道）+ `main/ipc.ts`（+8）+ `shared/service/api.ts`（+6）+ `preload/index.ts`（+3）+ `renderer/App.tsx`（+101，Ctrl/Cmd+Z 撤销、Ctrl/Cmd+Shift+Z/Ctrl+Y 重做、工具栏 undo/redo 按钮、setNotice 反馈）+ 3 个测试文件（unit×2 199+369、e2e×1 109）。
> **验证（主代理独立复算，非采信自报）**：双端 tsc **0 错误** / eslint **0 error** / undo 单元 **24/24 通过**（含 E2/E3/E8 三危险路径：create 后被改→跳过保留编辑、update 后被改→跳过不回写且栈顶保留、restore 抛错→failed 返回且 entry 保留历史不丢）；**E2E 本沙箱无 Electron 未实跑**（与既有 E2E 同源受限）。**审计数字不变（TS 侧新功能，非 Python 迁移）**。

> ✅ **E28（2026-10-05）：顶层 IA 对齐 PyQt（去侧栏 + 菜单栏角部件 + 策划书中心），提交 `de104be`**（收口 `2519c2c` / `0dc2211` / `f0a6694`）。
> **动因（读 Python 源码后定，非按名字）**：用户要求「布局跟 PyQt 一样」。逐行核实 PyQt 真实拓扑：`layout_builder.py:92-153` 的 `_build_three_column`（方法名误导）实为**两栏** `QSplitter`（`_center_stack` : `DigitalPanel` ≈ 75:25），默认落**策划书首页**；`main_window.py:455-511` 菜单栏**右上角部件** = 库条（当前库 + 下拉 + 数量）+ 设置/智能体/AI 三按钮；`editor_view.py:202-219` 编辑器 = [章节编辑 | 预览面板]，**预览常驻无开关**、工具栏第一个是返回；`menus.py` MENU_CONFIG 里**全部能力从菜单进**。**全仓无左侧栏** —— TS 原来的「品牌 + 库条 + 三模式 tab + 类型列表 + 策划书列表」纯属自造。
> **实现**：删整个 `.sidebar` 与 `mode` 状态；中央单栈 = 浮层 ? 策划书首页 : 编辑器（`ceshuHomeVisible` 默认 true）；库条移入 `.menubar-right` 角部件；编辑器加 `ceshu-back`、预览面板改**常驻**（去掉 `ceshu-toggle-preview`）；原 11 个顶层数据页面板收拢为**互斥浮层** `.panel-overlay`（标题 + `panel-close`）；工具菜单追加 4 项（字段结构编辑器/高级搜索/数据可见类型/AI 生图）。4 文件 +374/−909。
> **核验抓出 3 个真实缺陷（`2519c2c` 修）**：① `BatchEditPanel` **死控件** —— `App.tsx` 传 `selectedIds={[]}` → 应用/删除**永远 disabled**，而面板自身无勾选 UI（PyQt `BatchEditDialog` 是「选类型 + 条件作用于整类」）→ 改为面板**自持作用域**（`batch-type` 下拉 + 按类型拉全部 id，`effectiveCount===0` 才禁用）；② `TypeVisibilityPanel` **假控件** —— `value={null}` + `onConfirm=关闭`，`visibleTypes` 全仓无消费者，且 **PyQt 本无此功能** → 撤掉菜单项（组件文件保留，避免扰动审计）；③ `handleJump` **假跳转** —— 只 `setRefTarget` + notice、不发生导航 → 落 `jumpTarget`（含 `nonce` 防重复）+ 逐层下钻到 `DataEditorTab.initialSelectedId`，靠 `key` 重挂载（**不能用 effect 内 setState**，react-hooks v7 是 error）；失配为**静默无选中 + 中性文案**，绝不伪造「定位失败」。
> **我追加两处微清理**：`0dc2211`（删掉 `hasSelection` 恒真常量 prop —— PyQt `menus.py:94` 该菜单项本就无 disabled 语义）、`f0a6694`（跳转成功后清掉残留引导 notice，避免与「已定位」自相矛盾）。
> **验证（独立对抗核验 PASS）**：双端 tsc 0 / eslint 0 / vitest **94 文件 1344 用例** / build OK；核验方另写**整机渲染证明**（`npm run build` + 本地静态服务 + Playwright chromium + `addInitScript` 注入忠实桩 `window.mbApi`）：`render-adversarial.mjs` **24/24**、`render-proof.mjs` **20/20** —— 批量面板**回读数据层**确认内容真变、跳转 miss 给诚实 notice 且不选中、重复跳转同一 item 仍选中、无未捕获 pageerror。**审计数字不变（TS 侧外壳重构，非 Python 迁移）**。

> ✅ **E29（2026-10-05）：E2E 全量迁移到新 IA（51 个 spec），提交 `8502638` → `5471256`（7 笔）**。
> **背景**：E28 的 IA 重写使 **51/51 个 spec 全部失效** —— 50 个的门禁判据 `getByRole('heading',{name:'数据表预览'})`（71 处）随顶层数据页删除，第 51 个是 `type-tab` count=12；**27 个 testid 死引用、187 处、横跨 47 文件**；且**零共享 helper**（`electron.launch` 内联 73 次、门禁 51 份复制粘贴）。用户裁决**全量一次性推完**。
> **提交链**：`8502638` 地基（`helpers/app.ts` 的 `launchApp`/`waitReady` + 收敛 51 文件启动与门禁，52 files +288/−490）→ `5d07bad` 菜单栏补 `data-testid`（`menu-title-{file,edit,tools,settings,help}` + `menuitem-<menu>-<action>`；`notImplemented` 占位项**一律不加**）→ `b6d2d06` 策划书编辑流簇 20 spec → `b5791ca` 数据编辑簇 7 spec（+ `helpers/ceshuData.ts`）→ `8ccb65e` 混合簇 10 spec → `e8ec290` 工具入口簇 10 spec → `5471256` 数字员工面板（删已下线的 `mode-digital`）。
> **helper 关键设计**：`activeCeshuId` 是**渲染层 state**，纯 IPC 建文档 UI 不会切过去 → `seedCeshu()` **启动前把策划书 JSON 写进 `<userData>/libraries/初始库/ceshu/` 播种**，再从首页卡片打开（且**首页列表只在挂载时拉一次**，IPC 旁路建文档后须 `reload()`）。
> **最终独立核验（主代理自己跑，非采信子代理自报）**：① 已删 testid 的全仓 `getByTestId` 存活引用 **归零**（18 个锚点：`mode-*`/`type-tab`/`open-*`/`te-delete-field`/`export-csv` 等）；② 51 个 spec **全部**走 helper（`electron.launch` 仅存在于 `tests/e2e/helpers/`）；③ `test.fixme` **仅 2 处**且均附中文原因（`game-style` 待按 `doc.style` 重写、`type-visibility` 功能已移除）；④ tsc node/web 0 + eslint 0 + vitest 94 文件 1344 用例全过。
> **诚实边界**：**51 个 E2E 至今未在真机跑过**（沙箱无 Electron，`Process failed to launch!`），只能按既有模式写就、待 CI 实跑。**审计数字不变（测试侧迁移，非 Python 迁移）**。

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
- **LLM 相关 E2E 可用「Ollama 桩服务」打通全链路**：`node:http` 监听随机端口，`GET /api/tags` 返回 `{models:[{name:'stub:latest',...}]}`、`POST /api/generate` 返回 `{response: "<目标 JSON 字符串>", done:true,...}`，通过 `MB_OLLAMA_HOST` 注入；还能把收到的 `prompt` 收集起来断言提示词组装（见 `tests/e2e/ceshu-ai-datagen.spec.ts`）。
- 勾选项的 `data-testid` 若挂在 `<input>` 上，`toContainText` 断言要落在其外层 `label` 上（input 自身无文本）。
- **SVG 里用内联 `fill` 着色的元素，CSS 不要再写 `fill`**（CSS 会覆盖 presentation attribute，导致颜色失效）——竞品散点名只能控字号。
- **`mode-ceshu` 的落点依赖「自动选中第一份」**：`App.tsx` 的 `useEffect([mode])` 载入列表后 `setActiveCeshuId(current => current ?? list[0]?.id)`。7 个既有 E2E（checklist / fielddeps / notes / validate-score / version-diff / wordstats / export）在 `mode-ceshu` 后**直接点 CeshuView 工具栏按钮**，故 W34 的首页卡片视图必须走**显式入口**（侧栏「全部策划书」`ceshu-home` + `ceshuHomeVisible` 状态），**不可**把落点改成首页，否则打断这批 E2E。
- `CeshuSummary` 增必填字段会波及所有构造该类型的测试桩（`ceshuTimeline.test.ts` 的 `summary()`），加字段后需同步补齐。
- **v4→v5 迁移必须在套用默认值之前跑**（对齐 Python `from_dict`）：`normalizeCeshu` 内先 `needsV4Migration(raw)` 判定、再 `migrateV4ToV5(raw)`，最后才 `createDefaultChapters()` 兜底。若顺序颠倒，派生会读到 TS 默认章的值（如默认 `systems.battle.config`）而产生伪派生。判据：`version === "4.0"` 或 9 个新增章任一缺失。
- **派生规则有先后优先级**：`vision.business_model` 先于 `systems.economy.config.payment_system` 写 `monetization.payment_model`（即顺序=Python 顺序，勿调换）；`vip_system`/`season_pass` 用 `is not None` 而非真值判定（显式 `false` 也要转成「未启用」）。
- **`shared/` 内避免循环导入**：`ceshuMigration` 被 `ceshuModel` 引用，故其 `isPlainObject`/`pyTruthy` 本地定义（同 `ceshuCompetitiveChart.ts` 先例），勿从 `ceshuModel` 反向 import。
- **给子代理的「精确文案/数字」契约必须直接抄自 Python 源码，不能凭记忆写**：W31 委派时 `formatRecommendedSystems` 契约误写成「rpg 输出全部 9 项」，子代理按契约实现了错误的「>9 才截断」；正确语义是 Python 的 `rec_systems[:6]`（始终取前 6 项，>6 追加「 等 N 项」）。子代理会在汇报里指出冲突，但**必须当场按源码修正并回归单测**。

## 5. 子代理并行约定（重要）

并发冲突点是**接线文件**。因此：

- **禁止子代理修改**：`shared/ipc.ts`、`shared/schemas.ts`、`shared/api.ts`、`preload/index.ts`、`main/ipc.ts`、`main/index.ts`、`renderer/src/styles.css`、`renderer/src/components/CeshuView.tsx`、`renderer/src/App.tsx`。
- **子代理只做**：新增**互不重叠**的独立文件 —— `shared/<模块>.ts` + `tests/unit/<模块>.test.ts`，并自行跑 `vitest`/`tsc`/`eslint` 验证；**不得提交 git**。
- **父代理负责**：调研把关、IPC 接线、UI 集成、E2E、全量验证、提交、台账回写。
- 并行上限 **2–3 个子代理**；每个任务必须写清：目标文件路径、Python 参照与语义要点、精确数字要求、验证命令、禁止事项。
- 子代理交付时须附「语义对照」说明（Python 函数 ↔ TS 函数 + 有意偏离项），便于父代理复核。

## 6. 下一批分片排期（默认顺序）

| 编号          | 切片                                                                   | 说明                                                                                                                                                                                                                                                            |
| ----------- | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ~~W23~~     | ~~字数统计~~                                                             | ✅ 已完成（IPC `ceshu:wordStats` + `WordStatsPanel` + E2E）                                                                                                                                                                                                         |
| ~~W24~~     | ~~依赖检查（字段/系统）~~                                                      | ✅ 已完成（IPC `ceshu:fieldDeps` + `FieldDepsPanel` 双视图 + E2E 25-25）                                                                                                                                                                                               |
| ~~W25~~     | ~~Excel 导出（补满 6 种）~~                                                 | ✅ 已完成：`main/ceshu/export/excel.ts`（`buildExcelWorkbook` + `renderCeshuExcel`，8 Sheet：概览/系统配置/数值表/角色/里程碑/风险/竞品/校验报告；标题行蓝底白字加粗 + 冻结首行 + 列宽自适应 + 数字型字符串转 int/float）→ 单测 7 + E2E（xlsx 魔数 + exceljs 回读 8 Sheet）                                                    |
| ~~W26~~     | ~~版本时间线~~                                                            | ✅ 已完成：`shared/ceshuTimeline.ts`（尺寸/配色/文案/布局/默认选中/详情，单测 12）+ `VersionTimelinePanel`（SVG 主轴+节点+箭头、图例、节点详情、切换到此版本）+ E2E 26-26                                                                                                                                    |
| ~~W27~~     | ~~章节模板库（第一刀：内置模板 + 选择器）~~                                            | ✅ 已完成：`shared/ceshuTemplateData.ts`（18 章 34 模板，由 Python 数据池机械转换）+ `shared/ceshuTemplates.ts`（查询/三模式合并/预览树，单测 14）+ `TemplatePickerPanel`（筛选/搜索/预览/二次确认）+ ChapterForm「模板库」入口（回填章节草稿，需再点保存）+ E2E 27-27                                                           |
| ~~W28~~     | ~~自定义模板（第二刀）~~                                                       | ✅ 已完成：`shared/ceshuCustomTemplates.ts`（分类净化/归一化/搜索/筛选，单测 12）+ `main/ceshu/templateStore.ts`（`userData/ceshu_templates/<category>.json`，串行写队列 + 原子写，单测 6）+ IPC `ceshu:templates:list/save/delete` + 选择器「另存为模板」（章节/全局）、来源筛选（全部/内置/自定义）、删除二次确认 + E2E 28-28       |
| ~~W29~~     | ~~模板编辑器（第三刀）~~                                                       | ✅ 已完成：`TemplateEditorPanel`（筛选=全部章节/仅自定义/仅内置/18 章 + 搜索；编辑器=名称/章节/描述/标签/来源/数据 JSON；新建/保存/另存为自定义/删除/导出/导入（可勾选覆盖同 ID）/应用到该章节）+ IPC 4 通道 + E2E 29-29                                                                                                              |
| ~~W30~~     | ~~AI 生成数据表~~                                                         | ✅ 已完成：`shared/ceshuDataGen.ts`（类型解析/条数归一/背景与字段提示/提示词/候选归一化/摘要，单测 14）+ IPC `ceshu:aiGenerateData` + `AiDataGenPanel`（12 类勾选、每类数量 1~20、补充要求、分类标签预览、全选、勾选导入）+ E2E 2 条（离线提示 + 桩服务全链路）                                                                             |
| W31         | 预设市场（`preset_market_dialog.py` 300）/ 竞品图表（`competitive_chart.py` 80） | 数据 + 简单图表                                                                                                                                                                                                                                                     |
| W32         | 系统依赖确认 / 数据同步                                                        | ✅ 已完成（进度台账 W32）                                                                                                                                                                                                                                               |
| W33         | 迁移工具（v4.0→v5.0 策划书数据迁移）                                              | ✅ 已完成（进度台账 W33）                                                                                                                                                                                                                                               |
| W34         | 策划书首页卡片视图                                                            | ✅ 已完成（进度台账 W34）—— **B 档收官，后续转 A 档**                                                                                                                                                                                                                           |
| **A1-1**    | **技能协议 + 调度器内核**                                                     | ✅ 已完成（见 [`a-tier-plan.md`](./a-tier-plan.md) §6 落地记录）。**执行顺序调整**：A1-1/A1-2 先于 A2 —— A2-1 的验收依赖「全量 E2E 回归」，而本沙箱 Electron 起不来，先把**不碰存储路径、可单测闭环**的 A1-1 做掉；A1-1/A1-2 无会话目录，故不会产生 §4 所述的返工                                                                        |
| **A1-2**    | **Brain 循环 + 事件流 + LLM 工具调用**                                        | ✅ 已完成（同上 §6）                                                                                                                                                                                                                                                  |
| **A1-3**    | **Agent 会话与记忆**                                                      | ✅ 已完成（同上 §6）。会话目录暂落 `userData/agent/`——**A2-1 引入多库后只需改 `main/index.ts` 一处注入点**，故本刀与 A2-1 无返工耦合                                                                                                                                                                |
| **A1-4**    | **数字员工面板**                                                           | ✅ 已完成（同上 §6）                                                                                                                                                                                                                                                  |
| **A1-5**    | **业务技能接线 + 托盘/热键**                                                   | ✅ 已完成（同上 §6）—— \*\*A1（AI/Agent 引擎）A1-1…A1-5 + A1-4b + A1-5b 全部收官                                                                                                                                                                                              |
| **A2-2**    | **库条 UI 与切换联动**                                                      | ✅ 完成（**降级验证**：E2E 3 例已写、沙箱未实跑）。`components/LibraryBar.tsx` + 侧栏挂载 + `library:changed` → 整页重载；渲染层只做按钮启用预检，**主进程是校验权威**。\*\*A 档（A1+A2）至此全部收官\*\*\*\*。下一步 **A2-1 库服务与存储路径迁移**（A 档仅剩此块；其验收依赖「全量 E2E 回归」，本沙箱 Electron 起不来 → 需在有 CI/E2E 的环境做，或接受「单测 + 人工核对路径」的降级验证） |
| A2-1 / A2-2 | **库管理（多库，A 档内部优先）**：库服务+注册表+存储按库隔离 → 库条 UI 与切换联动                     | 方案见 [`a-tier-plan.md`](./a-tier-plan.md)；**已拍板：A 档整体后置，先清上面 W31–W34（B 档小件）**                                                                                                                                                                                  |
| A1-1 … A1-5 | **AI/Agent 引擎**：技能协议+调度器 → Brain 循环+事件流 → 会话与记忆 → 数字员工面板 → 业务技能接线    | 同上；**拍板：完全不做自愈**（工具报错直接回传 LLM 重新规划）；技能先只做最小集；LLM 相关 E2E 一律用 Ollama 桩服务（W30 技法）                                                                                                                                                                                |
