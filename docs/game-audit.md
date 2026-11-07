# 游戏档（GDD）审计：不符合与缺陷清单（2026-11-07）

> 范围：**只看游戏档**。应用档另开一轮。
> 每条附代码依据与影响，不含猜测。按严重度排序。本轮只诊断、不改代码。
>
> **依据来源声明**：以下 5 条**全部来自本项目代码的一致性分析**，未引用任何外部游戏文档。
> 「章表是否符合行业惯例」属另一问题，见 `docs/game-doc-corpus-2026.md`（重收 50 条游戏文档后的证据）——
> 该语料同时指出：上轮「游戏档也去编号」缺游戏原文支撑，属软件文档结论外推。

---

## P0-1 生成顺序与章表顺序是两套，且我上轮刚加的「前文要点」选错了前序章

**事实**（`ceshuAi.ts:476` `buildChapterOrder` vs `ceshuConstants.ts:23` `CHAPTER_PARTS`）：

| 章 | 生成顺序 | 章表顺序 |
|---|---|---|
| `market_analysis` | 3 | 13 |
| `combat` | 6 | 6 |
| `systems` | 7 | 5 |
| `monetization` | 9 | 16 |
| `tech` | 13 | 11 |
| `risk_handling` | 14 | 14 |

生成顺序：`meta, vision, market_analysis, story, gameplay, combat, systems, economy, monetization, numeric, art, audio, tech, risk_handling, mvp, resources, accessibility, uiux …`
章表顺序：`meta, vision, story, gameplay, systems, combat, economy, numeric, art, audio, tech, resources, market_analysis, risk_handling, mvp, monetization, accessibility, uiux …`

**24 章里 11 处位置不同**。注释说生成顺序是"依赖顺序"（market 在 vision 后、risk 在 tech 后），但导出的章表、目录、锚点、完成度、`lite` 前 9 章，全部按 `CHAPTER_PARTS`。

**直接影响（这是我上轮引入的缺陷）**：`buildPriorChaptersDigest`（`ceshuAi.ts:190`）用 `visibleChaptersForDoc(doc)` = **章表顺序**取"当前章之前"的章，但整篇生成按 **生成顺序** 跑。后果：

- 生成 `market_analysis`（生成第 3 位）时，按章表顺序它的前序有 12 章，其中 `story/gameplay/systems/…` **根本还没生成** ⇒ 摘要把它们当"已写的前文"。
- 生成 `combat`（生成第 6 位）时，章表顺序里 `systems` 在它前面、但生成顺序里 `systems` 在它后面 ⇒ 摘要把**未生成**的 systems 当前文，反而漏掉**已生成**的 `market_analysis`。
- 结果：前文摘要给的是错的前文，轻则无效、重则把不一致的设定喂给模型。

**根因**：把"生成顺序"和"文档顺序"混为一谈。前文要点应跟着 `plan.order`（生成顺序）走，而不是 `visibleChaptersForDoc`。

---

## P0-2 一键生成无视「默认关闭的模块章」与「品类裁剪」

**事实 A**：`DEFAULT_DISABLED_MODULE_CHAPTERS` = `market_analysis / monetization / live_ops`（`ceshuConstants.ts:255`），新建文档默认只启用 20 个模块章。但 `buildFullGeneratePlan`（`ceshuAi.ts:559`）只按 `includeMarket/includeRisk` 与 `lite` 过滤，**完全不看 `doc.meta.enabled_modules`**。`buildChapterOrder` 里 `monetization`、`live_ops` 是**无条件 push**，`market_analysis` 默认 `includeMarket=true` 也进。

⇒ 一份新建的、默认关掉这三章的文档，点"一键生成"仍会生成并写盘这三章。生成结果与用户刚设定的模块开关矛盾。

**事实 B**：`chapterApplicableToGenre` 规定无战斗品类（`模拟经营/视觉小说/派对/休闲益智`）自动剔除 `combat` 章（`ceshuConstants.ts:204-220`）。但生成计划没有品类裁剪，`buildChapterOrder` 无条件 push `combat`。

⇒ 视觉小说项目一键生成会产出"战斗系统设计"章，而章表/完成度里这章本不该存在。

**共同根因**：生成计划不消费 `specForDoc` / `visibleChapterKeys` 那套"文档感知"的可见章规则，是独立写死的一张顺序表。

---

## P1-3 `lite` 档生成顺序被过滤后与章表顺序仍不一致

`buildFullGeneratePlan` 在 lite 档用 `BASE_CHAPTER_KEYS` 过滤 `buildChapterOrder`，得到：
`meta, vision, story, gameplay, combat, systems, economy, numeric, art, audio`
而 lite 章表是：
`meta, vision, story, gameplay, systems, combat, economy, numeric, art, audio`

`combat` 与 `systems` 仍颠倒。lite 是"方向版前 9 章"，顺序与细节版章表不一致，导出目录与生成进度对不上。

---

## P1-4 生成顺序违反自身声明的依赖关系

注释称生成按"章节依赖顺序"（`AiFullGeneratePanel.tsx:29`），但 `buildChapterOrder` 把 `combat`（战斗系统设计）排在 `systems`（游戏系统设计）**之前**。而校验里明确存在 `combat.combat_mode` 与 `systems.battle.config.turn_mode` 的一致性约束（`ceshuValidation.ts:137-142`）——战斗模式应该建立在系统设计的回合制决策之上。

⇒ 先生成 combat、后生成 systems，等于让下游先定、上游后定，跨章一致性只能靠事后校验报警。配合 P0-1，前文摘要还会把未生成的 systems 当参照。

---

## P2-5 `milestones` 字段在两章重复，且 `tech` 把它列为必填

- `tech` 章有 `milestones`（"开发里程碑"，pipeList 占位符式，`ceshuSchema/systems/tech.ts:45`）
- `mvp` 章也有 `milestones`（"里程碑"，三列表格，`ceshuSchema/production/mvp.ts:43`）
- `CHAPTER_REQUIRED_FIELDS.tech = ['engine', 'milestones']`（`ceshuConstants.ts:327`），而 `mvp` 的必填是 `mvp_scope / mvp_timeline`

⇒ 同一份策划书里"里程碑"要在两处写两遍、格式还不同；`tech` 没写就被判必填缺失。这属于章表设计的语义重叠，不是 bug 但会让人重复劳动、且容易写出互相矛盾的里程碑。

---

## 已核实「不是问题」：`aiHint` 缺 24 个

用 TS 运行时精确统计（`CESHU_CHAPTER_FIELDS` + `resolveFieldMeta`）：**运行时 352 字段**（含动态拆分出的 `xxx_points/notes`），
`aiHint` 空 24、`aiDraftable:false` 24、**两者交集外的 `noHintAndDraftable = 0`**。

⇒ 缺 `aiHint` 的 24 个**恰好全是人定字段**（游戏名/文档类型/主要 NPC 数量/音频预算…AI 本就不起草）。
这是设计一致，不是缺陷。此前 `docs/ai-generation-audit.md` 记的"326 字段 / 92.6%"是**源码文本计数**（不含运行时拆分字段），
口径不同但结论同向：内容字段的 `aiHint` 覆盖是完整的。「建议显式标注」属可读性偏好，不列入问题清单。

---

## 建议修复顺序（不在本轮执行）

1. **先修 P0-1**：让 `buildPriorChaptersDigest` 按 `plan.order` 取前序章（把生成顺序作为显式参数传进 `buildChapterPrompt`，或给 `doc` 带一个"本次生成顺序"上下文）。这是我上轮引入的回归，优先。
2. **再修 P0-2**：`buildFullGeneratePlan` 消费 `doc.meta.enabled_modules` 与 `gameType`，让生成章集合 = 可见章集合；`buildChapterOrder` 不再无条件 push 默认关闭/品类不适用的章。
3. P1-3/P1-4 随 2 一起解决（统一为"以章表顺序为准、依赖顺序只在前文里体现"，或反过来，二选一，不要两套并存）。
4. P2-5 需产品决策：里程碑收归单章（建议 `mvp`），`tech` 改为引用而非重复。
5. P2-6 先核实 24 个是否为故意留空。
