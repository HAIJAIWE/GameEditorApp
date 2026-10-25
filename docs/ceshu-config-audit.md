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

> 📌 本节是 **2026-10-23 的体检快照**（分母 122 字段），保留作为「改造前」的对照基线，**不要当作当前指标引用**。当前覆盖率请跑 `cd desktop && npx tsx scripts/ceshuCoverage.ts`（口径见 §3 P0-2 的说明）；各条问题的处置状态见 §3 与 §6。

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

### 🐛 P0-1 `story` 章没有字数基准（明显 bug）· ✅ 已修复

`CHAPTER_WORD_BENCHMARK` 里有 `worldview` 和 `characters` 条目，但这两章早已合并为 `story`——**表里没有 `story`**。评分引擎对最大的章（14 字段）没有字数依据，只能走默认值。这是匹平迁移的遗留。

**现状**：`ceshuScorerData.ts` 已补 `story: [500, 1500, 800]`（原 worldview 500-1500 与 characters 400-1200 的并集上界）。同时把表类型收口为 `Record<ChapterKey, [number, number, number]>` 并删掉 `?? [0,0,0]` 兜底——漏配章节现在**编译期直接报错**，不会再静默按 0 基准算分。

### 🔴 P0-2 AI 契约覆盖率 19%、人审要点 6% · ✅ 已补（数字见下方口径说明）

`economy / art / audio / tech / resources / market_analysis / risk_handling / mvp / monetization / accessibility` **十个章的 aiHint 全军覆没**（systems 是动态配置，不参与静态统计）。后果：AI 会去填这 99 个没有生成目标的字段——它只能按「50-300 字、具体专业」的通用要求自由发挥；而人审时 94% 的字段拿不到「该看什么」。

**现状**：十个零契约章全部补齐，并有守卫测试 `ceshuFieldMeta.test.ts` 防回落（每章至少一个 aiHint、全库 ≥70%、高危字段必须含「待确认」、人定字段必须 `aiDraftable:false` 且不带 aiHint）。

> ⚠️ **口径提醒**：本文头部「19% → 93%」是 2026-10-23 的**冻结快照**（当时字段表 240/259）。档 4 把 4 套字段目录合并成 `ceshuSchema/` 后，字段表里多了 135 个拆分产物，同一个百分比再也算不回 93%。**要当前数字请跑脚本，不要引用冻结值**：
>
> ```bash
> cd desktop && npx tsx scripts/ceshuCoverage.ts
> ```
>
> 口径与守卫测试一致（`CHAPTER_KEYS` 去 systems、hint 经 `resolveFieldMeta` 含 schema 层叠加、分母含拆分产物）。2026-10-26 实测：全字段 **313/334 = 94%**；按 **AI 可起草字段**算 **313/313 = 100%**（人定字段本就不该有 aiHint，算进分母会稀释真实缺口）；reviewHint **334/334 = 100%**。
>
> 补齐过程（2026-10-26）：先一次补了 37 个可起草字段的 aiHint + reviewHint（resources 6 / story 7 / art 5 / mvp 3 / gameplay 3 / tech 3 等，多为 pipeList 结构化字段），再把 reviewHint 推到全覆盖——其中「补充」类拆分产物的 reviewHint 来自 `applySplits` 的**通用兜底**（改一处覆盖全部，不必逐字段写），人定字段也补了「填完该自查什么」。两条不变式守卫钉死：**AI 可起草 ⇔ 有 aiHint**、**每个字段都有 reviewHint**（`ceshuFieldMeta.test.ts`），比原来的「全库 ≥70%」强得多。

### 🔴 P0-3 「字数」被当成质量指标，方向错了 · ✅ 已根治（2026-10-26）

`REQUIREMENTS_FULL` 要求「字符串字段生成 50-300 字」；评分引擎「内容质量 40 分」主要看字数是否落在基准区间。**这套激励在系统性奖励「写满」**——与「简单易懂」直接冲突，也解释了为什么 AI 产出容易又长又空。

**处置**（提示词与评分同时改，两套标准必须同向）：

- **评分侧**：单章评分里的「字数达标 30%」乘上 `contentQualityFactor`（`ceshuContentQuality.ts`）——空话套话超标 ×0.8、长句过半 ×0.9、长文（>200 字）却无数字 ×0.9，乘性叠加、下限 0.5；空章节系数为 1（没内容不是「内容差」，字数分本就是 0）。**判定阈值与校验面板完全同一套**（`contentQualityIssues`），校验报什么、评分就扣什么。章节备注会写清「内容质量系数 0.72：空话套话 3 处；长篇但缺少可验证的数字或实例」，报告建议也会点名「N 章内容偏空」。
- **提示词侧**：`REQUIREMENTS_FULL` / `REQUIREMENTS_ONLY_EMPTY` 共用的第 3 条抽成 `REQUIREMENT_STRING_CONTENT` 单源，从「生成 50-300 字的专业内容」改为「写具体、可验证的内容（参考量级 50-300 字）：有数字、有实例、有取舍理由；宁可短而实，不要为凑字数注水」。
- **实证**：`ceshuScorer.test.ts` 新增「同样字数下，写满但空的章得分低于具体内容」；真实文档不误伤——45 字段复刻演练 patch 总分仅 73.7 → 73.6（-0.1），注水章才会被明显扣（字数分 100 → 72）。全量 2581 过 / 5 跳。

**遗留**：`REQUIREMENTS_FULL` 仍保留「参考量级 50-300 字」这个数字（作为量级参考而非目标），评分里的字数维度也仍是 30% 权重——彻底去掉字数需要另一套「内容价值」判定，目前用质量系数压制已足够。

### 🟠 P1-1 重叠字段（3 组全部处理，2026-10-23）

| 组 | 状态 |
|---|---|
| vision.design_vision ↔ differentiation | ✅ 契约已划界 + 重复检测已上线 |
| numeric.core_formulas ↔ combat.damage_formula | ✅ 同上 |
| resources.risk_matrix ↔ risk_handling.risk_matrix | ✅ 契约改「资源视角 TOP 3-5 条概要」，完整五列矩阵归第十三章 |
| vision.user_personas.potential ↔ secondary | ✅ 默认数据里的 `potential` 残留键已删（schema 无此字段、无代码引用） |
| numeric.economic_model ↔ economy 全章 | ✅ 拆分后本体只留数值模型概述，公式/参数走要点清单；契约写明「机制设计归经济章，此处只写数值侧」 |

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
| 2 | 给 10 个零契约章补 aiHint + reviewHint | ✅ **覆盖率 19% → 80%（aiHint）、6% → 75%（reviewHint）**；契约数据按章拆到 `src/shared/ceshuFieldHints/`（14 章文件并行编写），`ceshuFields.ts` 只在导出时合并；人定字段 8 → 18 |
| 3 | 质量门加「写对」代理指标 | ✅ 新模块 `shared/ceshuContentQuality.ts`（空话密度 / 长句率 / 数字具体性），接进 `validateCeshu` 第 14 项（字段级定位）；列表结构判据经校准后移出字段级输出（见 P1-3） |
| 4 | 高危字段加「禁编造」提示词 | ✅ 新增 `CESHU_NO_FABRICATION` 全局约束进整章/补全/单字段三条提示词路径；`competitors`/`market_size`/`target_market` 三个高危字段的 aiHint 另带字段级禁编造要求 |

覆盖率守卫测试已落地：每章至少一个 aiHint、全库 ≥70%、高危字段必须含「待确认」、人定字段必须 `aiDraftable:false` 且不带 aiHint。

### P1（把「审不动」变成「审得动」）—— ✅ 已完成（2026-10-23）

| # | 动作 | 状态 |
|---|---|---|
| 5 | 拆解第二批 textarea，沿用 `xxx_points + xxx_notes` 模式 | ✅ **39 个字段拆分**（combat 8 / economy 4 / monetization 5 / accessibility 6 / audio 3 / market_analysis 4 / mvp 2 / story 2 / risk_handling 2 / tech 1 / art 2 / numeric 1 / gameplay 1），字段表 122 → 200；拆分配置按章拆到 `src/shared/ceshuFieldSplits/`（数据驱动，`ceshuFields.ts` 导出时自动插入配套字段并带通用契约兜底）；**守卫测试锁定**：不拆必填 / 非 textarea / 点路径 / `_notes` / 人定字段 |
| 6 | 处理剩余 3 组重叠 | ✅ 见 P1-1 表；`user_personas.potential` 从默认数据删除（schema 无此字段、无代码引用） |
| 7 | 补标人定字段 | ✅ 已在 P0-2 完成（8 → 18 个） |

### P1-3 「写对」指标按人类写作基线校准（2026-10-23）

指标上线后用 docs/ 下 **161 段人类真实写作**回测，初版阈值（长句 40 字 / 0.3、数字门槛 120、字段级列表结构要求）把 **81.4%** 的正常段落标记——提示疲劳比漏报更糟（人会学会忽略所有提示，真问题也被淹没）。按数据修正：

| 判据 | 初版 | 校准后 | 依据 |
|---|---|---|---|
| 超长句 | >40 字且占比 >30% | >50 字且占比 >50% | 人类写作长句率均值 0.278、P90 1.0；中文 50 字以上才公认算长句 |
| 数字具体性 | >120 字无数字 | >200 字无数字 | 「一段设计理念没数字」在策划语境完全正常 |
| 列表结构 | 字段级要求「- 」前缀 | **移出字段级输出**（signal 保留） | 要求散文列表化与三件套设计自相矛盾——本体契约就是「一段概述」，可核对条目在 points 字段（天然 stringList） |
| 空话套话 | 12 词表 | 不变 | 人类文档**零误伤**，阈值设计正确 |

误报率 **81.4% → 19.9%**；剩余触发经人工核对均为「整段一句超长」这类真问题。校准结论已固化为 `tests/unit/ceshuContentQualityBaseline.test.ts`（人类样本不触发 + 空话样本必触发 + 阈值常量锁定），**将来调严阈值必须先重做校准实验**。

### P2（结构补全）—— ✅ 已完成（2026-10-23）

| # | 动作 | 状态 |
|---|---|---|
| 8 | 新增 7 个模块的章/字段 | ✅ **7 章 55 字段**（第十七~二十三章：UI/UX 8 / 关卡 8 / 运营 7 / 埋点 7 / QA 7 / 发行 10 / 性能 8），见下 |

**设计决策与落地方式**：
- **追加在末尾而非按逻辑插入**：章号由分区表位置派生，插中间会让后续所有章号平移、lite 档（前 9 章）范围变动、旧文档「见第 N 章」引用全部错位。追加在末尾则既有 16 章编号与 lite 范围**零变动**，中文数字扩展到二十三；
- **迁移零成本**：`normalizeCeshu` 的懒加载机制（旧文档缺章时填默认值）直接覆盖，无需写迁移器；
- **字段/默认数据按章分文件**（`src/shared/ceshuChapterFields/`，与 hints/splits 同构），`ceshuFields.ts` / `ceshuDefaults.ts` 只在导出时合并——3 个子代理按章并行设计，集成端注册 index + 填必填；
- **类型系统兜底**：`CHAPTER_WORD_BENCHMARK` 是 `Record<ChapterKey,…>`，新增章漏配字数基准**编译期报错**（P0-1 修 story 时埋的类型收口，这次立刻见效）；`ceshuAiData` 的三张章节映射同样被强制补全；
- **顺带修了一个隐性 bug**：`computeChapterProgress` 对「无必填章」返回 0.5 的分支本是死分支（唯一命中的 systems 被特殊路径截走），7 个空章全部命中它导致每份新文档自带 3.5% 假进度、空文档结构分 3.3 而非 0。改为 0（没有必填可衡量 = 未开始）；
- **契约从第一天就满覆盖**：新章 55 字段全部带 aiHint/reviewHint，全库覆盖率 80% → **93%**（240/259）；`autoFillRequiredFields` 同步补 14 条「待补充」占位规则，「一键填充」覆盖新章；
- **测试传播更新**（均非放宽，是结构变更的必然传播）：章数断言 17→24（scorer 明细 / bundle 目录 / diff / 模板汇总 / Excel 概览行 28→35）、pptx 页数 20→27、必填缺失 35→49、填充数 34→48、「仅填 meta」结构分 2.4→2.1→1.7（24 章 47 必填体系下覆盖度摊薄，数学正确）；覆盖率守卫改为「**有字段的章**才要求 aiHint」——空章（字段交付前）不参与。

---

## 4.5 复刻演练：不配模型的全链路验证（2026-10-23）

用户提议「测试生成不同游戏类型的内容 / 复刻流行游戏」→ 落地为可复用工具 `desktop/scripts/ceshuRehearsal.ts`：**不需要配模型**，由任何一个外部 AI（或人）扮演消费者——用项目自己的 `buildBundleConsumePrompt(doc, 'draft')` 生成提示词，按契约产出 `{章:{字段:值}}` JSON，再走与「导入 AI 结果」面板**同一条** `parseCeshuPatch → applyCeshuPatch → validateCeshu → scoreCeshu` 管道。

**三个案例**（每个 45 个字段、23 章）：

| 案例 | 类型 | 总分 | 机器校验 |
|---|---|---|---|
| 血液幸存者（复刻吸血鬼幸存者） | Roguelike | 63.5 C | 5 条 |
| 星露谷田园（复刻星露谷物语） | RPG | 65.5 C | 4 条 |
| 缤纷消消乐（原创三消+Meta） | Casual | 67.5 C | 3 条 |

**三个案例 3/3 命中了同样的问题——暴露两个设计缺陷（已修）**：

1. **人定必填字段的死锁错误**：`tech.engine`、`story.main_npc_count`、`meta.game_name` 这类「人定 + 必填」字段，draft 提示词按契约正确地不列它们（AI 不起草），但校验把它们报成「为必填项」——**这条错误永远无法通过 AI 生成消除，只能手填，却混在必填缺失里一起催人**。已改为单独措辞「由人确定，尚未填写（AI 不起草，需人工决断）」，归入建议检查分组；
2. **风险矩阵一致性检查过时**：P1 把 `resources.risk_matrix` 划为「TOP 概要」、`risk_handling` 保持完整矩阵后，旧的「逐字不同就报不一致」把三份产出全部误报。已改语义为「**资源章列的 TOP 风险必须出现在第十三章矩阵**」——概要不是详情的子集才是真问题。

**契约起作用的直接证据**：
- **禁编造生效**：三个案例的竞品/渠道字段全部出现真实名称 + 「待确认」标注（吸血鬼幸存者、Brotato、Steam 分成 30% 等，无编造数字）；
- **三件套分工生效**：AI 没有把「步骤清单」写进本体长文（activity_system、publish_plan 等本体都是概述，条目在 points）；
- **写对指标不误伤**：3 个案例的实在内容零空话命中；2 条「长句偏多」是**真问题**（positioning/source_sink 确实一句话 60+ 字）——校准后的阈值只抓该抓的；
- **schema 适配性**：Casual 案例能完整跑通（剧情章填「无反派，冲突是材料短缺」略显勉强但未被报错）——schema 对休闲游戏可容纳，世界观/剧情章对它是弱区，这是内容问题不是管道问题。

**评分解读**：三个案例都卡在 C 级（63-67），主因是**只填了 45/259 字段**——内容质量分按全字段完成度算，「只填必填」天然低分。这是评分引擎的正确行为（提醒还有 214 个字段没写），不是缺陷。

**完整案例（289 字段全量起草）与第三、四个深层问题**：新增 `draftAll` 任务（填全部空缺字段，不限必填）后，同一份血液幸存者全字段产出暴露：
- **40 个「幽灵字段」**（默认数据有键、字段表无定义——匹平迁移的不一致）：UI 不可见、提示词当扩展键列出、配套 points 被拒。已补齐 38 个字段定义（2 个对象型字段除外），data↔schema 不一致归零；
- **评分引擎把「提示」当「错误」惩罚**：完整案例章均分 89.9，质量分却 21——7 条提示触发满额惩罚 15/40。改为只计 error 级（与校验面板同一套 severity）；提示级仍展示但不扣分；
- **拆分清单遗漏 14 个字段**：契约要求「条目走要点」却不在 splits。已补 9 章（resources 新建）；
- 修复前后同一产出：**75.5 B → 89.9 A**，可应用 275 → 288，校验 7 条全为提示级零硬错误——其中「mvp/tech 里程碑不一致」「语言清单与本地化资源不一致」是校验在完整数据下**首次抓到的真问题**（两处确实没同步）。

**沉淀**：`scripts/ceshuRehearsal.ts` 留在仓库（prompt/apply 两阶段，tsconfig.node 已纳入检查）。以后每次改契约/字段/校验，都可以用它跑一轮回归——**用真实的「提示词→产出→校验」闭环代替单测里的手工断言**。

---

## 4.6 对标豆包《微光之塔》GDD：导入 5 个字段（2026-10-24）

用户拿来一份外部标杆：豆包产出的《微光之塔》(Shimmer Tower) 放置爬塔 GDD 全套产物（GDD 207 行 + design-contract.json 433 行机器可读契约 + numerical_validation.py 165 行数值复算脚本 + 561 行可玩 HTML Demo + 飞书 draft.xml）。逐篇研读后提炼出它做得好、我们模板缺的模式，**首批导入 5 个字段**（全部 pipeList、可选、带完整 aiHint/reviewHint，不动必填集与 splits）：

| 新字段 | 章 | 导入的模式 | 契约要点 |
|---|---|---|---|
| `design_pillars` | 产品愿景 | 设计支柱表（支柱\|裁决\|**反例（明确不做）**） | 反例必须是具体功能而非态度——把「范围控制」变成可审项 |
| `design_assumptions` | 产品愿景 | 假设登记（statement\|impact\|validation） | 没验证过的设计判断 + 验证方法 + **调参阈值**（如「首转生集中 40+ 则下调微光步长」） |
| `state_machine` | 核心玩法 | 状态机转移表（含 repeat_policy/cleanup） | 写清「什么重置、什么保留」；防重复结算处写明「每次只结算一次」 |
| `numeric_parameters` | 数值设计 | 参数表（参数\|当前值\|合法范围\|调高影响\|调低影响） | 区分设计初值/复算值；影响必须可观察，禁「影响较大」空话 |
| `numeric_assertions` | 数值设计 | 机器可验证断言（表达式\|期望值\|容差\|接受条件） | 设计目标写成可手算复现的断言，至少一条覆盖边界 |

**还识别出但未导入的**（留作后续选项）：① 每条机制六件套（目的/权威规则/公式/边界/反馈/**验收**）——我们的 _notes 可承担，暂不加字段；② 原型验证证据章（claim→evidence 表）——ch21 测试章用途不同；③ Demo 与 GDD 同源 ruleset_id 纪律——meta 已有 version；④ **断言执行器**（照抄 numerical_validation.py 的思路，把 numeric_assertions 从「文档」升级为「可复算」——这是最有价值的后续）。

验证：tsc 0 错；契约守卫 + splits 守卫 + bundle 测试 22 过；全量 2454 过/5 跳（与基线一致）；`draftAll` bundle 确认 5 条契约全部进入提示词；eslint 0。

---

## 4.7 数值断言执行器：把「文档字段」升级为「可复算检查」（2026-10-24）

4.6 导入的 `numeric_assertions` 当时只是文档字段；本次补上执行器（对标豆包 `numerical_validation.py` 的思路），**设计主张第一次被机器复算**。

**新增 `src/shared/ceshuNumericAssert.ts`，挂进 `validateCeshu`（第 15 项）**：

- **安全求值器**（词法 + 递归下降，**禁用 eval**——AI 产出是不可信输入）：只认数字、参数名、`+ - * / ^ ( ) ,` 与 10 个白名单函数（floor/ceil/round/abs/sqrt/exp/log/min/max/pow）；成员访问、字符串在词法层不存在；设表达式长度（200）与嵌套深度（64）上限
- **参数表代入**：`numeric_parameters` 的「当前值」格取数（`4次/秒`→4、`×1.2`→1.2、`待确认`→null）
- **两级判定**：① 复算值 vs 文中声明值（尊重容差）；② 复算值 vs 接受条件（`==3`/`>=0`/`between 1.5-2.5`）
- **严重度口径**（与校验面板同一套分类）：`一致性冲突`（error，复算不符/验收不通过）、`格式异常`（error，表达式无法解析/引用未登记参数）、`复算跳过`（warning，参数「待确认」如实不罚）

**实证（同题对标 patch 实跑）**：4 条自洽断言全部静默通过（真复算验证）；当场抓到 patch 自身两个问题——一条引用了未登记的参数（`首个守望者L2成本`）、一条声明值算错（计算得 3 文中声明 5，消息带完整定位）。

验证：新增 25 条单测（求值器优先级/右结合幂/负指数/中文参数名/安全拒绝/深度长度上限/各级消息形态）；全量 **2479 过/5 跳**（2454 基线 + 25 新，零回归）；tsc 三套 0 错；eslint 0。

---

## 4.8 claim→证据 与 生产风险：两个字段 + 一个执行器（2026-10-24）

对标豆包 `claims` / `production_risks` 两键后补齐（用户「好」批准）：

**新增字段**：
- `numeric.design_claims` 设计主张：`主张|强度|证据`——强度=计算时证据必须是数值断言表里的**断言名**（机器复算核对）；实测/假设填验证方式/计划
- `tech.production_risks` 生产风险：`风险|触发条件|检测方法|兜底方案|负责人`——工程视角，概率/影响留给风险控制章矩阵，不重复

**执行器**（`ceshuNumericAssert.ts` 重构 + 新增 `checkDesignClaims`，校验链第 16 项）：
- 断言求值抽成 `evaluateAssertions`（pass/fail/skip/error 四态），断言检查与主张核对共用同一结果，不存在两套复算
- 计算类主张：证据不存在 → 一致性冲突（无法复算）；证据断言复算不过 → 一致性冲突（主张不成立）；断言跳过/无法解析 → 复算跳过/格式异常
- 实测/假设：无法机器验证，证据非空即通过；空证据 → 一致性警告；强度无法识别 → 一致性警告

**实证**（《列王纷争录》样本 patch，`docs/gdd-samples/slg-ceshu-patch.json`）：
- 6 条主张（4 计算 + 1 实测 + 1 假设）全部通过 → 56 字段、8 条消息（全非阻断）、**74.3 B**
- 篡改两条（证据名不存在 + 证据断言复算失败）→ **2 条一致性冲突**，分数 **74.3 → 68.3（C）**

验证：新增 7 条单测（四态判定/英文强度/空证据/无法识别）；全量 **2513 过/5 跳**；tsc 三套 + eslint 全绿。

---

## 5. 一句话回答今天的问题

> **初始配置「像一份 GDD 目录」，但它从来没有被「生成一遍→审一遍→改一遍」验证过。** 2026-10-23 一天内完成：P0 四项（契约覆盖 19%→93%、写对指标校准、禁编造、story 基准修复）+ P1 三项（65 个 textarea 拆三件套、3 组重叠划界）+ P2 一项（16 章→24 章）+ **复刻演练全链路验证**（3 个游戏类型走「提示词→产出→导入→校验」真实管道，抓出并修复 2 个设计缺陷）。回答「有用吗」：管道和契约已被真实产出验证有效；剩下的是内容深度——那需要真模型 + 真人持续投入。

---

## 附录：判定标准与数据来源

- 字段数据：`desktop/src/shared/ceshuFields.ts`（122 静态字段）+ `SYSTEM_CONFIG_SCHEMA`（13 系统动态配置）
- 契约解析：`resolveFieldMeta(chapter, field)`（`aiHint` / `reviewHint` / `required` / `aiDraftable`）
- 评分依据：`ceshuScorer.ts`（结构 30 + 质量 40 + 市场 30）、`ceshuScorerData.ts` 的 `CHAPTER_WORD_BENCHMARK`
- 质量门：`shared/agent/qualityGate.ts::evaluateChapterDraft`（重跑 validateCeshu + scoreCeshu 比 before/after）
- 库内实证：`%APPDATA%/墨白可视化编辑/libraries/初始库/ceshu/` 下 4 份文档（均无生成内容）

---

## 6. 收尾：从「能审」到「能玩」——Demo 生成器补齐最后拼图（2026-10-24）

本会话主线是「把策划文档产出能力追平豆包」。豆包最关键的差异不是文案，而是**直接生成能玩的 HTML**。此前已补齐：原型验收字段、用例清单、经济账本对账、成长曲线图、SVG 转图、Demo 验收器（生成→验收→证据→主张核对闭环）。最后一块：

**Demo 生成器**（`src/shared/ceshuDemoPrompt.ts` + `scripts/generateDemo.ts`）：
- `buildDemoPrompt(doc)` 从策划文档抽取 **核心循环点 / 状态机 / 数值参数 / 账本 / 用例 / 验收旅程**，组装**硬约束** prompt：单文件 HTML、`RULES` 常量 = 数值参数、实时 tick、localStorage 存档、调试面板、≥100 字且 ≥3 个交互元素
- `generateDemo.ts` 用 CDP 驱动运行中的 app，走 `window.mbApi.llm.generate` 调 LLM 网关生成 → 抽取 `<!doctype html>` 整段 → 落盘 → 可选 `--acceptance` 回写 `qa.prototype_acceptance`
- 单测 `tests/unit/ceshuDemoPrompt.test.ts`（4 条，覆盖抽取与约束）

**实证**：因 LLM 网关当时 502，先以角色扮演产出样例 `docs/gdd-samples/slg-demo.html`（SLG《列王纷争录》可玩 Demo：RULES=主基地 30/成长 1.45、步兵攻击 10、防御常数 800、每格行军 180s；3 资源点、建筑升级、练兵/升级/出征、带预估战损的战斗、localStorage 存档）。验收 5/5（加载/无异常/内容渲染 731 字 18 交互/交互/稳定性），真实回放：升级→练兵→出征→战斗→占点→刷新存档存活，全部通过。修复 `defenseConst` 笔误、补「预估战损」展示。

**最终态势**：契约覆盖 19%→93%、写对指标校准、禁编造、24 章三件套拆分、数值断言执行器、claim→证据核对、生产风险、原型验收、用例清单、账本对账、成长曲线、SVG 图、Demo 验收、Demo 生成——豆包可见能力已全部吸收并对齐到本项目可机器验证的管道。剩余两项豆包能力未强求对齐：轻量/完整模板切换（本项目用一份契约）、分支/图例式流程图（本项目用线性转移表）。

验证：全量 **2546 过/5 跳**；tsc 三套 0 错；eslint 0。
