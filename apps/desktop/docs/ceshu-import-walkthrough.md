# GDD 导入走查：1 份真实公开 GDD + 1 份本项目交付案例 + 3 份合成样例

> 验证对象：阶段筛选（ceshuStages）+ 机读分区（ChapterForm 分组）+ 品类条件必填 是否真的降低「从空白到能交出去」的门槛。
> 方法：把每份文档实际覆盖到的必填字段填进新文档，跑**真实**的 `computeChapterProgress` 与阶段逻辑。
> 覆盖数据单源在 `src/shared/ceshuReferenceGdd.ts`，**每条注明出处**；本报告与「完备度面板」的参照对比同源。
> 样本：**1 份真实公开 GDD**（The Doom Bible, 1992, Tom Hall；公开 PDF）+ **1 份本项目交付案例**（深潮灯塔：GDD + 契约 + 可玩 Demo）+ **3 份本项目合成的 5 页样例**（best-case 对照，非真实文档）。

## 完成度并排对比

| 文档 | 来源 / 品类 | 出处类型 | 旧视图（全章均值） | 立项阶段 | 必填覆盖 |
|---|---|---|---|---|---|
| 《Doom Bible》 | 1992 FPS 设计圣经 | real-public | 16% | **54%** | 9/16 |
| 《深潮灯塔》 | 单路塔防（本项目交付案例） | project-deliverable | 24% | **82%** | 13/16 |
| 《列王纷争录》 | 军事 SLG | project-sample | 24% | **82%** | 13/16 |
| 《午夜列车》 | 卡牌 Roguelike | project-sample | 24% | **82%** | 13/16 |
| 《喵岛邮差》 | 休闲合成（无战斗品类） | project-sample | 20% | **79%** | 11/14 |

**结论**：五份文档导入后——

- 旧视图（全章均值，编辑器进度条原样）大多只有 **16%–24%**，大部分章为 0，看着大半空着；
- 切到「立项」阶段后立刻跳到 **54%–82%**——用户此时只面对 7 章（无战斗品类 6 章），且进度只数必填；
- **真实公开 GDD 明显低于合成样例**（Doom Bible 54% vs 合成 79%–82%）——这不是 schema 坏了，见下节；
- **本项目交付案例（深潮灯塔）落在中间（82%）**——它是真实交付物，缺口比合成样例多（没有时间线），比 1992 年的 Doom Bible 少。

## 真实公开 GDD：Doom Bible 的低分恰恰是「工具在暴露缺口」

Doom Bible（1992 FPS 概念圣经）立项阶段只有 **54%**（9/16），原因逐条可查：

- §4「Play Loop」只有一句「New 3-D engine」——**核心循环根本没写**；
- §14 武器只有定性描述（"minimum damage"），**无伤害公式**；护甲值甚至写成「?」；
- 完全没有**经济 / 数值断言 / 平衡原则**——那是现代 live-service GDD 才有的章节。

换句话说，工具没有替它脑补、也没有假装 82% 完整，而是**把「真实文档到底缺什么」直接量化**：立项稿还差
core_loop / damage_formula / economy / numeric 这些真空白。这正是它相对「人肉感觉差不多」的价值。

（合成样例之所以高，是因为它们贴着本 schema 的 5 页骨架写，属 best-case；真实旧文档落回 54% 才是常态。
若你有具体的现代真实 GDD，在 `ceshuReferenceGdd.ts` 加一条覆盖表即可复跑。）

## 逐份明细

### 《Doom Bible》（1992 FPS 设计圣经）

**出处**：Tom Hall 撰写，id Software 1992 年公开分发的设计圣经（PDF） — https://www.cs.wpi.edu/~imgd1001/a08/projects/proj2/doomBible.pdf（real-public）

**旧视图整体 16% → 立项阶段 54%**（必填 9/16）

立项稿还差：7 个字段

| 字段 | 为什么缺 | 补法 |
|---|---|---|
| meta.tags | 有 feature bullets，但无结构化标签 | 人定/AI 补 1 行 |
| gameplay.core_loop | §4「Play Loop」仅一句「New 3-D engine」，未写循环 | 人定/AI 补 1 行 |
| combat.damage_formula | §14.1 仅定性（minimum / more powerful），无公式 | 人定/AI 补 1 行 |
| economy.currency_types | 无货币系统；只有弹药 / 血 / 宝物 | 人定/AI 补 1 行 |
| economy.source_sink | 无经济循环（拾取 ≠ 经济） | 人定/AI 补 1 行 |
| numeric.core_formulas | 无公式；护甲值甚至写作「?」 | 人定/AI 补 1 行 |
| numeric.balance_principles | 无 | 人定/AI 补 1 行 |

机读数据层（已自带、不计入完成度）：

- `economy.ledger`：无经济账本（1992 FPS 无货币系统）
- `numeric.numeric_assertions`：无（该文档无任何可复算断言）
- `numeric.design_claims`：无
- `vision.design_assumptions`：隐含于 Program Features，但未登记为可证伪假设

### 《深潮灯塔》（单路塔防（本项目交付案例））

**出处**：本项目用 game-designer-pro 交付：GDD + 设计契约（ruleset abyssal-beacon-v1）+ 单文件可玩 Demo — docs/gdd-samples/abyssal-beacon/（project-deliverable）

**旧视图整体 24% → 立项阶段 82%**（必填 13/16）

立项稿还差：3 个字段

| 字段 | 为什么缺 | 补法 |
|---|---|---|
| meta.tags | 有支柱与克制关系，但无结构化标签 | 人定/AI 补 1 行 |
| gameplay.game_modes | 单核心循环，未枚举可选模式 | 人定/AI 补 1 行 |
| mvp.mvp_timeline | 只给了验证阈值，无研发/上线时间线 | 人定/AI 补 1 行 |

机读数据层（已自带、不计入完成度）：

- `economy.ledger`：§5.5 关键账本（20 波总击杀 226 / 总生物质 2503），可复算
- `numeric.numeric_assertions`：§6 验证假设与阈值 3 条；contract.json 断言 A1–A4
- `numeric.design_claims`：§7 原型验证结论（Demo 已在 headless Chrome 实跑）
- `vision.design_assumptions`：§6 三条可证伪阈值（3–5 分钟 / 至少 2 种塔 / 末波耐久 ≥5）

### 《列王纷争录》（军事 SLG）

**出处**：本项目为对齐 schema 骨架合成的 5 页样例（best-case，非真实文档） — docs/gdd-samples/01-SLG-列王纷争录.md（project-sample）

**旧视图整体 24% → 立项阶段 82%**（必填 13/16）

立项稿还差：3 个字段

| 字段 | 为什么缺 | 补法 |
|---|---|---|
| meta.tags | 未列结构化标签；类型散落定位句，需人定 | 人定/AI 补 1 行 |
| gameplay.game_modes | 只描述主玩法，未枚举可选项模式清单 | 人定/AI 补 1 行 |
| mvp.mvp_timeline | 无研发/上线时间线，仅新手前 20 分钟走读 | 人定/AI 补 1 行 |

机读数据层（已自带、不计入完成度）：

- `economy.ledger`：GDD 未给逐笔账本，但有产出/消耗/税收流（L26/31/47）
- `numeric.numeric_assertions`：L68-75 数值断言表 4 条，可复算
- `numeric.design_claims`：L83 验证假设与阈值 3 条
- `vision.design_assumptions`：L13-16 各支柱反例=假设；L83 可证伪阈值

### 《午夜列车》（卡牌 Roguelike）

**出处**：本项目为对齐 schema 骨架合成的 5 页样例（best-case，非真实文档） — docs/gdd-samples/02-卡牌Roguelike-午夜列车.md（project-sample）

**旧视图整体 24% → 立项阶段 82%**（必填 13/16）

立项稿还差：3 个字段

| 字段 | 为什么缺 | 补法 |
|---|---|---|
| meta.tags | 未列结构化标签，需人定 | 人定/AI 补 1 行 |
| gameplay.game_modes | 只描述主玩法，未枚举可选项模式清单 | 人定/AI 补 1 行 |
| mvp.mvp_timeline | 无研发/上线时间线，仅新手走读 | 人定/AI 补 1 行 |

机读数据层（已自带、不计入完成度）：

- `economy.ledger`：GDD 未给逐笔账本，但有硬币/精力流
- `numeric.numeric_assertions`：L68-76 数值断言表 5 条，可复算
- `numeric.design_claims`：L84 验证假设与阈值 3 条
- `vision.design_assumptions`：L13-16 支柱反例=假设；L84 可证伪阈值

### 《喵岛邮差》（休闲合成（无战斗品类））

**出处**：本项目为对齐 schema 骨架合成的 5 页样例（best-case，非真实文档） — docs/gdd-samples/03-休闲合成-喵岛邮差.md（project-sample）

**旧视图整体 20% → 立项阶段 79%**（必填 11/14）

立项稿还差：3 个字段

| 字段 | 为什么缺 | 补法 |
|---|---|---|
| meta.tags | 未列结构化标签，需人定 | 人定/AI 补 1 行 |
| gameplay.game_modes | 单核心循环，未枚举可选项模式 | 人定/AI 补 1 行 |
| mvp.mvp_timeline | 无研发/上线时间线，仅新手走读 | 人定/AI 补 1 行 |

机读数据层（已自带、不计入完成度）：

- `economy.ledger`：GDD 未给逐笔账本，但有贝壳币/货物流
- `numeric.numeric_assertions`：L69-77 数值断言表 5 条，可复算
- `numeric.design_claims`：L85 验证假设与阈值 4 条
- `vision.design_assumptions`：L9-16 支柱反例=假设；L85 可证伪阈值


## 关键发现（已修复）：combat 章对无战斗品类是「伪必填」

走查暴露：休闲合成（喵岛邮差）立项阶段只有 **68%**，比含战斗品类低
14 个百分点——根因是 `combat.combat_mode` /
`combat.damage_formula` 在概念阶段**必填**，但休闲合成根本无战斗系统。

**已落地修复**：按 `meta.game_type` 判定，无战斗品类（模拟经营 / 视觉小说 / 派对 / 休闲益智）的 combat 章
从 `visibleChapterKeys` 中剔除——不进导航、导出、机读包，也不进完成度分母与评阅。同一份 GDD 修复前后：

| 喵岛邮差（模拟经营） | 立项阶段完成度 |
|---|---|
| 修复前（combat 计入必填） | 68% |
| 修复后（combat 按品类隐藏） | **79%** |

剩余仍差 3 个非内容型字段（tags / game_modes / mvp_timeline），与含战斗品类一致。
未选品类（game_type 为空）时按「有战斗」保守处理 ⇒ 老文档行为零变化。

## 一句话结论

阶段筛选 + 机读分区 + 品类条件必填**有效**：字段一个没减（仍 340 个），但认知负担从 24 章压到 7 章。
合成样例（best-case）立项稿落在 79%–82%，本项目交付案例 82%，
真实旧文档（Doom Bible）只有 54%——**这个差值正是工具诚实暴露出的真实缺口**，而不是假装完整。
无战斗品类靠条件必填追平，不再被伪必填拖累。
