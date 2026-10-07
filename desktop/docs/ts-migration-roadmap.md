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
> | ✅ 已迁 | 106 | 38,907 | 42.7% |
> | ◐ 部分已迁 | 51 | 19,807 | 21.7% |
> | ⛔ 有意不迁（决策，非欠债） | 92 | 19,858 | 21.8% |
> | ⚠️ **未迁（整块没做）** | **50** | **12,592** | **13.8%** |
>
> 对账 PASS：`106+51+92+50 = 299` 文件、`38907+19807+19858+12592 = 91,164` 行。
>
> **结论：真实剩余 ≈ 2.4–2.8 万行（26–31%）** —— 而不是早前口头估算的「3.5–4.5k 行（4–5%）」。那句估算**口径过窄**（把 `ui/widgets`/`ui/dialogs`/`features` 三个混合态域当成了基本迁完）且未做文件级核实，**已被本审计推翻**。
> 三个最意外的数字：**① `core/agent`（最大域 24,670 行）只有 1,689 行是完整已迁**（A 档做的是核心闭环，不是整个 Agent 引擎）；**② `ui/` 顶层+主题 9,883 行里仅 1,819 行完整已迁**；**③ `features` 9 文件完整已迁为 4 个（1,543 行）**（E50 更新为最新 §1/§2 数字）。
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

> ✅ **E30（2026-10-06）：视觉与交互细节对齐 PyQt（配色 / 图标 / 首页 AI 卡 / 表单行 / 章节导航），提交 `1d96b0e`**。
> **动因**：用户肉眼反馈「跟 PyQt 的前端界面不一致，你是不是没复刻完」。**复盘结论：只对齐了顶层 IA + 布局骨架（E28），视觉细节与面板内部未逐项复刻** —— 用户判断正确。派 3 个只读调研子代理拿 `文件:行号` 证据的差异清单，再逐条回 Python 真源核实后开工；**3 个并行实现子代理全部被 429 限流打断、零落盘**，主代理接手自写（图标数据改用脚本导出而非手抄，规避转录风险）。
> **① 配色（头号根因）**：TS 默认 **dark + 绿 accent `#0fdc78`**，PyQt 默认「默认」主题是**浅色 + 蓝 `#0EA5E9`**（`main_window.py:116` `current_theme = "默认"`）。改法：令牌按 `themes.py::_THEME_CONFIGS["默认"]` **逐项取值**（bg `#F8FAFC` / panel `#FFF` / border `#E2E8F0` / text `#000` / secondary `#334155` / hint `#556678` / accent `#0EA5E9`+`#0284C7`+`#0369A1` / danger `#EF4444`…），并把机制**反转**：`:root` = 浅色默认、`data-theme="dark"` 为覆盖档（否则 `:root` 与 `DEFAULT_THEME` 会打架）。残余硬编码的 success/warning/danger 全部令牌化（先临时把令牌定义改大写再 `replace_all`，避免自引用）。
> **② 图标**：`shared/lucideIcons.ts` 由 `lucide_icon.py` 的 `_ICON_PATHS`(43 键) / `_ALIASES`(33 键) **脚本导出**（非手抄），渲染参数对齐 `get_icon()`：24×24 viewBox、**stroke-width 2.5**、圆头圆角。`LucideIcon.tsx` 走 `currentColor`（PyQt 每次传死色，TS 交给 CSS 更省）；**未收录图标不渲染**（等价 PyQt 返回空 `QIcon`），不抛错。铺开 12 处：角部件设置/智能体/AI、返回、更多▸、条目表单 AI 生成/编辑类型/引用关系、数据编辑器新建/删除、库条新建/重命名/删除、首页新建。
> **③ 首页 AI 入口卡**（`home_view.py:103-137` + `ceshu_theme.py::ceshu_home_ai_card_qss`）：渐变底 + 白字标题/提示 + 白底强调字按钮。文案与引导前缀**用 AST 提取 Python `guided_text` 逐字比对**（脚本输出 `IDENTICAL: True`）。**通道**：TS 无事件总线 → `CeshuHomePanel → App(aiSeed state) → DigitalPanel(seed prop) → submitText`；effect 内禁止同步 setState（react-hooks v7 error）→ 走微任务回调 + `consumedSeedNonce` 去重（`submitText` 依赖 `running` 会让 effect 重跑，没有去重会重复发送）。
> **④ 表单行改 QFormLayout**：**实测**（`QT_QPA_PLATFORM=offscreen`）QFormLayout 默认 `labelAlignment=AlignLeft`、`formAlignment=AlignLeft|AlignTop`、`rowWrapPolicy=DontWrapRows`；TS 原为上下堆叠 → 改「左标签列 + 右字段列」。标签色改 `--text-secondary`（PyQt `ceshu_form_label_qss` 用的是 `secondary_fg` 不是 `hint`）。
> **⑤ 章节导航项**对齐 `_CollapsibleSection._apply_theme()`：白底 + 1px 边框 + **左侧 3px 强调色竖条** + 10px 圆角；完成度改 **60×6 迷你进度条**（轨道 `border` / 填充 `hint`，**刻意不用强调色** —— 完成度是信息不是行动），百分比移入 `title` + `role=progressbar`。
> **⑥ `.btn.accent-outline`**：`editor_view.py:226-238` 把校验/AI生成/AI数据/更多/导出**全套** `ceshu_editor_btn_export_qss`（强调色描边），TS 原是中性灰描边 —— 这是观感差异的**第二主因**。另 `.btn` 改 `inline-flex + gap` 以承载图标。
> **⑦ 补 `3ead8c4` 的上游接线**：`onShowReferences` **必须先 `setRefTarget` 再开面板**，否则 `openPanel('references')` 的「无目标跳高级搜索」守卫会读到同批次尚未生效的 `null`；`TypeEditorPanel` / `AiDataGenPanel` 加 `initialTypeId` 预选类型（不做假跳转）；「复制」改由 `DataEditorTab` **自持**（重载列表 + 选中副本，对齐 `_on_copy_clicked`），链路少一层。
> **验证（主代理独立复算，非采信自报）**：双端 tsc **0** / eslint **0** / vitest **95 文件 1349 用例** / build OK。**整机渲染证明新增 `render-pyqt-visual.mjs` 20/20**：真读计算样式与盒模型 —— 默认浅色令牌逐项命中、`--accent=#0ea5e9`、AI 卡四段文案逐字、**拦 `agent.chat` 证实引导前缀真投到 AI 面板**、表单行 `labelRight(400) <= controlLeft(410)` 且 top 同为 184（横向非堆叠）、「校验」按钮 color/border 均为 `rgb(14,165,233)`、章节条 `3px`+`60×6`、编辑器主区 `scrollWidth == clientWidth`（无溢出）、深浅切换机制反转正确、无未捕获 pageerror。**回归**：既有 5 个 harness 复跑，并**顺手修掉 3 处陈旧期望**（`render-fixes` / `render-adversarial` 的桩缺 `system_confirmed` 导致被 E28-#3 自动弹窗挡住；`render-toolbar-more` 仍按 13 项收纳菜单断言，而 `ceshu-system-confirm` 已按 PyQt 移出菜单）—— 修后 12/12、16/16、24/24、14/14、4/4 全绿。
> **诚实边界**：① 全部 **51 个 E2E 仍未在真机跑过**（沙箱无 Electron）；② **PyQt「保存」（存整文档 + 清 dirty）与「AI 整章」刻意未跟** —— TS 是章节草稿级、无 dirty 概念，语义不同硬加会误导；③ **章节面板是折叠手风琴、TS 是单击切换 tabs**，属**结构差异**，需重写编辑器布局且会动 51 个 E2E 的导航契约，**留待用户裁决**，本刀只对齐了导航项的视觉；④ 编辑器内 TS 是「导航列 + 表单列 + 预览」三段，PyQt 是「折叠面板列 + 预览」两段（合计宽度一致），属既有 TS 适配，未动。
> **审计数字不变（TS 侧视觉复刻，非 Python 迁移）**。

> ✅ **E31（2026-10-06）：修 E30 引入的 E2E 契约回归 + 章节进度三色 + 旧库字段类型降级兜底，提交 `7850541`**。
> **动因**：E30 之后的差异审计（3 个只读子代理分区块 + 主代理复核）抓出三条，其中**一条是本轮自己引入的回归**。
> **① 回归（我自己引入的）**：章节进度从「百分比文字」改成迷你条后，`tests/e2e/ceshu.spec.ts:63` 的 `expect(combatTab).toContainText('50%')` 会失败（文字被挪进了 `title`）。改为在条内加 `.sr-only` 保留百分比文本 —— 视觉仍是 PyQt 的 `setTextVisible(False)` 形态，文本契约与读屏都保住。**教训：E2E 除了 testid 还有「文本内容」契约，IA 类改动要一并核。**
> **② 注释错误**：我原写「填充刻意不用强调色」，只读了 `_setup_ui` 没读 `set_progress` —— 实际 `chapter_panel.py:149-165` 是**三色阈值**（<50 红 {BT}#e57373{BT} / 50-79 黄 {BT}#fff176{BT} / >=80 绿 {BT}#81c784{BT}）。已实现三色，并与字数统计面板共用新增的 `--progress-low/mid/hi` 令牌（顺手把那 6 处硬编码也令牌化）。**教训：PyQt 真值要读方法体，不能只读初始化。**
> **③ 阻断级隐患**：`typeSchemaFile.ts::parseField` 对未收录控件类型 `throw`，而字段结构文件是 {BT}<库目录>/type_schema.json{BT}、**与 Python 版同构**（`main/stores.ts:71`）。PyQt 独有而 TS 未收录的 {BT}ref{BT} / {BT}textarea{BT} 会让旧库一被读就抛错 → **整个应用打不开、旧数据全部访问不到**。改为降级为 {BT}entry{BT} + `console.warn` 记原始类型（对齐 Python `field_config.py` 的 `else: QLineEdit()` 兜底：永不让控件缺失锁死应用）。同步改掉断言旧行为的单测。
> **④ 清理**：删除 `desktop/electron.vite.config.*.mjs` 构建残留并加进 `.gitignore`（未被跟踪但污染 `git status`）。
> **验证**：双端 tsc 0 / eslint 0 / vitest 95 文件 1350 用例 / build OK；`render-pyqt-visual` 22/22，既有 5 个 harness 全绿。
> **审计数字不变**。

> ✅ **E32（2026-10-07）：引擎导出补齐 Unity / Unreal / Godot / Cocos2d 四个真导出器，提交 `437223c`**。
> **动因（功能性误导，非外观问题）**：`文件 → 导出为 Unity / Unreal / Godot / Cocos2d` 四个菜单项**全都调同一个 `handleEngineExport`，而 `EngineTarget` 只有 `{BT}lua{BT}`** ⇒ 四个菜单项点下去**全都拿到 `.lua` 文件**。PyQt 侧 `features/engine_export.py` 是**四个各自独立**的导出器（`export_to_unity/unreal/godot/cocos2d`），产物扩展名分别是 `.cs` / `.h` / `.gd` / `.json`。
> **改动**：新增 `main/engineExport/engines.ts` 四个纯函数渲染器 + 分桶（`bucketize`，按 `pluralKey` 归桶、缺失回退 `type` 原文不丢数据）+ 五处 IPC 接线（文件对话框的默认扩展名与过滤器随引擎变）。
> **顺手修 PyQt 三处缺陷**（项目规矩：Python 缺陷在 TS 侧修正并记录）：① 对话框承诺「模板 + 实际数据」但三个生成器**只吐类/结构体声明、一行真实数据都没有** → TS 补数据块；② `RoleData` 声明了 `public List<TalentRef> talents;` 却**从未定义 `TalentRef`** —— 生成的 `.cs` **编译不过** → TS 补上；③ Cocos2d 分支只写死 7 个键，**多出来的桶被丢弃** → TS 保留 7 个规范键在最前、其余按名排序追加。
> **顺手修两处陈旧断言**：`engineExportLua.test.ts` 的 AC7/AC9 拿 {BT}'unity'{BT} 当「非法引擎」样本 —— 补齐四引擎后 unity 已是合法目标，换成真正非法的 {BT}'unreal5'{BT} 并**保留原断言语义**。
> **验证**：双端 tsc 0 / eslint 0 / vitest 96 文件 1368 用例（+18）/ build OK；7 个 harness 共 100 条断言全绿。

> ✅ **E33（2026-10-07）：AI 面板补「新建对话」与「草稿管理」，提交 `59c6f5c`**。
> **动因**：PyQt `digital_panel_ui.py:132-159` 标题栏有两个图标按钮，TS 侧都没有入口 —— 清空按钮（`_show_clear_menu`：新建对话 / 清空当前 / 删除全部）与草稿按钮（`_show_draft_menu`：保存为草稿 / 从草稿恢复 / 最近 5 条）。
> **改动**：`shared/agent/session.ts` 加 `DraftFile`/`DraftSummary` + 5 个纯函数（含 `safeDraftFileName`）；`main/agent/sessionStore.ts` 加 `saveDraft`/`listDrafts`/`readDraft`，草稿落 {BT}<userData>/agent/drafts/<名字>.json{BT}，**沿用既有「临时文件 + rename」原子写纪律**；`saveDraft` **从落盘的活跃会话取数据**而非让渲染层传消息（少一次跨进程传输，也避免「渲染层 state 与落盘不一致时存出旧草稿」）；三个 IPC 通道 + 五处接线；`DigitalPanel.tsx` 加两个图标按钮与下拉（复用 `.toolbar-more*` 样式与「点击外部 / Esc 关闭」交互）。**样式坑**：AI 面板在窗口最右侧，下拉必须 `{BT}left:auto; right:0{BT}`，沿用 `left:0` 会顶出屏幕右缘。
> **三处有意不照抄 PyQt**：① 清空菜单**只给一项** —— TS 只有一份活跃会话（`active_session.json`），PyQt 三项语义完全等价，摆三个点下去一样的按钮是假控件；② 草稿存**结构化 messages** 而非 PyQt 的 `QTextEdit.toHtml()`；③ **不写活跃会话** —— 恢复草稿只灌 UI，用户点「恢复上次会话」才落盘。
> **踩坑**：`safeDraftFileName` 最初用正则字符类写控制字符范围，heredoc 把 `\u0000-\u001f` 写成 `*-<0x1F>` —— **反向字符范围，JS 解析期直接 SyntaxError**。改用显式码点判断（`code < 0x20 || code === 0x7f`），并单测锁死「空格与连字符必须保留」。
> **验证**：双端 tsc 0 / eslint 0 / vitest 97 文件 1385 用例（+17）/ build OK；`render-pyqt-visual` 25/25（新增 3 条：两按钮各含内嵌 svg、草稿下拉右对齐不出屏、Esc 关闭）；其余 6 个 harness 共 75 条断言全绿。

> ✅ **E34（2026-10-07）：补 4 类字段控件形态 + 状态栏快捷键提示，提交 `14577df`**。
> **动因与排序依据**：**不照抄审计报告的排序**，先 node 扫 {BT}shared/typeSchema.ts{BT} 得内置 schema **173 个字段的真实类型分布**（combobox 44 / entry 30 / spinbox 17 / desc 14 / tags 14 / multiselect 12 / **template 9 / image 8 / image_desc 7 / image_tags 6** / content 4…），按真实使用量排，本刀覆盖 **38 个字段**。
> **① `template`（9 字段）**：从不可编辑 `<select>` → **可编辑** `<input list>`+`<datalist>`，并选中后**联动写入 `desc`**（PyQt `combo.setEditable(True)` + `_on_template_changed`）。**不猜占位符语义** —— PyQt 的 `_apply_desc_template` 实际就是 `return template_text`（**没做 {BT}{{职业}}{BT} 替换**，是留给子类的钩子），TS 同样只原文写入，免得替换错了悄悄改掉用户数据。
> **② `tags`（14 字段）**：补 placeholder「多个标签用逗号分隔」+ 显式「数组 ↔ 逗号串」转换。**两条路径都要接住**（别以为只有一条）：常见路径是 `buildInitialDraft` 已把数组 `join(', ')` 成**字符串**放进草稿；防御路径是值仍为数组时自己拼。
> **③ `image`（8 字段）**：只读路径框 + 「选择图片」+ **实时预览**（PyQt `_create_image_widget` 的三件套）。**预览走 data URL 而非本地路径** —— 渲染层在 Electron 里是独立来源，直接引用 `C:\...` 会被 `webSecurity` 拦掉，打包后（自定义协议）更读不到任意本地路径，故新增 `dialog:chooseImageFile` 由**主进程代读文件**。8 MB 上限 + 格式白名单，不满足时**给中文原因**而不是留白。预览状态用**派生判断**（`picked.path === 当前字段值`）而非 effect 同步。
> **④ `image_desc`（7 字段）**：单行 → `<textarea>` + `max-height: 60px`（PyQt 是 `QTextEdit` + `setMaximumHeight(60)`）。
> **⑤ 状态栏**：加常驻快捷键提示，但**只列 TS 真实注册的 `Ctrl+Z` / `Ctrl+Y`** —— PyQt 提示含 `Ctrl+S保存`，而 TS 的保存是章节草稿级、刻意不做整文档保存（见 E30 诚实边界②），没有 `Ctrl+S`。**照抄文案等于给一个按了没反应的键做广告。**
> **未做（诚实边界）**：`image_tags`（6）的「自动生成/AI分析」与 `desc` 类（19）的「AI生成/AI生图」按钮（需新增 AI IPC）→ 已在 E36 补齐；`dialog` 字段的「选择对话」弹窗（内置 schema 只用 1 处，优先级最低，仍未做）。
> **验证**：双端 tsc 0 / eslint 0 / vitest 98 文件 1394 用例（+9）/ build OK；**新增渲染证明 `render-field-controls.mjs` 11/11**；既有 7 个 harness 共 103 条断言全绿。
> **harness 踩坑（4 条）**：① **点条目行中心会静默只删不选中** —— 行内「删除」按钮带 `stopPropagation`，行中心正落在它上面，Playwright 视为命中后代**不报错**；② 关注字段都在「描述 & 图片」分区里，而该分区**默认折叠**，不展开量不到；③ **`doc.systems` 是按 key 的字典**（`computeEnabledEditors` 遍历 `Object.entries`），写成 `{BT}{{ items: [...] }}{BT}` 会**静默开不出编辑器标签页**；④ 共享桩 `schema.list` 返回空数组 → 字段全空，形态断言无从谈起，须内联最小 schema。

> ✅ **E35（2026-10-07）：补「游戏数据预览」面板 + Esc 关闭浮层，提交 `7421893`**。
> **动因**：`文件 → 导出 → 游戏数据预览` 一直是 `notImplemented`。**先核实不是死代码** —— grep 到 5 处引用、`menus.py:69` 有真实菜单项（这与 `menus.py:167 setup_agent_toolbar()` 那类死代码不是一回事，值得先分清）。
> **共用逻辑上移**：把 `bucketize` 从 `main/engineExport/engines.ts` **上移到 `shared/dataBuckets.ts`** —— 引擎导出与预览面板需要同一份 `pluralKey` 口径，两处各写一份迟早漂移；`engines.ts` 改为转出，导出面不变、既有测试 import 路径照旧可用。
> **两处有意不照抄 PyQt**：① **不做 50000 字符截断** —— 那是 Qt 单个 `QTextEdit` 的现实约束，`<pre>` 扛得住；截断反而让用户看不到自己数据的全貌，改为在标题显式告知「已渲染全量，未截断」；② **键序按字典序稳定、空桶不出现** —— PyQt 直接倾倒 `data_manager.data`（插入序不稳定 + 一堆空数组）。
> **Esc 关闭浮层**（PyQt `QDialog` 默认行为）：渲染证明抓到的**真交互缺失** —— TS 的浮层是 `div` 不是 `QDialog`，不注册这个键就没有「取消」语义。在 `App.tsx` 加了 panel 非空时监听 Esc → `setPanel(null)`。**这是 PyQt 免费的、我们没有的**。
> **验证**：双端 tsc 0 / eslint 0 / vitest 99 文件 1401 用例（+7）/ build OK；`render-field-controls.mjs` 扩到 **13/13**（从真实菜单路径打开面板 → 断言 `"roles"` 桶与条目名真在文本里、规模摘要、等宽字体、无横向溢出、Esc 可关闭）；其余 7 个 harness 共 103 条断言全绿。
> **harness 踩坑（3 条）**：① 子菜单定位**不能** `.menu-item` + `hasText('导出')` —— 菜单里还有「批量导出」也含「导出」，`first()` 命中它，要用 `.menu-submenu-label` + `hasText(/^导出$/)`；② 面板读 `data.listAll` 而非 `listItems`，只覆盖后者会走空态没有 `<pre>`；③ **bash heredoc 会吃掉中文多字节字符**（本轮咬坏 3 处）⇒ **凡是要写中文进文件，一律用 Write 工具或 python 写**。

> ✅ **E36（2026-10-07）：字段级 AI 辅助按钮（desc 类 19 + image_tags 6 + image_desc 7），提交 `ab2aa09`**。
> **读 PyQt 真源挖出三件按名字猜不到的事**：① `_on_ai_image`（desc 的「AI生图」）**是零能力桩** —— 函数体只有一句 `QMessageBox.information("AI图片生成功能需要配置API密钥")`，不生成任何东西；② `_on_auto_generate_image_info`（image_tags 的「自动生成」）**不调 AI** —— 纯模板 `f'{name}的图片描述'` / `f'{name},图片,游戏'`，按钮名里的「生成」纯属误导；③ `generate_desc_only` 在 `features/_ai_image.py:271`（不在 `features/ai/`），且会弹 `AIGenerateDialog`。
> **四处有意偏差**：① **「AI生图」接真实 `image:generate`** —— PyQt 是桩，照抄就是一枚「点了只弹你还没配 API」的装饰按钮，**违反项目「不放点了没反应的按钮」铁律**；未配 Key 时**如实报错**不假装成功；② 「自动生成」改叫**「自动填充」** —— 语义一致但文案不误导；③ **desc 生成是追加不是覆盖** —— PyQt `setPlainText` 会抹掉用户手写内容；④ 上下文**跳过数组/对象字段** —— PyQt 的 `f"{{value}}"` 会把 `['火','远程']` 喂给模型，TS 跳过并计数说明（**不猜怎么把引用列表描述成句子**），另加单值 200 字 / 单行 260 字 / 20 字段上限防 prompt 爆炸。`buildDescPrompt` 的正文**逐字对齐** PyQt。
> **技术决定**：新增 `llm:generate` IPC，**复用 `main/llm/client.ts` 里已注入的 `llmClient`** —— 刻意不新建第二套模型客户端（踩过坑：该类是 `registerIpcHandlers({{ llmClient }})` 解构注入，自己 `new` 会 tsc 报重复标识符）。
> **单测抓到真 bug**：`mergeImageTagsResult` 对纯空白结果会压成 `,` → 写出「已有, ,」脏值。**改实现不改断言**（切分逐段 trim、剔空段再拼）。
> **验证**：双端 tsc 0 / eslint 0 / vitest 100 文件 1420 用例（+19）/ build OK；`render-field-controls.mjs` 扩到 **21/21**（新增 6 条，含**失败路径**：llm 抛错时就地显示中文原因不弹窗）；其余 7 个 harness 共 103 条断言全绿。
> **harness 踩坑（4 条）**：① **override 层会重跑 `mbApiStub()`** —— 共享桩里加的通道会被擦掉，harness 自己的 `overrides` 里必须再写一份；② **不能对只读框用 `fill('')`** —— Playwright 会重试到超时；③ **AI 断言必须排在「开面板再 Esc 关」那段之前** —— 浮层关掉后编辑器整页被换掉，`field-*` testid 全部查不到；④ python 写 `.mjs` 里的单引号会被吃掉 → 按行号改写。

> ✅ **E37（2026-10-07）：接上「打开/保存/批量导入/批量导出」四个假动作 + 补「关于」「快捷键参考」「清空所有数据」，提交 `7d84338` 与 `3fc07ef`**。
> **动因**：主理人按用户裁决分批清理菜单里的 `notImplemented`。**先逐项 grep 实证 21 项真伪**（不靠子代理转述），结论分四类：
> **① 四个「菜单在骗人」的真接线**：`打开`/`保存`/`批量导入`/`批量导出` 原写 `action:'notImplemented'`（**用户点了毫无反应**），但 `App.tsx:385-410` 的 `handleImportLegacy`/`handleExportLegacy` **早已完整实现**，`dialog:chooseJsonFile`/`chooseSaveJsonFile`（`ipc.ts:176-177`）与 `data:importLegacy`/`data:exportLegacy`（`ipc.ts:496-503` → `main/data/legacyImport.ts:63`）**全都有**，且 TS 侧比 PyQt 严谨（PyQt `features/export.py:168` 无校验直接 append，TS 有 `parseLegacyData` + `skipped` 计数 + 自动刷新）。⇒ **零新能力、零新 IPC、零新对话框**，只差菜单接线。**刻意不抽包装层**（换名字不产生行为差异，违反「不过度开发」）。
> **② ⚠️ 与 PyQt 的四处已知语义差异（如实标注，不靠改文案掩盖）**：PyQt `打开` 是**整库替换**（`core/data_manager.py:382` 直接 `self.data = temp_data`）并记 `current_file`，TS 的 `importLegacy` 是**按 id upsert 合并**；PyQt `保存` 复用 `current_file` 不再问路径，TS 每次都弹另存为；PyQt `批量导入` 是 `features/export.py:188` `item['id'] = dm.generate_id(key)` **每条重生成 id**（重复导入得 N 份副本），TS 保留原 id ⇒ **幂等更新**（有单测锁定）；只有 `批量导出` 与 `export_json` **是同一函数**、映射精确。补齐前两项需新增 IPC（TS 无 `current_file` 概念），**本轮刻意不做**。
> **③ 判定不做**：「工具 → 关系图」是 `RelationTablePanel`（跨类型全库引用表 + 双击跳转），需新写导航逻辑，而条目维度已由 `ReferencesPanel` 覆盖 ⇒ 按「宁缺勿错」不做。
>
> **⚠️ 此条原判断已被证伪并更正（E40，2026-10-07）**：原文把「快速入门」判为 PyQt 死代码，依据是 `main_window.py:1004` 的 `getattr(self,'home_widget',None)` 而 `self.home_widget` 全仓零赋值。**该依据不成立**，三重反证（主代理已逐条 grep 复核）：① `tab_manager.py:91` **确有** `self._mw.home_widget = HomeWidget(self._mw.data_manager, parent=self._mw)`；② 该赋值所在的 `create_tabs()`（`tab_manager.py:87`）由 `main_window.py:148` 在**主窗口构造路径上**调用；③ `ui/widgets/home_widget.py:48` 的 `OnboardingGuide`（到 `:344` 的 `HomeWidget` 共 604 行，`:380` 实例化 `_guide`、`:602` `get_guide()` 正常返回非 None）**是实质实现**。⇒ PyQt 的「帮助→快速入门」**能正常弹出引导窗口**。审计 `migration-audit.md:174` 对该文件判 **⚠️未迁**（整块未迁 `OnboardingGuide` 5 步引导+持久化 / `QUICK_ACTIONS` / 数据概览卡）——**与本条更正后一致**。「快速入门」现归为**真实未迁能力**（TS 侧菜单恒显「尚未在 TS 版实现」），待后续批次裁决是否补迁。**保留原文痕迹以防文档被静默回退**。
> **④ 补三项真缺口**：「关于面板」（PyQt `main_window.py:1043-1053` 静态 HTML；版本号取真实 `app:info` 不硬编码）；「快捷键参考」（PyQt `shortcuts.py:17-52` 共 **35 条**，TS **只注册 3 个** `App.tsx:211-216` ⇒ **只列 3 条**，照抄=给 32 个死键做广告；`Escape` 不列入（交互键非命令键）；清单放 `shared/shortcuts.ts`，单测做**双向守护**（清单→代码 + 代码→清单，防「加了键忘更新面板」））；「清空所有数据」（PyQt `main_window.py:757-768` 有 `QMessageBox.question` 二次确认，TS `data:` 通道原本**无 `clearAll`**）⇒ `DataService.clearAll()`（`service.ts:218`）走 **`listAllItems()` + `deleteMany(ids)`** 而非直写 SQL（**复用 undo 记录 + `enqueueWrite` 串行化**，与 PyQt 走 manager 统一路径一致），`confirm:true` 校验同 `backup:restore`；确认交互照 `BatchEditPanel.tsx:368-394` 内联两按钮态，**显示具体条数**，并**如实告知「未保存草稿会丢失」+「可 Ctrl+Z 找回」**（不是真不可撤销）；刷新用 `dataEpoch` 并入 `DataEditorTab` 的 `key` 强制重挂载，**不新增 refresh 通道**。
> **验证**：双端 tsc 0 / eslint 0 / vitest **102 文件 1430 用例**（+10）/ build OK；自建 `render-newpanels.mjs` **22/22**；既有 8 个 harness 共 124 条断言全绿 + 新面板 22 条 = **146 条**。**主代理独立复算**（非采信子代理自报），并**验证守卫有效**：往快捷键清单注入假的 `Ctrl+S` → 3 个用例如期变红，还原后 6/6 绿。
> **⚠️ 环境变化（后续会话必读）**：本机 {BT}C:/Users/Administrator/AppData/Local/ms-playwright/{BT} **目录已不存在**，9 个 harness 里硬编码的 `chromium-1234/chrome-win64/chrome.exe` **全部失效、直接 THREW**。实证替代：用系统 Edge（`C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe`，同 Chromium 内核）+ `sed` 生成**临时副本**跑，**原 harness 文件一字未改**；新建的 `render-newpanels.mjs` 内置 `resolveChromium()` 兜底。⚠️ `render-adversarial.mjs` 的路径常量名是 `CHROME`（其余是 `executablePath`），批量替换易漏。
> **审计数字不变（本轮仍是 TS 侧补齐，非 Python 迁移）**。

> ✅ **E38（2026-10-07）：浏览器真机预览工具（`desktop/preview/`）+ 修两个「够不着」的面板，提交见 git log**。
> **动因**：沙箱跑不了 Electron（E2E 限制依旧），但用户要求「打开给我看看」。实证渲染层是纯 `window.mbApi` 消费者（grep 无 `electron`/`require`/`process`）⇒ 托管 `out/renderer/` 静态站 + 注入忠实桩即可在真浏览器点真 UI。
> **三个新文件（`desktop/preview/`）**：① `serve-preview.mjs` —— 静态托管 + SPA 回退 + 遍历防护；**所有 `.html` 响应**都注入 `<script src="/stub.js">`（首个版本只在回退分支注入，真 `index.html` 漏桩——curl 自查验出）；因 `index.html` 严格 CSP（`script-src 'self'`）必须用同源经典脚本、且经典脚本同步执行抢在 `type="module"` 之前，桩先于 React 挂载。② `preview-stub.js` —— 忠实 `window.mbApi` 桩：`app.info` 返回 `9.9.9`（**故意 ≠ 硬编码 1.0.0**，防版本号写死回归）；`agent.listTools` 返回 **5 个真实注册技能**（从 `src/main/agent/skills/*.ts` 抄真 id/描述/参数）。③ `shot.mjs` —— Edge（`msedge.exe` 兜底，ms-playwright 目录已消失）逐面板截图驱动，**每面板 fresh goto** 避免浮层状态串台。
> **截图驱出两个真缺陷（不修截图就是假证据）**：① `keywordTemplates` 面板在 `App.tsx` 已接线但**全仓无入口**（union/PANEL_TITLES/renderPanel 都在，MenuBar 没有菜单项）⇒ 补 `menuitem-tools-keywordTemplates`；② **`AgentEditorPanel` 整个是死组件** —— `App.tsx:677` 的 `agentEditor` 动作是 `notImplemented('智能体编辑器')`，`OverlayPanel` union 无 `agentEditor`、`renderPanel` 无 case ⇒ 角部件「智能体」按钮点了**毫无反应**（正是「点了没反应的按钮」铁律禁止的形态）⇒ 五处接线补齐（import + union + `PANEL_TITLES` + renderPanel case + `openPanel('agentEditor')`）。
> **桩的形状 bug（截图内容抓出来的）**：首版 `listTools` 返回裸数组，面板读 `res.tools` 得 undefined ⇒ 显示「调度器当前没有注册任何技能」。对照 `shared/ipc.ts:217` 真契约 `res: { description, tools: [...] }` 修正后，面板如实渲染 5 技能（含风险等级/动作/参数）。
> **验证**：双端 tsc 0 / eslint 0 / vitest **105 文件 1549 用例** / build OK；Edge 截图 **8/8**（home/agent-editor/settings/about/shortcuts/clearAll/keywordTemplates/cleanupImages）**全程 0 console/page error**——这是「渲染层可脱离 Electron 独立运行」的整机证明。
> **审计数字不变（预览工具不触 Python 迁移面）**。

> ✅ **E40（2026-10-07）：补「属性分布图表」真实缺口 + 修「模板管理」入口错位，提交见 git log**。
> **动因**：E38 排查「假入口」时顺带查出两处。① **属性分布图表是真实能力缺口** —— PyQt `features/advanced.py:48` `show_attribute_charts()` 是可用实现（等宽字符条形图 + 统计块），而 TS 侧菜单写 `notImplemented`；审计 `migration-audit.md:310` 把它归为 `advanced.py ◐25%` 的**缺口**、**不是**「有意不迁」，故本轮补齐。② **模板管理是入口错位** —— 能力完整存在于 `TypeEditorPanel`（`te-template`/`te-save-template`/`te-delete-template` 三个 IPC 全通），菜单却写 `notImplemented` ⇒ 改指向既有 `fieldEditor` 动作（**刻意不新建面板、不抽包装层**：换名字不产生行为差异，违反「不过度开发」）。
> **属性分布图表三处刻意偏差（均有实证，非照抄）**：① **属性下拉按 schema 自动发现**（复用 `dataStats.ts:96` `numericFieldNames()`，按 `spinbox` 字段）—— PyQt `advanced.py:82` 写死 `['value','hp','mp','atk','def','level']`，但 TS schema 里这些字段不存在（数值在 `attr_list`）⇒ 照抄必然得到「没有可用数据」的空图，是**能打开但永远空着的控件**（比不做更糟）；② **类型下拉按已注册 schema 列出**（含用户自建类型），不用 PyQt `advanced.py:77` 写死的中文→plural 映射；③ **柱条用 CSS 而非 `█` 字符**（不依赖等宽字体、不受中文名宽度影响），与 `StatisticsPanel` 「不复制 matplotlib 占位符」的取舍一致。
> **键口径坑（差点写错）**：`ItemRecord` 的业务字段在 **`item.data` 下**（`{id,type,data:{name,hp},createdAt,updatedAt}`），与 `dataStats.ts::summarizeNumeric` 读 `item.data[field]` 同口径。首版误写 `row[field]` ⇒ 浏览器实测「图表行数 0」才暴露（单测当时喂的是扁平对象、测不出来）⇒ 已补 **6 条 `ItemRecord` 真实形状**单测锁死。
> **react-hooks v7 约束**：「类型/字段回退到首项」用**惰性派生表达式**（`effectiveTypeId`/`effectiveField`），不在 effect 里 setState（`set-state-in-effect` 是 error）。
> **验证**：双端 tsc 0 / eslint 0 / vitest **106 文件 1574 用例**（+25）/ build OK；Edge 实测：类型下拉 `["职业（roles）","怪物（monsters）"]`、属性下拉随类型自动跟随（`hp/mp/atk/def` ↔ `level/hp/atk`）、职业 hp 分布 `战士320/法师180` 柱宽 `100%/56.25%`、怪物 level 6 条降序（巨龙60→史莱姆1）柱宽 `100%/41.67%/20%/13.33%/5%/1.67%`、统计 avg 250.0 sum 500 —— **全程 0 pageerror**。
> **顺带修**：`eslint.config.mjs` 补 `preview/**` 的 node+browser globals（此前 `preview/` 脚本的 `window`/`console`/`process` 报 16 个 `no-undef`）。
> **审计数字不变（本轮补的是 TS 侧缺口，不改 Python 迁移面）**。

> ✅ **E41（2026-10-07）：迁「AI 配置」基础页 —— 多服务商 LLM 配置真接通（不只是存得下，真调得通）**。
> **动因**：`migration-audit.md:262` 记 `ui/dialogs/api_config.py`（686 行）判 **⚠️未迁**（多服务商配置整块未迁，TS 仅 `MB_OLLAMA_HOST/MODEL` 环境变量）—— 是剩余缺口里**直接影响你换模型服务商**的一项（E40 排查后优先级最高）。**读源码后确认范围**：那 686 行是 4 个 tab，**只有「基础设置」有真实消费者**，故只迁它（刻意收窄，不照搬整页）。
> **消费者实证（判「真缺口」而非「有意不迁」的依据）**：`features/ai.py:43`（`get_config()` 后判 `config.enabled`）、`core/agent/intent.py:434`、`core/agent/skills/code_skill.py:270`、`ceshu_skill_generate.py:25` **都真读** `enabled/api_key/base_url/provider/model/temperature/max_tokens`。
> **三处刻意不做（宁缺勿错）**：① **「模型管理」tab 的自定义模型增删改**（`api_config.py:249-286`+`:478-547`）写的是 PyQt 自己的 `custom_models.json`，而 TS 侧模型清单**来自 Ollama 运行时**（`llm/client.ts` `client.list()`）⇒ 照搬是「能存没人读」的假控件；② **「视觉模型」tab** —— TS 侧无视觉模型消费者（无截图识别/UI 分析链路）；③ **「模板设置」tab** 实为**技能生成模板偏好**（`skill_default_mode`），属策划内容域，混进 API 配置是职责错位。
> **两种传输（不是所有 provider 都走 ollama 协议）**：Ollama 走原生 `/api/generate`（**不回归**）；OpenAI/豆包/Qwen/DeepSeek 走 OpenAI 兼容 `POST {baseUrl}/chat/completions`；**Claude 明确报「暂未接入」并给出原因**（Anthropic Messages API 不兼容 OpenAI 协议，强行发必被拒 ⇒ 不发注定失败的请求、不假装成功）。
> **🔒 安全硬约束不退步（E22/E25 既定）**：**API Key 绝不进 localStorage**。非敏感字段落 `mb.llmConfig`（`shared/llmConfig.ts`，**字段白名单**，写库前 `sanitize` 剔键）；Key 走 `settings:setSecret` → safeStorage 加密盘（`shared/secretNames.ts` 的 `llmApiKey`，**独立于 `mb.` 设置键空间**）；主进程每次调用现取现解密注入 `Authorization` 头，**渲染层永不持有也不回显长期明文**。单测锁死「写库 JSON 里没有 apiKey」+「只写 6 个白名单字段」。
> **配置怎么到主进程（踩坑记录）**：主进程**读不到 localStorage**，而配置刻意存 localStorage ⇒ 沿用 `image:generate` 的既定纪律：渲染层新增 `llm:configure` 把**非敏感镜像**推给主进程（启动/改设置各一次）+ 新增 `llm:status`；`llmCallOptions()` 统一为**全部 5 个 `llmClient.generate` 调用点**注入配置与解密后的 Key（逐点改 schema 属重复劳动，抽一个辅助函数消解）。
> **验证**：双端 tsc 0 / eslint 0 / vitest **108 文件 1614 用例**（+40：`llmConfig` 26 + `llmClient` 协议分流 14）/ build OK；**Edge 实测**：6 个服务商下拉齐全、Ollama 时**不显示** API Key 框、切 OpenAI 自动带出预设 base_url+首个模型、Claude 显示不兼容警示、Key 保存后 **localStorage 扫描 `sk-test-123456` 命中 0 个键**、`llm:configure` 实收 4 次 —— **0 pageerror**。
> **守护测试生效实录**：新增 `SETTINGS_KEYS.llmConfig` 后 `settingsStore.test.ts` 的「防漂移」用例**如期变红**（清单少一键），已同步登记 ⇒ 证明该守卫真的在拦漂移，不是摆设。
> **审计数字更新**：`api_config.py` 686 行从「⚠️整块未迁」降为「◐基础设置已迁 / 模型管理+视觉+模板三 tab 未迁」**（已被下方 E42 裁决覆盖，见 E42）**。

> ✅ **E44（2026-10-07）：补「数据引用概览」—— 非 AI 缺口里价值最高的一条，并修正 PyQt 真 bug**。
> **动因**：E43 复核出的 6 条非 AI 缺口之首。`ui/ceshu/preview_panel.py:102` `_refresh_refs` +
> `common/data_ref.py`（209 行）：策划书正文写 `@data[role.atk]`，面板列出全部引用及其**实时值**，
> 数值改动后不用来回切页核对。新增 `shared/dataRef.ts`（纯逻辑）+
> `ceshu/CeshuDataRefsPanel.tsx` + CeshuView 三处接线（更多▸菜单「数据引用」）。
> **🔧 修正了 PyQt 的真 bug（读源码实测，非臆测）**：`data_ref.py:89` 是 `items = raw.get(type_key)`
> —— `type_key` 来自引用文本的**单数**片段（`@data[role.atk]` ⇒ `role`），但
> `core/data_manager.py:56-59` 的 `self.data` 按 **`schema.plural_keys`（复数 `roles`）**建
> ⇒ **两边对不上，PyQt 里 `@data[role.atk]` 永远解析不到、恒显「未找到」**。
> TS 修正为：先按单数 `id` 归一（条目 `type` 存单数，与 `dataStats`/`attributeChart` 同口径），
> 找不到再按 `pluralKey`（兼容复数写法 `@data[roles.atk]`）。
> **刻意不做「点击跳转数据表」**：PyQt `render_refs_to_html` 有 `data-ref://` 链接可跳表，
> 但 TS 侧 `CeshuView` 不持有跳转处理器（它是**接收**宿主 `App.tsx:159` 的 `jumpTarget`），
> 同层 `FieldDepsPanel` 也没有跳转 ⇒ 凭空加按钮就是「点了没反应的按钮」⇒ 只做只读概览，
> 要跳转需新开 `panel → 宿主 setJumpTarget` 接线（独立立项）。同批不搬 `preview_panel` 的
> `enabled_editors` 动态编辑器半边（另案，`editor_layout.py` 208 行仍缺）。
> **两处语法限制如实记录（对齐 Python，非 TS 缺陷）**：① 正则只认 ASCII 标识符
> （`[a-zA-Z_]`，Python 同）⇒ `@data[角色.攻击]` **整体不匹配**（不是显示为未找到，是根本不当作引用）；
> ② 4 段以上跳过、一段不匹配。
> **浏览器实测抓出的崩溃（已修）**：桩里 `{ id:'skill' }` 无 `pluralKey` ⇒
> `t.pluralKey.toLowerCase()` 抛 undefined ⇒ **整面板白屏**。修复：归一函数对 `id`/`pluralKey`
> 全部空值保护（`norm()`），单测加 2 条脏数据用例锁死。**教训同 attributeChart 那次：
> 运行时数据完整性永远不能信声明，必须实测。**
> **验证**：双端 tsc 0 / eslint 0 / vitest **109 文件 1652 用例**（+38 dataRef）/ build OK；
> Edge 实测：`共 6 个引用（有效 4/6）`、role 分组 `r1.atk=45 / r1.mp=80 / 首条=45 / no_such_id=未找到`、
> `monster.m1.hp=45`、`nope.x=未找到`、中文引用被正确忽略 —— **0 pageerror**。
> **审计**：`preview_panel.py` 222 行由 ⚠️ 降为 ◐（引用概览已迁；`enabled_editors` 动态编辑器半边仍未迁）。

> ✅ **E45（2026-10-07）：补 Toast 非阻塞通知（E43 缺口第 2 条），并清掉一处死状态**。
> **动因**：`ui/components/toast.py`（98 行）在 PyQt 侧有 **9 处真实调用**（`data_tab.py` 的
> `_show_toast`：保存成功 / 删除成功 / AI 生成内容已添加 / 已选择模板 / 已选择参考策划案 …）。
> TS 侧原先只有 `App.tsx:109` 一个全局 `notice-banner`，它有三个毛病：**不会自动消失**、
> **占据布局空间**（把下方面板往下挤）、**只能显示一条**（后一条直接覆盖，前一条语义丢失）。
> **新增**：`shared/toast.ts`（纯逻辑，21 用例）+ `components/ToastHost.tsx` + `styles.css` 的 `.toast-*`。
> **与 PyQt 的三处刻意差异**：① **可多条并存**（上限 3，超出丢最旧）—— PyQt 是单实例覆盖，
> 而 TS 一次操作常连发多条反馈（「已保存」+「已同步」），覆盖会丢信息；
> ② **淡出用 CSS 而非 QTimer 逐帧改 opacity**；③ **位置改右上角**（PyQt 是父窗口顶部居中 +60px，
> 本项目顶部已有菜单栏/浮层头部，放右上更不挡内容）。配色沿用 PyQt 三套语义：
> default=`--bg-panel` / success=`--accent` / error=`--danger`，前景一律 `--btn-text`。
> **技术约束**：用 `useSyncExternalStore` 订阅模块级轻量 store，**不用 effect+setState**
> （react-hooks v7 的 `set-state-in-effect` 是 error）；用模块级订阅器而非 Context，
> 是为了让任意深度组件都能直接 `showToast(...)`，不必造 prop 透传管道。
> **接线的三处（`DataEditorTab.tsx`）**：保存 / 复制（原走 notice-banner，改 Toast）、
> **删除成功（原先删完**完全没有反馈**，补上，对齐 `data_tab.py:526`）**。
> 同时清掉因此变成死状态的 `notice` state 与其 `notice-banner` 渲染（留着就是永远为空的死代码）。
> **⚠️ 本轮验证的诚实边界**：单测 21 条覆盖了自动消失、队列上限、脏时长夹紧、订阅/退订、
> `getToasts` 稳定引用（防 `useSyncExternalStore` 无限重渲染）等**全部逻辑**；
> 并确认 `toast-host` 已进打包产物（JS + CSS 各命中）。但 **未做浏览器实机触发** ——
> `DataEditorTab` 需 `doc.systems` 派生出 `enabled_editors` 才渲染，桩里补 systems
> 会连带触发「确认游戏系统」自动弹窗（改变预览行为），故已回退该桩改动。

> ✅ **E46（2026-10-07）：补图片懒加载/缓存，并修「已保存图片路径不回显」的真 bug（E43 缺口第 3 条）**。
> **动因**：`ui/components/image_loader.py`（324 行）里**真正被消费的是 `LazyImageLabel`**
> （被 `ui/widgets/dynamic_form.py:581/593/747` 用作数据表单 `image` 字段的预览控件）；
> 同文件的 `LazyImageLoader` 在 PyQt 侧**只在退出时 `shutdown_all()`**，不是 UI，不迁。
> **修真 bug**：TS 侧预览只在「本会话刚选过」时显示（`ItemForm.tsx` 旧逻辑 `picked.path === current`），
> 打开**已保存图片路径**的条目时**完全看不到图**。改为 `ItemForm` 的 `image` 字段直接用字段值
> （已保存的绝对路径）渲染 `<LazyImage>`，经主进程 `images:readByPath` 回读 data URL。
> **⚠️ 关键的「读任意绝对路径」决策（与初版相反）**：初版把 handler 限制在「当前库 images 目录内」，
> 但实测 PyQt 的 `_select_image`（:587）**从不拷贝文件**、直接存绝对路径、`load_image(str(value))`（:747）
> 按绝对路径回读 —— 已保存路径就是任意绝对路径。若强限库内目录，反而让修复自相矛盾。
> 故放宽为「读任意绝对路径」，护栏为：必须是绝对路径 / 文件须存在且是文件 / 须是受支持图片扩展名
> （挡掉误读 `.env`/密钥等非图片文件）；这与 `dialog:chooseImageFile` 同款、标准且安全的 Electron 做法
> （仅捆绑代码能经 preload 调，无远程网页）。
> **新增**：`shared/imageCache.ts`（LRU，对齐 Python `MAX_CACHE_SIZE=50` / `100MB` 字节上限 /
> RGBA `w*h*4` 估算 / 双重淘汰；并修正 Python 只按路径作键、改用「路径+尺寸」作键；失败项也落缓存防无限重试）
> + `components/LazyImage.tsx`（占位「无图片」+「加载中…」+ `<img loading="lazy">` + 缓存，用
> `useSyncExternalStore` 订阅模块级 store，不用 effect+setState）。`images:readByPath` 走标准 5 点接线
> （`shared/ipc.ts`→`shared/schemas.ts`→`main/ipc.ts`→`preload/index.ts`→`shared/service/api.ts`）。
> **验证**：双端 tsc 0 / eslint 0 / vitest **111 文件 1702 用例**（+9 imageCache：加载成功 / null / 抛错 /
> 命中幂等 / 失败缓存不重试 / peek 不改 LRU / 订阅广播 等）/ `electron-vite build` OK /
> docsLedger 守卫 7 项全绿（audit 数字已同步：◐ 60/22,813、⚠️ 52/13,368，总 299/91,164）；
> 浏览器实测：应用启动 **0 pageerror**，清理图片面板可达且消费 `images` 通道，
> `images.readByPath` 链路连通且桩返回有效 data URL（证明已保存路径能回显为可渲染 `<img>`）。
> 仍受限于沙箱：无法在预览里打开数据条目编辑器（`doc.systems` 网关），故 `image-lazy` 在编辑器的实机渲染
> 由单测（`ensureCached` 成功/失败/peek）+ 生产构建覆盖，未做编辑器内 E2E。
> 该项目无 jsdom/组件测试设施（vitest `environment: 'node'`），为它加依赖属过度开发。
> ⇒ **Toast 的真实点击效果待真机 E2E 验证**（51 个 E2E 至今未在真机跑过，属既有边界）。
> **验证**：双端 tsc 0 / eslint 0 / vitest **110 文件 1673 用例**（+21）/ build OK。

> ✅ **E47（2026-10-07）：markdown→HTML + 代码高亮迁至数字员工气泡（对齐 Python `chat_renderer.py::render_markdown`）。**
> **动因**：`ui/chat_renderer.py`（172 行）用 markdown 扩展 `codehilite`/`fenced_code`/`tables`/`sane_lists`/`nl2br` 把 AI 消息渲成富文本；TS 侧 `DigitalPanel` 此前把 `message.text` 当纯文本 `pre-wrap` 输出，丢掉全部 markdown 格式与代码高亮。
> **做法**：新增 `components/digital/ChatMarkdown.tsx`（memo 组件），`react-markdown` + `remark-gfm`（tables/sane_lists）+ `remark-breaks`（nl2br）+ `rehype-highlight`（codehilite/fenced_code，highlight.js 语法高亮）渲染 `state.messages` 里 `user`/`assistant` 气泡；不动 `state.streaming` 流式气泡（保留纯文本 `pre-wrap`，避免不完整代码围栏闪烁）。
> **刻意范围收窄**：Python 的 `system`/`error`/`plan` 气泡类型在 TS 状态模型里不存在（`panel.ts` 的 `DigitalMessage.role` 只有 `user`/`assistant`，其余走独立 `error` 字段 / 步骤 UI），故只迁这两类气泡，不新增消息类型；Python 的 `try/except` 兜底在 react-markdown 下不需要（产物是 React 元素、无 XSS、对畸形输入容错），不加错误边界。
> **验证**：双端 tsc 0 / eslint 0 / vitest（含新增 `chatMarkdown.test.ts`：粗体斜体 / 围栏代码 hljs / GFM 表格 / 空文本 null / 单换行 <br>）/ `electron-vite build` OK；docsLedger 守卫（audit 数字已同步：◐ 61/22,985、⚠️ 51/13,196，总 299/91,164）。

> ✅ **E48（2026-10-07）：迁移 `home_widget.py` 引导式主页（5 步引导 + 6 快捷操作卡 + 数据概览卡）至 `OnboardingPanel.tsx`，接上菜单 帮助 → 快速入门。**
> **动因**：`ui/widgets/home_widget.py`（604 行）是 PyQt 的引导式主页 `HomeWidget`：`OnboardingGuide`（5 步引导 + 折叠/关闭/完成度持久化）+ `QUICK_ACTIONS`（6 张快捷操作卡）+ 数据概览卡。TS 侧菜单「帮助 → 快速入门」此前落在 `notImplemented` 占位（`MenuBar.tsx:247`），整块未迁。
> **做法**：新增纯逻辑 `shared/onboarding.ts`（`ONBOARDING_STEPS` / `QUICK_ACTIONS` 常量逐项照搬含 emoji；`load/save/reset` 经 `shared/settingsStore` 落 `mb.onboarding`，逐字段校验容错）+ 渲染组件 `components/OnboardingPanel.tsx`（引导区折叠/关闭/逐步完成 + 快捷操作卡 + 数据概览卡，计数取自 `countByType`）；`App.tsx` 加 `onboarding` 浮层键、`PANEL_TITLES`、`renderPanel` 分支、`quickCreateTarget` 状态与 `handleOnboardingAction` 动作映射（快捷操作卡 → 快速创建/批量创建/关联预览/字段编辑器/策划书/数据设计；5 步全成 → `setTimeout(500ms)` 自动折叠，对齐 Python `QTimer.singleShot`）；`MenuBar.tsx` 把「快速入门」由 `notImplemented` 接到 `onboarding`（`menuitem-help-onboarding`）。
> **刻意范围收窄（宁缺勿错）**：不迁数据概览的「⚙ 管理显示类型」按钮 —— 其唯一消费者 `TypeVisibilityPanel` 在 TS 已随侧栏刻意下线（`App.tsx` 注释明示），PyQt 亦无等价物，概览区改为路由到既有「游戏数据统计」；不接线按 `visible_types` 过滤；`view_relations` 走既有 `references` 入口守卫，无定位目标时如实引导到「高级搜索」而非打开空面板。
> **验证**：双端 tsc 0 / eslint 0 / vitest（含新增 `onboarding.test.ts`：默认/往返/容错/进度/完成/不可变/重置 + 常量 id）/ `electron-vite build` OK；docsLedger 守卫（audit 数字已同步：◐ 62/23,589、⚠️ 50/12,592，总 299/91,164）。

> ✅ **E49（2026-10-07）：代码+文档准确性收口 —— 补评分报告 Markdown 导出（唯一真实功能遗留），修审计 3 处不实陈述 + 清 2 处死/误导入口（§1 数字不变）。**
> **性质**：本片是**代码 + 文档准确性** pass，**不改动 §1/§2 分类计数**（仍 95 / 62 / 92 / 50、总 299 文件 / 91,164 行）。
> **动因**：对「◐ 部分已迁」条目逐条实测复核后确认**无功能级 backlog**，但抓到 3 处审计「自述缺口」与源码不符，且菜单/预览各留 1 处死/误导入口。
> **① 评分报告 Markdown 导出（真实功能遗留，本轮补齐）**：对齐 Python `score_report_dialog.py::_build_markdown`（549-603）+ `_on_export_md`（535-547）。新增纯函数 `shared/ceshuScorer.ts::buildScoreReportMarkdown(gameName, gameType, report, timestamp)`（标题 / meta / 总评 / 章节明细表 / 改进建议 / 同行业对比逐节对齐；完成度 `int(completion*100)`、必填 `齐全` 或 `缺 N`、备注 `; ` 连接、差距带符号）。走标准 5 点接线（`shared/ipc.ts` `ceshu:exportScoreReport` → `shared/schemas.ts` `ceshuScoreExportInputSchema` → `main/ipc.ts` 复用 `exportTextReportFile(...,'评分报告')` → `preload/index.ts` → `shared/service/api.ts`）；`CeshuView.tsx` 评分面板加 `data-testid="score-export"`「导出评分报告」按钮（`chooseCeshuExportFile` → build → `exportScoreReport` → notice / 错误进面板 error，完全镜像 `ChecklistPanel.handleExport`）。新增 `tests/unit/ceshuScoreReport.test.ts`（**真实 `CeshuScoreReport` 形状夹具**，断言各节标题 / 总分等级行 / 表格头与行 / 建议 / 行业行 / 负向差距 / 单元格转义）。
> **② 菜单死入口「平衡性分析工具」**：`MenuBar.tsx` 该条目原 `action:'notImplemented'`（点击报「尚未实现」），改接既有 `action:'stats'`（`testid: 'menuitem-tools-balance'`）打开统计面板的平衡性分析视图——能力早已存在（`StatisticsPanel`），只是菜单没接。
> **③ `ceshu/CeshuDataPreview.tsx` 误导占位**：`showRefs` 分支原渲染「数据引用解析（@data[...]）尚未迁移到 TS 版」**为假**（`CeshuDataRefsPanel` 早已存在且经 `CeshuView`「更多 ▸ 数据引用」可达）。改为**真接线**：给 `CeshuDataPreview` 增 `chapters` 度（宿主 `CeshuView` 单点传入 `doc`，非跨组件 prop-drilling），`showRefs` 标签内直接渲染 `<CeshuDataRefsPanel chapters={chapters} types={types} />`。
> **④ 审计 3 处不实陈述修正（实测翻案）**：`common/common.py` 的 `safe_dict` **在 Python 源中根本不存在**（grep 零命中），`safe_int`/`safe_float`/`safe_str` **仅定义 + 再导出、零业务调用点** ⇒ 非缺口（该文件真实消费者是 `atomic_write_*`/`is_test_env`，已迁）；`menus/shortcuts/tab/window_state` 行原写「撤销/重做 **TS 完全没有**」为误——**已迁**（E27：`data:undo`/`data:redo`/`data:undoState` + `main/data/undoRecorder.ts` + `App.tsx` 按钮与 Ctrl+Z/Y），且清理未用图片 / 多引擎导出 / Lua 导出均已完成；`preview_panel.py` 行的 `enabled_editors` 半边原写「未迁」为误——`ceshu/CeshuDataPreview.tsx` 已实现 `enabledEditors` → `DataEditorTab` 渲染。另在审计 §1 增 `### ◐ 复核（2026-10-07）` 小结（**不改 §1 数字**）。
> **验证**：双端 tsc 0 / eslint 0 / vitest 全绿（含新增 `ceshuScoreReport.test.ts`）/ `electron-vite build` OK；docsLedger 守卫全绿（§1 数字未变：◐ 62/23,589，总 299/91,164）。

> ✅ **E50（2026-10-07）：◐→✅ 重新分类 —— 把实测确认 STALE-DONE 的 11 个文件从「部分已迁」上移为「已迁」。**
> **性质**：文档准确性 pass，**重算 §1/§2 分类计数**（✅ 95→106 文件 / 35,125→38,907 行；◐ 62→51 文件 / 23,589→19,807 行；⛔ 92/19,858、⚠️ 50/12,592 均不变；总 **299 文件 / 91,164 行不变**）。
> **逐文件实测（读 Python 源 + grep TS 对照物）重新分类为 ✅ 的 11 个文件**：`common/common.py`（`atomic_write_*`/`is_test_env` 真实消费者已迁；`safe_*`/`is_number`/`merge_dicts` 等 14 函数 Python 源**零调用点=死代码**）、`ui/window_state.py`（E24 `main/windowState.ts`；从「menus/shortcuts/tab_manager/window_state」捆绑行**拆出**为独立 ✅ 行）、`ui/ceshu/preview_panel.py`（`shared/dataRef.ts` + `ceshu/CeshuDataPreview.tsx`，两半均迁）、`ui/dialogs/statistics.py`（`shared/dataStats.ts` + `StatisticsPanel.tsx`）、`ui/dialogs/template_manager.py`（`main/schema/fieldTemplateStore.ts` + `TypeEditorPanel` 模板存取，比 Python 的残缺语义强）、`ui/chat_renderer.py`（E47 react-markdown 栈）、`ui/components/image_loader.py`（E46 `imageCache.ts` + `LazyImage.tsx`）、`ui/components/toast.py`（E45 `toast.ts` + `ToastHost.tsx`）、`ui/widgets/home_widget.py`（E48 `onboarding.ts` + `OnboardingPanel.tsx`）、`features/export.py`（`csvIO`/`excelIO`/`legacyExport` + `BatchEditPanel`）、`features/advanced.py`（E38–E41 的图表/搜索/关键词/清理/API 全接线）。
> **保持 ◐（实测发现真实缺口，不误判）**：`ui/data_tab.py`（1157 行）—— 核心数据编辑能力（列表/搜索/增删改/复制/类型编辑/引用/AI 生成/撤销重做）均已迁，但 **P5 数量约束软检查 / AI 生成的「参考策划方案·技能模板」选择上下文 / F2·右键重命名** 在 TS 侧经 grep 确缺，未达「完全等价」，故**保持 ◐**（其中 P5 与 F2·右键重命名、条目右键菜单已由 **E51** 补齐，仅剩「技能锚点模板」）。
> **审计同步**：`docs/migration-audit.md` §1 结论表 + 对账行、§2 域表（`ui/` / `ui/ceshu` / `ui/widgets` / `ui/dialogs` / `features` / `common` 六域）的 ✅/◐ 列与合计行、`### ◐ 复核（2026-10-07，E50 更新）` 小节、§3 各文件行（追加 `（E50 重新分类为 ✅：TS 已等价实现，原 ◐ 判定过期）` 标记）均已更新；域表与 §1 的既有小差异（**`±2 文件 / 480 行`**）保持不变。
> **验证**：`tests/unit/docsLedger.test.ts` 的 §1↔roadmap §2 四类数字一致断言 + 对账（299/91,164）全绿；`REQUIRED_ROADMAP_MARKERS` 增 `'E50（2026-10-07）'`。

> ✅ **E51（2026-10-07）：`ui/data_tab.py` 残留缺口收口 —— P5 数量约束软检查 + F2/右键重命名 + 条目右键菜单（§1 数字不变）。**
> **性质**：代码 pass，**不改动 §1/§2 分类计数**（`data_tab.py` 仍为 ◐ —— 还剩「技能锚点模板」一项，未达完全等价；仍 106 / 51 / 92 / 50，总 299 文件 / 91,164 行）。
> **动因**：E49/E50 复核把 `data_tab.py` 的三条残留如实留下，本轮把其中两条**无设计分歧**的补齐（第三条触及 AI 生成提示词与 IPC 契约，属设计裁决，不动）。
> **① P5 数量约束软检查**（Python `data_tab.py:370-432`）：新增纯逻辑 `shared/dataCountConstraint.ts` —— `countLimitFieldNames`（顺序照抄 Python 字面量 `count` / `<type>_count` / `max_count` / `total_count`）、`resolveCountLimit`（只认整数值或十进制整数字符串，非法值**跳过继续试下一个字段**；与 Python 一致的只有「字段优先级 / 非法值 continue / ≤0 不算约束」三点，**另有 4 处有意偏离并已逐例实测对照**，见审计「E51 数量约束：对 Python 的有意偏离」小节 —— 前 3 处（布尔、`'1_0'`/全角数字、`3` vs `3.0`）在策划书第五章的字段形态下不可达，第 4 处是刻意统一 `data_type ?? key` 口径）、`findCountConstraint`（只取**第一个** `data_type` 命中的系统，命中但上限 ≤0/非法 ⇒ 不约束）、`exceedsCountConstraint`（`current >= limit` 才拦，对应 Python `current < limit` 才放行）、`buildCountConstraintMessage`（文案逐句对齐 QMessageBox 正文）。`ceshu/CeshuDataPreview.tsx` 用 `findCountConstraint(chapters?.systems, activeEditor.data_type)` 解析后作为 `countConstraint` 度下发给 `DataEditorTab`；`handleCreate` 在**已满**时先渲染行内确认横幅（`.count-warning`：继续创建 / 取消），确认后复用同一落盘路径 —— 不引入任何原生对话框（Electron 渲染层无 `window.prompt`，且 `window.confirm` 无法在 vitest 中断言）。
> **② F2 / 右键「重命名」**（Python `data_tab.py:108-111, 542-561`）：`shared/dataTableOps.ts` 新增 `withRenamedName`（去首尾空白；空白名视为取消返回 null，同 Python `if ok and new_name.strip()`；不修改入参）。`DataEditorTab` 新增 `renamingId`/`renameDraft`：F2 键绑在 `.list` 容器上（该容器加 `tabIndex={0}`，语义等价于 PyQt 的 `WidgetShortcut`，**不会**在搜索框里误触发），右键菜单「重命名」亦进入同一路径；提交走既有 `data:updateItem`，Enter 提交 / Esc 取消 / 失焦提交。
> **③ 条目右键菜单**（Python `ui/components/virtual_list.py:217-231`）：`DataEditorTab` 新增 `row-context-menu`，四项**同序**：重命名 / 编辑 / 复制 / 删除（复制 = 以列表项为准、剥离 `id` 后 `data:createItem`，对齐 `_on_copy_clicked`）。`VirtualListWidget` 全仓真实消费者只有 `data_tab.py` ⇒ 该组件随本轮可视为已迁。
> **刻意不跟（已写入审计 §4）**：列表上的 **Delete 键**（PyQt 先弹「确定要删除这个项目吗？」，而 TS 现有删除按钮是**无确认直删** —— 加退格键会变成一键误删）；AI 生成的**「技能锚点模板」选择上下文**（TS `AiDataGenPanel` 走策划书驱动的另一种设计，Python 的「参考策划方案」一项已被取代，但角色/怪物/装备锚点仍是真实缺口，需先裁决）。
> **审计同步**：`migration-audit.md` §1「仅有的真实遗留」第 2/3 条 + `### ◐ 复核` 的 genuine-partial 行 + §3 `data_tab.py` 行均已改写为 E51 后的状态；并新增 `### E51 数量约束：对 Python 的有意偏离（逐例实测对照）` 小节（把 4 处偏离连同 `python -c` 真跑值列表存档）。**§1 结论表与对账行数字未动**（`data_tab.py` 保持 ◐）。
> **端到端契约网**：新增 `tests/e2e/data-count-constraint.spec.ts`（2 例：上限拦截的取消/继续、右键菜单四项 + 重命名去空白 + F2 空白名取消）；为让 spec 能写上限，`tests/e2e/helpers/ceshuData.ts` 的 `SeedSystem` 增可选 `config`（默认 `{}`，**既有 51 个 spec 的播种结果逐字不变**）。此前 helper 恒播 `config: {}` ⇒ 数量横幅在 E2E 里永不触发，等于新代码没有端到端网。**该 spec 本沙箱跑不了 Electron，期望值取自 `desktop/preview/verify-e51.mjs` 在真实 Chromium 上跑通的同一组断言**。
> **健壮性**：`.row-context-menu` 原样用 `clientX/clientY` 定位，贴右/下缘会出界被裁 —— 改为事件触发时按当前视口 clamp（`CONTEXT_MENU_*` 常量 + 8px 边距）。
> **验证**：双端 tsc 0 / eslint 0 / vitest 全绿（115 文件 / 1756 测试，含新增 `tests/unit/dataCountConstraint.test.ts` 15 例 + `dataTableOps.test.ts` 增 3 例重命名）/ docsLedger 守卫全绿；渲染面由独立验证者用真实 Chromium 实证 5 条交互路径（33/33 断言）+ 菜单 clamp 夹取，契约面静态复核 51 个 spec 无回归；`REQUIRED_ROADMAP_MARKERS` 增 `'E51（2026-10-07）'`。

> ✅ **E52（2026-10-07）：条目行点击落点修复 —— 窄列下「点行中心 = 误删」+ 举证守卫；同批落盘 Python 侧一轮先前未提交的 UX 简化。**
> **性质**：TS 渲染层健壮性修复 + 可复现守卫；**不改动 §1/§2 分类计数**（仍 106 / 51 / 92 / 50，总 299 文件 / 91,164 行）。
> **动因**：E51 的渲染侧独立验证者报告——预览面板列窄时条目行只有 160px，行的**几何中心落在「删除」按钮上**，其 T5 用例第一次因此**误删**而非选中。属既有缺陷（E51 未引入），本轮修掉。
> **实测根因**（新增 `preview/measure-row.mjs`，用 `document.elementFromPoint(行中心)` 判落点，不靠读 CSS 推理）：`.ceshu-preview .list-column` 固定 `flex: 0 0 200px` + `.list` 左右各 20px 内边距 ⇒ 行 **160px**；默认布局里删除钮占 **74.7px（整行 47%）**、名称被压到 **18.7px**（「技能 1」文本需 40px，已截断），`elementFromPoint(行中心)` 命中 **`ceshu-data-delete`**。
> **修法**（全部限定在 `.ceshu-preview .item-row` 作用域）：① 删除钮文本包进 `.btn-label` 并在窄列 `display:none` ⇒ 收成 **26px 图标**（按钮本体与 `data-testid="ceshu-data-delete"` 均保留，`smoke.spec.ts:84` 的 `getByTestId(...).click()` 照旧可用；补 `title`/`aria-label` 保可访问性）；② `.item-meta`（8 位短 id）`display:none` 让位给名称（行 `title` 与右侧条目表单仍可读到 id）；③ `.item-name { min-width: 64px }` 兜底；④ 删除钮 `padding: 4px 6px`。
> **效果（实测三档视口 wide-1440 / mid-1100 / narrow-900）**：名称 18.7px → **92px**（不再截断）、删除钮 74.7px → **26px**、`elementFromPoint(行中心)` 由 `ceshu-data-delete` 变为 **`ceshu-data-item-row`**（= 选中该条目）。
> **守卫有效性已用「已知坏版本」验证**（本仓库铁律，不做橡皮图章）：`preview/measure-row.mjs` 已升级为**断言脚本**（行中心命中删除钮即退出码 1）；把 `styles.css` 退回 E51 提交版重跑，wide / mid 两档**如实报失败**（名称 18.7px、命中 `ceshu-data-delete`），恢复修复版后全部通过。E51 的 41 条渲染断言复跑仍 **41/41**（无回归）。
> **遗留（未修，属另一既有问题）**：视口 ≤900px 时 AI 停靠栏会叠在预览面板之上，行取不到点（`elementFromPoint` → `digital-panel`）。与本条无关，本轮不处理。
> **同批落盘（另一件事，Python 侧）**：Python 应用（迁移的权威源）有一轮**先前完成但从未提交**的 UX 简化（对应 `CHANGELOG.md` 的 2026-09-16 条目 + `docs/ux-simplification-plan.md`），本轮实测核实后一并提交：**pytest 839 passed / ruff 全绿 / mypy 299 文件 0 错误**，与其文档自述**逐项一致**（此前 3 周一直躺工作区，有静默丢失风险）。
> **⚠️ 待核（E53 已复核，见下条）**：上述 Python 轮次里有 3 项**在 TS 侧是否已有等价物尚未逐项核对** —— `data_tab.py` 的「更多 ▾」按钮分组、`ceshu/chapter_forms/_base.py` 给「主要用户」补的 `ai_path` AI 生成钮、`ceshu/preview_panel.py::focus_first_editor()`。**E53 复核结论：①多数已迁（缺「参考策划方案」项）②确缺 ③已迁。**
> **验证**：双端 tsc 0 / eslint 0 / vitest 115 文件 1756 用例全绿 / `electron-vite build` OK / docsLedger 守卫全绿。

> ✅ **E53（2026-10-07）：复核 E52 遗留的 3 项「TS 等价物待核」+ 更正审计一处自相矛盾（不改 §1/§2 计数）。**
> **性质**：文档准确性 pass（复核 + 纠错），**不动 §1/§2 分类计数**（仍 106 / 51 / 92 / 50，总 299 文件 / 91,164 行）；不新增产品代码。
> **逐项实测结论**（读 Python 真源 + grep TS 对照物，不按名字臆测）：
> 1. **`data_tab.py`「更多 ▾」按钮分组 = 多数已迁**。`ItemForm.tsx:987–1044` 有 `toolbar-more`/`toolbar-more-menu`/`item-form-more-edit-type`/`item-form-more-references`，docblock 明写「对应 PyQt data_tab 的 more_btn 菜单」，已收纳 PyQt 三项中的 2 项（编辑当前类型字段结构 / 查看此项的引用关系）。**但第 3 项「参考策划方案 / 模板」无 TS**（PyQt `_planning_action` → `_on_select_planning`/`_on_select_template`）：实测 TS 侧 `planning_docs_v3` / `selected_planning_doc` / 技能归属模板选择**零命中**，而 Python 侧是活代码（`data_tab.py:648-657` 用 `selected_planning_doc` 拼 AI 提示词：游戏理念/世界观/玩法）。⇒ 这正是 `data_tab.py` 维持 ◐ 的那条残留（E50/E51 已记）。
> 2. **`_base.py` 的 `ai_path` = 确缺**（原「已做」判定是错的，见下段纠错）。`ai_path` 不是「某个字段的标注」，而是 **F1 章节表单按字段 AI 填充**整条机制：`ai_field_button.py`(78 行) → `_common.py::_add_row(…, ai_path)` 建 `AIFieldButton` 并打 `ai_field_path` 属性 → `apply_ai_content_to_form` 回填 → 信号链 `chapter_panel.py:262-265` → `editor_view.py:210` → `editor_view_mixins.py:56 _on_ai_fill_field` → `_AIFillFieldWorker`。调用点 **111 处**（`_base.py` 32 / `_industrial.py` 79；如「主要用户」= `vision.user_personas.primary`）。TS 侧 `ai_field_path`/`AIFieldButton`/`ai_fill_requested`/`apply_ai_content`/`aiFieldPath` **全部零命中**；`shared/ceshuAi.ts` 只有整章 `buildChapterPrompt`。
> 3. **`preview_panel.py::focus_first_editor()` = 已迁**。`ceshu/CeshuDataPreview.tsx:63-66,86-106`：`jumpEditor` 命中即覆盖 activeKey、`targetNonce` 支持重复跳转同一类型、未命中回落 `onJumpMissed`、`enabledEditors.length===0` 走空态；docblock 已显式标注对齐 `focus_first_editor`。
> **⚠️ 本轮更正的审计自相矛盾（这才是本次的真实缺陷）**：审计顶部「翻案」表原写 `ui/dialogs/ai_field_button.py` 78 行「字段级 AI 无 TS」= **已做**，证据 `ItemForm.tsx:751,799` —— 该判定有**三处错**：① **路径误写**（`ui/dialogs/` 不存在；真身 `ui/ceshu/ai_field_button.py`，全仓仅此一个 78 行同名文件）；② **证据张冠李戴**：`ItemForm.tsx:751/799` 是**数据条目表单**的字段 AI（`FieldAiAssist`：`generateDesc`/`generateImage`/`analyzeImageTags`，即审计顶部 AI 横幅里那条第 4 项 `llm:generate` 字段级按钮 —— **已迁且在用，重写框架时必须保留**），**不等于**章节表单的 `ai_path`；③ 与 §3.2 的 `ai_field_button.py | ⚠️` 行、`editor_view_workers.py | ◐50% 单字段填充 _AIFillFieldWorker 无对应` 行**直接打架**。已按实测更正为「**翻案不成立 ⇒ 维持未迁**」并补 §3.2 依据（含 111 处调用点 + 完整信号链实证）。
> **未做（刻意，等裁决）**：**不移植** F1 字段级 AI 填充，也不补 `data_tab.py` 的「参考策划方案」残留。理由：二者整条依赖 AI 能力链，而主理人已裁决 AI 框架**重写**（audit 顶部 E42 横幅）；此刻 1:1 移植 111 处调用点 = 极可能白做，属过度开发。
> **§3.2 依据同步**：`_common.py` / `_base.py` / `_industrial.py` 三行**仍标 ✅**（本审计粒度是「文件」，其表单构建确实已迁；§5 已声明同一文件内功能可处于不同迁移态），但各加一句 E53 补充指向未迁的 `ai_path` 机制，避免读者误判整文件零缺口。**若主理人认为应按「机制粒度」把这些文件降为 ◐，需同步改 §1 + §2 + roadmap §2 三处计数 —— 本轮未动，不擅自改数。**
> **验证**：docsLedger 守卫全绿（§1 四类仍 106/51/92/50，合计 299 文件 / 91,164 行；两文档 `^## ` 各 6；E42/E43 横幅标记在场）；双端 tsc 0 / eslint 0 / vitest 115 文件 1756 用例全绿（无代码改动，回归确认）。`REQUIRED_ROADMAP_MARKERS` 增 `'E53（2026-10-07）'`。

> 🔴 **E42（2026-10-07）：主理人裁决 —— `core/agent` 停止 1:1 迁移，改为「AI 框架重写」**。
> **主理人原话**：「**ai 那边就不搞了。框架可能要重写**」。
> **决策落地（写入 `migration-audit.md` 顶部横幅 + 本条，作为跨会话唯一事实源）**：
> `core/agent` 域剩余 **33 文件 / 8,419 行「⚠️未迁」全部不再计入迁移欠债**（记忆向量检索 883 行、
> `learner` 学习闭环 543 行、`intent` 意图解析 718 行、`mcp` 客户端 391 行、团队 CRUD 818 行、
> `model_registry` 186 行、自愈链 4,166 行〔本就刻意不迁〕）。
> **⇒ 剩余量口径变更**：「≈2.4–2.8 万行 / 26–31%」**应扣除 core/agent 未迁部分** ⇒ 编辑器侧真实剩余 ≈ **1.4–1.7 万行**。⚠️ **该数字待重跑审计后更新，本轮不伪造统计**。
> **🔑 必须区分两类 AI 能力（否则重写会误伤在用功能）**：
> - **要重写**：Agent 框架本身（brain / dispatcher / skills / 记忆 / 意图那套自主决策循环）。
> - **必须保留**：**LLM 调用能力** —— 被 **4 个非 Agent 功能**真实消费且**不依赖框架**：
>   `schema:suggestFieldIds`（字段 ID 建议）、`ceshu:aiGenerateData`（策划书数据生成）、
>   `ceshu:aiReview`（策划书审查）、`llm:generate`（字段级 AI 按钮）。它们经
>   `main/llm/client.ts`（E41 两种传输）**绕开 brain/dispatcher 直接调 LLM**。
> **现有 Agent 资产实测（重写时的输入，非裁决）**：`shared/agent/` **1,564 行**（brain 420 / protocol 472 /
> panel 255 / session 167 / operationLog 100 / personalization 75 / prompts 44 / memory 31）+
> `main/agent/` **1,187 行**（dispatcher 233 / sessionStore 183 / brainService 165 / ollamaTransport 139 /
> preferenceStore 131 / operationRecorder 123 / operationLogStore 96 / memoryStore 64 / approvalBroker 53）
> + skills 5 个 + **12 个 agent 单测文件**。
> **耦合面实测很窄**（这是「重写成本可控」的实证依据）：仅 **2 个渲染组件**（`DigitalPanel` /
> `AgentEditorPanel`）+ **28 个 IPC handler** 依赖 agent 层，**不渗进数据/策划书内核**
> ⇒ 拆掉重写不会牵动编辑器主体。
> **守卫**：`tests/unit/docsLedger.test.ts` 新增标记 `E42（2026-10-07）` + `停止 1:1 迁移`，
> 防止该裁决被文档回退静默抹掉。

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
