# Py → TS 迁移审计（文件级，2026-10-04）

> **本文把「还剩多少」从估算变成可复核的数字。结论与我 2026-10-04 早前在 roadmap §2 里写的「剩余 ≈3.5–4.5k 行（4–5%）」**严重不符** —— 那句话是**下限估算且用错了口径**（把三个混合态域当成了基本迁完）。真实剩余见下。

> ## ⚠️ 2026-10-07 实测复核：非 AI 部分的一致性（主理人问「其他内容和逻辑都是一致的不」）
>
> **结论：主体一致，但不是「完全一致」。** 编辑器内核 / 策划书 / 字段属性 / 引擎导出 / 导入导出
> 这些**主干功能逻辑一致**；仍有**若干真实缺口 + 1 处审计自身的数据自相矛盾**。逐条实测如下
> （⚠️ 审计表头是 10-04 的，以下每条都在 10-07 重新 grep 核实过，**已剔除因 E28–E41 而过期的判定**）。
>
> **① 审计数据自相矛盾（E54 已复核消除）**：原先 §1 结论表、§2 域表、§3 逐文件明细**三套分类计数互不相同** —— 对外表现为 **±2 文件 / 480 行** 的差异（§2 一度算出 `93+61+88+57=299`、行数 `34,605+22,917+18,756+14,886`，与 §1 加总对不上）。
> **E54（2026-10-07）已以 §3 逐文件明细为唯一真源重算 §1/§2**，三者现**逐格相等**（E54 后为 `109 / 58 / 126 / 6` = 299 文件、`40,116 + 21,503 + 29,095 + 450` = 91,164 行；**E56 复核后为 `111 / 22 / 160 / 6`**；**E57 收口后为 `113 / 18 / 162 / 6`**，**E58 收口后为 `116 / 15 / 162 / 6`**，**E61（2026-10-10）后为 `117 / 15 / 162 / 5`**，总量始终不变）；方法与逐笔来源见 §1 的「E54 台账校准」块、「E56 ◐ 行文件级复核」块与「E57 前端尾巴收口」块。
>
> **② 审计已过期、本轮实测复核的 3 条**（2 条翻案成立、1 条翻案被 E53 推翻）：
> | 原判 | 实测 | 证据 |
> |---|---|---|
> | `ui/dialogs/settings_dialog.py` 671 行「设置面板整块未迁」 | **已做** | `renderer/src/components/SettingsPanel.tsx`（21 个 testid，E41 又加了 AI 模型服务区） |
> | `common/data_importer.py` 269 行「TS 无（CSV/Excel 缺）」 | **已做** | `main/ipc.ts:628` `data:importCsv` / `importExcelFile`（`data/csvIO.ts`、`data/excelIO.ts`） |
> | `ui/dialogs/ai_field_button.py` 78 行「字段级 AI 无 TS」 | **翻案不成立 ⇒ 维持未迁**（E53 更正） | 原证据 `ItemForm.tsx:751,799` 实为**数据条目表单**的字段 AI（`FieldAiAssist`：`generateDesc`/`generateImage`/`analyzeImageTags`，＝§ 顶部 AI 横幅里那条第 4 项 `llm:generate` 字段级按钮），**不等于**章节表单的 `ai_path` 机制。且路径误写 `ui/dialogs/`，真身是 `ui/ceshu/ai_field_button.py`（全仓仅此一个 78 行同名文件） |
>
> **②-b E53 复核三项「Python 侧 TS 等价物待核」（实测结论，见 §3.2 对应行）**：
> | 待核项 | 结论 | 证据 |
> |---|---|---|
> | `data_tab.py`「更多 ▾」按钮分组 | **多数已迁** | `ItemForm.tsx:987–1044`（`toolbar-more`/`toolbar-more-menu`/`item-form-more-edit-type`/`item-form-more-references`）已收纳 PyQt 三项中的 2 项（编辑类型 / 引用关系）。**第 3 项「参考策划方案 / 模板」无 TS** ⇒ 即 `data_tab.py` 保持 ◐ 的那条残留 |
> | `_base.py` 的 `ai_path`（章节表单按字段 AI 填充） | **确缺**（审计自相矛盾已更正） | F1 机制实测为**活代码**：`ai_field_button.py`（78）+ `_common.py::_add_row(…, ai_path)` 建 `AIFieldButton` + `apply_ai_content_to_form` 回填 + 信号链 `chapter_panel.py:262-265` → `editor_view.py:210` → `editor_view_mixins.py:56 _on_ai_fill_field` → `_AIFillFieldWorker`。调用点 **111 处**（`_base.py` 32 / `_industrial.py` 79）。TS 侧 `ai_field_path`/`AIFieldButton`/`ai_fill_requested`/`apply_ai_content`/`aiFieldPath` **全部零命中**；`shared/ceshuAi.ts` 只有整章 `buildChapterPrompt` |
> | `preview_panel.py::focus_first_editor()` | **已迁** | `ceshu/CeshuDataPreview.tsx:63-66,86-106`（`jumpEditor` 命中覆盖 activeKey / `targetNonce` 支持重复跳转 / 未命中回调 `onJumpMissed` / `enabledEditors.length===0` 空态），docblock 已显式标注对齐 `preview_panel.focus_first_editor` |
>
> **③ 非 AI 域**仍然真实存在的缺口**（10-07 实测确认，均非 AI 框架部分）：
> - **`ui/ceshu/preview_panel.py` 222 行** —— 右侧「数据引用」实时预览：`@data[role.atk]` 引用解析
>   + 按 `enabled_editors` 动态渲染编辑器。实测 TS 侧 `@data[` **零命中** ⇒ **确缺**。
> - **`ui/widgets/home_widget.py` 604 行** —— 5 步新手引导 + `QUICK_ACTIONS` + 数据概览卡。**E48 已迁** `OnboardingPanel.tsx`（菜单 帮助→快速入门）；刻意不迁数据概览的「⚙ 管理显示类型」按钮与 `visible_types` 过滤。
> - **`components/image_loader.py` 324 行** —— `LazyImageLabel` 异步加载缓存。**E46 已补** `LazyImage`（按已保存绝对路径经 `images:readByPath` 回读 data URL 回显预览，含 `loading="lazy"`）；未对齐 PIL 位图重采样（刻意规避过度开发）。
> - **`components/toast.py` 98 行** —— 无 Toast 组件，TS 只有内联 `notice-banner`。
> - **`ui/chat_renderer.py` 172 行** —— markdown→HTML + 代码高亮。实测 TS **无 markdown 渲染库**。
> - **`core/editor_layout.py` 208 行** —— 动态编辑器布局。TS 有 `enabledEditors` 消费但**无同等的动态布局生成**。
>
> **④ 已知且刻意保留的语义差异**（不是 bug，E37 已记录并说明取舍）：`打开` 整库替换 vs 按 id 合并、
> `保存` 每次问路径、快捷键 35 条 vs TS 只注册 3 个。**这些是有意为之，需用户裁决后才补。**

> ## ⚠️ 2026-10-07 主理人裁决：`core/agent` 域**停止 1:1 迁移**，改为「框架重写」
>
> 主理人原话：**「ai 那边就不搞了。框架可能要重写」**。据此，本审计中 `core/agent` 域
> 剩余的 **33 文件 / 8,419 行「⚠️未迁」**（记忆向量检索 883 行、`learner.py` 学习闭环 543 行、
> `intent.py` 规则意图解析 718 行、`mcp.py` 客户端 391 行、`team_dialog` 团队 CRUD、
> `model_registry` 模型注册切换、以及**刻意不迁**的自愈链 4,166 行）**全部不再计入迁移欠债**。
>
> **含义**：本文件剩余量已按此扣除 —— **E54（2026-10-07）已重跑审计**，现为 **≈1.1–1.5 万行（12–16%）**，
> 其中「整块没做」的 ⚠️ 只剩 **4 文件 / 287 行**（`auto_updater` 60 / `event_bus` 87 / `sentry_client` 52 / `privacy` 88，见 §1 与 §3 逐行；**E61 后 `rate_limiter` 85 已 ⚠️→✅、E62 后 `ai_field_button` 78 已 ⚠️→✅**，两者均从本清单移除）；`team_dialog.py`（818）已经主理人批准归入 ⛔（团队 CRUD 属被重写的 Agent 框架）；**E65（2026-10-10）这 4 文件全部改判 ⛔**（`event_bus`/`privacy` 仅被 `core/agent` 重写域消费、`auto_updater`/`sentry` 为本地离线应用不需要），⚠️ 至此清零。
>
> **⚠️ E59 补充的「客户端侧真相」（实测，重要）**：① `src/core/agent/` 剩余那 22,981 行在 **Electron 客户端里已是死代码** ——
> `grep "from core.agent" src/ --include=*.py` 只有 **22 个外部 import 点且全部在 `src/ui/`（PyQt 界面层）**，
> 而 PyQt 正被 Electron 逐片取代（E28 顶层 IA 已重写、E57 前端尾巴已收口）⇒ 它们**既不是「待迁移欠债」、也与「框架重写」无关**。
> ② 本项目**并非从零设计 agent 框架**：`docs/archive/AGENT_OS_BLUEPRINT_STATUS.md`（L6 蓝图）与
> `desktop/docs/a-tier-plan.md`（**A1-1~A1-5 已于 2026-10-04 全部收官**，「结论先行：不需要 1:1 复刻」）是既有资产。
> ③ **agent 侧首要待修项**：全仓**未设 `num_ctx`** ⇒ 客户端 agent 的**实际上下文只有 Ollama 默认的 4096**
> （同规格 8GB 卡实测第 7 轮即**半句截断**）。
> 架构结论见 [`agent-framework-design.md`](./agent-framework-design.md)（E59，v0.2 待裁决：不引框架、在已收官 A1 上定向加固）。
> **本表数字不动** —— 删那 22,981 行会破坏 299 文件 / 91,164 行的审计基线与 `docsLedger` 对账，故**建议保留不删、只标注死代码**。
>
> **但请注意区分两类 AI 能力**（否则会误伤已迁且在用的功能）：
> - **要重写的是「Agent 框架」**（brain/dispatcher/skills/记忆/意图那套自主决策循环）。
> - **不是「LLM 调用能力」** —— 后者被 **4 个非 Agent 功能**真实消费，且**不依赖框架**：
>   `schema:suggestFieldIds`（字段 ID 建议）、`ceshu:aiGenerateData`（策划书数据生成）、
>   `ceshu:aiReview`（策划书审查）、`llm:generate`（字段级 AI 按钮）。
>   这四条经 `main/llm/client.ts`（**两种传输**：Ollama 原生 / OpenAI 兼容，E41 接通多服务商）
>   **绕开 brain/dispatcher 直接调 LLM**，重写框架时**必须保留**。
>
> **现有 Agent 资产的处置建议（供重写时参考，尚未裁决）**：TS 侧现存
> `shared/agent/` 1,564 行 + `main/agent/` 1,187 行（brain 420 / protocol 472 / dispatcher 233 /
> session 167 / panel 255 等）+ 12 个 agent 单测文件。耦合面**很窄**（仅 2 个渲染组件
> `DigitalPanel`/`AgentEditorPanel` + 28 个 IPC handler），**不渗进数据/策划书内核** ⇒
> 重写成本可控，不必担心牵一发动全身。

## 1. 结论

**总计 299 文件 / 91,164 行**（`src/` 下全部 `.py`，不含 `__pycache__`；E54 用真源码枚举逐域复算，与 §2 域表**逐格相等**）。

| 判定 | 文件 | 行数 | 占比 |
|---|---|---|---|
| ✅ 已迁 | 118 | 43,235 | 47.4% |
| ◐ 部分已迁 | 15 | 8,328 | 9.1% |
| ⛔ 有意不迁 | 166 | 39,601 | 43.4% |
| ⚠️ 未迁（整块没做） | 0 | 0 | 0.0% |

**对账（必须相等，已 PASS）**：`118+15+166+0 = 299` ✓、`43235+8328+39601+0 = 91,164` ✓
（**E61 已收口**：`common/rate_limiter.py` 85 行 **⚠️→✅** —— `shared/rateLimiter.ts` + 单测 15，
并**已接线**到 `main/llm/client.ts::generate()`（对齐 Python `ai_client.py` 的 5 处 `_acquire_rate_limit`），
故记 ✅ 而非 ◐。见 §1 的 E61 块）

> ### E54 台账校准（2026-10-07）—— 本文件此前有「三套互不一致的数字」，本轮统一
>
> **问题**：同一份审计里 **§1 结论表**（106 / 51 / 92 / 50）、**§2 域表合计**（105 / 49 / 92 / 53）、**§3 逐文件明细加总**（105 / 58 / 92 / 44）三套分类计数互不相同。三者总量都等于 299 / 91,164，但**逐类对不上**（7 个文件在 §1 与 §3 间归类不同，9 个在 §2 与 §3 间不同）。审计顶部横幅自己也承认过「±2 文件 / 480 行差异待逐文件复核」，一直没复核。
>
> **E54 做法**：以 **§3 逐文件明细为唯一真源**（唯一带逐文件证据、且可脚本复算的一层）机械重算 §1 与 §2，使三者完全一致；并把 §3 两处「不精确行数」改精确（§3.4 聚合行 963→**1,029**、§3.7 聚合行 3,097→**3,269**），使 §3 加总**精确**等于 299 / 91,164。
>
> **同批的三处改判**（这才是「数字下降」的真实来源）：
> 1. **E42 裁决落地**：`core/agent` 的 **33 文件 / 8,419 行「⚠️未迁」→ ⛔**（框架改为重写、不再计入迁移欠债）。
> 2. **4 个「早已迁完」文件 ⚠️→✅**（逐条实证，共 1,363 行）：`ui/dialogs/settings_dialog.py` 671（`SettingsPanel.tsx` 21 个 testid）、`common/data_importer.py` 269（`data:importCsv`/`importExcel`）、`common/data_ref.py` 209（`shared/dataRef.ts`，E44）、`common/lucide_icon.py` 214（`shared/lucideIcons.ts` 43+33 键，E30）。
> 3. **`ui/widgets/team_dialog.py` 818 行 ⚠️→⛔**（主理人 2026-10-07 批准）。该文件整块是 AI **团队 CRUD / 智能体定义管理**，与 `core/agent` 的 `agents/agent_manager.py`/`collaboration.py` 同属「Agent 框架重写」范畴；E42 横幅的举例文字里本就点了「team_dialog 团队 CRUD」，此前因它落在 `ui/widgets` 域、不在 `core/agent` 的 33 文件内而未擅自改判，现按主理人裁决归入 ⛔。
>
> **域级复算**：`src/` 下 8 个域的（文件数 / 行数）已用脚本枚举实测，与 §2 域表**逐格相等**（`core/agent` 97/24,670、`ui/ceshu` 35/14,620、`ui/widgets` 24/9,232、`ui/` 顶层+`themes`+`components` 31/9,883、`core/ceshu`+`core` 顶层+`defaults` 38/12,602、`ui/dialogs` 20/6,055、`common`+`config`+`security`+`data`+顶层 45/10,672、`features` 9/3,430）。
>
> **此前待裁决项已落地（2026-10-07）**：`ui/widgets/team_dialog.py`（818 行）原按 §3 记 ⚠️，经主理人批准已改判 **⛔**（见上「三处改判」第 3 条）。

### E56 ◐ 行文件级复核（2026-10-07）—— 把 58 个「◐ 部分已迁」逐条做实，并落实 E42 的 AI 域口径

**做法**：§3 全部 56 条 ◐ 行（58 文件）逐条重新实证（读 Python 真源 + grep TS 对照物），按三条规则改判：

1. **E42「AI 框架重写」域 ⇒ ⛔**（主理人 2026-10-07 裁定「归入 ⛔」，不再计入迁移欠债）。含 `core/agent` 全部 **23 个 ◐ 文件（6,752 行）**（brain / dispatcher / prompts / memory×7 / models / safety_guard / semantic_memory / workspace / skills×7 / learner）+ **数字员工与任务面板 7 个（2,281 行）**（`digital_employee` / `digital_panel_chat` / `_input` / `_tasks` / `_workspace` / `collapsible_task_panel` / `task_row`）⇒ 共 **30 文件 / 9,033 行**。**已迁部分是在用资产、保留**；未迁部分随框架重写，不 1:1 移植。
2. **能力实测已存在 ⇒ ✅**：① `ui/ceshu/score_report_dialog.py` 603（`ceshu:exportScoreReport` + `CeshuView` 的「导出评分报告」按钮 —— **E49 就补了，台账没跟**）；② `ui/shortcuts_dialog.py` 107（`ShortcutsPanel.tsx` + 菜单「帮助 → 快捷键参考」，E37）。
3. **死代码 / 设计性替换 ⇒ ⛔**：`security/sandbox.py` 325（`jsSandbox.ts` 设计性替换，其 2 处消费者全在 core/agent 域）、`core/buff_system.py` 129 + `core/equipment_system.py` 96（真实使用面已由 `attrPreview.ts` 等价实现，未迁部分 Python 源内**无调用点**）、`ui/tab_manager.py` 249（多标签形态被 E28 顶层 IA 重写取代，技术前提消失）。

**顺带修 4 处「依据过期、但缺口仍在」的行**（判定不动，只改依据）：`dynamic_form`（image / image_tags / AI 按钮 **已迁**，仅剩 `dialog`/`formula` 两种形态）、`virtual_list`（条目右键菜单 E51 **已补**，仅剩虚拟滚动；拖拽排序属 DESIGN-DIFFERENT）、`common/ai_client.py`（**6 家服务商** E41 + 生图 E22 已迁，仅剩流式 / tools / vision / 限流 ⇒ 完成度 15% → **40%**）、`menus.py` / `shortcuts_dialog.py` / `tab_manager.py` 捆绑行**拆为 3 个独立行**（分别是 ◐ / ✅ / ⛔）。

**结果**：**§1 = §2 = Σ§3 = ✅ 111 / 40,826 · ◐ 22 / 10,961 · ⛔ 160 / 38,927 · ⚠️ 6 / 450**（合计 **299 文件 / 91,164 行**，逐格相等；8 个域锚点 Δ=0/0）。
**真实剩余**：由「≈1.0–1.4 万行（11–15%）」再降为 **≈0.5–0.8 万行（6–9%）**。

### E57 前端尾巴收口（2026-10-07）—— 4 个 ◐ 文件做实 + 2 处真缺口补码

**动因**：主理人问「前端是哪个没迁」→ 列出 `ui/` 域 15 个 ◐ + 1 个 ⚠️（≈7,400 行）并逐条给缺口；主理人裁决「**就是 py 都重构 ts**」。本轮把其中**能落实的全部落实**，剩下的**给出实证判为 ⛔ 或列出具体缺口**，不留含糊。

**① 两处真缺口，已写码补齐（不是台账调整，是新能力）**：

| 缺口 | Python 依据 | TS 补法 |
|---|---|---|
| **「工具 → 关系图」菜单项** | `menus.py:96` → `main_window.py:1158 _show_relation_graph` → `ui/widgets/relation_graph.py::RelationTablePanel`（407 行：类型/主体双选择器 + 主体信息卡 + 关联数据表 5 列 + 双击跳转） | 新增 `shared/relationGraph.ts`（`buildRelationRows` / `buildSubjectDetailLine` / `itemDisplayName`，纯逻辑）+ `components/RelationGraphPanel.tsx`（表格式，双击行跳转复用 `handleJump`）；`App.tsx` 五处接线（import / OverlayPanel union / `PANEL_TITLES` / `renderPanel` / `openPanel`）+ `MenuBar.tsx` 把该条目由 `notImplemented` 接到 `relationGraph`（`menuitem-tools-relationGraph`）。**顺带修**：`handleOnboardingAction('view_relations')` 原走 `references`（该通道带「无目标则弹去高级搜索」守卫，与 PyQt `main_window.py:1200 → _show_relation_graph()` 不符）⇒ 改正为 `relationGraph` |
| **`dialog` 字段控件形态** | `ui/widgets/dynamic_form.py:450` `field_type == 'dialog'`；默认 schema 真实使用（`typeSchema.ts:327` `field('dialog_id', '对话ID:', 'dialog')`） | `ItemForm.tsx` 增 `case 'dialog'`（`<select>` 列同库 `dialog` 类型条目、空态提示、值含失效 id 时以「（已失效）」保留不静默丢值）+ `dialogOptions` 懒加载（`data.listItems({type:'dialog'})`）。此前落到默认渲染 = 纯文本输入框 |

**运行期举证（`preview/verify-e57.mjs`，46/46 通过、页面错误 0）**：Playwright chromium（Edge）+ 预览服务器 + 忠实桩，6 组用例逐条断言：菜单收口（新项在场 / 死入口已删 / 相邻项未误删）、面板逐格取值（类型→主体→信息卡→5 列表格 / 悬空 token 行 / 无关联空态）、悬空行双击不跳转、已解析行双击跳转、`dialog` 下拉的选项与失效值保留、面板宽度。**其中截图驱出一个此前无人发现的真缺陷**：浮层面板根节点复用的 `.editor` 带 `width:400px; flex-shrink:0`（那是**右侧详情栏**的样式），放进 `.panel-overlay-body` 后 9 个菜单面板全部只占左侧 400px、右侧留大片空白 ⇒ 新增一条 `.panel-overlay-body > .editor { width:auto; flex:1 1 auto; min-width:0; border-left:none }`（**只作用于浮层正文直接子元素**，右侧栏语境不受影响），并由 T6/T7 覆盖（逐个打开 9 个面板量宽 + 查横向溢出）。另修**预览桩过期**：`schema:listFieldTemplates` 的真实契约为 `{builtin, custom}`，桩仍返回 `[]` ⇒ `字段结构编辑器` 在所有预览脚手架下必然抛 `Cannot read properties of undefined (reading 'length')`（既有 E51/E46 脚手架都没打开过该面板，故长期未暴露），已按真实契约修正。

**② 4 个 ◐ 文件逐条做实（2 升 ✅ / 2 改判 ⛔）**：

1. **`ui/widgets/dynamic_form.py`（839 行）◐→✅** —— 18 个字段形态分支逐一对表：缺的只有 `dialog`（本轮已补）与 `formula_builder`。后者**全仓仅 dynamic_form 自身分支**（`grep -rn formula_builder src/` 命中：`attribute_panel.py:27` + `widgets/__init__.py:6` 消费的是 **`FormulaBuilderDialog`** 本身，即**属性面板**的公式编辑器，TS 已由 `AttrFormulaBuilder.tsx` 等价实现；**无任何 schema 产出 `formula_builder` 形态的字段**）⇒ 死代码，非缺口。`entry`/`multiselect`/`droptable`/`attrtable`/`attrpanel` 由 `COMPLEX_FIELD_TYPES` + `RefTableEditor`/`DropTableEditor`/`AttrTableEditor`/`AttrPanelEditor` 承接。
2. **`ui/menus.py`（180 行）◐→✅** —— 「数据关系图」已实现（见上）；**另一项此前台账漏记**：「内容关联」子菜单两项（`show_content_relations` / `show_relation_visualization`）在 PyQt 侧**是死入口** —— `features/advanced.py:30-45` 两个函数**函数体完全相同**，都是 `ReferencePanel(dm, "", "", mw)`（**空 type / 空 id**），而 `reference_panel.py:46-53` 的 `_find_item()` 对空 type 必然返回 `None` ⇒ 该对话框**任何情况下只渲染「未找到该数据」**。TS 侧原先保留这两项为 `notImplemented`（点了报「尚未实现」），本轮**直接删除**（能力面已由 `references`（按目标看引用）+ 新增 `relationGraph`（按主体浏览关联）覆盖，删掉不丢能力；`notImplemented` 占位机制随之成为无用户代码，一并移除）。`menus.py:167 setup_agent_toolbar()` 仍是全仓无调用点的死代码（真值角部件在 `main_window.py:450`）。
3. **`ui/dialogs/startup_mode_dialog.py`（144 行）◐→⛔** —— **设计性替换**：该对话框是「选择工作模式」（数据设计 ↔ 策划书两条主线），依赖 PyQt 的双模式启动形态；E28 顶层 IA 已重写为「无侧栏单栈：策划书首页 ↔ 编辑器，一切能力从菜单进」⇒ **TS 全仓 `startupMode`/`startup_mode`/`mode-data`/`mode-ceshu` 零命中**，工作模式概念不存在。同 `tab_manager.py` 的处置。
4. **`ui/components/virtual_list.py`（243 行）◐→⛔** —— **唯一真实消费者是 `data_tab.py`**（另两处只是 `ui/components/__init__.py` 与 `ui/__init__.py` 的 re-export），而数据表页已随 E28 IA 重写下线；其**条目右键菜单语义已由 E51 并入 `DataEditorTab`**（`row-context-menu`：重命名/编辑/复制/删除，同 `virtual_list.py:217-231` 顺序）；「拖拽排序」此前已判 DESIGN-DIFFERENT（PyQt 重排**内存数组**，TS 条目来自 SQLite、无数组序）；余下「虚拟滚动」是 PyQt 的**渲染技术**（`QListView` 只画可见行），Web 侧为原生滚动列表，**无用户可见能力差异**。⇒ 归入「有意不迁」，并记**复盘条件**：若真实数据集（单类型条目数）出现滚动卡顿，再引入窗口化渲染（`react-window` 类），届时按新能力立项而不是补旧账。

**③ `ui/dialogs/api_config.py`（686 行）保持 ◐（依据已在本轮补精确）** —— 「基础设置」页 E41 已迁（`shared/llmConfig.ts` + `SettingsPanel`，Key 走 `safeStorage`）；**三个未迁 tab 各有依据**：模型管理（自定义模型增删改写 PyQt 私有 `custom_models.json`，而 TS 的模型输入是「预设 datalist + 自由文本」，任何模型名可直接使用并持久化 ⇒ 无同一消费者）、视觉模型（TS 无截图识别/UI 分析链路）、模板设置（实为技能生成模板偏好，属策划内容域）。**本轮新发现一处真缺口**：基础设置页的「**测试连接**」按钮（`api_config.py:641-685` → `common/ai_client.test_api_connection`）TS 侧**无对应**（全仓 `测试连接`/`testConnection` 零命中），依赖 AI 域的客户端实现 ⇒ 保留 ◐ 并把该条写入 §3 依据。

**结果**：**§1 = §2 = Σ§3 = ✅ 113 / 41,845 · ◐ 18 / 9,555 · ⛔ 162 / 39,314 · ⚠️ 6 / 450**（合计 **299 文件 / 91,164 行**，逐格相等；8 个域锚点 Δ=0/0）。
**真实剩余**：由「≈0.5–0.8 万行（6–9%）」再降为 **≈0.5–0.7 万行（6–8%）**。

### E58 前端尾巴 3/3（2026-10-07）—— 台账滞后修复 + 拼音兜底

**动因**：「前端尾巴 1/3」（`d5ad355`，导出类 —— 校验报告 Markdown + 变更日志 MD/HTML/Text）**只写码、未同步台账**，导致 §3 仍把两个文件记 ◐；另主理人裁决「引入 `pinyin-pro` 并实现」拼音兜底。

**① 台账滞后修复（2 文件 ◐→✅ —— 是补记，不是新码）**：

| 文件 | 行数 | 依据 |
|---|---|---|
| `ui/ceshu/validation_dialog.py` | 556 | 「视图已迁、缺导出 Markdown 校验报告」—— 该导出**已由 `d5ad355` 实现并接线**（`shared/ceshuReports.ts::buildValidationReportMarkdown` + `CeshuView.tsx` 的 `validate-export` 按钮 → `ceshu:exportValidationReport`）。同批的「**一键修复必填字段**」（`_on_auto_fix` → `auto_fill_required`）另有对应物：`shared/ceshuFill.ts::autoFillRequiredFields` + `ceshu:autoFill` + `ChecklistPanel` 的「一键修复」 |
| `ui/ceshu/changelog_dialog.py` | 326 | 「视图+日志已迁、缺导出 MD/HTML/Text」—— 三格式导出**已由 `d5ad355` 实现**（`buildChangelog{Markdown,Text,Html}` + `CeshuView` 的 `changelog-export-md/html/text` → `ceshu:exportChangelogReport`） |

> 这两行的滞后**成因可复现**：`d5ad355` 的 `git show --stat` 里**没有任何 `docs/` 文件**，即「写码未同步台账」；而紧随其后的 E57 提交流程只按自己那 4 个文件收了口，把这两行漏在 ◐ 里。⇒ 台账与代码不同步**未必是文档被回退**，也可能是「提交时忘了记账」，同样要用 §3 逐文件对账才能发现。

**② 拼音兜底实现（`ui/dialogs/type_editor_field_widget.py` ◐→✅）** ——

Python 的字段 ID 生成有两条**正交**的路子：**英译**（`_auto_translate` → 术语表，`攻击力 → atk`）与**拼音**（`_auto_pinyin` → `pypinyin`，`攻击力 → gong_ji_li`，**支持任意汉字**）。TS 此前只有前者（`shared/fieldId.ts`），拼音层**刻意留空**（E6 明示未做）。本轮补齐：

- 新增 `shared/pinyinFieldId.ts`（依赖 `pinyin-pro ~3.29`）：`chineseToPinyin` 复现 `pypinyin.lazy_pinyin` 口径（逐字取音节 → `_` 连接 → 清洗 `[^a-zA-Z0-9_]` → 折叠 `_` → 转小写；`nonZh:'consecutive'` 保证**连续 ASCII 成段**，`hp_max → hp_max` 不被打碎）+ `suggestPinyinFieldId`（与 `suggestFieldIds` 同形，`source:'pinyin'`、`skipped` 恒空）。
- `SuggestionSource` 增 `'pinyin'`；`TypeEditorPanel.tsx` 字段行新增**「拼音」按钮**（`te-field-pinyin-{i}`），候选条中拼音层与规则层 / AI 层**同面板并列**（`data-source` 区分），沿用「**只提案不写入**」。
- **新建类型的 ID 随中文名自动填拼音**（对齐 `type_editor_dialog.add_type` 的 `tname_edit.textChanged → tid_edit.setText(_chinese_to_pinyin(...))`）：仅对**尚未保存的新类型**且 **ID 未被用户手改过**（`manualTypeIds` 记录，等价 Python 的 `tid_edit.isModified()`）时生效；**既有类型 ID 锁定、永不被自动改**。
- **有意不迁（保持）**：CEDICT + `jieba` 词典回退 —— `fieldId.ts` 已实证其产出 `abbr_surname` / `canada_surname` 类垃圾，故不接；未收录词仍如实提示（并引导点「拼音」）。
- **放置判据（E58 被主理人当场纠正过一次）**：拼音层放 `shared/` 由**渲染层同步**直调，而非再包一层 IPC。理由是**同步性**（新建类型的 ID 随中文名输入即填，走 IPC 必引入响应乱序竞态），**不是包体积** —— 本项目是 **Electron 客户端**（本地 SQLite / 本地文件 / `safeStorage`，无服务端），仓库无任何体积门禁，renderer 2.65MB 相对 Electron 运行时本身 ~200MB 可忽略。主/渲染的真实边界只有「**要不要 Node / electron 能力**」这一条（`fs`/`node:path`/原生插件 `better-sqlite3`/`safeStorage`/`dialog`）：`better-sqlite3`（原生插件）、`docx`/`exceljs`/`pptxjs`（经 `reportExport.ts` 落盘）、`ollama`（`safeStorage` 存密钥）全都在 main **是因为这个，与包多大无关**。

**③ `ui/dialogs/type_editor_dialog.py`（528 行）保持 ◐（依据已在本轮补精确）** —— 拼音/英译按钮已补齐（见 ②）；余下未迁面**均非缺口**：**布局分区编辑**（已判不迁，Web 无 QSplitter 分区形态）、**智能工具栏** 4 项中的 3 项（`AI推荐字段` / `分析现有数据` / `联网参考`）**属 AI 域**（随 E42 框架重写），第 4 项 `导入模板` 已迁（`TypeEditorPanel` 的「字段模板」）。故保持 ◐。

**运行期举证（`preview/verify-e58.mjs`，14/14 通过、页面错误 0）**：复用 E57 桩链、独立端口 5201，6 组用例 —— 未收录词「斗能」规则层如实报未收录 + 拼音层给 `dou_neng`；`攻击力` 两层对照（`atk` / `gong_ji_li`）同时在场；展开候选不覆盖字段名、点选后才写入；无可用字符（`$$$`）拼音层如实报错且不给候选；新建类型「卡牌」→ ID `ka_pai`、手改 `card` 后不再被覆盖；既有类型改中文名 ID 保持 `role`。回归 `verify-e51` 41/41、`verify-e57` 46/46 仍绿。

**结果**：**§1 = §2 = Σ§3 = ✅ 116 / 43,072 · ◐ 15 / 8,328 · ⛔ 162 / 39,314 · ⚠️ 6 / 450**（合计 **299 文件 / 91,164 行**，逐格相等；8 个域锚点 Δ=0/0）。
**真实剩余**：量级不变，仍为 **≈0.5–0.7 万行（6–8%）**（本轮清掉的是 1.2 千行细项）。

### E61（2026-10-10）：限流器 —— `common/rate_limiter.py`（85 行）⚠️ → ◐

**为什么先动它**：它是 ⚠️「整块没做」6 文件里**唯一纯逻辑、可一刀收口**的一项 ——
其余各项都卡在非技术因素：`auto_updater` 60（要不要自动更新，产品决策）、`event_bus` 87
（已由 IPC + brain 事件流**设计性替代**）、`sentry_client` 52（要不要接错误上报，产品决策）、
`privacy` 88（待定）、~~`ai_field_button` 78~~ → **已于 E62 收口**（新 IPC `ceshu:aiGenerateField` + `onlyFields` 单字段提示词 + 按钮组件）。
且它与已落地的 **M5 成本护栏**互补：**护栏管「总量/预算」，限流管「突发速率」**。

**⚠️ 顺带查出的文档漂移（已更正）**：路线图 §2 的 D 档说明段把 `style_manager.py` 289 仍写作
「**仍活着的剩余项**」，但台账 `migration-audit.md:467/554` 早已记 **✅ 已迁（E21）+「D 档至此收官」**。
⇒ 这是**说明性文字没跟着台账更新**，不是代码欠债。已按「单一事实源 = `migration-audit.md`」更正路线图 §2。
（教训：动手前先核对台账，否则会照着过期描述**重复实现一遍已迁完的东西** —— E21 的 `shared/gameStyle.ts`
已完整覆盖 `style_manager.py`，含 6 风格×46 概念内联数据 + 4 个消费者接线。）

**交付**：`shared/rateLimiter.ts`（`TokenBucket` + `RateLimiter`）+ `tests/unit/rateLimiter.test.ts`（单测 15）。

**有意偏离（已写进源码注释）**：
1. **不引入锁** —— Python 用 `threading.Lock` 保护多线程；TS 主进程单线程事件循环，无共享内存竞争。
2. **`waitAndAcquire` 改 async** —— Python 阻塞线程；TS **绝不能阻塞事件循环**（会整个应用卡住）。
3. **不导出模块级单例** —— 沿用 `gameStyle.ts` 约定（便于测试与依赖注入），实例由调用方持有。
4. **时钟 / 休眠器可注入** ⇒ 限流可确定性单测（假时钟 + 假休眠器）。
5. **放弃 Python 的 `threading.Event` 提前唤醒**，改固定 100ms 轮询上限
   （与 Python `event.wait(min(remaining, 0.1))` 的 0.1s 上限一致），正确性等价。

**⚠️ 坑（勿"顺手修正"）—— 增量补桶的浮点敏感度**：每次 `acquire` 只按「距上次补充的时间」**增量累加**，
不从固定锚点重算 ⇒ 十个 0.1 相加在 IEEE754 下是 0.9999… < 1，**极端情况会多等一个轮询周期**
（实测 `rate=1 / burst=1`、轮询 100ms：理论 1000ms，实际 1100ms）。
**已用 `.venv` 探针核过 Python 的算术：Python 同为增量补桶、同源敏感度** ⇒ 属**算法固有**，
若改成"就近取整"或"从锚点重算"就会破坏匹平。故单测按**区间**断言（1000~1100ms），不硬钉精确值。

**接线（2026-10-10，主理人拍板后执行）**：`main/llm/client.ts::generate()` 在**配置校验之后**取一次
`llm` 桶令牌；取不到则抛 `LLM_MESSAGES.rateLimited`（**拒绝，不静默放行** —— 放行会让限流形同虚设）。
- **限流器为进程级共享**（`sharedRateLimiter()`），因生产有 **2 个** `LlmClient` 实例
  （`stores.ts:124`、`qualityJudge.ts:25`）—— 各建一套桶会让实际限额**翻倍**，与 Python 单例不等价。
- **闸的位置是与 Python 的有意差异**：Python 把 `_acquire_rate_limit` 放在各函数最前面，
  连 `config.enabled=false` 这种注定失败的请求也先吃一次配额；TS 放在校验之后，
  并用单测锁死「三种非法请求 ⇒ 一次令牌都不取」。
- 单测 +3 例（拒绝⇒抛文案且 0 次 fetch / 放行⇒正常走请求 / 非法请求不占配额）。

**结果**：§1 = §2 = Σ§3 = ✅ **117 / 43,157** · ◐ **15 / 8,328** · ⛔ 162 / 39,314 · ⚠️ **5 / 365**
（合计 **299 文件 / 91,164 行**，逐格相等）。**E61 至此收口**（`rate_limiter` ⚠️→✅）。

### E62（2026-10-13 全量收口；契约前向声明 2026-10-10）：按字段 AI 填充 —— `ui/ceshu/ai_field_button.py`（78 行）⚠️ → ✅

⚠️ **文档日期更正**：本节初写于 2026-10-10，彼时 `ceshu:aiGenerateField` 仅进了契约四层（`shared/`），主进程 `handle(...)` 与渲染层挂载（`AiFieldButton` 进 `ChapterForm`）尚未落地，挂在 `ipcRegistrationDrift.test.ts` 的 `PLANNED_CHANNELS`。**实际全量接线于 2026-10-13 完成**（handler + 渲染挂载 + 移出 `PLANNED_CHANNELS`，见 `bc` 任务「全量实现 E62+E63」）。下方交付物现已全部落地。

**背景**：E53 曾实证这条链在 TS **零对应**（按钮 / `_add_row(…, ai_path)` / `apply_ai_content_to_form` /
信号链 `chapter_panel:262`→`editor_view:210`→`editor_view_mixins:56`→`_AIFillFieldWorker` 全部无 TS 对应物），
且调用点达 **111 处**。本轮补齐。

**交付（纵向切片，非"只加个按钮"）**：
- `shared/ceshuAi.ts`：`buildChapterPrompt` 新增 `onlyFields` —— **只收窄字段范围**，
  上下文 / 风格术语表 / 已有内容 / 生成要求全部沿用整章逻辑。**刻意不另造一套单字段提示词**
  （两套提示词必然漂移）。与 `onlyEmpty` 叠加取**交集**。
- `shared/schemas.ts` + `shared/ipc.ts` + `shared/service/api.ts` + `preload/index.ts`：
  新通道 `ceshu:aiGenerateField`（契约类型一律取 `IpcContract[...]`，不内联）。
- `main/ipc.ts`：新 handler。
- `renderer`：`AiFieldButton.tsx` + `CeshuFieldControl` 的 `FieldLabel` / `AI_FILLABLE_KINDS`
  + `ChapterForm.handleAiFillField`。
- 单测 4 例（`onlyFields` 四条性质）+ CSS（`.ceshu-field-label-row` / `.ai-field-btn`）。

**有意偏离（逐条写明）**：
1. **状态由发起方持有**：Python 把 `_busy` 存在按钮里、由外部调 `set_busy(False)` 复位；
   React 里"谁发起请求谁持有状态"更不易漏复位。⇒ **60 秒安全兜底随之从按钮上移到 `ChapterForm`**。
   ⚠️ 那个 60s 不是体验优化而是**必需**：上层回调一旦没落地，按钮会**永久禁用**，用户只能重启应用。
2. **按字段类型批量启用，不复刻 Python 的 111 处 `ai_path` 逐字段标注** ——
   复刻等于新增一份必须与 `ceshuFields.ts` 手工同步的清单，是**新的漂移源**；
   且那 111 处本就都是文本型字段。**未验证**：111 处标注与 TS 类型判定的实际差集未逐条比对。
3. **只对文本承载型字段开入口**（text/textarea/stringList/pipeList/json），
   排除 number/combo/multiCombo/checkbox —— 结构化字段上 AI 易吐中文标签而非枚举值，
   而 `inputToFieldValue` 对 number 是 `Number(input) || 0`（乱值 → 0，**静默写坏数据**）。宁缺勿错。
4. **不套 DD-17 审批闸、不跑 DD-19 评分门**：单字段是定向小调用，非"整章/批量"；
   评分门是整章草稿粒度。一个字段对不对由用户**当场肉眼确认**（值只回填草稿、**不落盘**）。
5. 按钮用文字「AI」而非图标：TS 侧**未引入图标库**，不为一个按钮新增依赖。

**⚠️ 本轮最大的回归风险（已处理，但需渲染举证复核）**：
给标签加了 `.ceshu-field-label-row` wrapper 后，标签不再是 `.form-row` 的直接子元素
⇒ 原 `.form-row > .form-label` 的 **120px 定宽规则不再命中**，且 `.form-row > :not(.form-label):not(.btn)`
（特异性 0-3-0）会把 wrapper 拉满整行。已同时改两处：① 把 wrapper 加进那条 `:not()` 排除；
② 补 `.form-row > .ceshu-field-label-row { flex: 0 0 120px }` 与 `.form-grid` 下的 88px。
**已跑 `scripts/audit-renderer-css.py` 复核**：新增两个类均有规则，剩余 5 项为已知动态类名噪声。
**待 GUI 举证**：`preview/shot-parts.mjs` 类脚本确认章节表单标签列未错位（沙箱跑不了 GUI）。

**结果**：§1 = §2 = Σ§3 = ✅ **118 / 43,235** · ◐ **15 / 8,328** · ⛔ **166 / 39,601** · ⚠️ **0 / 0**
（合计 **299 文件 / 91,164 行**，逐格相等）。**E62 至此收口**（`ai_field_button` ⚠️→✅）。

### E63（2026-10-13 全量收口；契约前向声明 2026-10-10）：「测试连接」 —— `api_config.py` 的一处真缺口

⚠️ **文档日期更正**：本节初写于 2026-10-10，彼时 `llm:testConnection` 仅进了契约四层（`shared/`），主进程 handler 与设置面板「测试连接」按钮尚未落地，挂在 `ipcRegistrationDrift.test.ts` 的 `PLANNED_CHANNELS`。**实际全量接线于 2026-10-13 完成**（handler + 设置面板按钮 + 移出 `PLANNED_CHANNELS`，见 `bc` 任务「全量实现 E62+E63」）。下方交付物现已全部落地。

**为什么选它**：`api_config.py`（686 行）是 ◐，但审计把「测试连接」单列为**真缺口**，
且明写它是「**直接影响你换模型服务商**的一项（E40 排查后**优先级最高**）」——
用户配/换服务商后第一件事就是验证能不能连通，而 TS 侧全仓 `testConnection` 零命中。
其余三个 tab（模型管理 / 视觉 / 模板）仍属未迁或 AI 域，故 `api_config.py` **保持 ◐**。

**交付**：`LlmClient.testConnection()`（**不抛错**，所有失败转 `{ ok, message }`）
+ `probeOpenAiCompatible()` 最小探测 + IPC `llm:testConnection`（schema/IpcContract/MbApi/preload 四层）
+ 设置面板「测试连接」按钮（`data-testid="llm-test-connection"`）+ 单测 7。

**🟢 最重要的有意改进：Ollama 单独分支** —— Python 的 `test_api_connection` 只构造
`{base_url}/chat/completions` 请求，**对 Ollama 没有分支** ⇒ 本地档点「测试连接」会去打一个
本地根本不提供的路径（真缺陷）。TS 侧：**Ollama 走 `status()` 列模型（不烧 token）、云端发
`max_tokens=5` 的最小请求**。已用单测锁死「本地档的探测 URL 里**不出现** `/chat/completions`」。

**⚠️ 排障记录（我的第一版断言是错的，值得记）**：最初写成"本地档 0 次 fetch"，
结果红灯 —— **Ollama 官方 SDK 自己就走 `fetch`**（列模型 = `/api/tags`），
所以"有没有发 fetch"**不能**用来区分档位，必须看 URL。教训：断言要打到真正的行为差异上。

**其余要点**：① 刻意**不复用** `generateOpenAiCompatible`（它按 `config.maxTokens` 发正式请求，
做连通性测试会白白烧 token）；② 仍走限流桶（探针也是真实请求，保护服务商）；
③ 失败优先取服务商的 `error.message`，取不到再退回原始文本（对齐 Python 的解析回退）；
④ 设置面板点击后**先 `commitLlm` 再测** —— `testConnection` 读的是 `llm:configure` 推的镜像，
不先推就会拿旧配置去测（与既有 `probeLocal` 同理）。

**结果**：台账**数字不变**（`api_config.py` 仍是 ◐，只是少一处缺口）：
✅ 118 / 43,235 · ◐ 15 / 8,328 · ⛔ 166 / 39,601 · ⚠️ 0 / 0。
验证：vitest **121 文件 / 1916 例全绿**（+7）、tsc 双配置 0 错、eslint 0、build 成功。
**⚠️「整块没做」只剩 4 项，且全部卡在非技术因素**：`auto_updater` 60（产品决策：要不要自动更新）、
`event_bus` 87（已由 IPC + brain 事件流设计性替代）、`sentry_client` 52（产品决策：要不要接错误上报）、
`privacy` 88（待定）。

### E64（2026-10-10）：主题 2 套 → 4 套（暖调 / 暗夜）—— 闭合 `config/constants.py` 的「主题」子缺口

**为什么选它**：上一轮清 ◐ 非 AI 小件时，三个候选（备份目录 / 快捷键 / 窗口常量）两度被证伪
（`backup_dir` 默认值与 TS 写死 `<库>/backups` 行为等价；`shortcuts.py` 的 35 条 TS 已按「只列真实注册」有意只留 3 条），
唯一真差是 **Python `themes.py` 有 4 套主题（默认/暖调/深色/暗夜），TS 只有 2 套**。属可见、有边界的一刀。

**交付**：色值**逐一取自 Python `themes.py`（不自配）**。
- `shared/theme.ts`：`ThemeMode` 加 `warm`/`night`，`VALID_THEMES` 同步扩；
- `shared/settingsPreferences.ts`：`THEME_OPTIONS` 由 2 档扩到 4（浅色/深色/暖调/暗夜）；
- `styles.css`：新增 `[data-theme='warm']` / `[data-theme='night']` 覆写块（CSS 变量层，非 QSS）；
- `App.tsx`：主题切换由「翻转深/浅」改为「在 4 档间循环」，按钮文案动态化。

**🟢 关键 bug 修复（差点让整功能失效）**：原 `applyTheme` 只对 `'dark'` 设 `data-theme`、其余一律
`removeAttribute` ⇒ 选「暖调/暗夜」会**静默回落到 `:root`（浅色），新主题根本不生效**。
改为「非 `light` 一律 `setAttribute('data-theme', mode)`」。这正是本项目翻过三次的同型缺陷
（**改判定前必须枚举依赖旧值的路径**——两档时代的 `mode==='dark' ? set : remove` 与
`mode==='light' ? remove : set` 等价，加档后不再等价）。

**单测锁死**：① `applyTheme` 对 warm/night 正确写入 `data-theme`（防将来改判定静默失效）；
② `THEME_OPTIONS` 长度=4、每档能被 `loadTheme` 认回（防面板下拉漂移出第三档）；
③ `loadTheme` 拒非法值回退默认。`settingsPreferences.test.ts` 原「恰好两档」断言同步改为 4。

**结果**：台账**数字不变**（`config/constants.py` 仍 ◐，窗口/文件名常量仍缺，仅「主题」子缺口闭）：
✅ 118 / 43,235 · ◐ 15 / 8,328 · ⛔ 166 / 39,601 · ⚠️ 0 / 0。
验证：vitest **121 文件 / 1919 例全绿**（+3）、tsc 双配置 0 错、eslint 0、CSS 审查脚本通过（仅 5 个已知噪声）、build 成功（CSS 107.57→109.93 kB，即两档新主题块）。

### E65（2026-10-10）：⚠️ 清零（4 文件全改判 ⛔）+ Python 版物理隔开

**用户指令**：「py 是 2（物理隔开到 `_legacy-py/`）；TS 迁移尚余 6–8% 的，在做一个不就好了吗？」—— 即：① 按方案 2 隔离 Python 版；② 把剩余迁移一口气收掉。

**澄清「6–8%」的真相（避免误判）**：那 6–8% 里，**真正「整块没做」就这 4 个小文件（287 行），且全卡在产品决策**，不是大块欠债：
- `event_bus`（87）：**仅被 `core/agent/tools/*` 用** ⇒ 全在已判 ⛔ 的 AI 重写域；TS 用 IPC + brain 事件流替代。
- `privacy`（88）：**仅被 `core/agent/memory_store.py` 用** ⇒ 同样只在 ⛔ 的 AI 重写域（且头部写「Agent OS §11」＝重写域设计稿）。
- `auto_updater`（60）：被 py `main_window` 用，但本质是「GitHub releases 检查」——本地离线应用、无发布基础设施＝产品决策。
- `sentry_client`（52）：被 py `app.py` 用，但本地离线应用默认不上报外部遥测＝与保密/隐私哲学一致。

⇒ **这 4 个都不值得 1:1 迁**（迁了也是死代码，违反铁律）；全部改判 ⛔。**⚠️ 至此清零。**
**剩余 ◐ 的大头是 AI 重写域**（`core/agent` 等，约 8,328 行里的未迁面），按 E42 裁决走**重写**而非 1:1 移植 —— 那是智能体框架的独立大工程，**不计入「迁移欠债」**，不是一刀能收的。

**Python 版物理隔开（方案 2）**：`src/`、`tests/`、`config/`、`app.py`、`build.py`、`build.spec`、`pyproject.toml`、`requirements*.txt` 全部移到仓库根 **`_legacy-py/`**（含 README 注明「冻结、只读、勿改」）。**不动**：`data/`（TS 在用）、`desktop/`（TS 产品）、`docs/`、`scripts/`（CSS 审查脚本用 venv 解析 `desktop/src`）、`assets/`。`desktop/` 与 TS 构建/测试完全不依赖根 `src/`，隔离零影响。

**台账结果**：4 文件从 ⚠️ 改判 ⛔ ⇒ ⛔ 162→**166**、39,314→**39,601**；⚠️ 4/287→**0/0**。✅/◐ 不变。
✅ 118 / 43,235 · ◐ 15 / 8,328 · ⛔ **166 / 39,601** · ⚠️ **0 / 0**（仍 299 文件 / 91,164 行）。
验证：docsLedger 守卫全绿（三处数字一致）；TS vitest **121 文件 / 1919 例**、tsc 双 0、eslint 0、build 成功（隔离前已验；隔离只动根 `src/`，不触碰 `desktop/`）。

### 真实剩余 ≈ 0.5–0.7 万行（6–8%）

- **确定未迁（整块没做）＝ 0 行 / 0 文件**（E65 已清零：上述 4 文件全部改判 ⛔）
- **部分已迁里的缺口 ≈ 0.5–0.6 万行**（**估算**：8,673 行按各文件给出的完成度 25%–75% 折算，未完成部分过半）
- 合计 **≈ 0.5–0.7 万行**，占旧代码 **≈ 6–8%**

> **口径说明（E57 更新）**：不能把「⛔有意不迁」的 39,314 行算成欠债 —— 那些是**决策**（`core/agent` AI 框架重写域 24,670 行中的绝大部分、团队 CRUD 818、自愈链 4,166、样例数据 1,125、PyQt 胶水、死代码、Qt QSS 主题栈、`themes`/QSS 与 `tab_manager`/`startup_mode`/`virtual_list` 的设计性替换等），各有实证依据。
> 但也不能把「◐部分已迁」算成已迁 —— 那 9,555 行里有一部分是真缺口。
>
> **⚠️ 除本表之外还有一块「重写」而非「移植」的工作**：**AI 框架整体重写**（`core/agent` 域 97 文件 / 24,670 行 + 数字员工 UI 与任务面板）。它**不计入上面的迁移欠债**（E42 裁决），但也**不是零工作量** —— 只是走重写路径，规模与范围待框架设计定案。

### ◐ 复核（2026-10-07：E50 首轮 + E56 收口）

对全部「◐ 部分已迁」条目做了逐条实测复核。

> **⚠️ E56 已把本节结论整体刷新**：E50 只处理了 STALE-DONE（TS 已等价实现但判定过期）一类，**当时的 ◐ 仍为 58 文件 / 21,503 行**；**E56（见 §1「E56 ◐ 行文件级复核」块）逐条重判后降为 22 文件 / 10,961 行**，**E57（见 §1「E57 前端尾巴收口」块）再降为 18 文件 / 9,555 行**，**E58 再降为 15 文件 / 8,328 行**，**E61 中 `rate_limiter` ⚠️→◐ 曾回升为 16 文件 / 8,413 行，接线后 ◐→✅ 落回 15 文件 / 8,328 行**。以下 E50 名单保留为**历史痕迹**，**当前 ◐ 明细请以 §3 与 §1 的 E58 块为准**。

**E50 首轮（已升 ✅，共 11 文件）**：window_state / preview_panel / statistics / template_manager / common / export / advanced / chat_renderer / image_loader / toast / home_widget（TS 已等价实现、原 ◐ 判定过期）。

**E56 收口（三类改判，共 36 文件）**：
- **AI 框架重写域 ⇒ ⛔（30 文件 / 9,033 行）**：`core/agent` 全部 23 个 ◐（6,752 行）+ 数字员工与任务面板 7 个（2,281 行）。**已迁部分保留**，未迁部分随框架重写、不 1:1 移植。
- **能力实测已存在 ⇒ ✅（2 文件）**：`score_report_dialog.py`（E49 就补了，台账没跟）、`shortcuts_dialog.py`（E37 的 `ShortcutsPanel` + 菜单入口）。
- **死代码 / 设计性替换 ⇒ ⛔（4 文件）**：`security/sandbox.py`（`jsSandbox.ts` 设计性替换）、`buff_system.py` + `equipment_system.py`（使用面已由 `attrPreview.ts` 等价实现，未迁部分无调用点）、`tab_manager.py`（多标签形态被 E28 顶层 IA 取代）。

**E57 收口（2 升 ✅ / 2 改判 ⛔，共 4 文件）**：
- **升 ✅**：`dynamic_form.py`（839 行，`dialog` 形态本轮补齐；余下唯一「未迁」的 `formula_builder` 经 grep 实证为**无 schema 产出**的死代码 ⇒ 非缺口）、`menus.py`（180 行，「数据关系图」本轮实现；「内容关联」两项经实证为 PyQt **死入口** ⇒ 删除而非迁）。
- **改判 ⛔**：`startup_mode_dialog.py`（144 行，工作模式概念随 E28 IA 重写消失）、`components/virtual_list.py`（243 行，唯一消费者页已下线 + 右键菜单语义务 E51 并入 `DataEditorTab`；余下「虚拟滚动」是渲染技术差异）。

**E58 后仍为 ◐ 的 15 文件（真实缺口）**，属下列两类之一（E58 把 `validation_dialog` / `changelog_dialog` / `type_editor_field_widget` 三个文件清出 ◐ —— 前两个是 `d5ad355` 的**台账滞后**、第三个补了拼音兜底）：

- **DESIGN-DIFFERENT（TS 有意替换，非缺口；但整文件尚有其他未迁面，故未升 ✅）**：`themes` / QSS 主题栈（`ui/` 顶层域）、`_ai_dialog` 模板模式。
- **genuine-partial（仍有真实缺口）**：`data_tab.py`（AI 生成时的「技能锚点模板」选择上下文，见 §4；P5 数量约束软检查、F2·右键重命名与条目右键菜单已由 **E51** 补齐）；`ceshu_controller.py`（tab 过滤已由 `computeEnabledEditors` 设计性取代，`send_ceshu_ai_context` 属 AI 域）；`main_window.py`（外壳骨架已迁 `App.tsx`，多标签被 E28 IA 取代、窗口状态已迁 `main/windowState.ts`，余下为 AI context 与更新检查）；`common/ai_client.py`（仅剩流式 / tools / vision / 限流，完成度 40%）；`api_config.py`（三 tab 未迁 + 「测试连接」无对应，见上）；`type_editor_dialog.py`（布局分区 + 智能工具栏的 AI 三项）、`type_editor_ai.py` 等 AI 依赖面。

**仅有的真实遗留**（本轮实测确认）：

1. **评分报告 Markdown 导出** —— 已由 **E49** 补齐（`shared/ceshuScorer.ts::buildScoreReportMarkdown` + `ceshu:exportScoreReport` 接线 + 面板「导出评分报告」按钮）。
2. **`components/virtual_list.py` 的条目右键菜单** —— 已由 **E51** 补齐（`DataEditorTab` 的 `row-context-menu`：重命名 / 编辑 / 复制 / 删除，与 Python `virtual_list.py:217-231` 同序）。**E57** 完成该文件的收口判定：全仓 `VirtualListWidget` 的真实消费者只有 `data_tab.py`（`ui/components/__init__.py` 与 `ui/__init__.py` 仅 re-export），而数据表页已随 E28 IA 重写下线；「拖拽排序」属 **DESIGN-DIFFERENT**（Python 重排**内存数组**，而 TS 条目来自 **SQLite、无数组序**）；「虚拟滚动」是 PyQt 的渲染技术（`QListView` 只画可见行）而非用户可见能力。⇒ 整文件**改判 ⛔**（复盘条件见 §1「E57 前端尾巴收口」）。
3. **`ui/data_tab.py` 的少量缺口** —— **E51 已补两项**：① P5 数量约束软检查（`shared/dataCountConstraint.ts` + `DataEditorTab` 行内确认）；② F2 / 右键「重命名」（行内输入框，替代 Electron 渲染层不存在的 `QInputDialog`/`window.prompt`）。**仅剩** AI 生成的「技能锚点模板」选择上下文：TS 的 `AiDataGenPanel` 走**策划书驱动**的另一种设计，Python 的「参考策划方案」一项已被取代，但「选一个角色/怪物/装备作为技能归属」的锚点仍是真实缺口（且改动会触及 AI 生成提示词与 IPC 契约，需先裁决）。核心数据编辑能力（列表/搜索/增删改/复制/类型编辑/引用/AI 生成/撤销重做）均已迁，故本文件**保持 ◐**（未达「完全等价」）。

### E51 数量约束：对 Python 的有意偏离（逐例实测对照）

E51 新增的 `shared/dataCountConstraint.ts` 把 Python `data_tab.py:370-432` 的 P5 软约束搬到了 TS。
**一致**的部分：候选字段优先级（`count` → `<type>_count` → `max_count` → `total_count`）、非法值跳过继续试下一字段、
上限 ≤0 视为无约束、`current < limit` 才放行、只取第一个 `data_type` 命中的系统。

**不一致**的 4 处，全部用 `python -c` 与 `node -e` 逐例跑过（下表的「Python」列是真跑出来的值）：

| 输入 | Python | TS | 性质 |
|---|---|---|---|
| `{count: true}` | `1`（生效） | `null`（不约束） | **刻意**：上限字段出现布尔本身就是数据错误 |
| `{count: '1_0'}` | `10` | `null` | **刻意**：Python `int()` 接受下划线分隔与全角数字，TS 只认 `^[+-]?\d+$` |
| `{count: '１２'}` | `12` | `null` | 同上 |
| `{count: 3.0}` | `null`（float 被跳过） | `3`（生效） | **语言层不可复现**：`JSON.parse('{"count":3.0}')` 在 JS 里就是数字 `3`，无法与 `3` 区分 |
| 系统缺 `data_type` | 永不约束（严格 `==`） | 回退系统 key 后参与约束 | **刻意**：与 TS `computeEnabledEditors` 的 `data_type ?? key` 口径统一 |

前 3 处在策划书第五章的字段形态下**不可达**（上限来自系统 config 表单，只有整数/文本两种形态），
第 4 处是刻意的口径统一。**测试已把这 4 处钉住**（`tests/unit/dataCountConstraint.test.ts`），
不靠注释约定。

### E52 条目行点击落点（窄列误删修复，实测记录）

E51 的独立验证者报告：在策划书右侧预览面板里，条目行的**几何中心**落在「删除」按钮上，其用例第一次因此**误删**而非选中。这是**既有**缺陷（E51 未引入），E52 修掉。

**实测根因**（`preview/measure-row.mjs`，用 `document.elementFromPoint(行中心)` 判落点，非读 CSS 推理）：

| | 修前 | 修后 |
|---|---|---|
| 行宽 | 160px（`.list-column` 固定 200px − `.list` 左右各 20px） | 160px（不变） |
| 名称盒 | **18.7px**（「技能 1」文本需 40px，`scrollWidth 40 > clientWidth 19` ⇒ 已截断） | **92px**（`92 == 92`，不截断） |
| 删除钮 | **74.7px**（占整行 47%） | **26px**（图标态） |
| `elementFromPoint(行中心)` | **`ceshu-data-delete`**（点中心即删除） | **`ceshu-data-item-row`**（= 选中该条目） |

**修法**（`styles.css`，全部限定在 `.ceshu-preview .item-row` 作用域）：删除钮文本包进 `.btn-label` 并在窄列 `display:none`；`.item-meta`（8 位短 id）`display:none` 让位（id 仍可由行 `title` 与右侧表单读到）；`.item-name { min-width: 64px }` 兜底；删除钮 `padding: 4px 6px`。
**E2E 契约不变**：按钮本体与 `data-testid="ceshu-data-delete"` 保留（`smoke.spec.ts:84` 唯一的删除点击照旧可用），无任何 spec 断言行内 `item-meta` 文本。

**守卫**：`preview/measure-row.mjs` 已从「报告脚本」升级为**断言脚本**（行中心命中删除钮 ⇒ 退出码 1）；按本仓库铁律用**已知坏版本验过有效性** —— 把 `styles.css` 退回 E51 提交版重跑，wide-1440 / mid-1100 两档如实报失败（名称 18.7px、命中 `ceshu-data-delete`），恢复后全通过。同批 E51 的 41 条渲染断言复跑仍 41/41。

**遗留（未修）**：视口 ≤900px 时 AI 停靠栏叠在预览面板之上，行取不到点（`elementFromPoint` → `digital-panel`）。与条目行布局无关，未处理。

## 2. 汇总（按域）

| 域 | 文件 | 行数 | ✅已迁 | ◐部分 | ⛔不迁 | ⚠️未迁 |
|---|---|---|---|---|---|---|
| `core/agent` | 97 | 24,670 | 8 / 1,689 | 0 / 0 | 89 / 22,981 | 0 / 0 |
| `ui/ceshu` | 35 | 14,620 | 29 / 13,830 | 2 / 349 | 3 / 363 | 1 / 78 |
| `ui/widgets` | 24 | 9,232 | 15 / 6,892 | 0 / 0 | 9 / 2,340 | 0 / 0 |
| `ui/` 顶层 + `themes` + `components` | 31 | 9,883 | 10 / 1,952 | 3 / 2,784 | 18 / 5,147 | 0 / 0 |
| `core/ceshu` + `core` 顶层 + `defaults` | 38 | 12,602 | 28 / 11,129 | 0 / 0 | 10 / 1,473 | 0 / 0 |
| `ui/dialogs` | 20 | 6,055 | 11 / 3,519 | 3 / 1,552 | 6 / 984 | 0 / 0 |
| `common` + `config` + `security` + `data` + 顶层 | 45 | 10,672 | 11 / 2,518 | 5 / 2,164 | 28 / 5,905 | 0 / 0 |
| `features` | 9 | 3,430 | 4 / 1,543 | 2 / 1,479 | 3 / 408 | 0 / 0 |
| **合计** | **299** | **91,164** | **118 / 43,235** | **15 / 8,328** | **166 / 39,601** | **0 / 0** |

> **注（E54 已消除漂移；E58 同步收口结果）**：上表「合计」是各域行直接相加，且与 §1 结论表**逐格相等**（117 / 15 / 162 / 5 = 299 文件；43,157 + 8,328 + 39,314 + 365 = 91,164 行）。此前 §1 与 §2 存在 **±2 文件 / 480 行** 的差异、§1 与 §3 明细差 7 文件，**E54 已按 §3 逐文件明细统一**（方法与逐笔来源见 §1 的「E54 台账校准」块）；**E56** 又把 30 行 ◐→⛔（AI 框架重写域）、2 行 ◐→✅、4 行改判 ⛔；**E57** 再 2 行 ◐→✅（`dynamic_form` / `menus`）、2 行 ◐→⛔（`startup_mode_dialog` / `virtual_list`）；**E58** 再 3 行 ◐→✅（`validation_dialog` / `changelog_dialog` 为 `d5ad355` 的台账滞后补记；`type_editor_field_widget` 补拼音兜底），各域行随之更新（见 §1 的「E58 前端尾巴 3/3」块）。**§1 仍是守护测试的解析源**。
> **E61（2026-10-10）**：`common/rate_limiter.py` 85 行 **⚠️→✅**（`shared/rateLimiter.ts` + 单测 15
> + 接线 `main/llm/client.ts::generate()` + 闸测试 3 例）⇒ **⚠️ 6→5（450→365）、✅ 116→117（43,072→43,157）**，
> ◐ 经 16 / 8,413 后**落回 15 / 8,328**；总量仍为 299 文件 / 91,164 行，各域行已随之更新。
> **守护测试 `docsLedger.test.ts` 当场抓到过「§1 改了但 §2 合计没跟」的漂移**（本轮两次红灯的来源）：
> 审计数字必须**三处同步** —— ① 本 §1 表 ② §2 的「合计」行 ③ roadmap §2 内嵌的那份副本。
>
> **E58 后各域 ◐ 列**：`core/agent` / `ui/widgets` / `core/ceshu` 三域 **◐ 已清零**；余下 ◐ 集中在 `ui/dialogs`（3 / 1,552）、`ui/` 顶层+主题（3 / 2,784）、`ui/ceshu`（2 / 349）、`features`（2 / 1,479）、`common`（5 / 2,164）。

**三个最值得注意的域**：
1. **`core/agent`（最大域，24,670 行）→ 只有 8 个文件（1,689 行）是完整已迁**；其余 **89 个文件（22,981 行）全部 ⛔**（E56 后 ◐ 清零）：其中 33 文件 / 8,419 行按 **E42** 改判「不迁（框架改为重写）」，再叠加 **E56** 把余下的 23 个 ◐ 文件（6,752 行）一并归入该重写域。A 档做的是「核心闭环」，不是「整个 Agent 引擎」。
2. **`ui/` 顶层 + 主题（9,883 行）→ 仅 1,952 行完整已迁**（E56 把 `shortcuts_dialog.py` 107 上移 ✅、`tab_manager.py` 249 与 `buff`/`equipment` 等改判 ⛔；E57 把 `menus.py` 180 上移 ✅、`virtual_list.py` 243 改判 ⛔），主题/特效/多标签整块未做（多为 C 档，但那是**决策**还是**欠债**需区分：主题≠核心功能）。
3. **`ui/dialogs`（6,055 行）→ 已完整迁出 3,519 行**（E54 把 `settings_dialog.py` 671 行从 ⚠️ 上移 ✅；E58 再把 `type_editor_field_widget.py` 345 行上移 ✅），该域 **⚠️ 列已清零**；余下 `api_config.py`（模型管理/视觉/模板三 tab 未迁 + 「测试连接」无对应）等为 ◐（E57 把 `startup_mode_dialog.py` 144 改判 ⛔）。快速创建/统计/字段模板/高级搜索/类型可见性/数据对比/备份已由此前的 E10–E16 迁出。

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
| brain.py | 130 | ⛔ | 门面→`brainService.ts`；intent/learner/plan/reflect/subagent/plugin/perf 装配未迁 ｜ **E56**：属 E42「AI 框架重写」域 —— **未迁部分随框架重写、不 1:1 移植，不计迁移欠账**（已迁部分为在用资产、保留）（原判 ◐50%） |
| brain_prompt.py | 294 | ⛔ | `shared/agent/prompts.ts` 仅骨架；persona/画像/长期记忆/黑板未迁 ｜ **E56**：属 E42「AI 框架重写」域 —— **未迁部分随框架重写、不 1:1 移植，不计迁移欠账**（已迁部分为在用资产、保留）（原判 ◐30%） |
| dispatcher.py | 585 | ⛔ | `main/agent/dispatcher.ts`；MCP/SubAgent/`execute_parallel` 未迁 ｜ **E56**：属 E42「AI 框架重写」域 —— **未迁部分随框架重写、不 1:1 移植，不计迁移欠账**（已迁部分为在用资产、保留）（原判 ◐70%） |
| frontend_snapshot.py | 480 | ⛔ | 内省约 300 行为 PyQt 胶水；库信息→`library/manager.ts`、危险确认→`approvalBroker.ts` ｜ **E56**：属 E42「AI 框架重写」域 —— **未迁部分随框架重写、不 1:1 移植，不计迁移欠账**（已迁部分为在用资产、保留）（原判 ◐35%） |
| memory.py | 80 | ⛔ | 门面→`shared/agent/memory.ts`+`memoryStore.ts`（仅嵌入/检索/写入） ｜ **E56**：属 E42「AI 框架重写」域 —— **未迁部分随框架重写、不 1:1 移植，不计迁移欠账**（已迁部分为在用资产、保留）（原判 ◐25%） |
| memory_context.py | 136 | ⛔ | `brainService.ts` 注入「## 相关记忆」；项目记忆/上下文块未迁 ｜ **E56**：属 E42「AI 框架重写」域 —— **未迁部分随框架重写、不 1:1 移植，不计迁移欠账**（已迁部分为在用资产、保留）（原判 ◐25%） |
| memory_embedder.py | 114 | ⛔ | `shared/agent/memory.ts::embedText`（32 维确定性；原 ngram/TF-IDF bug 不复刻） ｜ **E56**：属 E42「AI 框架重写」域 —— **未迁部分随框架重写、不 1:1 移植，不计迁移欠账**（已迁部分为在用资产、保留） |
| memory_index.py | 74 | ⛔ | vectra `LocalIndex`（`memoryStore.ts`） ｜ **E56**：属 E42「AI 框架重写」域 —— **未迁部分随框架重写、不 1:1 移植，不计迁移欠账**（已迁部分为在用资产、保留） |
| memory_search.py | 231 | ⛔ | `memoryStore.ts::search(topK)`；多路召回/去重未迁 ｜ **E56**：属 E42「AI 框架重写」域 —— **未迁部分随框架重写、不 1:1 移植，不计迁移欠账**（已迁部分为在用资产、保留） |
| memory_store.py | 195 | ⛔ | `memoryStore.ts` add/count；反馈/偏好持久化未迁 ｜ **E56**：属 E42「AI 框架重写」域 —— **未迁部分随框架重写、不 1:1 移植，不计迁移欠账**（已迁部分为在用资产、保留） |
| memory_vector.py | 271 | ⛔ | 自研向量→vectra 替代 ｜ **E56**：属 E42「AI 框架重写」域 —— **未迁部分随框架重写、不 1:1 移植，不计迁移欠账**（已迁部分为在用资产、保留） |
| models.py | 52 | ⛔ | `SkillResult`/`SkillExecutionContext`→`protocol.ts`；`FeedbackRecord`→`shared/agent/personalization.ts`；Intent/MemoryEntry 未迁 ｜ **E56**：属 E42「AI 框架重写」域 —— **未迁部分随框架重写、不 1:1 移植，不计迁移欠账**（已迁部分为在用资产、保留） |
| prompts.py | 598 | ⛔ | `shared/agent/prompts.ts` 仅骨架；USER_AGENTS/TEAM_AGENTS/STEWARD_BASE_PROMPT 未迁 ｜ **E56**：属 E42「AI 框架重写」域 —— **未迁部分随框架重写、不 1:1 移植，不计迁移欠账**（已迁部分为在用资产、保留）（原判 ◐30%） |
| safety_guard.py | 154 | ⛔ | `protocol.ts` 风险分级 + `approvalBroker`；token 裁剪/工具替代建议未迁 ｜ **E56**：属 E42「AI 框架重写」域 —— **未迁部分随框架重写、不 1:1 移植，不计迁移欠账**（已迁部分为在用资产、保留）（原判 ◐50%） |
| semantic_memory.py | 233 | ⛔ | ChromaDB→vectra 重设计 ｜ **E56**：属 E42「AI 框架重写」域 —— **未迁部分随框架重写、不 1:1 移植，不计迁移欠账**（已迁部分为在用资产、保留） |
| workspace.py | 227 | ⛔ | →`main/library/*` + `<库>/agent`；persona/多工作区未迁 ｜ **E56**：属 E42「AI 框架重写」域 —— **未迁部分随框架重写、不 1:1 移植，不计迁移欠账**（已迁部分为在用资产、保留）（原判 ◐40%） |
| skills/ceshu_skill.py | 138 | ⛔ | `ceshuSkill.ts`；`ai_*` 动作未接 ｜ **E56**：属 E42「AI 框架重写」域 —— **未迁部分随框架重写、不 1:1 移植，不计迁移欠账**（已迁部分为在用资产、保留） |
| skills/ceshu_skill_data.py | 120 | ⛔ | CRUD 已迁；`import` 未迁 ｜ **E56**：属 E42「AI 框架重写」域 —— **未迁部分随框架重写、不 1:1 移植，不计迁移欠账**（已迁部分为在用资产、保留） |
| skills/ceshu_skill_generate.py | 684 | ⛔ | `ceshuAi.ts`+`ceshuDataGen.ts`；`ai_fill_field`/`analyze_description` 无 TS ｜ **E56**：属 E42「AI 框架重写」域 —— **未迁部分随框架重写、不 1:1 移植，不计迁移欠账**（已迁部分为在用资产、保留）（原判 ◐55%） |
| skills/ceshu_skill_review.py | 299 | ⛔ | review 维度+`AiReviewPanel`；`ai_review_full`/系统推荐应用未迁 ｜ **E56**：属 E42「AI 框架重写」域 —— **未迁部分随框架重写、不 1:1 移植，不计迁移欠账**（已迁部分为在用资产、保留）（原判 ◐50%） |
| skills/common.py | 106 | ⛔ | `protocol.ts::inferAction/fixParams`+`dispatcher.ts` 归一 ｜ **E56**：属 E42「AI 框架重写」域 —— **未迁部分随框架重写、不 1:1 移植，不计迁移欠账**（已迁部分为在用资产、保留） |
| skills/game_data_skill.py | 1008 | ⛔ | `gameDataSkill.ts`（list/query/create/update/delete）；batch/switch/统计未迁 ｜ **E56**：属 E42「AI 框架重写」域 —— **未迁部分随框架重写、不 1:1 移植，不计迁移欠账**（已迁部分为在用资产、保留）（原判 ◐45%） |
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
| brain_plan.py | 287 | ⛔ | 计划驱动执行，A1-2 明确不移植 |
| brain_reflect.py | 108 | ⛔ | 失败反思，A1-2 明确不移植 |
| brain_subagent.py | 67 | ⛔ | SubAgent 通道，A1-1 明确不移植 |
| intent.py | 718 | ⛔ | 规则意图解析+Planner，TS 无 |
| learner.py | 543 | ⛔ | **偏好/反馈子集已迁**：`shared/agent/personalization.ts`（extractPreferences/buildPersonalizedContext）+ `main/agent/preferenceStore.ts`（PreferenceStore/FeedbackStore）+ `brainService.ts` 注入系统提示词 + `agent:feedback` IPC；**未迁**：动作计数/转移矩阵、下一步建议、时间峰值、技能模板自动生成（依赖 TS 没有的 `Intent`/`BrainState`，属过度设计，有意不迁） ｜ **E56**：属 E42「AI 框架重写」域 —— **未迁部分随框架重写、不 1:1 移植，不计迁移欠账**（已迁部分为在用资产、保留） |
| mcp.py | 391 | ⛔ | MCP 客户端（方案列「重设计」，未实施） |
| memory_history.py | 211 | ⛔ | 对话历史/反馈持久化，TS 无 |
| model_registry.py | 186 | ⛔ | 模型注册/切换，TS 无 |
| speech_service.py / vision_capture.py | 235+306 | ⛔ | TTS/ASR、截图 Vision，随技能暂缓 |
| agents/agent_manager.py / collaboration.py / subagent_engine.py | 338+72+219 | ⛔ | 团队/黑板/子智能体，TS 无 |
| skills/audio_skill.py / image_skill.py / pdf_parse_skill.py | 246+487+465 | ⛔ | 拍板暂缓 |
| skills/model_skill.py / shell_skill.py / system_skill.py | 156+297+614 | ⛔ | TS 无注册 |
| skills/ui_control_skill.py / ui_preview_skill.py | 404+161 | ⛔ | 操控 PyQt 界面，Electron 无对应 |
| skills/schema_edit_skill.py / batch_data_skill.py | 359+65 | ⛔ | UI 有对应能力但未接协议技能 |
| skills/export_doc_skill.py / game_balance_skill.py / git_tool_skill.py | 152+155+190 | ⛔ | TS 无 |
| skills/todo_skill.py / web_search_skill.py / visualization_skill.py | 172+198+162 | ⛔ | TS 无 |
| skills/delegate_skill.py / scheduler_skill.py / workflow_skill.py | 75+155+214 | ⛔ | 依赖未迁的团队/工作流 |
| workflow/scheduler.py / workflow_engine.py | 242+312 | ⛔ | 仅被 scheduler/workflow_skill 消费 |

### 3.2 `ui/ceshu`（35 文件 / 14,620 行）—— **本域迁移质量最高**

| 文件 | 行数 | 判定 | 依据 |
|---|---|---|---|
| chapter_forms/_industrial.py | 1246 | ✅ | `ChapterForm.tsx`+`CeshuFieldControl`+`shared/ceshuFields.ts`。**E53 补充**：`_add_row` 的 **79 处** `ai_path` 同 `_base.py`，属未迁的字段级 AI |
| editor_view_mixins.py | 871 | ✅ | `CeshuView.tsx` + 各 Panel |
| version_diff_dialog.py | 855 | ✅ | `VersionDiffPanel.tsx`+`shared/ceshuDiff.ts` |
| ai_full_generate_dialog.py | 801 | ✅ | `AiFullGeneratePanel.tsx`+`shared/ceshuAi.ts` |
| systems_editor.py | 611 | ✅ | `SystemsEditor.tsx` |
| template_editor_dialog.py | 589 | ✅ | `TemplateEditorPanel.tsx`+`ceshuCustomTemplates.ts`+`main/ceshu/templateStore.ts` |
| chapter_forms/_base.py | 571 | ✅ | `ChapterForm.tsx`+`ceshuFields.ts`/`ceshuDefaults.ts`。**E53 补充**：`_add_row` 的 **32 处** `ai_path`（如「主要用户」= `vision.user_personas.primary`）属**未迁**的字段级 AI，见 `ai_field_button.py` 行 |
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
| chapter_forms/_common.py | 231 | ✅ | 并入 `ChapterForm.tsx`+`CeshuFieldControl.tsx`。**E53 补充**：本文件另含 F1 按字段 AI 填充机制（`_add_row` 的 `ai_path` 参数 / `apply_ai_content_to_form`），该机制**未迁** —— 单独计入 `ai_field_button.py` 行（⚠️），故本行 ✅ 不变 |
| chapter_templates.py | 170 | ✅ | `ceshuTemplateData.ts::CHAPTER_TEMPLATES` |
| home_card.py | 161 | ✅ | `ceshuHome.ts::buildCeshuCards` |
| competitive_chart.py | 99 | ✅ | `CompetitiveChart.tsx`+`ceshuCompetitiveChart.ts` |
| score_report_dialog.py | 603 | ✅ | **E56 实证已迁**：`ceshu:exportScoreReport`（`main/ipc.ts:872` → `exportTextReportFile`）+ `CeshuView.tsx:338-351` 的 `buildScoreReportMarkdown` 与「导出评分报告」按钮（E49 补齐，对齐 Python `_on_export_md`）。原判「缺导出 Markdown 评分报告」是 E49 之前的快照 |
| validation_dialog.py | 556 | ✅ | **E58 补记（原判 ◐90% —— 台账滞后）**。「导出 Markdown 校验报告」**已由 `d5ad355` 实现并接线**：`shared/ceshuReports.ts::buildValidationReportMarkdown`（逐行对齐 `_build_markdown`：评分 `100−错误数×3`、分类摘要、问题清单分组、章节完成度表、结论与建议）+ `CeshuView.tsx` 的 `validate-export` 按钮 → `ceshu:exportValidationReport`（主进程原子写盘）。视图侧 `validate-panel` 早已迁；「**一键修复必填字段**」（`_on_auto_fix` → `auto_fill_required`）另有对应物 `shared/ceshuFill.ts::autoFillRequiredFields` + `ceshu:autoFill` + `ChecklistPanel` 的「一键修复」。**该行是被 `d5ad355` 遗漏同步的**（该提交未改任何 `docs/` 文件） |
| changelog_dialog.py | 326 | ✅ | **E58 补记（原判 ◐80% —— 台账滞后）**。「导出 MD/HTML/Text」**已由 `d5ad355` 实现**：`shared/ceshuReports.ts::buildChangelog{Markdown,Text,Html}`（对齐 `core/ceshu/ceshu_changelog.py::Changelog.to_{markdown,text,html}`，含 HTML 转义与内联样式）+ `CeshuView` 的 `changelog-export-md/html/text` 三按钮 → `ceshu:exportChangelogReport`。版本范围选择 + 生成 + 渲染此前已迁。**该行是被 `d5ad355` 遗漏同步的** |
| ai_panel.py | 248 | ◐60% | 通用对话由 `DigitalPanel` 承接；策划书专属 8 主题快捷面板未迁 |
| editor_view_workers.py | 101 | ◐50% | 整章 AI 已迁；单字段填充 `_AIFillFieldWorker` 无对应 |
| preview_panel.py | 222 | ✅ | **E44 已迁「数据引用概览」**（`@data[...]` 解析 + 实时值 + 分组统计，见 `shared/dataRef.ts`；并修正 PyQt 单复数键不匹配的 bug）。**E49 更正（实测翻案）**：原写「`enabled_editors` 动态编辑器半边未迁」**为误**——该半边**亦已迁**：`ceshu/CeshuDataPreview.tsx` 按 `computeEnabledEditors(doc)` 逐启用系统渲染标签页并内嵌 `DataEditorTab`，同面板「📊 数据引用」标签渲染 `CeshuDataRefsPanel`。`core/editor_layout.py` 是另一文件（⛔ E5 已实证过期死代码），与此无关（E50 重新分类为 ✅：TS 已等价实现，原 ◐ 判定过期） |
| ai_field_button.py | 78 | ✅ | **E62（2026-10-10）已迁**：`components/AiFieldButton.tsx`（含 Python 的**防重入** + **60s 安全兜底**）+ `CeshuFieldControl` 的 `FieldLabel`/`AI_FILLABLE_KINDS` + `ChapterForm.handleAiFillField`（状态由发起方持有、兜底定时器上移）+ IPC `ceshu:aiGenerateField` + `shared/ceshuAi.ts::buildChapterPrompt` 新增 `onlyFields` + 单测 4。**有意偏离**：① Python 是**逐字段标注** `ai_path`（111 处：`_base.py` 32 / `_industrial.py` 79），TS 改为**按字段类型批量启用**（只限 text/textarea/stringList/pipeList/json 五种文本承载型）—— 若复刻 111 条标注，等于新增一份必须与 `ceshuFields.ts` 手工同步的清单，是**新的漂移源**；且那 111 处本就都是文本型字段。**未验证**：111 处标注清单与 TS 类型判定的实际差集未逐条比对。**注意区分**：数据条目表单的字段级 AI（`ItemForm.tsx` 的 `FieldAiAssist`）**已迁且在用**，与本行无关 |
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
| relation_graph.py | 407 | ✅ | `shared/references.ts`（引用报告纯逻辑：「引用了谁 / 被谁引用 / 相似数据」，与 `reference_panel` 合并迁移）+ `ReferencesPanel.tsx`；**E57 补**：本文件的**表格式面板 UI**（`RelationTablePanel`：类型/主体双选择器 + 主体信息卡 + 关联数据表 5 列 + 双击跳转）此前**并未迁移**（原判定只覆盖了引用计算层，`RelationTablePanel`/`relationGraph` 在 TS 侧零命中）⇒ 新增 `shared/relationGraph.ts`（`buildRelationRows`/`buildSubjectDetailLine`/`itemDisplayName`）+ `components/RelationGraphPanel.tsx`，并把「工具 → 关系图」菜单项由 `notImplemented` 接到真实能力 |
| relation_matrix.py | 265 | ✅ | `AttrSystemPanel.tsx` matrix 视图+`attrSystem.ts::topoSortAttributes` |
| collapsible_task_panel.py | 243 | ⛔ | `DigitalPanel.tsx` 有折叠步骤+`panel.ts::reduceBrainEvent`；缺任务工作区折叠面板 ｜ **E56**：属 E42「AI 框架重写」域 —— **未迁部分随框架重写、不 1:1 移植，不计迁移欠账**（已迁部分为在用资产、保留）（原判 ◐35%） |
| drop_table.py | 225 | ✅ | `shared/dropTable.ts`+`DropTableEditor.tsx`（名称/掉率/最小/最大 + 内联选库 + 夹紧；E18） |
| dynamic_form.py | 839 | ✅ | `formSections.ts`+`ItemForm.tsx`+`FormSectionCard.tsx`。**E56 更正**：原「缺 image/dialog/formula_builder/image_tags/AI 按钮」**多数已迁** —— `image`/`image_tags`（含「自动填充」「AI分析」两钮，对齐 `_create_image_tags_widget`）/`template`/`desc`/`content`/`tags`/`spinbox`/`double_spin`/`combobox`/`image_desc` 均有 `case`，AI 按钮 `item-form-ai-generate`（E36）。**E57 收口为 ✅**：① `dialog` 形态**本轮补齐**（`ItemForm.tsx` 的 `case 'dialog'`：`<select>` 列同库 `dialog` 条目 + 失效 id 保留；默认 schema 真实使用，`typeSchema.ts:327` `field('dialog_id','对话ID:','dialog')`）；② 唯一余项 `formula_builder` 经 grep 实证**无 schema 产出**（`grep -rn formula_builder src/` 只命中 dynamic_form 自身分支与 `FormulaBuilderDialog` 的类定义/导出；后者的真实消费者是 `attribute_panel.py:27`，即**属性面板**公式编辑器，TS 已由 `AttrFormulaBuilder.tsx` 实现）⇒ 死代码，非缺口；③ `entry`/`multiselect`/`droptable`/`attrtable`/`attrpanel` 由 `COMPLEX_FIELD_TYPES` + `RefTableEditor`/`DropTableEditor`/`AttrTableEditor`/`AttrPanelEditor` 承接 |
| multi_select.py | 258 | ✅ | `shared/refTable.ts`+`RefTableEditor.tsx`（refType 解析→单数 id + 名称/等级 + 内联选库；E17） |
| task_row.py | 317 | ⛔ | `panel.ts::summarizeToolTasks` 派生扁平列表；缺可展开任务卡/状态徽章/完成删除动作 ｜ **E56**：属 E42「AI 框架重写」域 —— **未迁部分随框架重写、不 1:1 移植，不计迁移欠账**（已迁部分为在用资产、保留）（原判 ◐40%） |
| home_widget.py | 604 | ✅ | E48 已迁 5 步引导（含完成度持久化）+ 6 张快捷操作卡 + 数据概览卡 至 `OnboardingPanel.tsx`（菜单 帮助→快速入门）；刻意不迁：数据概览的「⚙ 管理显示类型」按钮（TypeVisibilityPanel 在 TS 已刻意下线）、按 visible_types 过滤（TS 不接线）（E50 重新分类为 ✅：TS 已等价实现，原 ◐ 判定过期） |
| team_dialog.py | 818 | ⛔ | **E42 裁决域 · E54 落地改判**：整块是 AI **团队 CRUD / 成员工具覆盖 / 自定义提示词 / 智能体定义管理** —— 属「Agent 框架」被重写的范畴（主理人 2026-10-07 批准「改吧」），**不再计入迁移欠债**。TS 侧零对应（`shared/agent/` 无团队模型） |
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
| data_tab.py | 1157 | ◐65% | `ItemForm.tsx`+各类编辑器+`BatchEditPanel`+`ReferencesPanel`；**E50 更正**：原写「缺 undo/redo(~130)」为误——**已迁**（E27：`data:undo`/`data:redo`/`data:undoState` + `main/data/undoRecorder.ts` + App 按钮与 Ctrl+Z/Y）。**E51 补齐**：P5 数量约束软检查（`shared/dataCountConstraint.ts`，`CeshuDataPreview` 解析 → `DataEditorTab` 行内确认）、F2/右键重命名 + 条目右键菜单（重命名/编辑/复制/删除，同 `virtual_list.py:217-231`）。**仍缺**：AI 生成的「技能锚点模板」选择上下文（Python 的「参考策划方案」一项已被 TS 的策划书驱动生成取代）⇒ **保持 ◐**（未达完全等价） |
| digital_employee.py | 486 | ⛔ | `DigitalPanel.tsx`+`main/tray.ts`；缺独立弹窗/浮窗常驻 ｜ **E56**：属 E42「AI 框架重写」域 —— **未迁部分随框架重写、不 1:1 移植，不计迁移欠账**（已迁部分为在用资产、保留）（原判 ◐55%） |
| digital_panel_chat.py | 504 | ⛔ | `panel.ts::reduceBrainEvent`+`DigitalPanel`；缺 markdown 气泡/记忆上下文/欢迎语 ｜ **E56**：属 E42「AI 框架重写」域 —— **未迁部分随框架重写、不 1:1 移植，不计迁移欠账**（已迁部分为在用资产、保留）（原判 ◐75%） |
| digital_panel_input.py | 209 | ⛔ | 输入+发送已迁；缺斜杠命令/编辑器上下文采集 ｜ **E56**：属 E42「AI 框架重写」域 —— **未迁部分随框架重写、不 1:1 移植，不计迁移欠账**（已迁部分为在用资产、保留）（原判 ◐40%） |
| digital_panel_tasks.py | 214 | ⛔ | 后端重设计为 `summarizeToolTasks`；独立任务 CRUD 未迁 ｜ **E56**：属 E42「AI 框架重写」域 —— **未迁部分随框架重写、不 1:1 移植，不计迁移欠账**（已迁部分为在用资产、保留）（原判 ◐50%） |
| digital_panel_workspace.py | 308 | ⛔ | 会话快照→`sessionStore.ts`；富文本草稿/多工作区未迁 ｜ **E56**：属 E42「AI 框架重写」域 —— **未迁部分随框架重写、不 1:1 移植，不计迁移欠账**（已迁部分为在用资产、保留）（原判 ◐40%） |
| main_window.py | 1248 | ◐40% | `App.tsx` 骨架+`LibraryBar`+模式切换；缺多标签/菜单/窗口状态/自动保存 |
| components/virtual_list.py | 243 | ⛔ | 搜索过滤/多选已迁；条目右键菜单**E51 已补**（`DataEditorTab` 的 `row-context-menu`：重命名/编辑/复制/删除，同 `virtual_list.py:217-231` 顺序；E56 实测 `row-context-menu` 在场）。**E57 改判 ⛔（有意不迁）**：全仓 `VirtualListWidget` 的**唯一真实消费者是 `data_tab.py`**（`ui/components/__init__.py:4` 与 `ui/__init__.py:3` 只是 re-export），而数据表页已随 **E28 顶层 IA 重写**下线；「拖拽排序」属 **DESIGN-DIFFERENT**（PyQt 重排**内存数组**，TS 条目来自 SQLite、**无数组序**）；余下「虚拟滚动」是 PyQt 的**渲染技术**（`QListView` 只画可见行），Web 侧为原生滚动列表，**无用户可见能力差异**。复盘条件：若真实数据集单类型条目数出现滚动卡顿，再引入窗口化渲染（届时按新能力立项，不作为补旧账） |
| chat_renderer.py | 172 | ✅ | markdown→HTML+代码高亮已迁（E47：react-markdown+remark-gfm+remark-breaks+rehype-highlight 至 DigitalPanel 气泡）；system/error/plan 气泡类型因 TS 状态模型不同未迁（TS 用独立 error 字段/步骤 UI），属刻意范围收窄（E50 重新分类为 ✅：TS 已等价实现，原 ◐ 判定过期） |
| effects.py / theme_effects.py / text_glow_effect.py | 459+201+148 | ⛔ | **有意不迁（E24 判定）**：**86% 是 Qt QSS/hex 字面量**（技术上不可迁）；且**实证死代码**——`GlowButton`/`GlowLineEdit`/`GlowComboBox`/`GlowListWidget`/`SuccessToast` 在 `src/` 内**零引用**；`apply_text_glow` 遍历的 `main_window.glow_widgets` 初始化为 `[]` 后**从未 append**（恒空转）；`generate_digital_panel_qss` 仅被 `themes/__init__` 再导出，**无真正调用者**（数字员工面板已由 A1-4 `DigitalPanel.tsx` 覆盖） |
| themes/themes.py | 1097 | ⛔ | **有意不迁（E24 判定）**：`_THEME_QSS`(255 行) + `_DIGITAL_PANEL_QSS`(200 行) + 5 套 `_THEME_CONFIGS` 主题字典(210 行) **全是 Qt QSS 字符串**，Web 端不可用；TS 已有 CSS 变量深色主题（`styles.css` 9 个变量）。唯一有价值的是 33 行**设计令牌**（`FONT_SIZE_XS..XL` 11/12/13/14/16、`SPACING_XS..XL` 4/8/12/16/24），已作为 CSS 自定义属性覆盖（`:root` 变量层）。多主题切换属**独立立项**（需 `[data-theme]` 覆写 ~80-100 行），不搭车 |
| window_state.py | 154 | ✅ | **E24 已迁**：`main/windowState.ts`（几何 + 最大化 + lastMode，原子写）+ `app:setWindowMode` IPC。**刻意不迁**（TS 无对应物，非缺口）：theme（TS 无多主题，`themes.py` 已判不迁）、layout_mode（Python 硬编码 `"three_column"` 常量、无信息）、splitter_ratio（TS 侧栏是 CSS Grid、无 QSplitter）、auto_save_enabled/interval（TS 条目级即时落库、无内存脏状态）、has_unsaved_changes/compute_data_hash/check_data_changed（TS 无内存脏状态，无源之水）（E50 从捆绑行拆出并重新分类为 ✅：TS 已等价实现，原 ◐ 判定过期） |
| menus.py | 180 | ✅ | **E56 从捆绑行拆出为独立行**；**E57 收口为 ✅**。全部菜单项逐一对照 `MenuBar.tsx`：文件（打开/保存/导入×4/导出×12/备份管理/退出）、编辑（撤销/重做/模板管理/清空所有数据）、工具（快速创建向导/批量修改数据/数据关联预览/**关系图**/数据对比/数据分析×3/属性系统编辑器/清理未使用图片）、设置（打开设置）、帮助（快速入门/快捷键参考/关于）**均有真实接线**。**「数据关系图」原为真实缺口**（E56 实测 TS 侧 `relationGraph`/`dataRelation` 零命中；此前 `MenuBar.tsx` 写 `notImplemented`）⇒ **E57 已实现**（`RelationGraphPanel.tsx` + `shared/relationGraph.ts`，见 §1「E57 前端尾巴收口」）。**「内容关联」子菜单两项（`show_content_relations`/`show_relation_visualization`）不迁**：`features/advanced.py:30-45` 两函数**函数体完全相同**（都是 `ReferencePanel(dm, "", "", mw)`，空 type/空 id），而 `reference_panel.py::_find_item()` 对空 type 必返 `None` ⇒ **PyQt 侧本就是只渲染「未找到该数据」的死入口**；TS 原为 `notImplemented` 占位，E57 **直接删除**（能力面已由 `references` + `relationGraph` 覆盖）。`setup_agent_toolbar()`（:167）为全仓无调用点死代码（真值角部件在 `main_window.py:450`） |
| shortcuts_dialog.py | 107 | ✅ | **E56 实证已迁**：`renderer/src/components/ShortcutsPanel.tsx`（docblock 明写「对齐 Python `ui/shortcuts_dialog.py::ShortcutsDialog`」）+ 菜单入口「帮助 → 快捷键参考」（`MenuBar.tsx:250` `menuitem-help-shortcuts`，E37 `3fc07ef`）。原判「纯键盘映射表、无消费者、随 menus 不迁」是 E37 之前的快照 |
| tab_manager.py | 249 | ⛔ | **E56 改判（设计性替换）**：Python 的多标签编辑器（延迟切标签 / 侧栏计数 / 标签撕裂保护）已被 **E28 顶层 IA 重写**取代 —— 中央单栈 `mode-data`/`mode-ceshu` + `LibraryBar`，**「标签」这一形态在 TS 已不存在**，该机制的技术前提消失 ⇒ 有意不迁（与 `themes`/QSS 同类：Web 侧不适用） |
| components/image_loader.py | 324 | ✅ | **E46 已迁 `LazyImageLabel` 行为**（`shared/imageCache.ts` LRU 缓存 + `LazyImage` 组件，按已保存绝对路径经 `images:readByPath` 回读 data URL 回显预览，修「已保存图片路径不回显」的真 bug）；**未对齐**：不做 PIL 位图重采样（浏览器 `<img>` 引擎解码，CSS 限尺寸即可，属刻意的过度开发规避）（E50 重新分类为 ✅：TS 已等价实现，原 ◐ 判定过期） |
| components/toast.py | 98 | ✅ | **E45 已补 Toast 组件**（`shared/toast.ts` + `ToastHost`，多条并存/自动消失/三态配色）；**未完全对齐**：未做 E2E 实机点击验证（无 jsdom 设施，见 roadmap E45 的诚实边界）（E50 重新分类为 ✅：TS 已等价实现，原 ◐ 判定过期） |
| `__init__.py`×3 / ai_bridge.py / digital_panel_state.py / digital_panel_theme.py / layout_builder.py | 98+116+232+338+245 | ⛔ | 包胶水 / `a-tier-plan` 明列不迁（初始化窗口定位、类型桩、QSS 注入、QSplitter 布局）。**E54 校准**：原写 `32+116+… 等`（尾带「等」），实测三个 `__init__.py` 合计 **98**（32+10+56），故本行精确为 1,029 行 |

### 3.5 `core/ceshu` + `core` 顶层 + `core/defaults`（38 文件 / 12,602 行）

| 文件 | 行数 | 判定 | 依据 |
|---|---|---|---|
| ceshu_checklist.py | 886 | ✅ | `shared/ceshuChecklist.ts::runChecklist` |
| ceshu_scorer.py | 684 | ✅ | `shared/ceshuScorer.ts::scoreCeshu` |
| ceshu_model.py | 645 | ✅ | `shared/ceshuModel.ts`（章默认值另见 `domain/ceshu/ceshuDefaults.ts`）。**TS 侧 D3 去重**：删除 vision.business_model、worldview.character_network、tech.milestones、resources.{audio_assets,localization,risk_matrix,contingency_plan} 七个重复字段（权威处见 `ceshuDefaults.ts` 注释）；载入旧文档仍由 `ceshuMigration.migrateV4ToV5` 单向搬运 |
| ceshu_manager.py | 641 | ✅ | `main/ceshu/manager.ts`+`storage.ts` |
| ceshu_constants.py | 566 | ✅ | `shared/ceshuConstants.ts`+`shared/systemConfigSchema.ts`。**TS 侧 D3 去重**：`systemConfigSchema` 的 battle 去掉 turn_mode/damage_formula/combat_pace/element_system（→ combat 章）、economy 去掉 currency_types/source_mechanisms/sink_mechanisms/inflation_control/payment_system/recharge_tiers/vip_system/season_pass（→ economy/monetization 章）；`CHAPTER_REQUIRED_FIELDS` 的 tech/resources 相应去掉 milestones/risk_matrix。**TS 侧章节结构**：`CHAPTER_KEYS` 曾按「先游戏数据/设计、后游戏架构」重排；**E60（2026-10-09）再重组为分区制** —— `CHAPTER_PARTS`（5 区）为唯一结构来源，`NUMBERED_CHAPTER_KEYS = CHAPTER_PARTS.flatMap(p => p.chapters)`、章号 = 展开后位置、`CHAPTER_LABELS` 由 `chapterNumber()` 派生；`meta` 改为无数号「文档信息」段（不占章号），`worldview`/`characters` 合并为 `story`；`BASE_CHAPTER_KEYS`/`INDUSTRIAL_CHAPTER_KEYS` 由 `LITE_CHAPTER_KEYS`（**必须是 `NUMBERED_CHAPTER_KEYS` 的前缀**，保证 lite 编号 1..9 连续）取代。守卫见 `tests/unit/ceshuConstants.test.ts` |
| ceshu_pptx_exporter.py | 480 | ✅ | `main/ceshu/export/pptx.ts` |
| custom_template_manager.py | 442 | ✅ | `shared/ceshuCustomTemplates.ts`+`templateStore.ts` |
| ceshu_changelog.py | 433 | ✅ | `shared/ceshuDiff.ts` |
| ceshu_excel_exporter.py | 390 | ✅ | `main/ceshu/export/excel.ts` |
| ceshu_html_exporter.py | 326 | ✅ | `main/ceshu/export/html.ts` |
| ceshu_docx_exporter.py | 313 | ✅ | `main/ceshu/export/docx.ts` |
| ceshu_pdf_exporter.py | 298 | ✅ | `main/ceshu/export/pdf.ts` |
| ceshu_data_sync.py | 282 | ✅ | `main/ceshu/dataSync.ts` |
| field_dependencies.py | 278 | ✅ | `shared/ceshuFieldDeps.ts`。**TS 侧 D3 去重**：行为对齐 Python，但依赖表由 20 条收敛为 13 条（删掉 7 条「重复字段对账」依赖），字段图 18/19/10 层 → 16/13/4 层 |
| ceshu_validation.py | 196 | ✅ | `shared/ceshuValidation.ts::validateCeshu`。**TS 侧 D3 去重**：章节间一致性检查由 11 项收敛为 4 项（删除 7 项重复字段对账），必填报错由 35 条降为 33 条 |
| ceshu_markdown_exporter.py | 175 | ✅ | `main/ceshu/export/markdown.ts` |
| ceshu_fill.py | 166 | ✅ | `shared/ceshuFill.ts`。**TS 侧 D3 去重**：去掉 tech.milestones / resources.risk_matrix 两处填充（权威处为 mvp.milestones / risk_handling.risk_matrix），填充数 34 → 32 |
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
| buff_system.py | 129 | ⛔ | **E56 改判（死代码 + 设计性替换）**：真实使用面（`BuffSystem` 百分比加成）只被 `ui/widgets/live_preview.py` 消费，该面已由 `shared/attrPreview.ts`（`buffBonuses` 百分比加成 + 装备固定加成 + 拓扑计算）**等价实现**；未迁的「模板/tick/active 管理」在 Python 源内**无调用点**（死代码）⇒ 非缺口 |
| equipment_system.py | 96 | ⛔ | **E56 改判（同 `buff_system`）**：真实使用面（`EquipmentSystem` 固定加成 / `EQUIP_SLOTS`）已由 `shared/attrPreview.ts` 等价实现；未迁的「槽位注册 / 穿脱 API」**无调用点**（死代码）⇒ 非缺口 |
| style_manager.py | 289 | ✅ | `shared/gameStyle.ts`（E21：`GAME_STYLES` 内联 6 风格×46 概念 + `CONCEPT_ALIASES` 23 条；`resolveLabel`/`resolveFieldLabel`/`inferStyleFromText`/`buildReplacementPairs` 等纯函数）+ `ceshuModel.ts::resolveDocGameStyle` + `fieldLabelFor(field,layout,styleId)`/`ItemForm.gameStyle` + 工具栏 `game-style` 下拉。**无消费者而有意不迁**：`get_styles`（≡ `GAME_STYLES` 常量）、`get_active_style_name`（活跃风格在 TS 是参数非状态）；`list_style_names`/`get_terminology` 已按 1:1 移植但**暂无 TS 消费者**（保留以便对照，非预建） |
| `__init__.py`×2 + defaults/`__init__.py` | 31+35+4 | ⛔ | 包 re-export |
| extended_formulas.py | 455 | ⛔ | 死代码（仅 `core/__init__` re-export）—— E4 已实证 |
| game_templates.py | 326 | ⛔ | 死代码（同上） |
| editor_layout.py | 208 | ⛔ | E5 已实证「能写、没人读、且已过期」 |
| cedict.py | 72 | ⛔ | E6 已评估不迁（消费者 `type_editor_field_widget.py:234`） |
| level_scaling.py | 117 | ⛔ | 死代码（仅 re-export，无调用点） |

> **E21 实测发现的 Python 缺陷（已忠实保留，不"顺手修"）**：`_build_replacement_pairs` 的替换对按**源术语长度降序**逐个 `str.replace`，而被替换出来的**目标术语**又可能包含更短的源术语 → 产生连锁二次替换。实例如 `resolve_label('内力', 'fantasy')` 返回 **`'生命值值'`**（先 `内力→生命值`，再 `生命→生命值`）。TS 移植**保持同样行为并钉死用例**：修正它会与 Python 输出不一致，且真实 schema 标签（`生命加成%` 一类）不受影响（已实测全量标签 × 6 风格无此路径）。这条记录的目的是：将来若要修，应作为**独立决策**而不是被当成移植 bug。

### 3.6 `ui/dialogs`（20 文件 / 6,055 行）

| 文件 | 行数 | 判定 | 依据 |
|---|---|---|---|
| batch_edit.py | 312 | ✅ | `BatchEditPanel.tsx`+`dataTableOps.ts`+IPC `data:batchUpdate`/`deleteMany` |
| reference_panel.py | 261 | ✅ | `ReferencesPanel.tsx`+`shared/references.ts`+IPC `data:references` |
| advanced_search.py | 172 | ✅ | `shared/advancedSearch.ts`（`searchItems`/`resolveSearchValue`/`SEARCH_FIELD_OPTIONS`/`truncateMatch`）+ `AdvancedSearchPanel.tsx`：选类型 + 选字段（名称/ID/类型/描述）+ 关键词 + 结果 + 点击跳转（复用 `handleJump`），与 Python 能力对齐；**TS 增强**「全部类型」「全部字段」两个哨兵（Python 只能单选）。数据走既有 `data:listAll`，**不开新 IPC**。**更正**：审计原写「跨类型搜索」为 Python 缺失项，实为 Python 本就单类型（`type_combo`），此项是 TS 增强而非补缺 |
| engine_export.py | 353 | ⛔ | **有意不迁四引擎模板**（Unity/Unreal/Godot/Cocos2d 是**纯静态代码模板字符串**、无运行时数据计算，仅按字段名插值）；TS 刻意走 **Lua 数据模块导出**（`EngineExportButton`+`engine.exportData`）匹配用户真实的 Lua/fengari ARPG 管线（**Python 反而没有 Lua 导出**）。故四引擎模板对本案属装饰性死代码，不搬 |
| startup_mode_dialog.py | 144 | ⛔ | **E57 改判 ⛔（设计性替换）**。该对话框是「**选择工作模式**」（数据设计 ↔ 策划书两条主线），依赖 PyQt 的双模式启动形态；**E28 顶层 IA 重写**后 TS 为「无侧栏单栈：策划书首页 ↔ 编辑器，一切能力从菜单进」⇒ **TS 全仓 `startupMode`/`startup_mode`/`mode-data`/`mode-ceshu` 零命中**，工作模式概念已不存在（同 `tab_manager.py` 的处置）。原判定「模式切换已迁」是误记（该「模式切换」指状态栏主题切换，与工作模式无关） |
| type_editor_ai.py | 338 | ◐25% | 模板导入已迁；缺 AI 推荐字段/分析现有数据/联网参考（**均属 AI 域**，随 E42 框架重写） |
| type_editor_dialog.py | 528 | ◐70% | `TypeEditorPanel.tsx`；**E58 补齐拼音/英译按钮**（「拼音」→ `shared/pinyinFieldId.ts`、「生成」→ `shared/fieldId.ts`）。**仍缺**：布局分区编辑（已判不迁，Web 无 QSplitter 分区形态）、智能工具栏 4 项中的 3 项 AI 工具（`AI推荐字段` / `分析现有数据` / `联网参考`，属 AI 域；第 4 项 `导入模板` 已迁至「字段模板」） |
| type_editor_field_widget.py | 345 | ✅ | **E58 补拼音兜底（原判 ◐80%）**：新增 `shared/pinyinFieldId.ts`（`pinyin-pro`）+ `TypeEditorPanel` 的「拼音」按钮（`te-field-pinyin-{i}`），对齐 `_auto_pinyin` / `_chinese_to_pinyin`；英译层由 `shared/fieldId.ts` 承接（并修掉 Python 逐字打碎 ASCII 的缺陷）；字段 ID 合法性由 `validateFieldId` + 保存前 `validateTypeSchema` 负责。**有意不迁**：CEDICT + `jieba` 词典回退（`fieldId.ts` 实证其产出 `abbr_surname` 类垃圾） |
| api_config.py | 686 | ◐ | **E41 已迁「基础设置」**（6 家服务商 / base_url / model / 温度 / 最大令牌 + Key 走 safeStorage，见 `shared/llmConfig.ts` + `main/llm/client.ts`）；**未迁**：模型管理 tab（自定义模型增删改，写 PyQt 私有 `custom_models.json`，无同一消费者）、视觉模型 tab（TS 无截图识别/UI 分析消费者）、模板设置 tab（实为技能生成偏好，属内容域）。**~~E57 补一处真缺口~~ → ✅ E63（2026-10-10）已补**：「**测试连接**」按钮（`api_config.py:641-685` → `common/ai_client.test_api_connection`）= `LlmClient.testConnection()` + IPC `llm:testConnection` + 设置面板 `llm-test-connection` 按钮 + 单测 7。**有意改进**：Python 只构造 OpenAI 兼容请求、**对 Ollama 无分支** ⇒ 本地档会打一个本地不提供的 `/chat/completions`；TS 按档位分探（Ollama 走 `status()` 列模型不烧 token，云端发 `max_tokens=5` 最小请求）。**仍 ◐**：模型管理 / 视觉 / 模板三个 tab 未迁 + `ai_client.py` 自身完成度 40% |
| backup_manager.py | 155 | ✅ | `shared/backup.ts`（命名/时间戳/`BackupEntry`/`RestoreOutcome`）+ `main/backup/backupStore.ts`（**原子写 tmp+rename**、**软删除**改名 `.deleted`、**路径包含校验** 拒目录穿越）+ `main/backup/restore.ts`（**恢复前自动 pre-restore 快照**、按 id 差集删除多余条目后 upsert，**保留 id 故引用不错乱**）+ 4 条 IPC + `BackupPanel.tsx`。**刻意修正 Python 四处缺陷**：只改内存不落盘（假成功）、无 pre-restore 备份、`unlink` 永久删、`split(' - ')[1]` 反推文件名 |
| data_diff_dialog.py | 154 | ✅ | `DataDiffPanel.tsx`（**当前 vs 用户设定的基线**，基线缓存在 localStorage）。**不照搬 Python 的残废行为**：Python 执行 `DataDiff.compare({}, {...})` 拿空 dict 与当前数据比，**永远只输出「全部新增」**、从不做真对比（文件头却自称对比历史版本）；TS 改为真正的双侧对比。**注意 `ceshuDiff.ts` 对应的是另一文件（策划书版本），与此无关** |
| quick_create.py | 543 | ✅ | `shared/quickCreate.ts`（TEMPLATE_DEFS 12 类/61 模板 + DATA_TYPE_LABELS）+ `QuickCreatePanel.tsx`；落库复用 `data:createItem`。**刻意修正**：Python `_on_create` 里 `data_type + "s"` 死代码不复制；类型下拉与 schema 求交（`filterQuickCreateTypes`），防造出无类型定义的孤儿条目 |
| settings_dialog.py | 671 | ✅ | **E54 实证已迁**：`renderer/src/components/SettingsPanel.tsx`（**21 个 `data-testid`**；E41 又补了 AI 模型服务区）。原判「设置面板整块未迁（C 档）」是 10-04 的过期快照 |
| statistics.py | 374 | ✅ | **已迁**：`shared/dataStats.ts`（均值/样本标准差/平衡性判定阈值 0.3/按类型计数与占比/**按 schema spinbox 字段自动发现数值字段**）+ `StatisticsPanel.tsx`（概览柱条 + 平衡性分析）+ IPC `data:listAll`。<br>**缺**：① 角色/怪物的 `hp`/`atk`/`def` 分析 —— TS schema 里 **`role`/`monster` 根本没有这些扁平字段**（属性在 `attr_list`），直译即死代码，故改为自动发现（role 因此不出现在分析列表）；② Python 的「📈 图表」页是 **matplotlib 占位符**，不复制，改用 CSS 柱条真实渲染（E50 重新分类为 ✅：TS 已等价实现，原 ◐ 判定过期） |
| template_manager.py | 411 | ✅ | **字段编辑部分早已由 `TypeEditorPanel` 覆盖**（增/删/上移/下移/名称·标签·类型·可编辑·可选值·数值范围），故本刀不重做第二套（避免重复计「已迁」）。<br>**本刀补齐的是模板存取**：`main/schema/fieldTemplateStore.ts`（`<库>/field_templates.json`，原子写）+ 4 条 IPC（`schema:listFieldTemplates`/`getFieldTemplate`/`saveFieldTemplate`/`deleteFieldTemplate`）+ `TypeEditorPanel` 里「保存当前为模板 / 删除模板」，自定义模板与内置模板在同一个下拉里（optgroup 分组），内置不可删。<br>**刻意不迁**：Python 的模板只存 `{字段名: 显示标签}`（`settings.py:780-786` 应用时**只覆盖 label**，类型/可选值/范围全丢）——是残废语义，TS 改存**完整 `TypeFieldDef[]`**，应用即整体还原（比 Python 强）（E50 重新分类为 ✅：TS 已等价实现，原 ◐ 判定过期） |
| type_visibility_dialog.py | 121 | ✅ | `shared/visibleTypes.ts`（`isTypeVisible`/`normalizeVisibleTypes`/`resolveVisibilityResult`/`load`+`save`，语义：null=全部、`[]`=全隐藏）+ `TypeVisibilityPanel.tsx` + 侧栏「⚙ 管理显示类型」入口。**不开新 IPC**（纯渲染层 + localStorage）。**刻意修 Python 缺陷**：`settings.py:650` 用 `if ... and vt:` 判空列表 → 「全不选」重启即失效，TS 用「键是否存在」区分 |
| `__init__.py` / auto_input_dialog.py / type_editor_dialog_state.py / type_editor_layout_widget.py | 25+60+99+303 | ⛔ | 包胶水 / QDialog 输入胶水 / mixin 类型桩 / E5 已实证不迁 |

### 3.7 `common` + `config` + `security` + `data` + 顶层（45 文件 / 10,672 行）

| 文件 | 行数 | 判定 | 依据（含被引用处数） |
|---|---|---|---|
| graph.py | 45 | ✅ | `shared/attrSystem.ts::topologicalSort`（Kahn）；引用 2 处 |
| security/acl.py | 141 | ✅ | `shared/agent/protocol.ts` RISK_LEVEL/TOOL_RISK_MAP；引用 1 处 |
| data/chapter_templates_data.py | 800 | ✅ | `shared/ceshuTemplateData.ts::CHAPTER_TEMPLATES` |
| data/type_editor_templates.py | 98 | ✅ | `shared/typeTemplates.ts::TYPE_TEMPLATES` |
| app.py | 103 | ✅ | `desktop/src/main/index.ts`（crash 日志/sentry 未随迁） |
| common/ai_client.py | 753 | ◐40% | 已迁 `main/llm/client.ts` + `shared/llmConfig.ts`。**E56 更正**：原「缺 OpenAI/Qwen/豆包/DeepSeek/生图」**多数已迁** —— **6 家服务商**（`ollama`/`openai`/`doubao`/`qwen`/`claude`/`deepseek`，E41，Key 走 safeStorage）+ AI 生图四 provider（E22 `imageGen/`）。**仍缺**：流式输出（`client.ts` 写死 `stream: false`）、tools / function-calling、vision 多模态、限流；**引用 14 处** ⇒ 保持 ◐ |
| common/common.py | 287 | ✅ | 原子写（`atomic_write_*`）/uuid/`is_test_env` **已迁**（文件真实消费者）。**E49 更正**：`safe_dict` 在 Python 源中**根本不存在**（grep 零命中）；`safe_int`/`safe_float`/`safe_str` **仅有定义（`common.py:157/174/191`）+ `common/__init__.py` 再导出、零业务调用点** ⇒ 非缺口（E50 重新分类为 ✅：TS 已等价实现，原 ◐ 判定过期） |
| common/exceptions.py | 195 | ◐ | `shared/ipc.ts` IpcInvokeError；缺友好化；引用 2 处 |
| common/shortcuts.py | 177 | ◐ | `main/tray.ts` 单热键；缺 ShortcutManager/DEFAULT_SHORTCUTS |
| config/constants.py | 181 | ◐ | 类型/字段/属性/策划常量已迁；**主题子缺口 E64 已闭**（TS 4 套主题对齐 Python 4 套 `_THEME_CONFIGS`，走 `[data-theme]` 覆写而非 QSS）；仍缺窗口/文件名常量；引用 31 处 |
| config/settings.py | 858 | ◐ | `fields_config`→`typeSchema.ts`；**E23 补存储基座**：`shared/settingsStore.ts`（统一 localStorage 读写/枚举/导出/导入/重置，`StorageLike` 单一真源，已收拢 4 处散点）。仍缺 `backup_dir`/`startup_mode`/`api_*`（TS 刻意无全局单例；api_* 现由 `imageGenConfig` 单独存） |
| security/sandbox.py | 325 | ⛔ | **E56 改判（设计性替换）**：已由 `main/security/jsSandbox.ts`（QuickJS 白名单）**设计性替换**（E56 实测该文件在场）；其 2 处消费者（`code_skill.py` / `shell_skill.py`）**都在 core/agent 重写域**（见 §3.1）⇒ 非编辑器侧缺口 |
| common/auto_updater.py | 60 | ⛔ | **E65 改判 ⛔（2026-10-10）**：本地离线应用、无发布基础设施（GitHub releases），自动更新检查**有意不迁**；引用 1 处 |
| common/data_diff.py | 197 | ✅ | `shared/itemDiff.ts`（`diffValues`/`diffItems`/`diffLibraries`/`collectLeaves`/`summarizeDiff`）。**修 Python 三处缺陷**：① 数组元素**不递归**（`_compare_list` 整块标 MODIFIED）→ 递归；② `compare_items_by_id` 新增/删除只塞 `name` 一个标量 → 携带 `data` 全量；③ 从不产出的 `UNCHANGED` 死枚举 → 无变化即不产出。**有意保留**数组按下标对齐（与 Python 一致，已在注释标注局限） |
| common/data_importer.py | 269 | ✅ | **E54 实证已迁**：`main/ipc.ts:690` `data:importCsv`（+`data:importExcel`）→ `main/data/csvIO.ts::importCsvFile` / `excelIO.ts::importExcelFile`；旧 JSON 走 `data:importLegacy`（`legacyImport.ts`）。原判「TS 无」过期 |
| common/data_ref.py | 209 | ✅ | **E54 实证已迁**：`shared/dataRef.ts`（E44：`@data[...]` 解析 + 实时值 + 分组统计）+ `ceshu/CeshuDataPreview.tsx`「📊 数据引用」标签（`CeshuDataRefsPanel`）。原判「无 TS」是 E44 之前的快照 |
| common/event_bus.py | 87 | ⛔ | **E65 改判 ⛔（2026-10-10）**：TS 用 IPC + brain 事件流**设计性替代**；18 处引用全在 `core/agent` 重写域（见 §3.1），编辑器侧无缺口 |
| common/i18n.py | 401 | ⛔ | **有意不迁（E23 决策）**：这是**全局翻译框架**，而 TS 侧 UI 文案目前 100% 硬编码中文——接入需翻译全部组件（数十文件、上千字符串），属**独立立项**而非存储基座职责。注意 `core/agent/i18n.py::AgentI18n` 早已是死代码（无 import/调用点），勿混淆两者 |
| common/logger.py | 155 | ✅ | 已迁为 `shared/logger.ts`（统一入口，渲染层经 IPC 转发到主进程）+ `main/logger.ts`（轮转文件日志，10MB×5 备份）；原 142 处引用现统一走 `log` 入口（E8） |
| common/lucide_icon.py | 214 | ✅ | **E54 实证已迁**：`shared/lucideIcons.ts`（`LUCIDE_ICON_PATHS` **43 键** / `LUCIDE_ICON_ALIASES` **33 键**，由 `lucide_icon.py` 的 `_ICON_PATHS`/`_ALIASES` **脚本机械导出**，另有 `resolveIconName`）+ `LucideIcon.tsx`（`currentColor`/stroke 2.5/24×24，未收录名不渲染）——E30 落地。原判「renderer 用 emoji/内联 SVG」是 E30 之前的快照 |
| common/rate_limiter.py | 85 | ✅ | **E61（2026-10-10）**：`shared/rateLimiter.ts`（`TokenBucket` + `RateLimiter`，4 内置桶参数照抄；`waitAndAcquire` 改 async 不阻塞事件循环；时钟/休眠器可注入）+ 单测 15，**并已接线** `main/llm/client.ts::generate()`（+3 例闸测试）。**有意偏离**：不引入锁（单线程事件循环）；限流器为**进程级共享**（生产有 `stores.ts:124` 与 `qualityJudge.ts:25` 两个 `LlmClient` 实例，各建一套会让限额翻倍，故对齐 Python `RateLimiter()` 单例），同时保留构造器注入供单测替换；闸**放在配置校验之后**（Python 放在最前、非法请求也会吃配额，TS 取更合理顺序）。⚠️ 增量补桶有浮点敏感度（十个 0.1 相加 = 0.9999…），**Python 同源，已用 `.venv` 探针核实**，勿"顺手修正" |
| common/sentry_client.py | 52 | ⛔ | **E65 改判 ⛔（2026-10-10）**：本地离线应用默认不上报外部遥测（与保密/隐私哲学一致），错误经主进程轮转日志（E8）；**有意不迁**；引用 1 处 |
| security/privacy.py | 88 | ⛔ | **E65 改判 ⛔（2026-10-10）**：`summarize_sensitive` 仅被 `core/agent/memory_store.py` 消费（AI 重写域，见 §3.1），编辑器侧无消费点；「Agent OS §11」设计稿，保密模式已在传输层覆盖敏感信息 |
| async_runner / auto_backup / cache / config_schema / data_validator / icons / interfaces / lazy_loader / llm_provider / metrics / path_utils / text / text_game_export / validator / `__init__` | 3,269 | ⛔ | **src 内 0 引用**（仅 `common/__init__.py` re-export）＝真死代码。**E54 校准**：原写 `3,097`，实测 15 文件合计 **3,269** 行 |
| security/encryption.py / guard.py / rate_limiter.py | 458 | ⛔ | 死代码，且**与 settings.py / core/agent/safety_guard.py / common/rate_limiter.py 重复** |
| data/sample_data.py | 1125 | ⛔ | 有意不迁（立项 §3.4「不迁移样本数据」） |
| config/`__init__.py` / security/`__init__.py` / data/`__init__.py` | 40 | ⛔ | 包 re-export / 文档字符串 |

### 3.8 `features`（9 文件 / 3,430 行）—— **本域完整已迁为 0**

| 文件 | 行数 | 判定 | 依据 |
|---|---|---|---|
| _ai_dialog.py | 923 | ◐55% | UI 被 `AiDataGenPanel.tsx`+`ceshuDataGen.ts` 取代；缺技能专属模板模式/`normalize_item_fields`/策划文档长文生成/多对象括号级解析 |
| ai.py | 556 | ◐40% | AI 生成→`ceshuDataGen.ts`；审核→`DigitalPanel`/`AiReviewPanel`；缺 schema 驱动的直调生成/AI 平衡分析/API 配置 |
| advanced.py | 431 | ✅ | 模板管理→`TypeEditorPanel`（E40）/高级搜索→`AdvancedSearchPanel`+`shared/advancedSearch.ts`/内容关联·可视化→`ReferencesPanel`/属性分布图表→`AttributeChartPanel`+`shared/attributeChart.ts`（E40）/关键词模板配置→`KeywordTemplatePanel`/API 配置→`SettingsPanel` AI 服务区（E41）/清理未用图片→`CleanupImagesPanel`（E38）均已迁；余 3 个函数（工作流配置 / 规则验证 / 规则配置）在 Python 侧本就是**纯占位对话框**（静态说明文案、无逻辑），非功能缺口（E50 重新分类为 ✅：TS 已等价实现，原 ◐ 判定过期） |
| export.py | 705 | ✅ | JSON（→`data:importLegacy`/`exportLegacy`）/CSV（→`main/data/csvIO.ts`）/Excel（→`main/data/excelIO.ts`，E19–E20）/批量编辑（→`BatchEditPanel`）已迁；仅剩 `batch_import` 的「重生成 id 追加」语义（现由 `importLegacy` 的 upsert 覆盖，属有意收敛）与 `batch_edit` 重复实现（见「已知待修」）（E50 重新分类为 ✅：TS 已等价实现，原 ◐ 判定过期） |
| _ai_image.py | 365 | ✅ | **E22 已迁**（`shared/imageGen.ts` 纯逻辑 + `main/imageGen/client.ts` 云调用 + `main/imageGen/save.ts` 原子落盘 + `ImageGenPanel.tsx` 面板；四 provider：OpenAI/dashscope/豆包/Generic）。真实生图引擎在 `common/ai_client.generate_image`，`image_skill` 消费者仍待接线 |
| statistics.py | 273 | ⛔ | **有意不迁**（2026 实测：角色/怪物平衡分析硬编码 `hp`/`atk`，但内置 schema `typeSchema.ts` 的 `role`/`monster` **无扁平 hp/atk**（在 `attr_list`），直译即死代码——该能力已由 E11 `shared/dataStats.ts`（`summarizeNumeric`/`assessBalance`，按 schema spinbox 字段自动发现）覆盖且更优）。唯一独有逻辑 `calculate_overall_score`/`generate_issues`/`generate_recommendations`（总分+问题+建议）依赖上述死代码分析、需重架构为 schema 感知，且与 StatisticsPanel 已展示的逐字段判定部分冗余，列为**可选未来项**而非缺口。**注意 `ceshuScorer`/`ceshuWordStats` 是策划书域，与此无关** |
| backup.py | 42 | ✅ | `export_for_game` 已迁（`data:exportLegacy`）；`show_backup_manager` 已迁（`BackupPanel.tsx` + `backup:*` 4 条 IPC，见 `ui/dialogs/backup_manager.py` 行）。**不迁** `common/auto_backup.py`（死代码，见 `common/` 域） |
| engine_export.py | 75 | ⛔ | **有意不迁**：`export_to_unity/unreal/godot/cocos2d` 仅为上述四引擎模板对话框的启动器（同判不迁）。`show_game_data_preview`（纯 JSON 树预览，~25 行无逻辑）为**可选小便利**，非缺口，留作未来可选 |
| __init__.py | 60 | ⛔ | 包 re-export 胶水 |

## 4. 真实剩余里值得排期的功能（按性价比）

| 优先 | 项 | 量级 | 为什么 |
|---|---|---|---|
| **1** | `common/logger.py`（155 行）+ TS 文件日志 | 中 | ✅ **已迁**（E8，`main/logger.ts` + `shared/logger.ts`）；**被引用 142 处**，原有 TS 只有 console.* |
| **2** | `core/agent` 记忆系统补全（`memory_history` 211 + `memory_store` 195 + `memory_vector` 271 + `memory_search` 231） | ≈900 行 | ◐ **只做了偏好/反馈层**（E9，`learner.py` 子集）；对话历史/向量/搜索仍**未迁**。当前记忆**只增不学** |
| **3** | `ui/dialogs` 未迁（含 `common/data_diff`）：`quick_create` 543 / `statistics` 374 / `template_manager` 411 / `advanced_search` 172 / `type_visibility` 121 / `data_diff` 154+197 / `backup_manager` 155（+`features/backup` 42） | ≈2,170 行 | ✅ **已全部迁完**（E10–E16）；都是**日常可达**的功能，非外围 |
| **4** | 引用类字段编辑器：`multi_select`→`RefTableWidget`（258）+ `drop_table`→`DropTableWidget`（225） | ≈410 行 | ✅ **已迁**（E17/E18，`RefTableEditor.tsx`+`DropTableEditor.tsx`）；原是 JSON/逗号串降级，现为专用表格编辑器（内联选库） |
| **5** | `features/export.py` 的 CSV + Excel 游戏数据导入导出 | ≈230 行 | ✅ **已迁**（E19–E20，`main/data/csvIO.ts`+`excelIO.ts` + 4 条 IPC + 工具栏入口） |
| **6** | `core/style_manager.py`（289 行） | 289 行 | ✅ **已迁**（E21，`shared/gameStyle.ts` + 2 条消费者接线 + 工具栏手工入口）。**D 档至此收官**：`core` 顶层/`defaults` 域的 ⚠️ 列清零 |
| **7** | `features/_ai_image.py` AI 生图（365 行） | 365 行 | ✅ **已迁**（E22，`shared/imageGen.ts` + `main/imageGen/{client,save}.ts` + `ImageGenPanel.tsx`，四 provider 云端生图 + 原子落盘）。**注意**：本项此前经双源调研判定为「能力缺口（源 app 自身是死壳）」并记档待决策，后按用户决策立项补齐；`image_skill`（agent 技能侧消费）仍待接线 |
| **8** | C 档外围：主题/特效 1,905 + 菜单/多标签/窗口状态 690 + 设置/i18n | ≈3,700 行 | **多为「体验完整度」而非核心功能**，可长期后排 |

## 5. 方法与可复核性

- **全量枚举**：脚本统计 `src/**/*.py`（排除 `__pycache__`）→ 299 文件 / 91,164 行，按域分组行数。
- **逐文件判定**：8 个**只读**子代理并行审计（每个域一个），要求对每个文件给出**具体依据** —— TS 文件路径 + 导出符号，或「grep 无消费者」这类实证；明确禁止「文件名相似即判已迁」。
- **域总量对账**：每份审计的（文件 / 行）总量必须与脚本统计的域总量相等；8 份全部通过。**E54 补**：此前四类**分类计数**虽总和正确，但 §1 / §2 / §3 三处互相不一致；E54 已以 §3 逐文件明细为准统一（见 §1），并修掉 §3 两处不精确行数。
- **全局对账**：四类合计 = 299 文件 / 91,164 行，**PASS**（见 §1）；且 §1 = §2 = Σ§3，**逐格相等**（E54 校准，E56 / E57 / E58 同步后仍成立）。
- **台账滞后同样要防**：E58 发现「前端尾巴 1/3」（`d5ad355`）**只写码未同步台账**，使两个已迁完的文件在 §3 里挂了 3 天 ◐ —— 故「§1 = §2 = Σ§3」这类对账**只能证明三处自洽，不能证明与代码同步**；判断某行是否过时仍需**回到 Python 真源 + grep TS 对应物**（E58 即这样复核实证）。
- **已知误差来源**：①「◐部分已迁」的完成度是**估计值**（各代理给出，主观性存在）；②「⛔有意不迁」的判定依赖既有决策记录 + grep 实证，若某模块将来被需要需重新评估；③ 判定粒度是「文件」，同一文件内不同功能的迁移状态可能不一致（已在依据里尽量写明）。

## 6. 本次审计纠正的三处早前误判

1. **roadmap §2 的「剩余 ≈3.5–4.5k 行（4–5%）」是错的** —— 逐文件审计给出的真实剩余，经 E42 / E54 / E56 / E57 四轮扣减后为 **≈0.5–0.7 万行（6–8%）**（时间线：10-04 首版 ≈2.4–2.8 万行 → E42 写掉 `core/agent` 未迁部分 → E54 校准 → E56 落实 AI 域口径 → E57 前端尾巴收口，见 §1「E56 ◐ 行文件级复核」/「E57 前端尾巴收口」）。那句估算把三个混合态域当成了基本迁完，且口径过窄。
2. **三条「已迁映射」线索是错的**（幸好标注了"须自行核实"）：`ui/dialogs/template_manager.py` ✗≠ `TemplateEditorPanel`（后者对应**策划书**模板）、`statistics.py` ✗≠ `WordStatsPanel`（后者是策划书字数）、`data_diff_dialog.py` ✗≠ `ceshuDiff.ts`（后者对应策划书版本对比）。这三个文件当时实为**未迁** —— **均已于后续切片迁完**（E12 / E11 / E15）。
3. **`common/` 不能整体按「用不到」处理**：`logger.py` 引用 142 处、`event_bus.py` 18 处、`lucide_icon.py` 11 处、`i18n.py` 4 处、`rate_limiter.py` 2 处 —— 这些**有真实消费者**，属未迁而非"设计上不迁"。（其余 15 个文件确认 src 内 0 引用，是真死代码。）
