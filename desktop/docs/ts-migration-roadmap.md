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
> | ✅ 已迁 | 84 | 32,993 | 36.2% |
> | ◐ 部分已迁 | 64 | 23,203 | 25.5% |
> | ⛔ 有意不迁（决策，非欠债） | 84 | 16,851 | 18.5% |
> | ⚠️ **未迁（整块没做）** | **67** | **18,117** | **19.9%** |
>
> 对账 PASS：`84+64+84+67 = 299` 文件、`32993+23203+16851+18117 = 91,164` 行。
>
> **结论：真实剩余 ≈ 3.0–3.4 万行（33–37%）** —— 而不是早前口头估算的「3.5–4.5k 行（4–5%）」。那句估算**口径过窄**（把 `ui/widgets`/`ui/dialogs`/`features` 三个混合态域当成了基本迁完）且未做文件级核实，**已被本审计推翻**。
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
