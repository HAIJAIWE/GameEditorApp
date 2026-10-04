# Py → TS 迁移审计（文件级，2026-10-04）

> **本文把「还剩多少」从估算变成可复核的数字。结论与我 2026-10-04 早前在 roadmap §2 里写的「剩余 ≈3.5–4.5k 行（4–5%）」**严重不符** —— 那句话是**下限估算且用错了口径**（把三个混合态域当成了基本迁完）。真实剩余见下。

## 1. 结论

**总计 299 文件 / 91,164 行**（`src/` 下全部 `.py`，不含 `__pycache__`）。

| 判定 | 文件 | 行数 | 占比 |
|---|---|---|---|
| ✅ 已迁 | 84 | 32,993 | 36.2% |
| ◐ 部分已迁 | 65 | 23,614 | 25.9% |
| ⛔ 有意不迁 | 84 | 16,851 | 18.5% |
| ⚠️ 未迁（整块没做） | 66 | 17,706 | 19.4% |

**对账（必须相等，已 PASS）**：`84+65+84+66 = 299` ✓、`32993+23614+16851+17706 = 91,164` ✓

### 真实剩余 ≈ 3.0–3.4 万行（33–37%）

- **确定未迁（整块没做）＝ 17,706 行 / 66 文件**（精确数字）
- **部分已迁里的缺口 ≈ 1.0–1.4 万行**（**估算**：按各文件的完成度估计汇总，各代理给的完成度多在 25%–75%，本身带主观性）
- 合计 **≈ 3.0–3.4 万行**，占旧代码 **33–37%**

> **口径说明**：不能把「⛔有意不迁」的 16,851 行算成欠债 —— 那些是**决策**（自愈链 5,372、样例数据 1,125、PyQt 胶水、死代码等），各有实证依据。
> 但也不能把「◐部分已迁」算成已迁 —— 那 23,614 行里有一部分是真缺口。

## 2. 汇总（按域）

| 域 | 文件 | 行数 | ✅已迁 | ◐部分 | ⛔不迁 | ⚠️未迁 |
|---|---|---|---|---|---|---|
| `core/agent` | 97 | 24,670 | 8 / 1,689 | 23 / 6,752 | 33 / 7,810 | 33 / 8,419 |
| `ui/ceshu` | 35 | 14,620 | 25 / 12,123 | 5 / 1,834 | 3 / 363 | 2 / 300 |
| `ui/widgets` | 24 | 9,232 | 11 / 4,966 | 5 / 1,882 | 6 / 962 | 2 / 1,422 |
| `ui/` 顶层 + `themes` + `components` | 31 | 9,883 | 4 / 917 | 9 / 4,748 | 7 / 1,029 | 11 / 3,189 |
| `core/ceshu` + `core` 顶层 + `defaults` | 38 | 12,602 | 27 / 10,840 | 2 / 225 | 8 / 1,248 | 1 / 289 |
| `ui/dialogs` | 20 | 6,055 | 3 / 1,116 | 8 / 2,665 | 4 / 487 | 5 / 1,787 |
| `common` + `config` + `security` + `data` + 顶层 | 45 | 10,672 | 5 / 1,187 | 7 / 2,776 | 22 / 4,892 | 11 / 1,817 |
| `features` | 9 | 3,430 | 0 / 0 | 6 / 2,732 | 1 / 60 | 2 / 638 |
| **合计** | **299** | **91,164** | **82 / 32,295** | **62 / 22,286** | **84 / 16,851** | **71 / 19,732** |

**三个最值得注意的域**：
1. **`core/agent`（最大域，24,670 行）→ 只有 8 个文件（1,689 行）是完整已迁**，34 个文件（8,962 行）整块未迁。A 档做的是「核心闭环」，不是「整个 Agent 引擎」。
2. **`ui/` 顶层 + 主题（9,883 行）→ 仅 917 行完整已迁**，主题/特效/菜单/多标签/窗口状态整块未做（多为 C 档，但那是**决策**还是**欠债**需区分：主题≠核心功能）。
3. **`ui/dialogs`（6,055 行）→ 仅 573 行完整已迁**，8 个文件（3,115 行）整块未迁（API 配置、备份、快速创建、设置、统计、字段模板、类型可见性、数据对比）。

## 3. 逐文件明细

判定口径：**✅已迁**（TS 有明确对应物）/ **◐部分已迁**（写清已迁什么、缺什么）/ **⛔有意不迁**（死代码 / PyQt 胶水 / 已决策不做，须实证）/ **⚠️未迁**（找不到对应物且非有意不迁）。

### 3.1 `core/agent`（97 文件 / 24,670 行）

| 文件 | 行数 | 判定 | 依据 |
|---|---|---|---|
| skill_protocol.py | 107 | ✅ | `shared/agent/protocol.ts`（SkillProtocol/checkPermission/resolveRiskLevel/toJsonSchema） |
| brain_llm.py | 474 | ✅ | `shared/agent/brain.ts::runBrainLoop` + `main/agent/ollamaTransport.ts` |
| brain_session.py | 248 | ✅ | `shared/agent/session.ts` + `main/agent/sessionStore.ts` |
| ask_user_skill.py | 130 | ✅ | `main/agent/skills/askUserSkill.ts::createAskUserSkill` |
| code_skill.py | 349 | ✅ | `main/agent/skills/codeSkill.ts`（QuickJS 沙箱替换 subprocess+黑名单） |
| ceshu_agent_router.py | 74 | ✅ | `shared/ceshuAi.ts::agentForChapter` |
| ceshu_style_helpers.py | 106 | ✅ | `shared/ceshuAi.ts::STYLE_GLOSSARIES/getStyleGlossary` |
| ceshu_skill_prompt.py | 201 | ✅ | `shared/ceshuAi.ts::buildChapterPrompt/buildChapterOrder/buildMetaSeed` |
| brain.py | 130 | ◐50% | 门面→`brainService.ts`；intent/learner/plan/reflect/subagent/plugin/perf 装配未迁 |
| brain_prompt.py | 294 | ◐30% | `shared/agent/prompts.ts` 仅骨架；persona/画像/长期记忆/黑板未迁 |
| dispatcher.py | 585 | ◐70% | `main/agent/dispatcher.ts`；MCP/SubAgent/`execute_parallel` 未迁 |
| frontend_snapshot.py | 480 | ◐35% | 内省约 300 行为 PyQt 胶水；库信息→`library/manager.ts`、危险确认→`approvalBroker.ts` |
| memory.py | 80 | ◐25% | 门面→`shared/agent/memory.ts`+`memoryStore.ts`（仅嵌入/检索/写入） |
| memory_context.py | 136 | ◐25% | `brainService.ts` 注入「## 相关记忆」；项目记忆/上下文块未迁 |
| memory_embedder.py | 114 | ◐ | `shared/agent/memory.ts::embedText`（32 维确定性；原 ngram/TF-IDF bug 不复刻） |
| memory_index.py | 74 | ◐ | vectra `LocalIndex`（`memoryStore.ts`） |
| memory_search.py | 231 | ◐ | `memoryStore.ts::search(topK)`；多路召回/去重未迁 |
| memory_store.py | 195 | ◐ | `memoryStore.ts` add/count；反馈/偏好持久化未迁 |
| memory_vector.py | 271 | ◐ | 自研向量→vectra 替代 |
| models.py | 52 | ◐ | `SkillResult`/`SkillExecutionContext`→`protocol.ts`；`FeedbackRecord`→`shared/agent/personalization.ts`；Intent/MemoryEntry 未迁 |
| prompts.py | 598 | ◐30% | `shared/agent/prompts.ts` 仅骨架；USER_AGENTS/TEAM_AGENTS/STEWARD_BASE_PROMPT 未迁 |
| safety_guard.py | 154 | ◐50% | `protocol.ts` 风险分级 + `approvalBroker`；token 裁剪/工具替代建议未迁 |
| semantic_memory.py | 233 | ◐ | ChromaDB→vectra 重设计 |
| workspace.py | 227 | ◐40% | →`main/library/*` + `<库>/agent`；persona/多工作区未迁 |
| skills/ceshu_skill.py | 138 | ◐ | `ceshuSkill.ts`；`ai_*` 动作未接 |
| skills/ceshu_skill_data.py | 120 | ◐ | CRUD 已迁；`import` 未迁 |
| skills/ceshu_skill_generate.py | 684 | ◐55% | `ceshuAi.ts`+`ceshuDataGen.ts`；`ai_fill_field`/`analyze_description` 无 TS |
| skills/ceshu_skill_review.py | 299 | ◐50% | review 维度+`AiReviewPanel`；`ai_review_full`/系统推荐应用未迁 |
| skills/common.py | 106 | ◐ | `protocol.ts::inferAction/fixParams`+`dispatcher.ts` 归一 |
| skills/game_data_skill.py | 1008 | ◐45% | `gameDataSkill.ts`（list/query/create/update/delete）；batch/switch/统计未迁 |
| __init__.py / brain_state.py / memory_state.py / ceshu_skill_state.py | 41+197+147+79 | ⛔ | 包 re-export 胶水 + 类型桩（自述「不承载运行时代码」） |
| code_sandbox.py | 237 | ⛔ | 死代码（全仓仅自身命中）；`security/sandbox.py` 另有同名类 |
| i18n.py | 107 | ⛔ | 死代码：`AgentI18n` 无 import/调用点 |
| agents/identity_manager.py | 143 | ⛔ | 死代码：`IdentityManager` 无消费者 |
| perf_dashboard.py / plugin_system.py | 55+177 | ⛔ | A1 已明确「不移植」（perf 面板 / 插件钩子） |
| skills/diagnosis_skill.py | 150 | ⛔ | 依赖 `tools/tool_repair`，随自愈整体砍 |
| skills/editor_layout_skill.py | 184 | ⛔ | E5 实证：`editor_layouts.json` 能写无人读 |
| diagnostics/（14 文件） | 4,166 | ⛔ | 自愈改写源文件无原子回滚，立项已砍；`llm_healer` 名不符实 |
| tools/tool_repair.py | 1,206 | ⛔ | 明确不迁（`tool_repair.py:786-792` 无原子回滚改写源文件） |
| tools/tool_advanced.py | 856 | ⛔ | 仅被 `diagnosis_skill.py` 消费，属自愈链 |
| tools/tool_shared.py + 5 个 `__init__.py` | 12+53 | ⛔ | 辅助常量 / 包 re-export |
| brain_plan.py | 287 | ⚠️ | 计划驱动执行，A1-2 明确不移植 |
| brain_reflect.py | 108 | ⚠️ | 失败反思，A1-2 明确不移植 |
| brain_subagent.py | 67 | ⚠️ | SubAgent 通道，A1-1 明确不移植 |
| intent.py | 718 | ⚠️ | 规则意图解析+Planner，TS 无 |
| learner.py | 543 | ◐ | **偏好/反馈子集已迁**：`shared/agent/personalization.ts`（extractPreferences/buildPersonalizedContext）+ `main/agent/preferenceStore.ts`（PreferenceStore/FeedbackStore）+ `brainService.ts` 注入系统提示词 + `agent:feedback` IPC；**未迁**：动作计数/转移矩阵、下一步建议、时间峰值、技能模板自动生成（依赖 TS 没有的 `Intent`/`BrainState`，属过度设计，有意不迁） |
| mcp.py | 391 | ⚠️ | MCP 客户端（方案列「重设计」，未实施） |
| memory_history.py | 211 | ⚠️ | 对话历史/反馈持久化，TS 无 |
| model_registry.py | 186 | ⚠️ | 模型注册/切换，TS 无 |
| speech_service.py / vision_capture.py | 235+306 | ⚠️ | TTS/ASR、截图 Vision，随技能暂缓 |
| agents/agent_manager.py / collaboration.py / subagent_engine.py | 338+72+219 | ⚠️ | 团队/黑板/子智能体，TS 无 |
| skills/audio_skill.py / image_skill.py / pdf_parse_skill.py | 246+487+465 | ⚠️ | 拍板暂缓 |
| skills/model_skill.py / shell_skill.py / system_skill.py | 156+297+614 | ⚠️ | TS 无注册 |
| skills/ui_control_skill.py / ui_preview_skill.py | 404+161 | ⚠️ | 操控 PyQt 界面，Electron 无对应 |
| skills/schema_edit_skill.py / batch_data_skill.py | 359+65 | ⚠️ | UI 有对应能力但未接协议技能 |
| skills/export_doc_skill.py / game_balance_skill.py / git_tool_skill.py | 152+155+190 | ⚠️ | TS 无 |
| skills/todo_skill.py / web_search_skill.py / visualization_skill.py | 172+198+162 | ⚠️ | TS 无 |
| skills/delegate_skill.py / scheduler_skill.py / workflow_skill.py | 75+155+214 | ⚠️ | 依赖未迁的团队/工作流 |
| workflow/scheduler.py / workflow_engine.py | 242+312 | ⚠️ | 仅被 scheduler/workflow_skill 消费 |

### 3.2 `ui/ceshu`（35 文件 / 14,620 行）—— **本域迁移质量最高**

| 文件 | 行数 | 判定 | 依据 |
|---|---|---|---|
| chapter_forms/_industrial.py | 1246 | ✅ | `ChapterForm.tsx`+`CeshuFieldControl`+`shared/ceshuFields.ts` |
| editor_view_mixins.py | 871 | ✅ | `CeshuView.tsx` + 各 Panel |
| version_diff_dialog.py | 855 | ✅ | `VersionDiffPanel.tsx`+`shared/ceshuDiff.ts` |
| ai_full_generate_dialog.py | 801 | ✅ | `AiFullGeneratePanel.tsx`+`shared/ceshuAi.ts` |
| systems_editor.py | 611 | ✅ | `SystemsEditor.tsx` |
| template_editor_dialog.py | 589 | ✅ | `TemplateEditorPanel.tsx`+`ceshuCustomTemplates.ts`+`main/ceshu/templateStore.ts` |
| chapter_forms/_base.py | 571 | ✅ | `ChapterForm.tsx`+`ceshuFields.ts`/`ceshuDefaults.ts` |
| editor_view.py | 528 | ✅ | `CeshuView.tsx` |
| template_picker_dialog.py | 520 | ✅ | `TemplatePickerPanel.tsx`+`ceshuTemplates.ts` |
| home_view.py | 513 | ✅ | `CeshuHomePanel.tsx`+`shared/ceshuHome.ts` |
| checklist_dialog.py | 499 | ✅ | `ChecklistPanel.tsx`+`ceshuChecklist.ts` |
| chapter_notes.py | 495 | ✅ | `ChapterNotesPanel.tsx`+`ceshuNotes.ts`+`main/ceshu/notesStore.ts` |
| version_timeline_dialog.py | 461 | ✅ | `VersionTimelinePanel.tsx`+`ceshuTimeline.ts` |
| ai_review_dialog.py | 456 | ✅ | `AiReviewPanel.tsx`+`ceshuAi.ts` |
| field_dependency_graph.py | 447 | ✅ | `FieldDepsPanel.tsx`+`ceshuFieldDeps.ts` |
| chapter_panel.py | 412 | ✅ | `CeshuView.tsx` 章节导航 |
| ai_data_generate_dialog.py | 352 | ✅ | `AiDataGenPanel.tsx`+`ceshuDataGen.ts` |
| system_dependency_graph.py | 348 | ✅ | `ceshuFieldDeps.ts::buildSystemDependencyGraph` |
| preset_market_dialog.py | 346 | ✅ | `PresetMarketPanel.tsx`+`ceshuPresets.ts` |
| system_confirm_dialog.py | 282 | ✅ | `SystemConfirmPanel.tsx`+`main/ceshu/dataSync.ts` |
| word_stats_dialog.py | 259 | ✅ | `WordStatsPanel.tsx`+`ceshuWordStats.ts` |
| chapter_forms/_common.py | 231 | ✅ | 并入 `ChapterForm.tsx`+`CeshuFieldControl.tsx` |
| chapter_templates.py | 170 | ✅ | `ceshuTemplateData.ts::CHAPTER_TEMPLATES` |
| home_card.py | 161 | ✅ | `ceshuHome.ts::buildCeshuCards` |
| competitive_chart.py | 99 | ✅ | `CompetitiveChart.tsx`+`ceshuCompetitiveChart.ts` |
| score_report_dialog.py | 603 | ◐90% | 视图已迁；缺「导出 Markdown 评分报告」 |
| validation_dialog.py | 556 | ◐90% | 视图已迁；缺「导出 Markdown 校验报告」 |
| changelog_dialog.py | 326 | ◐80% | 视图+日志已迁；缺「导出 MD/HTML/Text」 |
| ai_panel.py | 248 | ◐60% | 通用对话由 `DigitalPanel` 承接；策划书专属 8 主题快捷面板未迁 |
| editor_view_workers.py | 101 | ◐50% | 整章 AI 已迁；单字段填充 `_AIFillFieldWorker` 无对应 |
| preview_panel.py | 222 | ⚠️ | **数据引用预览缺失**：`enabled_editors` 动态编辑器 + `@data[...]` 解析无 TS |
| ai_field_button.py | 78 | ⚠️ | 字段级「AI 帮我填」无 TS（`ceshuFieldControl` 无 AI 入口） |
| ceshu_theme.py / 2 个 `__init__.py` | 238+65+60 | ⛔ | QSS 主题胶水 / 包 re-export |

### 3.3 `ui/widgets`（24 文件 / 9,232 行）

| 文件 | 行数 | 判定 | 依据 |
|---|---|---|---|
| attr_library.py | 442 | ✅ | `AttrSystemPanel.tsx`+`shared/attrSystem.ts::validateAttrSystem` |
| attr_system_editor.py | 456 | ✅ | `AttrSystemPanel.tsx`（list/matrix/live/equip 四视图+导入导出）+ `attrSystem.ts` |
| attr_table.py | 143 | ✅ | `shared/attrList.ts`+`AttrTableEditor.tsx` |
| attribute_panel.py | 763 | ✅ | `shared/attrPanel.ts::evaluateAttrPanel`+`AttrPanelEditor.tsx` |
| collapsible_section.py | 93 | ✅ | `FormSectionCard.tsx` |
| equipment_preview.py | 1021 | ✅ | `shared/equipPreview.ts`+`EquipPreviewPanel.tsx` |
| formula_builder.py | 486 | ✅ | `shared/formulaBuilder.ts`+`AttrFormulaBuilder.tsx` |
| library_bar.py | 418 | ✅ | `LibraryBar.tsx`+`main/library/manager.ts` |
| live_preview.py | 472 | ✅ | `shared/attrPreview.ts`+`AttrLivePreview.tsx` |
| relation_graph.py | 407 | ✅ | `shared/references.ts`（注释注明与 reference_panel 合并迁移）+`ReferencesPanel.tsx` |
| relation_matrix.py | 265 | ✅ | `AttrSystemPanel.tsx` matrix 视图+`attrSystem.ts::topoSortAttributes` |
| collapsible_task_panel.py | 243 | ◐35% | `DigitalPanel.tsx` 有折叠步骤+`panel.ts::reduceBrainEvent`；缺任务工作区折叠面板 |
| drop_table.py | 225 | ◐20% | `ItemForm.tsx` 降级为 JSON 文本框；缺表格 UI+选库对话框+掉率校验（影响 monster 三个掉落字段） |
| dynamic_form.py | 839 | ◐75% | `formSections.ts`+`ItemForm.tsx`+`FormSectionCard.tsx`；缺 image/dialog/formula_builder/image_tags/AI 按钮等专用控件 |
| multi_select.py | 258 | ◐30% | 降级为逗号分隔 id/JSON；缺 `RefTableWidget`+`RefSelectDialog`（影响 role/monster/job/skill 的引用字段） |
| task_row.py | 317 | ◐40% | `panel.ts::summarizeToolTasks` 派生扁平列表；缺可展开任务卡/状态徽章/完成删除动作 |
| home_widget.py | 604 | ⚠️ | 整块未迁：`OnboardingGuide`（5 步引导+持久化）、`QUICK_ACTIONS`、数据概览卡 |
| team_dialog.py | 818 | ⚠️ | 整块未迁：团队 CRUD/成员工具覆盖/自定义提示词/智能体定义管理 |
| __init__.py | 22 | ⛔ | 包 re-export |
| agent_monitor.py | 131 | ⛔ | 死代码：`AgentMonitorPanel` 无 import/实例化 |
| attr_conversion.py / generic_drop.py | 117+275 | ⛔ | 默认 schema 无 `attrconversion`/`genericdrop` 字段类型（TS `FieldType` 亦无） |
| attr_system_adapter.py | 202 | ⛔ | 死代码：仅 `test_adapter()` 自用 |
| model_selector.py | 215 | ⛔ | 死代码：无消费者；TS 改由 `MB_OLLAMA_*` 环境变量选模型 |

### 3.4 `ui/` 顶层 + `themes` + `components`（31 文件 / 9,883 行）

| 文件 | 行数 | 判定 | 依据 |
|---|---|---|---|
| digital_employee_workers.py | 29 | ✅ | `main/agent/brainService.ts`+`dispatcher.ts` 取代 QThread 桥 |
| digital_panel_ui.py | 480 | ✅ | `components/digital/DigitalPanel.tsx` 复刻面板 UI |
| field_config.py | 360 | ✅ | `TypeEditorPanel.tsx` |
| library_controller.py | 48 | ✅ | `main/library/manager.ts`+`LibraryBar.tsx` |
| ceshu_controller.py | 379 | ◐65% | `main/ceshu/manager.ts`+`CeshuView.tsx`；缺 tab 过滤/`send_ceshu_ai_context` |
| data_tab.py | 1157 | ◐65% | `ItemForm.tsx`+各类编辑器+`BatchEditPanel`+`ReferencesPanel`；缺 AI 生成(~380)+规划模板(~200)+undo/redo(~130) |
| digital_employee.py | 486 | ◐55% | `DigitalPanel.tsx`+`main/tray.ts`；缺独立弹窗/浮窗常驻 |
| digital_panel_chat.py | 504 | ◐75% | `panel.ts::reduceBrainEvent`+`DigitalPanel`；缺 markdown 气泡/记忆上下文/欢迎语 |
| digital_panel_input.py | 209 | ◐40% | 输入+发送已迁；缺斜杠命令/编辑器上下文采集 |
| digital_panel_tasks.py | 214 | ◐50% | 后端重设计为 `summarizeToolTasks`；独立任务 CRUD 未迁 |
| digital_panel_workspace.py | 308 | ◐40% | 会话快照→`sessionStore.ts`；富文本草稿/多工作区未迁 |
| main_window.py | 1248 | ◐40% | `App.tsx` 骨架+`LibraryBar`+模式切换；缺多标签/菜单/窗口状态/自动保存 |
| components/virtual_list.py | 243 | ◐40% | 搜索过滤/多选已迁；缺虚拟滚动/拖拽排序/右键菜单 |
| chat_renderer.py | 172 | ⚠️ | markdown→HTML+代码高亮无 TS（`a-tier-plan.md:320` 标「待接 react-markdown」） |
| effects.py / theme_effects.py / text_glow_effect.py | 459+201+148 | ⚠️ | C 档主题特效未排期 |
| themes/themes.py | 1097 | ⚠️ | C 档；`styles.css` 仅单一深色 `:root` 变量，无多主题 |
| menus.py / shortcuts_dialog.py / tab_manager.py / window_state.py | 180+107+249+154 | ⚠️ | C 档未排期（菜单/快捷键/多标签/窗口状态） |
| components/image_loader.py | 324 | ⚠️ | `LazyImageLabel`/异步加载缓存无 TS（装备/角色图片无缩略图） |
| components/toast.py | 98 | ⚠️ | 无 Toast 组件；仅 `notice-banner` 内联提示 |
| `__init__.py`×3 / ai_bridge.py / digital_panel_state.py / digital_panel_theme.py / layout_builder.py | 32+116+232+338+245 等 | ⛔ | 包胶水 / `a-tier-plan` 明列不迁（初始化窗口定位、类型桩、QSS 注入、QSplitter 布局） |

### 3.5 `core/ceshu` + `core` 顶层 + `core/defaults`（38 文件 / 12,602 行）

| 文件 | 行数 | 判定 | 依据 |
|---|---|---|---|
| ceshu_checklist.py | 886 | ✅ | `shared/ceshuChecklist.ts::runChecklist` |
| ceshu_scorer.py | 684 | ✅ | `shared/ceshuScorer.ts::scoreCeshu` |
| ceshu_model.py | 645 | ✅ | `shared/ceshuModel.ts` |
| ceshu_manager.py | 641 | ✅ | `main/ceshu/manager.ts`+`storage.ts` |
| ceshu_constants.py | 566 | ✅ | `shared/ceshuConstants.ts` |
| ceshu_pptx_exporter.py | 480 | ✅ | `main/ceshu/export/pptx.ts` |
| custom_template_manager.py | 442 | ✅ | `shared/ceshuCustomTemplates.ts`+`templateStore.ts` |
| ceshu_changelog.py | 433 | ✅ | `shared/ceshuDiff.ts` |
| ceshu_excel_exporter.py | 390 | ✅ | `main/ceshu/export/excel.ts` |
| ceshu_html_exporter.py | 326 | ✅ | `main/ceshu/export/html.ts` |
| ceshu_docx_exporter.py | 313 | ✅ | `main/ceshu/export/docx.ts` |
| ceshu_pdf_exporter.py | 298 | ✅ | `main/ceshu/export/pdf.ts` |
| ceshu_data_sync.py | 282 | ✅ | `main/ceshu/dataSync.ts` |
| field_dependencies.py | 278 | ✅ | `shared/ceshuFieldDeps.ts` |
| ceshu_validation.py | 196 | ✅ | `shared/ceshuValidation.ts::validateCeshu` |
| ceshu_markdown_exporter.py | 175 | ✅ | `main/ceshu/export/markdown.ts` |
| ceshu_fill.py | 166 | ✅ | `shared/ceshuFill.ts` |
| ceshu_migration.py | 124 | ✅ | `shared/ceshuMigration.ts` |
| ceshu_export_common.py | 103 | ✅ | `main/ceshu/export/common.ts` |
| ceshu_template.py | 96 | ✅ | `shared/ceshuTemplates.ts` |
| attr_system.py | 436 | ✅ | `shared/attrSystem.ts`+`main/attr/attrSystemStore.ts` |
| data_manager.py | 767 | ✅ | `main/data/service.ts`+`repository.ts`+`sqliteRepo.ts` |
| library_manager.py | 741 | ✅ | `main/library/{manager,store,migrate}.ts` |
| type_schema.py | 262 | ✅ | `shared/typeSchemaFile.ts`+`main/schema/store.ts` |
| operation_log.py | 154 | ✅ | `shared/agent/operationLog.ts`+`operationLogStore.ts` |
| calc_engine.py | 170 | ✅ | `attrSystem.ts` 等价实现（Python 源仅单测/`__init__` 引用） |
| defaults/rpg_schema.py | 786 | ✅ | `shared/typeSchema.ts::BUILTIN_DATA_TYPES` |
| buff_system.py | 129 | ◐40% | 加成预览已迁（`attrPreview.ts`）；模板/tick/active 管理未迁（src 内无调用点） |
| equipment_system.py | 96 | ◐40% | bonuses/EQUIP_SLOTS 已迁；槽位注册/穿脱 API 未迁（无调用点） |
| style_manager.py | 289 | ⚠️ | **D 档最后一个活模块**：`game_styles.json` 驱动的术语替换，仍被 `dynamic_form.py:260`、`ceshu_controller.py:58-61` 消费 |
| `__init__.py`×2 + defaults/`__init__.py` | 31+35+4 | ⛔ | 包 re-export |
| extended_formulas.py | 455 | ⛔ | 死代码（仅 `core/__init__` re-export）—— E4 已实证 |
| game_templates.py | 326 | ⛔ | 死代码（同上） |
| editor_layout.py | 208 | ⛔ | E5 已实证「能写、没人读、且已过期」 |
| cedict.py | 72 | ⛔ | E6 已评估不迁（消费者 `type_editor_field_widget.py:234`） |
| level_scaling.py | 117 | ⛔ | 死代码（仅 re-export，无调用点） |

### 3.6 `ui/dialogs`（20 文件 / 6,055 行）

| 文件 | 行数 | 判定 | 依据 |
|---|---|---|---|
| batch_edit.py | 312 | ✅ | `BatchEditPanel.tsx`+`dataTableOps.ts`+IPC `data:batchUpdate`/`deleteMany` |
| reference_panel.py | 261 | ✅ | `ReferencesPanel.tsx`+`shared/references.ts`+IPC `data:references` |
| advanced_search.py | 172 | ◐35% | 已迁：单类型列表关键字过滤；缺跨类型搜索/按字段选择/结果跳转 |
| engine_export.py | 353 | ◐30% | 已迁 Lua（Python 反而没有！）；缺 Unity/Unreal/Godot/Cocos2d 四引擎 |
| startup_mode_dialog.py | 144 | ◐60% | 模式切换已迁；缺启动弹窗+「记住选择」持久化 |
| type_editor_ai.py | 338 | ◐25% | 模板导入已迁；缺 AI 推荐字段/分析现有数据/联网参考 |
| type_editor_dialog.py | 528 | ◐70% | `TypeEditorPanel.tsx`；缺布局分区编辑（已判不迁）/智能工具栏/拼音英译按钮 |
| type_editor_field_widget.py | 345 | ◐80% | 字段全属性+ID 生成（`fieldId.ts`/`fieldIdAi.ts`）；缺拼音兜底（E6 明示未做） |
| api_config.py | 686 | ⚠️ | 多服务商配置整块未迁（TS 仅 `MB_OLLAMA_HOST/MODEL` 环境变量） |
| backup_manager.py | 155 | ⚠️ | 备份列表/创建/恢复/删除整块未迁 |
| data_diff_dialog.py | 154 | ⚠️ | `common/data_diff.py::DataDiff` 及 UI 未迁（**注意 `ceshuDiff.ts` 对应的是另一文件**） |
| quick_create.py | 543 | ✅ | `shared/quickCreate.ts`（TEMPLATE_DEFS 12 类/61 模板 + DATA_TYPE_LABELS）+ `QuickCreatePanel.tsx`；落库复用 `data:createItem`。**刻意修正**：Python `_on_create` 里 `data_type + "s"` 死代码不复制；类型下拉与 schema 求交（`filterQuickCreateTypes`），防造出无类型定义的孤儿条目 |
| settings_dialog.py | 671 | ⚠️ | 设置面板整块未迁（C 档） |
| statistics.py | 374 | ◐ | **已迁**：`shared/dataStats.ts`（均值/样本标准差/平衡性判定阈值 0.3/按类型计数与占比/**按 schema spinbox 字段自动发现数值字段**）+ `StatisticsPanel.tsx`（概览柱条 + 平衡性分析）+ IPC `data:listAll`。<br>**缺**：① 角色/怪物的 `hp`/`atk`/`def` 分析 —— TS schema 里 **`role`/`monster` 根本没有这些扁平字段**（属性在 `attr_list`），直译即死代码，故改为自动发现（role 因此不出现在分析列表）；② Python 的「📈 图表」页是 **matplotlib 占位符**，不复制，改用 CSS 柱条真实渲染 |
| template_manager.py | 411 | ◐ | **字段编辑部分早已由 `TypeEditorPanel` 覆盖**（增/删/上移/下移/名称·标签·类型·可编辑·可选值·数值范围），故本刀不重做第二套（避免重复计「已迁」）。<br>**本刀补齐的是模板存取**：`main/schema/fieldTemplateStore.ts`（`<库>/field_templates.json`，原子写）+ 4 条 IPC（`schema:listFieldTemplates`/`getFieldTemplate`/`saveFieldTemplate`/`deleteFieldTemplate`）+ `TypeEditorPanel` 里「保存当前为模板 / 删除模板」，自定义模板与内置模板在同一个下拉里（optgroup 分组），内置不可删。<br>**刻意不迁**：Python 的模板只存 `{字段名: 显示标签}`（`settings.py:780-786` 应用时**只覆盖 label**，类型/可选值/范围全丢）——是残废语义，TS 改存**完整 `TypeFieldDef[]`**，应用即整体还原（比 Python 强） |
| type_visibility_dialog.py | 121 | ⚠️ | 首页概览「显示哪些数据类型」未迁 |
| `__init__.py` / auto_input_dialog.py / type_editor_dialog_state.py / type_editor_layout_widget.py | 25+60+99+303 | ⛔ | 包胶水 / QDialog 输入胶水 / mixin 类型桩 / E5 已实证不迁 |

### 3.7 `common` + `config` + `security` + `data` + 顶层（45 文件 / 10,672 行）

| 文件 | 行数 | 判定 | 依据（含被引用处数） |
|---|---|---|---|
| graph.py | 45 | ✅ | `shared/attrSystem.ts::topologicalSort`（Kahn）；引用 2 处 |
| security/acl.py | 141 | ✅ | `shared/agent/protocol.ts` RISK_LEVEL/TOOL_RISK_MAP；引用 1 处 |
| data/chapter_templates_data.py | 800 | ✅ | `shared/ceshuTemplateData.ts::CHAPTER_TEMPLATES` |
| data/type_editor_templates.py | 98 | ✅ | `shared/typeTemplates.ts::TYPE_TEMPLATES` |
| app.py | 103 | ✅ | `desktop/src/main/index.ts`（crash 日志/sentry 未随迁） |
| common/ai_client.py | 753 | ◐15% | 已迁 `main/llm/client.ts`；缺 OpenAI/Qwen/豆包/DeepSeek/流式/tools/vision/生图/限流；**引用 14 处** |
| common/common.py | 287 | ◐ | 原子写/uuid 已迁；safe_int/dict 工具未迁；引用 4 处 |
| common/exceptions.py | 195 | ◐ | `shared/ipc.ts` IpcInvokeError；缺友好化；引用 2 处 |
| common/shortcuts.py | 177 | ◐ | `main/tray.ts` 单热键；缺 ShortcutManager/DEFAULT_SHORTCUTS |
| config/constants.py | 181 | ◐ | 类型/字段/属性/策划常量已迁；缺窗口/主题/文件名常量；引用 31 处 |
| config/settings.py | 858 | ◐ | `fields_config`→`typeSchema.ts`；缺 visible_types/backup_dir/startup_mode/api_*（TS 刻意无全局单例）；引用 26 处 |
| security/sandbox.py | 325 | ◐ | 已由 `main/security/jsSandbox.ts`（QuickJS 白名单）**设计性替换**；引用 2 处 |
| common/auto_updater.py | 60 | ⚠️ | TS 无；引用 1 处 |
| common/data_diff.py | 197 | ⚠️ | TS 无通用 diff；引用 1 处 |
| common/data_importer.py | 269 | ⚠️ | TS 无（`legacyImport.ts` 仅旧 JSON；CSV/Excel 缺） |
| common/data_ref.py | 209 | ⚠️ | `@data[...]` 解析无 TS；引用 1 处 |
| common/event_bus.py | 87 | ⚠️ | TS 用 IPC + brain 事件流替代；**引用 18 处** |
| common/i18n.py | 401 | ⚠️ | TS 无 i18n（C 档）；引用 4-5 处 |
| common/logger.py | 155 | ✅ | 已迁为 `shared/logger.ts`（统一入口，渲染层经 IPC 转发到主进程）+ `main/logger.ts`（轮转文件日志，10MB×5 备份）；原 142 处引用现统一走 `log` 入口（E8） |
| common/lucide_icon.py | 214 | ⚠️ | renderer 用 emoji/内联 SVG；引用 11 处 |
| common/rate_limiter.py | 85 | ⚠️ | TS 无 TokenBucket；引用 2 处 |
| common/sentry_client.py | 52 | ⚠️ | TS 无；引用 1 处 |
| security/privacy.py | 88 | ⚠️ | TS 无 `summarize_sensitive`；引用 1 处 |
| async_runner / auto_backup / cache / config_schema / data_validator / icons / interfaces / lazy_loader / llm_provider / metrics / path_utils / text / text_game_export / validator / `__init__` | 3,097 | ⛔ | **src 内 0 引用**（仅 `common/__init__.py` re-export）＝真死代码 |
| security/encryption.py / guard.py / rate_limiter.py | 458 | ⛔ | 死代码，且**与 settings.py / core/agent/safety_guard.py / common/rate_limiter.py 重复** |
| data/sample_data.py | 1125 | ⛔ | 有意不迁（立项 §3.4「不迁移样本数据」） |
| config/`__init__.py` / security/`__init__.py` / data/`__init__.py` | 40 | ⛔ | 包 re-export / 文档字符串 |

### 3.8 `features`（9 文件 / 3,430 行）—— **本域完整已迁为 0**

| 文件 | 行数 | 判定 | 依据 |
|---|---|---|---|
| _ai_dialog.py | 923 | ◐55% | UI 被 `AiDataGenPanel.tsx`+`ceshuDataGen.ts` 取代；缺技能专属模板模式/`normalize_item_fields`/策划文档长文生成/多对象括号级解析 |
| ai.py | 556 | ◐40% | AI 生成→`ceshuDataGen.ts`；审核→`DigitalPanel`/`AiReviewPanel`；缺 schema 驱动的直调生成/AI 平衡分析/API 配置 |
| advanced.py | 431 | ◐25% | 关系图→`ReferencesPanel`；缺属性图表/高级搜索/关键词模板配置/清理未用图片 |
| export.py | 705 | ◐50% | JSON 导入导出/批量编辑已迁；**缺 CSV 与 Excel 的游戏数据导入导出**（`main/ceshu/export/excel.ts` 是策划书，非此） |
| _ai_image.py | 365 | ⚠️ | **AI 生图/配图整块无 TS 对应**（文生图+下载落盘+进度、`generate_desc_only` 等） |
| statistics.py | 273 | ⚠️ | 数据统计/平衡分析（`analyze_balance` 系列）无 TS（**注意 `ceshuScorer`/`ceshuWordStats` 是策划书域**） |
| backup.py | 42 | ◐30% | `export_for_game` 已迁；`show_backup_manager` 未迁 |
| engine_export.py | 75 | ◐15% | 薄壳；TS 只做 Lua，缺 `show_game_data_preview` |
| __init__.py | 60 | ⛔ | 包 re-export 胶水 |

## 4. 真实剩余里值得排期的功能（按性价比）

| 优先 | 项 | 量级 | 为什么 |
|---|---|---|---|
| **1** | `common/logger.py`（155 行）+ TS 文件日志 | 中 | **被引用 142 处**；TS 目前只有 console.*，无落盘日志 —— 排障基础设施 |
| **2** | `core/agent` 记忆系统补全（`memory_history` 211 + `memory_store` 195 + `memory_vector` 271 + `memory_search` 231） | ≈900 行 | 当前记忆**只增不学**（对话历史/偏好/反馈未迁） |
| **3** | `ui/dialogs` 未迁 8 件：`quick_create` 543 / `statistics` 374 / `template_manager` 411 / `advanced_search` 172 / `type_visibility` 121 / `data_diff` 154 / `backup_manager` 155 | ≈1,930 行 | 都是**日常可达**的功能，非外围 |
| **4** | 引用类字段编辑器：`multi_select`→`RefTableWidget`（258）+ `drop_table`→`DropTableWidget`（225） | ≈410 行 | 现在降级成 JSON 文本框，**编辑体验退化**（影响 role/monster/job/skill 多处） |
| **5** | `features/export.py` 的 CSV + Excel 游戏数据导入导出 | ≈230 行 | 你作为策划，导表进 Excel 调整是常见动作 |
| **6** | `core/style_manager.py`（289 行） | 289 行 | D 档最后一个活模块；**但需先定其全局单例状态在 TS 放哪** |
| **7** | `features/_ai_image.py` AI 生图（365 行） | 365 行 | 新架构**完全没有**的能力（可选） |
| **8** | C 档外围：主题/特效 1,905 + 菜单/多标签/窗口状态 690 + 设置/i18n | ≈3,700 行 | **多为「体验完整度」而非核心功能**，可长期后排 |

## 5. 方法与可复核性

- **全量枚举**：脚本统计 `src/**/*.py`（排除 `__pycache__`）→ 299 文件 / 91,164 行，按域分组行数。
- **逐文件判定**：8 个**只读**子代理并行审计（每个域一个），要求对每个文件给出**具体依据** —— TS 文件路径 + 导出符号，或「grep 无消费者」这类实证；明确禁止「文件名相似即判已迁」。
- **域总量对账**：每份审计的四类计数必须与脚本统计的域总量相等；8 份全部通过。
- **全局对账**：四类合计 = 299 文件 / 91,164 行，**PASS**（见 §1）。
- **已知误差来源**：①「◐部分已迁」的完成度是**估计值**（各代理给出，主观性存在）；②「⛔有意不迁」的判定依赖既有决策记录 + grep 实证，若某模块将来被需要需重新评估；③ 判定粒度是「文件」，同一文件内不同功能的迁移状态可能不一致（已在依据里尽量写明）。

## 6. 本次审计纠正的三处早前误判

1. **roadmap §2 的「剩余 ≈3.5–4.5k 行（4–5%）」是错的** —— 真实剩余 **≈3.0–3.4 万行（33–37%）**。那句话把三个混合态域当成了基本迁完，且口径过窄。
2. **三条「已迁映射」线索是错的**（幸好标注了"须自行核实"）：`ui/dialogs/template_manager.py` ✗≠ `TemplateEditorPanel`（后者对应**策划书**模板）、`statistics.py` ✗≠ `WordStatsPanel`（后者是策划书字数）、`data_diff_dialog.py` ✗≠ `ceshuDiff.ts`（后者对应策划书版本对比）。这三个文件实为**未迁**。
3. **`common/` 不能整体按「用不到」处理**：`logger.py` 引用 142 处、`event_bus.py` 18 处、`lucide_icon.py` 11 处、`i18n.py` 4 处、`rate_limiter.py` 2 处 —— 这些**有真实消费者**，属未迁而非"设计上不迁"。（其余 15 个文件确认 src 内 0 引用，是真死代码。）
