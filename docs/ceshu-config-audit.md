# 策划书字段配置体检报告

> 2026-10-23 · 基于 `desktop/src/shared/ceshuFields.ts` 的 122 个静态字段 + 13 个动态游戏系统配置
> 触发问题：**「AI 生成的内容真的对吗？初始配置真的对吗？」**

---

## 0. 结论摘要（TL;DR）

**配置「列得全」，但没有任何证据表明它能产出对的内容；而且现有指标在奖励「写满」而不是「写对」。**

三个硬数据：

| 指标 | 数值 | 含义 |
|---|---|---|
| **AI 生成契约覆盖率** | **23/122 = 19%** | 81% 的字段没有 `aiHint`——AI 只能自由发挥，人也不知道该审什么 |
| **人审要点覆盖率** | **7/122 = 6%** | 94% 的字段，审核人拿不到「该看什么」的一句话 |
| **textarea 占比** | **72/122 = 59%** | 近六成字段是最不适合「AI 按格生成 + 人按格审」的形态 |

更关键的负面证据：**库里 4 份策划书全是空壳**（平均已填 20/165 字段，且全是 `version/date` 之类结构默认值 + 13 个系统的空 config），**没有一份 AI 生成内容可供评估**；本地也未配置模型。所以「生成对不对」目前是一个**未被验证的假设**——2411 个单测验证的是管道，不是内容。

---

## 1. 体检方法

对每个字段按四个问题判定：

1. **AI 填得好吗**——有没有 `aiHint`（生成目标）？类型是结构化（列表/表格/数字/枚举）还是开放文本？
2. **人审得动吗**——有没有 `reviewHint`（审阅要点）？内容是「可逐格核对」还是「得通读」？
3. **该不该拆**——textarea 且内容天然可列举（步骤/清单/表格）→ 应拆成 `points` + `notes`
4. **该不该并/该不该留**——与其他字段语义重叠？或需要人定（预算、团队、商业决策）？

分类标记：`✅ 合适` / `🔧 该拆` / `🔀 该并` / `❓AI 填不好` / `➕ 缺` / `🐛 配置 bug`

---

## 2. 逐章体检

### 文档信息 meta（8 字段）· 结论：✅ 全库最健康

| 字段 | 判定 |
|---|---|
| game_name / game_type / platform / status / confidentiality / gdd_scope | ✅ 人定 + 枚举/多选，AI 不掺和，正确 |
| positioning / tags | ✅ 有 AI 目标 + 人审要点 |

**章级结论**：这一章证明了「契约写清 → AI 按格填、人按格审」是成立的。问题是**只有这一章和下面两章做到了**。

### 第一章·产品愿景 vision（5 字段）· 结论：⚠️ 结构对，形态差

- `design_vision` / `differentiation`：契约已锐化（互斥边界写进 aiHint），但**两者仍是 textarea**——🔧 该拆：愿景应拆「愿景句 + 理念要点」，差异化应拆「竞品对比表（pipeList：我们/竞品A/竞品B）」
- `user_personas.primary/secondary`：textarea + 点路径，🔧 该拆成结构化（年龄段/场景/痛点各一格）
- `business_model`：✅ 人定正确
- **➕ 缺**：`potential`（潜在用户）在默认数据里有键（`user_personas.potential`）但**不在 schema 里**——🐛 数据与配置不一致

### 第二章·世界观与角色 story（14 字段）· 结论：⚠️ 已拆 3 个，还剩 4 个大段

- ✅ 已拆：`architecture` / `main_plot`（points+notes 形态），`npc_list` / `boss_design` 是 pipeList
- 🔧 该拆：`geography`（应拆「地点清单：名称/作用/关联」）、`protagonist`（应拆「身份/目标/缺陷/弧光」）、`companion_system`、`character_arcs`
- ❓AI 填不好：`antagonants` / `character_arcs` / `voice_cast`——**无 aiHint**（AI 不知产出什么），且这类内容强依赖作者审美
- **章级结论**：本章是「拆了一半」的样板——证明拆完的字段（architecture_points）确实更好审，但拆解停在 3/14

### 第三章·核心玩法 gameplay（5 字段）· 结论：🔴 重点章，契约几乎为零

- `core_loop`：**必填、无 aiHint**——核心循环是整份策划最重要的字段之一，AI 却不知道要产出什么；`core_loop_points` 有 aiHint 但 `core_loop` 本体没有（本末倒置）
- 🔧 `first_30_min` 该拆成「分钟段体验清单」（pipeList：时间段/玩家动作/情绪目标）
- ❓ `game_modes`：无 aiHint 的 stringList
- **章级结论**：**最重要的章之一，契约覆盖 2/5，且最该有契约的字段没有**

### 第五章·战斗 combat（13 字段）· 结论：🔴 面积最大、契约最薄

- 13 字段里 10 个 textarea，只有 3 个有 aiHint（且都是 `damage_formula` 一家的 points/notes）
- 🔧 该拆：`skill_system`（→ 技能表：名称/消耗/CD/效果）、`buff_debuff`（→ Buff 表）、`element_system`（→ 元素克制表）、`team_formation`、`pvp_design`、`pve_design`
- ❓ `boss_mechanics` / `balance_strategy`：无契约且需要设计经验
- **章级结论**：10/13 是开放文本 = AI 每字段吐一大段、人每字段通读一遍

### 第六章·经济 economy（7 字段）· 结论：🔴 AI 契约 0

- 7 字段 **aiHint 全部为 0**；5 个 textarea
- 🔧 `source_sink`（必填！）应拆成「产出/回收两张表」——这是经济设计的标准表达
- 🔧 `drop_tables` 应升级为 pipeList（物品/掉率/来源），不是 stringList
- ❓ `inflation_control` / `economic_goals`：需要真实运营数据支撑，AI 只能编

### 第七章·数值 numeric（5 字段）· 结论：⚠️ 契约有了，缺可算性校验

- `core_formulas` 契约已锐化（声明不重复战斗章），但**公式能不能算是没人验的**——质量门只数字数
- 🔧 `economic_model` 该拆（与 economy 章重叠，见横切问题）

### 第八章·美术 art（4 字段）· 结论：🔴 4/4 textarea、0 契约

- `art_style` / `color_system` 是必填但无 aiHint——AI 会自由发挥写一堆风格形容词
- 🔧 全部该结构化：`color_system` → 色板表（主色/辅色/语义色），`typography` → 字体表
- **➕ 缺**：**UI/UX 交互设计整块缺失**（界面清单、交互流程、信息架构）——标准 GDD 必有

### 第九章·音频 audio（9 字段）· 结论：⚠️ 有清单形态，但 0 契约

- `soundtrack_list` / `sfx_list` 是 pipeList ✅；其余 5 个 textarea 无契约
- ❓ `audio_budget`：人定字段却标着 AI 可起草（应标 `aiDraftable: false`）

### 第十章·技术 tech（4 字段）· 结论：⚠️ 0 契约 + 缺块

- `milestones` 是 pipeList ✅，但 `core_architecture` / `team_structure` 无契约
- **➕ 缺**：性能与适配目标（帧率/机型分档/包体）、测试与 QA 计划、上线发行计划

### 第十一章·资源 resources（3 字段）· 结论：✅ 人定正确，但太薄

- `budget.summary` / `ip` 是 text（人定合理）；`risk_matrix` 与 risk_handling 章**重名重叠**（见横切问题）

### 第十二章·市场分析 market_analysis（7 字段）· 结论：🔴 0 契约，且最危险

- `competitors` 是 pipeList ✅ 但无 aiHint——**AI 填竞品表时会编造游戏名和数据**，这是「内容不对」的最高危场景，而契约对此一字未提
- 🔧 `target_market` / `user_demographics` / `market_size` 该结构化
- ❓ `market_size`：AI 给的数字无法验证，建议标人定或要求「给出处」

### 第十三章·风险 risk_handling（9 字段）· 结论：⚠️ 0 契约 + 与 resources 重叠

- 6 个分类风险清单（技术/市场/团队/法律/进度）是好的结构化形态，但无 aiHint
- 🔀 `risk_matrix` 与 `resources.risk_matrix` 重名重叠（横切问题 #3）

### 第十四章·MVP mvp（9 字段）· 结论：⚠️ 0 契约

- `milestones` pipeList ✅、`cut_features` 概念好；其余无契约
- ❓ `team_size` / `budget_estimate`：人定字段未标 `aiDraftable: false`
- **➕ 缺**：验收标准（`success_criteria` 有字段但无契约 → AI 会写「DAU 100 万」这种空话）

### 第十五章·商业化 monetization（10 字段）· 结论：🔴 0 契约 + 敏感区

- 7 个 textarea 全无契约；`whale_strategy` / `arpu_target` 这类**商业决策字段应标人定**，现在 AI 可起草
- 🔧 `pricing_tiers` 应升级为 pipeList（档位/价格/内容）
- **➕ 缺**：运营与活动计划（版本节奏、活动类型、留存目标）、数据埋点与指标

### 第十六章·可访问性与本地化 accessibility（10 字段）· 结论：⚠️ 0 契约

- `language_list` / `accessibility_features` stringList ✅；7 个 textarea 无契约
- 🔧 `rating_certification` 应结构化（地区/分级/要求）
- **➕ 缺**：本地化流程（谁译、何时译、如何回归）

---

## 3. 横切问题（按严重度排序）

### 🐛 P0-1 `story` 章没有字数基准（明显 bug）

`CHAPTER_WORD_BENCHMARK` 里有 `worldview` 和 `characters` 条目，但这两章早已合并为 `story`——**表里没有 `story`**。评分引擎对最大的章（14 字段）没有字数依据，只能走默认值。这是匹平迁移的遗留。

### 🔴 P0-2 AI 契约覆盖率 19%、人审要点 6%

`economy / art / audio / tech / resources / market_analysis / risk_handling / mvp / monetization / accessibility` **十个章的 aiHint 全军覆没**（systems 是动态配置，不参与静态统计）。后果：AI 会去填这 99 个没有生成目标的字段——它只能按「50-300 字、具体专业」的通用要求自由发挥；而人审时 94% 的字段拿不到「该看什么」。

### 🔴 P0-3 「字数」被当成质量指标，方向错了

`REQUIREMENTS_FULL` 要求「字符串字段生成 50-300 字」；评分引擎「内容质量 40 分」主要看字数是否落在基准区间。**这套激励在系统性奖励「写满」**——与「简单易懂」直接冲突，也解释了为什么 AI 产出容易又长又空。

### 🟠 P1-1 重叠字段（已处理 2 组，还剩 3 组）

| 组 | 状态 |
|---|---|
| vision.design_vision ↔ differentiation | ✅ 契约已划界 + 重复检测已上线 |
| numeric.core_formulas ↔ combat.damage_formula | ✅ 同上 |
| **resources.risk_matrix ↔ risk_handling.risk_matrix** | ❌ 未处理（重名重叠，校验里有一条「内容不一致」警告在兜） |
| **vision.user_personas.potential ↔ secondary** | ❌ 潜在用户在默认数据有键、schema 无字段 |
| **numeric.economic_model ↔ economy 全章** | ❌ 经济模型在两个章各写一遍 |

### 🟠 P1-2 人定字段未标记（8/122 标了人定，明显漏标）

`audio.audio_budget`、`mvp.team_size`、`mvp.budget_estimate`、`monetization.whale_strategy`、`monetization.arpu_target`、`vision.business_model`（已标）——**商业与资源决策让 AI 起草是危险的**，应统一标 `aiDraftable: false`。

### 🟡 P2-1 缺 7 个标准 GDD 模块

UI/UX 交互设计、关卡/内容设计、运营与活动、数据埋点与指标、测试与 QA、上线发行、性能适配。

---

## 4. 分级改动清单

### P0（不做这些，生成质量无从谈起）—— ✅ 已完成（2026-10-23）

| # | 动作 | 状态 |
|---|---|---|
| 1 | 修 `story` 字数基准缺失；清掉 `worldview`/`characters` 死条目 | ✅ 基准表改按 `ChapterKey` 收口（漏配编译期报错），补 `story: [500,1500,800]`，删死条目；加「每章都有基准」回归测试 |
| 2 | 给 10 个零契约章补 aiHint + reviewHint | ✅ **覆盖率 19% → 80%（aiHint）、6% → 75%（reviewHint）**；契约数据按章拆到 `src/shared/ceshuFieldHints/`（12 章文件并行编写），`ceshuFields.ts` 只在导出时合并；人定字段 8 → 18 |
| 3 | 质量门加「写对」代理指标 | ✅ 新模块 `shared/ceshuContentQuality.ts`（空话密度 / 长句率 / 列表结构率 / 数字具体性），接进 `validateCeshu` 第 14 项（字段级定位，数组型字段自动跳过列表结构检查） |
| 4 | 高危字段加「禁编造」提示词 | ✅ 新增 `CESHU_NO_FABRICATION` 全局约束进整章/补全/单字段三条提示词路径；`competitors`/`market_size`/`target_market` 三个高危字段的 aiHint 另带字段级禁编造要求 |

覆盖率守卫测试已落地：每章至少一个 aiHint、全库 ≥70%、高危字段必须含「待确认」、人定字段必须 `aiDraftable:false` 且不带 aiHint。

### P1（把「审不动」变成「审得动」）—— 待办

| # | 动作 | 工作量 |
|---|---|---|
| 5 | 拆解第二批 textarea（combat 6 个、economy 3 个、art 4 个、market 3 个、accessibility 5 个…），沿用 `xxx_points + xxx_notes` 模式 + 既有迁移器 | 1 天 |
| 6 | 处理剩余 3 组重叠（risk_matrix 二义、economic_model 归位、potential 补字段） | 2 小时 |
| 7 | 补标人定字段 | ✅ 已在 P0-2 完成（8 → 18 个，含 mvp/monetization/tech/resources/audio 的预算与决策字段） |

### P2（结构补全，建议在 P0/P1 之后）

| # | 动作 | 工作量 |
|---|---|---|
| 8 | 新增 7 个模块的章/字段（UI/UX、关卡、运营、埋点、QA、发行、性能） | 2-3 天（含迁移方案） |

---

## 5. 一句话回答今天的问题

> **初始配置「像一份 GDD 目录」，但它从来没有被「生成一遍→审一遍→改一遍」验证过；19% 的 AI 契约覆盖率和「字数当质量」的评分方向，意味着现在的 AI 产出大概率「写满了但没写对」。** 先做 P0-1/P0-2/P0-4（合计半天、零风险），再谈补模块。

---

## 附录：判定标准与数据来源

- 字段数据：`desktop/src/shared/ceshuFields.ts`（122 静态字段）+ `SYSTEM_CONFIG_SCHEMA`（13 系统动态配置）
- 契约解析：`resolveFieldMeta(chapter, field)`（`aiHint` / `reviewHint` / `required` / `aiDraftable`）
- 评分依据：`ceshuScorer.ts`（结构 30 + 质量 40 + 市场 30）、`ceshuScorerData.ts` 的 `CHAPTER_WORD_BENCHMARK`
- 质量门：`shared/agent/qualityGate.ts::evaluateChapterDraft`（重跑 validateCeshu + scoreCeshu 比 before/after）
- 库内实证：`%APPDATA%/墨白可视化编辑/libraries/初始库/ceshu/` 下 4 份文档（均无生成内容）
