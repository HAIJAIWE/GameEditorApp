# Py → TS 迁移审计（文件级，2026-10-04）

> **本文把「还剩多少」从估算变成可复核的数字。结论与我 2026-10-04 早前在 roadmap §2 里写的「剩余 ≈3.5–4.5k 行（4–5%）」**严重不符** —— 那句话是**下限估算且用错了口径**（把三个混合态域当成了基本迁完）。真实剩余见下。

> ## ⚠️ 2026-10-07 实测复核：非 AI 部分的一致性（主理人问「其他内容和逻辑都是一致的不」）
>
> **结论：主体一致，但不是「完全一致」。** 编辑器内核 / 策划书 / 字段属性 / 引擎导出 / 导入导出
> 这些**主干功能逻辑一致**；仍有**若干真实缺口 + 1 处审计自身的数据自相矛盾**。逐条实测如下
> （⚠️ 审计表头是 10-04 的，以下每条都在 10-07 重新 grep 核实过，**已剔除因 E28–E41 而过期的判定**）。
>
> **① 审计数据自相矛盾（E54 已复核消除）**：原先 §1 结论表、§2 域表、§3 逐文件明细**三套分类计数互不相同** —— 对外表现为 **±2 文件 / 480 行** 的差异（§2 一度算出 `93+61+88+57=299`、行数 `34,605+22,917+18,756+14,886`，与 §1 加总对不上）。
> **E54（2026-10-07）已以 §3 逐文件明细为唯一真源重算 §1/§2**，三者现**逐格相等**（109 / 58 / 126 / 6 = 299 文件、40,116 + 21,503 + 29,095 + 450 = 91,164 行）；方法与逐笔来源见 §1 的「E54 台账校准」块。
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
> 其中「整块没做」的 ⚠️ 只剩 **6 文件 / 450 行**（`auto_updater` 60 / `event_bus` 87 / `rate_limiter` 85 / `sentry_client` 52 / `privacy` 88 / `ai_field_button` 78，见 §1 与 §3 逐行）；`team_dialog.py`（818）已经主理人批准归入 ⛔（团队 CRUD 属被重写的 Agent 框架）。
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
| ✅ 已迁 | 109 | 40,116 | 44.0% |
| ◐ 部分已迁 | 58 | 21,503 | 23.6% |
| ⛔ 有意不迁 | 126 | 29,095 | 31.9% |
| ⚠️ 未迁（整块没做） | 6 | 450 | 0.5% |

**对账（必须相等，已 PASS）**：`109+58+126+6 = 299` ✓、`40116+21503+29095+450 = 91,164` ✓

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

### 真实剩余 ≈ 1.0–1.4 万行（11–15%）

- **确定未迁（整块没做）＝ 450 行 / 6 文件**（精确数字）
- **部分已迁里的缺口 ≈ 1.0–1.4 万行**（**估算**：按各文件的完成度估计汇总，各代理给的完成度多在 25%–75%，本身带主观性）
- 合计 **≈ 1.0–1.4 万行**，占旧代码 **11–15%**

> **口径说明**：不能把「⛔有意不迁」的 29,095 行算成欠债 —— 那些是**决策**（`core/agent` 框架重写域 8,419 + 团队 CRUD 818、自愈链 4,166、样例数据 1,125、PyQt 胶水、死代码、Qt QSS 主题栈等），各有实证依据。
> 但也不能把「◐部分已迁」算成已迁 —— 那 21,503 行里有一部分是真缺口。
>
> **相比 10-04 原判「≈2.4–2.8 万行（26–31%）」的下降，逐笔可复核**：① 8,419 行＝E42 把 `core/agent` 未迁**改判为不迁**（**决策，不等于已做完**）；② 1,363 行＝4 个早已迁完的文件从 ⚠️ 上移 ✅；③ 1,542 行＝§1 与 §3 明细对不上的 6 个文件归位为「◐」；④ 818 行＝`ui/widgets/team_dialog.py` 按 E42 域归入 ⛔。
>
> **⚠️ 现在「整块没做」的 6 文件已全部是「小件 + AI 待重写」**：`common/auto_updater.py` 60、`common/event_bus.py` 87、`common/rate_limiter.py` 85、`common/sentry_client.py` 52、`security/privacy.py` 88、`ui/ceshu/ai_field_button.py` 78（章节字段级 AI，随框架重写一起做）。**编辑器内核已无「整块没做」的功能缺口**。

### ◐ 复核（2026-10-07，E50 更新）

对全部「◐ 部分已迁」条目做了逐条实测复核。**E50 已将下列 STALE-DONE（TS 已等价实现、原 ◐ 判定过期）文件重新分类为 ✅**：window_state / preview_panel / statistics / template_manager / common / export / advanced / chat_renderer / image_loader / toast / home_widget。余下 ◐ 条目属下列两类之一：

- **DESIGN-DIFFERENT（TS 有意替换，非缺口）**：themes / QSS 主题栈、agent UI（per E42 重写域）、buff / equipment 系统、`_ai_dialog` 模板模式。
- **genuine-partial（仍有真实缺口）**：`data_tab`（AI 生成时的「技能锚点模板」选择上下文未迁，见 §4 下条；P5 数量约束软检查、F2·右键重命名与条目右键菜单已由 **E51** 补齐）。

> 另：`dynamic_form` / `main_window` 曾被 E49 复核记入 STALE-DONE 名单，但**不在 E50 的 12 个候选范围内**，本轮未重新分类（仍为 ◐，待后续实测）。

**仅有的真实遗留**（本轮实测确认）：

1. **评分报告 Markdown 导出** —— 已由 **E49** 补齐（`shared/ceshuScorer.ts::buildScoreReportMarkdown` + `ceshu:exportScoreReport` 接线 + 面板「导出评分报告」按钮）。
2. **`components/virtual_list.py` 的条目右键菜单** —— 已由 **E51** 补齐（`DataEditorTab` 的 `row-context-menu`：重命名 / 编辑 / 复制 / 删除，与 Python `virtual_list.py:217-231` 同序）；其「拖拽排序」属 **DESIGN-DIFFERENT**（Python 重排**内存数组**，而 TS 条目来自 **SQLite、无数组序**），非缺口。全仓 `VirtualListWidget` 的真实消费者只有 `data_tab.py`（`ui/components/__init__.py` 与 `ui/__init__.py` 仅 re-export），故该组件可视为已迁。
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
| `core/agent` | 97 | 24,670 | 8 / 1,689 | 23 / 6,752 | 66 / 16,229 | 0 / 0 |
| `ui/ceshu` | 35 | 14,620 | 26 / 12,345 | 5 / 1,834 | 3 / 363 | 1 / 78 |
| `ui/widgets` | 24 | 9,232 | 14 / 6,053 | 3 / 1,399 | 7 / 1,780 | 0 / 0 |
| `ui/` 顶层 + `themes` + `components` | 31 | 9,883 | 8 / 1,665 | 12 / 5,284 | 11 / 2,934 | 0 / 0 |
| `core/ceshu` + `core` 顶层 + `defaults` | 38 | 12,602 | 28 / 11,129 | 2 / 225 | 8 / 1,248 | 0 / 0 |
| `ui/dialogs` | 20 | 6,055 | 10 / 3,174 | 5 / 2,041 | 5 / 840 | 0 / 0 |
| `common` + `config` + `security` + `data` + 顶层 | 45 | 10,672 | 11 / 2,518 | 6 / 2,489 | 23 / 5,293 | 5 / 372 |
| `features` | 9 | 3,430 | 4 / 1,543 | 2 / 1,479 | 3 / 408 | 0 / 0 |
| **合计** | **299** | **91,164** | **109 / 40,116** | **58 / 21,503** | **126 / 29,095** | **6 / 450** |

> **注（E54 已消除漂移）**：上表「合计」是各域行直接相加，且与 §1 结论表**逐格相等**（109 / 58 / 126 / 6 = 299 文件；40,116 + 21,503 + 29,095 + 450 = 91,164 行）。此前 §1 与 §2 存在 **±2 文件 / 480 行** 的差异、§1 与 §3 明细差 7 文件，**E54 已按 §3 逐文件明细统一**（方法与逐笔来源见 §1 的「E54 台账校准」块）；**§1 仍是守护测试的解析源**。

**三个最值得注意的域**：
1. **`core/agent`（最大域，24,670 行）→ 只有 8 个文件（1,689 行）是完整已迁**；另有 33 个文件（8,419 行）按 **E42** 改判「不迁（框架改为重写）」，不再计入欠债。A 档做的是「核心闭环」，不是「整个 Agent 引擎」。
2. **`ui/` 顶层 + 主题（9,883 行）→ 仅 1,665 行完整已迁**，主题/特效/菜单/多标签整块未做（多为 C 档，但那是**决策**还是**欠债**需区分：主题≠核心功能）。
3. **`ui/dialogs`（6,055 行）→ 已完整迁出 3,174 行**（E54 把 `settings_dialog.py` 671 行从 ⚠️ 上移 ✅），该域 **⚠️ 列已清零**；余下 `api_config.py`（模型管理/视觉/模板三 tab 未迁）等为 ◐。快速创建/统计/字段模板/高级搜索/类型可见性/数据对比/备份已由此前的 E10–E16 迁出。

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
| brain_plan.py | 287 | ⛔ | 计划驱动执行，A1-2 明确不移植 |
| brain_reflect.py | 108 | ⛔ | 失败反思，A1-2 明确不移植 |
| brain_subagent.py | 67 | ⛔ | SubAgent 通道，A1-1 明确不移植 |
| intent.py | 718 | ⛔ | 规则意图解析+Planner，TS 无 |
| learner.py | 543 | ◐ | **偏好/反馈子集已迁**：`shared/agent/personalization.ts`（extractPreferences/buildPersonalizedContext）+ `main/agent/preferenceStore.ts`（PreferenceStore/FeedbackStore）+ `brainService.ts` 注入系统提示词 + `agent:feedback` IPC；**未迁**：动作计数/转移矩阵、下一步建议、时间峰值、技能模板自动生成（依赖 TS 没有的 `Intent`/`BrainState`，属过度设计，有意不迁） |
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
| score_report_dialog.py | 603 | ◐90% | 视图已迁；缺「导出 Markdown 评分报告」 |
| validation_dialog.py | 556 | ◐90% | 视图已迁；缺「导出 Markdown 校验报告」 |
| changelog_dialog.py | 326 | ◐80% | 视图+日志已迁；缺「导出 MD/HTML/Text」 |
| ai_panel.py | 248 | ◐60% | 通用对话由 `DigitalPanel` 承接；策划书专属 8 主题快捷面板未迁 |
| editor_view_workers.py | 101 | ◐50% | 整章 AI 已迁；单字段填充 `_AIFillFieldWorker` 无对应 |
| preview_panel.py | 222 | ✅ | **E44 已迁「数据引用概览」**（`@data[...]` 解析 + 实时值 + 分组统计，见 `shared/dataRef.ts`；并修正 PyQt 单复数键不匹配的 bug）。**E49 更正（实测翻案）**：原写「`enabled_editors` 动态编辑器半边未迁」**为误**——该半边**亦已迁**：`ceshu/CeshuDataPreview.tsx` 按 `computeEnabledEditors(doc)` 逐启用系统渲染标签页并内嵌 `DataEditorTab`，同面板「📊 数据引用」标签渲染 `CeshuDataRefsPanel`。`core/editor_layout.py` 是另一文件（⛔ E5 已实证过期死代码），与此无关（E50 重新分类为 ✅：TS 已等价实现，原 ◐ 判定过期） |
| ai_field_button.py | 78 | ⚠️ | **E53 实证**：章节表单字段级「AI 帮我填」全链无 TS —— 本文件（真身 `ui/ceshu/ai_field_button.py`，非 `ui/dialogs/`）+ `chapter_forms/_common.py::_add_row(…, ai_path)` + `apply_ai_content_to_form` + 信号链（`chapter_panel.py:262-265`→`editor_view.py:210`→`editor_view_mixins.py:56`→`_AIFillFieldWorker`）在 TS **零对应**；`ceshuFieldControl`/`ChapterForm.tsx` 无 AI 入口。**注意区分**：数据条目表单的字段级 AI（`ItemForm.tsx` 的 `FieldAiAssist`）**已迁且在用**，不要混为一谈 |
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
| drop_table.py | 225 | ✅ | `shared/dropTable.ts`+`DropTableEditor.tsx`（名称/掉率/最小/最大 + 内联选库 + 夹紧；E18） |
| dynamic_form.py | 839 | ◐75% | `formSections.ts`+`ItemForm.tsx`+`FormSectionCard.tsx`；缺 image/dialog/formula_builder/image_tags/AI 按钮等专用控件 |
| multi_select.py | 258 | ✅ | `shared/refTable.ts`+`RefTableEditor.tsx`（refType 解析→单数 id + 名称/等级 + 内联选库；E17） |
| task_row.py | 317 | ◐40% | `panel.ts::summarizeToolTasks` 派生扁平列表；缺可展开任务卡/状态徽章/完成删除动作 |
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
| digital_employee.py | 486 | ◐55% | `DigitalPanel.tsx`+`main/tray.ts`；缺独立弹窗/浮窗常驻 |
| digital_panel_chat.py | 504 | ◐75% | `panel.ts::reduceBrainEvent`+`DigitalPanel`；缺 markdown 气泡/记忆上下文/欢迎语 |
| digital_panel_input.py | 209 | ◐40% | 输入+发送已迁；缺斜杠命令/编辑器上下文采集 |
| digital_panel_tasks.py | 214 | ◐50% | 后端重设计为 `summarizeToolTasks`；独立任务 CRUD 未迁 |
| digital_panel_workspace.py | 308 | ◐40% | 会话快照→`sessionStore.ts`；富文本草稿/多工作区未迁 |
| main_window.py | 1248 | ◐40% | `App.tsx` 骨架+`LibraryBar`+模式切换；缺多标签/菜单/窗口状态/自动保存 |
| components/virtual_list.py | 243 | ◐40% | 搜索过滤/多选已迁；缺虚拟滚动/拖拽排序/右键菜单 |
| chat_renderer.py | 172 | ✅ | markdown→HTML+代码高亮已迁（E47：react-markdown+remark-gfm+remark-breaks+rehype-highlight 至 DigitalPanel 气泡）；system/error/plan 气泡类型因 TS 状态模型不同未迁（TS 用独立 error 字段/步骤 UI），属刻意范围收窄（E50 重新分类为 ✅：TS 已等价实现，原 ◐ 判定过期） |
| effects.py / theme_effects.py / text_glow_effect.py | 459+201+148 | ⛔ | **有意不迁（E24 判定）**：**86% 是 Qt QSS/hex 字面量**（技术上不可迁）；且**实证死代码**——`GlowButton`/`GlowLineEdit`/`GlowComboBox`/`GlowListWidget`/`SuccessToast` 在 `src/` 内**零引用**；`apply_text_glow` 遍历的 `main_window.glow_widgets` 初始化为 `[]` 后**从未 append**（恒空转）；`generate_digital_panel_qss` 仅被 `themes/__init__` 再导出，**无真正调用者**（数字员工面板已由 A1-4 `DigitalPanel.tsx` 覆盖） |
| themes/themes.py | 1097 | ⛔ | **有意不迁（E24 判定）**：`_THEME_QSS`(255 行) + `_DIGITAL_PANEL_QSS`(200 行) + 5 套 `_THEME_CONFIGS` 主题字典(210 行) **全是 Qt QSS 字符串**，Web 端不可用；TS 已有 CSS 变量深色主题（`styles.css` 9 个变量）。唯一有价值的是 33 行**设计令牌**（`FONT_SIZE_XS..XL` 11/12/13/14/16、`SPACING_XS..XL` 4/8/12/16/24），已作为 CSS 自定义属性覆盖（`:root` 变量层）。多主题切换属**独立立项**（需 `[data-theme]` 覆写 ~80-100 行），不搭车 |
| window_state.py | 154 | ✅ | **E24 已迁**：`main/windowState.ts`（几何 + 最大化 + lastMode，原子写）+ `app:setWindowMode` IPC。**刻意不迁**（TS 无对应物，非缺口）：theme（TS 无多主题，`themes.py` 已判不迁）、layout_mode（Python 硬编码 `"three_column"` 常量、无信息）、splitter_ratio（TS 侧栏是 CSS Grid、无 QSplitter）、auto_save_enabled/interval（TS 条目级即时落库、无内存脏状态）、has_unsaved_changes/compute_data_hash/check_data_changed（TS 无内存脏状态，无源之水）（E50 从捆绑行拆出并重新分类为 ✅：TS 已等价实现，原 ◐ 判定过期） |
| menus.py / shortcuts_dialog.py / tab_manager.py | 180+107+249 | ◐ | **tab_manager** 核心（多标签/延迟切标签/侧栏计数）已由 TS `mode-data`/`mode-ceshu`/`mode-digital` + `LibraryBar` 覆盖，仅剩「标签撕裂保护」边缘情形。**menus.py** 26 项中 TS 已覆盖 16 项（工具栏+侧栏）；**E49 更正（实测翻案）**：原写「撤销/重做 **TS 完全没有**」**为误**——撤销/重做**已迁**（E27：`shared/ipc.ts` `data:undo`/`data:redo`/`data:undoState` + `main/data/undoRecorder.ts` + `App.tsx` 按钮与 Ctrl+Z/Y）；清理未用图片（IPC `images:deleteImages` + 菜单 `menuitem-tools-cleanupUnusedImages`）、多引擎导出（Unity/Unreal/Godot/Cocos2d 四导出器 + Lua 导出 `main/engineExport/lua.ts`）**均已迁**。仅剩「数据关系图」一项为真实缺口（TS 无对应）。**shortcuts_dialog** 是纯键盘映射表（无消费者），随 menus 不迁（E50：window_state 已拆为独立 ✅ 行） |
| components/image_loader.py | 324 | ✅ | **E46 已迁 `LazyImageLabel` 行为**（`shared/imageCache.ts` LRU 缓存 + `LazyImage` 组件，按已保存绝对路径经 `images:readByPath` 回读 data URL 回显预览，修「已保存图片路径不回显」的真 bug）；**未对齐**：不做 PIL 位图重采样（浏览器 `<img>` 引擎解码，CSS 限尺寸即可，属刻意的过度开发规避）（E50 重新分类为 ✅：TS 已等价实现，原 ◐ 判定过期） |
| components/toast.py | 98 | ✅ | **E45 已补 Toast 组件**（`shared/toast.ts` + `ToastHost`，多条并存/自动消失/三态配色）；**未完全对齐**：未做 E2E 实机点击验证（无 jsdom 设施，见 roadmap E45 的诚实边界）（E50 重新分类为 ✅：TS 已等价实现，原 ◐ 判定过期） |
| `__init__.py`×3 / ai_bridge.py / digital_panel_state.py / digital_panel_theme.py / layout_builder.py | 98+116+232+338+245 | ⛔ | 包胶水 / `a-tier-plan` 明列不迁（初始化窗口定位、类型桩、QSS 注入、QSplitter 布局）。**E54 校准**：原写 `32+116+… 等`（尾带「等」），实测三个 `__init__.py` 合计 **98**（32+10+56），故本行精确为 1,029 行 |

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
| startup_mode_dialog.py | 144 | ◐60% | 模式切换已迁；缺启动弹窗+「记住选择」持久化 |
| type_editor_ai.py | 338 | ◐25% | 模板导入已迁；缺 AI 推荐字段/分析现有数据/联网参考 |
| type_editor_dialog.py | 528 | ◐70% | `TypeEditorPanel.tsx`；缺布局分区编辑（已判不迁）/智能工具栏/拼音英译按钮 |
| type_editor_field_widget.py | 345 | ◐80% | 字段全属性+ID 生成（`fieldId.ts`/`fieldIdAi.ts`）；缺拼音兜底（E6 明示未做） |
| api_config.py | 686 | ◐ | **E41 已迁「基础设置」**（6 家服务商 / base_url / model / 温度 / 最大令牌 + Key 走 safeStorage，见 `shared/llmConfig.ts` + `main/llm/client.ts`）；**未迁**：模型管理 tab（自定义模型增删改，写 PyQt 私有 `custom_models.json`，TS 模型清单来自 Ollama 运行时）、视觉模型 tab（TS 无消费者）、模板设置 tab（实为技能生成偏好，属内容域） |
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
| common/ai_client.py | 753 | ◐15% | 已迁 `main/llm/client.ts`；缺 OpenAI/Qwen/豆包/DeepSeek/流式/tools/vision/生图/限流；**引用 14 处** |
| common/common.py | 287 | ✅ | 原子写（`atomic_write_*`）/uuid/`is_test_env` **已迁**（文件真实消费者）。**E49 更正**：`safe_dict` 在 Python 源中**根本不存在**（grep 零命中）；`safe_int`/`safe_float`/`safe_str` **仅有定义（`common.py:157/174/191`）+ `common/__init__.py` 再导出、零业务调用点** ⇒ 非缺口（E50 重新分类为 ✅：TS 已等价实现，原 ◐ 判定过期） |
| common/exceptions.py | 195 | ◐ | `shared/ipc.ts` IpcInvokeError；缺友好化；引用 2 处 |
| common/shortcuts.py | 177 | ◐ | `main/tray.ts` 单热键；缺 ShortcutManager/DEFAULT_SHORTCUTS |
| config/constants.py | 181 | ◐ | 类型/字段/属性/策划常量已迁；缺窗口/主题/文件名常量；引用 31 处 |
| config/settings.py | 858 | ◐ | `fields_config`→`typeSchema.ts`；**E23 补存储基座**：`shared/settingsStore.ts`（统一 localStorage 读写/枚举/导出/导入/重置，`StorageLike` 单一真源，已收拢 4 处散点）。仍缺 `backup_dir`/`startup_mode`/`api_*`（TS 刻意无全局单例；api_* 现由 `imageGenConfig` 单独存） |
| security/sandbox.py | 325 | ◐ | 已由 `main/security/jsSandbox.ts`（QuickJS 白名单）**设计性替换**；引用 2 处 |
| common/auto_updater.py | 60 | ⚠️ | TS 无；引用 1 处 |
| common/data_diff.py | 197 | ✅ | `shared/itemDiff.ts`（`diffValues`/`diffItems`/`diffLibraries`/`collectLeaves`/`summarizeDiff`）。**修 Python 三处缺陷**：① 数组元素**不递归**（`_compare_list` 整块标 MODIFIED）→ 递归；② `compare_items_by_id` 新增/删除只塞 `name` 一个标量 → 携带 `data` 全量；③ 从不产出的 `UNCHANGED` 死枚举 → 无变化即不产出。**有意保留**数组按下标对齐（与 Python 一致，已在注释标注局限） |
| common/data_importer.py | 269 | ✅ | **E54 实证已迁**：`main/ipc.ts:690` `data:importCsv`（+`data:importExcel`）→ `main/data/csvIO.ts::importCsvFile` / `excelIO.ts::importExcelFile`；旧 JSON 走 `data:importLegacy`（`legacyImport.ts`）。原判「TS 无」过期 |
| common/data_ref.py | 209 | ✅ | **E54 实证已迁**：`shared/dataRef.ts`（E44：`@data[...]` 解析 + 实时值 + 分组统计）+ `ceshu/CeshuDataPreview.tsx`「📊 数据引用」标签（`CeshuDataRefsPanel`）。原判「无 TS」是 E44 之前的快照 |
| common/event_bus.py | 87 | ⚠️ | TS 用 IPC + brain 事件流替代；**引用 18 处** |
| common/i18n.py | 401 | ⛔ | **有意不迁（E23 决策）**：这是**全局翻译框架**，而 TS 侧 UI 文案目前 100% 硬编码中文——接入需翻译全部组件（数十文件、上千字符串），属**独立立项**而非存储基座职责。注意 `core/agent/i18n.py::AgentI18n` 早已是死代码（无 import/调用点），勿混淆两者 |
| common/logger.py | 155 | ✅ | 已迁为 `shared/logger.ts`（统一入口，渲染层经 IPC 转发到主进程）+ `main/logger.ts`（轮转文件日志，10MB×5 备份）；原 142 处引用现统一走 `log` 入口（E8） |
| common/lucide_icon.py | 214 | ✅ | **E54 实证已迁**：`shared/lucideIcons.ts`（`LUCIDE_ICON_PATHS` **43 键** / `LUCIDE_ICON_ALIASES` **33 键**，由 `lucide_icon.py` 的 `_ICON_PATHS`/`_ALIASES` **脚本机械导出**，另有 `resolveIconName`）+ `LucideIcon.tsx`（`currentColor`/stroke 2.5/24×24，未收录名不渲染）——E30 落地。原判「renderer 用 emoji/内联 SVG」是 E30 之前的快照 |
| common/rate_limiter.py | 85 | ⚠️ | TS 无 TokenBucket；引用 2 处 |
| common/sentry_client.py | 52 | ⚠️ | TS 无；引用 1 处 |
| security/privacy.py | 88 | ⚠️ | TS 无 `summarize_sensitive`；引用 1 处 |
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
- **全局对账**：四类合计 = 299 文件 / 91,164 行，**PASS**（见 §1）；且 §1 = §2 = Σ§3，**逐格相等**（E54）。
- **已知误差来源**：①「◐部分已迁」的完成度是**估计值**（各代理给出，主观性存在）；②「⛔有意不迁」的判定依赖既有决策记录 + grep 实证，若某模块将来被需要需重新评估；③ 判定粒度是「文件」，同一文件内不同功能的迁移状态可能不一致（已在依据里尽量写明）。

## 6. 本次审计纠正的三处早前误判

1. **roadmap §2 的「剩余 ≈3.5–4.5k 行（4–5%）」是错的** —— 逐文件审计给出的真实剩余是 **≈1.0–1.4 万行（11–15%）**（10-04 首版为 ≈2.4–2.8 万行，E42 写掉 `core/agent` 未迁部分 + E54 校准后见 §1）。那句话把三个混合态域当成了基本迁完，且口径过窄。
2. **三条「已迁映射」线索是错的**（幸好标注了"须自行核实"）：`ui/dialogs/template_manager.py` ✗≠ `TemplateEditorPanel`（后者对应**策划书**模板）、`statistics.py` ✗≠ `WordStatsPanel`（后者是策划书字数）、`data_diff_dialog.py` ✗≠ `ceshuDiff.ts`（后者对应策划书版本对比）。这三个文件当时实为**未迁** —— **均已于后续切片迁完**（E12 / E11 / E15）。
3. **`common/` 不能整体按「用不到」处理**：`logger.py` 引用 142 处、`event_bus.py` 18 处、`lucide_icon.py` 11 处、`i18n.py` 4 处、`rate_limiter.py` 2 处 —— 这些**有真实消费者**，属未迁而非"设计上不迁"。（其余 15 个文件确认 src 内 0 引用，是真死代码。）
