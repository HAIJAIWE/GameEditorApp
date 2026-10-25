# 字段必要性反向验证（2026-10-26）

> 目的：不再凭感觉讨论「334 个字段是不是太多」，改用两个外部证据回答：**真实策划文档到底会写哪些字段**、**这个工具的实际使用到底碰了哪些字段**。

## 0. 结论先说

1. **真实 5 页 GDD 覆盖 7/24 章、约 40 个字段**；剩下 17 章不是「写错了」，是**这个阶段不该出现**。
2. **库内 10 份文档里有 5 章零使用**（有样本可判断的范围内），71 个字段从未被任何人写过；最好的两份也只填到 13%。
3. **病根不是字段数量，是没有分层入口**：打开就是全量 24 章，人第一屏就被劝退。
4. **建议不删字段，先做阶段分层**（立项 7 章 / 研发 +9 / 发行 +8）；另有 4 组跨章同名字段需要合并或明确划界。

---

## 1. 方法与样本

**样本 A：库内真实文档（10 份）**
`data/libraries/初始库/ceshu/` 8 份 + `data/libraries/默认库/ceshu/` 2 份。逐字段判定「非空」（字符串去空白、数字非 0、数组/对象非空）。

**样本 B：外部短 GDD（3 份）**
`docs/gdd-samples/01-SLG-列王纷争录.md`、`02-卡牌Roguelike-午夜列车.md`、`03-休闲合成-喵岛邮差.md`，各约 5 页 / 3000 字，骨架一致：
`一句话定位 → 设计支柱（每条都拒绝一些功能）→ 90 秒走读 → 核心机制(P0) → 数值表+可复算断言 → 首个可玩范围 → 数据编辑对接`

**口径说明（重要）**
老文档多数创建于 `story` 合并（原 worldview+characters）与 P2 七章（uiux/level_design/live_ops/analytics/qa/publishing/performance）之前，这些章在文档里**根本不存在**。因此它们的「0 使用」属于**无样本**，不能当证据。下表只对「含该章的文档数 > 0」的章下结论。

---

## 2. 硬数据

| 章节 | 含该章文档 | 碰过 | 字段覆盖 | 判定 |
|---|---|---|---|---|
| 文档信息 meta | 8 | **8** | 10/10 | 真在用 |
| 技术规格 tech | 10 | **9** | 2/14 | 只填了少数（架构/团队），其余空 |
| 核心玩法 gameplay | 10 | 5 | 4/11 | 部分在用 |
| 产品愿景 vision | 8 | 2 | 3/8 | 部分在用 |
| 战斗系统 combat | 6 | 2 | 3/32 | 仅 9% 字段 |
| 经济系统 economy | 6 | 2 | 3/20 | 仅 15% 字段 |
| 数值设计 numeric | 10 | 2 | 3/12 | 仅 25% 字段 |
| 美术设计 art | 10 | 2 | 1/17 | 仅 6% 字段 |
| 商业化 monetization | 9 | 2 | 4/21 | 仅 19% 字段 |
| 音频设计 audio | 9 | 1 | 1/16 | 仅 6% 字段 |
| MVP 规划 mvp | 6 | 1 | 1/18 | 仅 6% 字段 |
| **资源规划 resources** | 8 | **0** | **0/13** | **零使用** |
| **市场分析 market_analysis** | 4 | **0** | **0/15** | **零使用** |
| **风险控制 risk_handling** | 6 | **0** | **0/14** | **零使用** |
| **可访问性 accessibility** | 7 | **0** | **0/22** | **零使用** |
| **数据埋点 analytics** | 3 | **0** | **0/7** | **零使用** |
| story / uiux / level_design / live_ops / qa / publishing / performance | 0 | — | — | **无样本** |

零使用 5 章合计 **71 个字段**。

单份文档最高填写率：**31/243 = 13%**（必填 17/31）；最低 **1/175 = 1%**。

---

## 3. 三桶分类

### A. 真实在用（保留，且是核心）
`meta` 全部、`gameplay.core_loop / game_modes`、`tech.core_architecture / team_structure`、`vision.design_vision / differentiation`、`combat.combat_mode / damage_formula`、`economy.currency_types / source_sink`、`numeric.core_formulas / balance_principles`、`monetization.payment_model / pricing_tiers`。

### B. 管道必需，但不是「文档内容」（保留，但要换位置）
这些字段的存在价值是**让机器能判**，不是让人写散文。放在「正文」里会让人误以为必须写：

| 字段 | 作用 |
|---|---|
| `economy.ledger` | 逐笔对账，校验会求和核对 |
| `qa.prototype_acceptance` | 实测类设计主张的证据来源 |
| `numeric.numeric_assertions` | 可复算的数值断言 |
| `numeric.design_claims` | 主张→证据核对 |
| `qa.test_case_list` / `qa.acceptance_journeys` | 可执行用例与验收旅程 |
| `vision.design_assumptions` | 可证伪的关键假设 |

**建议**：UI 上归入「验收 / 机读数据」区，与「叙述内容」分开；完成度统计也分开算。

### C. 从未使用（有样本范围内）→ 默认折叠，发行期解锁
`resources`(13) / `market_analysis`(15) / `risk_handling`(14) / `accessibility`(22) / `analytics`(7)。

注意：这些**不是没价值**——市场分析、风险、可访问性在上线前是硬需求。问题只在于它们和「立项」同屏出现。

---

## 4. 真实 5 页 GDD 的映射

| 样例章节 | 对应我们的字段 | 覆盖情况 |
|---|---|---|
| 1 一句话定位 | `meta.positioning / game_type / platform`、`vision.differentiation` | ✅ |
| 2 设计支柱（裁决 + 反例） | `vision.design_pillars`（占位符已要求「支柱\|裁决\|反例」） | ✅ |
| 3 90 秒走读 | `gameplay.first_30_min`（0-2/2-10/10-30 三段） | ✅ |
| 4 核心机制（P0） | `gameplay.core_loop`、`combat.*`、`economy.*` | ✅ |
| 5 数值表 + 可复算断言 | `numeric.numeric_parameters / numeric_assertions` | ✅ |
| 6 首个可玩范围 | `mvp.mvp_scope / core_features / cut_features` | ✅ |
| 7 数据编辑对接（需要哪些编辑器数据表） | **无对应字段** | ❌ 反向缺口 |
| P0/P1 优先级标记 | `mvp.cut_features` 部分覆盖 | 🟡 弱 |

**反向缺口 1 个**：`技术规格` 里没有「本设计需要哪些数据表 / 字段」这一项。这对本项目尤其讽刺——**产品本身就是数据编辑器**，却没有一个字段记录「这份策划需要哪些数据表」。建议补 `tech.data_tables`（pipeList：表名|用途|关键字段）。

---

## 5. 跨章同名字段（合并 / 划界候选）

| 字段 key | 出现在 | 判断 |
|---|---|---|
| `drop_tables` | 经济章（掉落表，stringList） / 数值章（掉落公式，pipeList） | **真重复**，建议保留数值章（公式），经济章改为引用或删 |
| `contingency_plan` | 资源章（资源侧应急） / 风险章（风险预案） | 语义重叠，hints 已划界；建议资源章改名 `resource_contingency` |
| `risk_matrix` | 资源章（TOP 3-5 摘要） / 风险章（完整矩阵） | 摘要 vs 全量，可接受，但同名易混；建议资源章改名 `resource_risks` |
| `milestones` | 技术章（开发里程碑） / MVP 章（里程碑） | 语义重叠，建议 MVP 章保留（时间线），技术章改 `tech_milestones` |

> 注：字段在不同章是独立命名空间，同名不会覆盖数据；这里说的是**语义混淆**——人和 AI 都会问「这两个到底写哪个」。

---

## 6. 建议动作（按性价比）

1. **阶段分层（不动 schema）**：`concept`（立项，7 章：meta/vision/gameplay/combat/economy/numeric/mvp）→ `production`（+9：story/systems/art/audio/tech/monetization/uiux/level_design/qa）→ `release`（+8：resources/market_analysis/risk_handling/accessibility/live_ops/analytics/publishing/performance）。默认只展开当前阶段，其余折叠为「后续阶段」。
2. **B 桶字段移出正文**：验收/机读数据单独一区，不计入「文档完成度」。
3. **C 桶 5 章默认折叠**：不删、不催填，到 release 阶段再解锁。
4. **补 1 个字段** `tech.data_tables`（反向缺口）。
5. **合并/改名 4 组同名**：`economy.drop_tables` 与 `numeric.drop_tables` 二选一，其余三组改名划界。

完成 1–3 之后，「打开就 334 个框」变成「打开 7 章 40 个框」，剩下的按阶段长出来——这才是让填写率从 13% 往上走的前提。
