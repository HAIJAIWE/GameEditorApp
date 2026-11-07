# 语料库二次核验（8 项缺口）

> 核验时间：2026-11-07。目的：把 `design-doc-templates-research.md` §五 列的 8 项「未逐条核」逐项补掉。
>
> **口径**
> - `已核` = 实际读到原文分节（页面 / 论文 HTML 版），标题逐字抄录；
> - `部分` = 只拿到一部分（取到流程文档但没有内容模板）；
> - `未核` = 取不到权威原文（付费墙 / 已迁移 / 无公开样本）。
>
> **诚实声明**：本文不把"没读到"写成"核过了"。上一轮 §五 里第 1、2、3、5 项标的是"未逐条核"，本轮补上；第 4、7、8 项仍缺，第 6 项只到"部分"。

---

## 一、速览

| # | 项目 | 状态 | 来源 |
|---|---|---|---|
| 1 | Python PEP 官方模板 | **已核** | `peps.python.org/pep-0001/` + `peps.python.org/pep-0484/` |
| 2 | System Card / Model Card 真实结构 | **已核** | `deepmind.google/models/model-cards/gemini-3-1-pro/` |
| 3 | Datasheet for Datasets 7 节原文 | **已核** | `arxiv.org/html/1803.09010v8` |
| 4 | ISO/IEC/IEEE 29148 SRS 条款结构 | **未核** | 标准付费墙，仅到摘要层 |
| 5 | C4 官方 4 层定义 | **已核** | `c4model.com/` |
| 6 | 企业 RFC 实例 | **部分** | `rfd.shared.oxide.computer/rfd/0001`（流程文档）；`github.com/hashicorp/rfc` 返回 404；Sourcegraph handbook 已迁 Notion |
| 7 | 中文行业惯例（PRD / 技术方案评审） | **未核** | 本轮未取到可核对的权威原文 |
| 8 | 游戏 Art Bible / TDD 样本 | **未核** | 公开检索未命中可核对的完整分节 |

---

## 二、逐项详录

### 1. Python PEP —— 已核

**PEP 1「What belongs in a successful PEP?」给出的通用清单（15 项，原文顺序）**：

`Preamble` / `Abstract` / `Motivation` / `Specification` / `Rationale` / `Backwards Compatibility` / `Security Implications` / `How to Teach This` / `Reference Implementation` / `Rejected Ideas` / `Open Issues` / `Acknowledgements` / `Footnotes` / `Change History` / `Copyright/license`

**真实 PEP 484 的顶层分节（16 项）**：

`Abstract` / `Rationale and Goals` / `The meaning of annotations` / `Type Definition Syntax` / `Compatibility with other uses of function annotations` / `Type comments` / `Casts` / `NewType helper function` / `Stub Files` / `Exceptions` / `The typing Module` / `Suggested syntax for Python 2.7 and straddling code` / `Rejected Alternatives` / `PEP Development Process` / `Acknowledgements` / `Copyright`

**关键观察**：规范清单只有 15 项，真实 PEP 却有 16 节且顺序不同——因为 `Specification` 被拆成「注解含义 / 类型语法 / 兼容性 / stub / typing 模块」等**主题节**。

> 对本项目的意义：**章节清单是骨架，不是逐字模板**。我们把 `Specification` 拆成「功能 / 流程 / 交互 / 架构 / 数据接口」方向是对的，不该为了"对齐 PEP"再压回一节。

**PEP 1 里唯一用 `must` 的硬要求**是版权许可；其余是 `should have` / `helpful` / `may`。其中「引入不兼容变更**必须**写 Backwards Compatibility，否则可能直接拒稿」——这条已落到本项目：`release` 章新增可选字段 `compatibility_impact`（不兼容与迁移影响）。

### 2. Model Card —— 已核

**Gemini 3.1 Pro 模型卡的 8 个顶层分节（原文）**：

`Model Information` / `Model Data` / `Implementation and Sustainability` / `Distribution` / `Evaluation` / `Intended Usage and Limitations` / `Ethics and Content Safety` / `Frontier Safety`

**与项目 `ai_layer` 四章的映射**：

| 模型卡分节 | 项目章 | 覆盖度 |
|---|---|---|
| Model Information | `model_card` | 有（base_model / model_version） |
| Model Data | `data_sheet` | 部分（只有来源与许可，缺采集过程） |
| Evaluation | `eval_redteam` | 有（eval_metrics） |
| Intended Usage and Limitations | `model_card` | 有（capabilities / limitations） |
| Ethics and Content Safety | `system_card` | 部分（safety 有，伦理评估无独立字段） |
| Frontier Safety | — | **无归属** |
| Distribution | — | **无归属** |
| Implementation and Sustainability | — | **无归属** |

> 后三项（分发、实现与可持续性、前沿安全）是"模型作为产品交付"才需要的，与目前"应用内嵌 AI"的定位不完全同构。**不建议为它单开章**，可在 `model_card` 里补一个可选字段。

### 3. Datasheet for Datasets —— 已核

论文第 3 节给出的 **7 个顶层问题组**（每组 3–12 个问题，此处只记组名与核心问点）：

1. **Motivation** —— 为何建、谁建、谁资助
2. **Composition** —— 实例是什么、总量、是否抽样、每条含什么、有无标签、有无缺失、有无敏感/冒犯内容
3. **Collection Process** —— 数据如何取得、用什么机制、采样策略、谁参与、时间范围、有无伦理审查
4. **Preprocessing/Cleaning/Labeling** —— 做了哪些处理、是否保留原始数据、工具是否可获取
5. **Uses** —— 已被用于什么、还能用于什么、有无**不应使用**的任务、有无公平性风险
6. **Distribution** —— 是否对外分发、分发方式与时间、许可与 ToU、出口管制
7. **Maintenance** —— 谁维护、联系方式、有无勘误、更新策略、旧版本是否继续支持、能否接受外部贡献

**论文自己的免责口径**（很重要）：问题**不具强制性**，不适用的应跳过；且明确反对把填数据表这件事自动化。

**与项目 `data_sheet` 四字段的映射**：

| 数据表分组 | 项目字段 | 覆盖度 |
|---|---|---|
| Motivation | `training_data`（部分） | 部分 |
| Composition | `training_data` / `pii_handling` | 部分 |
| Collection Process | — | **缺** |
| Preprocessing/Cleaning/Labeling | — | **缺** |
| Uses（含禁用用途） | `bias_audit`（部分） | 部分 |
| Distribution | `data_license` | 有 |
| Maintenance | — | **缺** |

### 4. ISO/IEC/IEEE 29148 —— 未核

只有公开摘要与二手转述，条款级结构（§5.2 等）需购买标准。**不作为定稿依据**，维持上一轮"粗核"的定位。

### 5. C4 model —— 已核

**4 层抽象 / 4 类图**：`System Context` → `Container` → `Component` → `Code`。

**另有 3 类补充图**：`System Landscape`、`Dynamic`、`Deployment`。且明确「与记号无关、与工具无关」。

**与项目 `architecture` 章的映射**：现有字段 `modules`（≈ Component）、`tech_choices`、`alternatives`。

| C4 层 | 项目字段 | 覆盖度 |
|---|---|---|
| System Context（外部系统与参与者） | — | **缺** |
| Container（运行时/部署单元） | — | **缺**（部署形态在 `release.deployment`） |
| Component | `modules` | 有 |
| Code | — | 刻意不做（GDD/SDD 不做类图，合理） |

> 判断：**Context 与 Container 值得补**——它们回答"系统边界在哪、谁调用我、跑在几个进程里"，比"模块划分"更早被问到。Code 层不补是对的。

### 6. 企业 RFC —— 部分

- `github.com/hashicorp/rfc`：**404**（仓库不存在或已迁移）；
- Sourcegraph handbook RFC 页：已跳转到 Notion，抓不到模板；
- Oxide `rfd/0001`：拿到的是 **RFD 流程规范**（27 节，含 When to use / Insights to include / Metadata and State / life-cycle / 工具链），**不是内容模板**。

**能得出的结论只有流程观**：成熟团队的 RFC 是「编号 + 状态机 + 分支评审 + PR 讨论」的**流程**，文档结构反而轻。这条支持本项目"章表别做太重"的判断，但不能用来定章。

### 7. 中文行业惯例 —— 未核

国内大厂 PRD / 技术方案评审的真实模板基本不公开，公开的多为文库转存，无法核对原始分节。**维持 `template-corpus.md` §A 里「同类 / 常识」的标注，不升级为"已核"。**

### 8. 游戏 Art Bible / TDD —— 未核

公开检索命中的多是"如何写 GDD"的二手文章，未找到可逐节核对的 Art Bible 或 TDD 完整样本。本项目游戏侧目前沿用 gdad 7 节 + 16 类文档，**不缺结构，缺的是样本佐证**。

---

## 三、对项目的净结论

**章级：不用改。** 本轮核验没有推翻任何一章的存在理由——PEP/Model Card/Datasheet/C4 都是"同一批章节、不同详略"。

**字段级：两处该补，且都补成"可选"。**

| 章 | 要补的字段 | 依据 | 为何可选 |
|---|---|---|---|
| `data_sheet` | `collection_process`（采集方式 / 时间范围 / 伦理审查） | Datasheet §3 | 论文明确"不具强制性、不适用就跳过" |
| `data_sheet` | `preprocessing`（清洗标注 + 是否保留原始数据） | Datasheet §4 | 同上 |
| `data_sheet` | `usage_limits`（推荐用途 / 明确禁用用途） | Datasheet §5 | 同上 |
| `data_sheet` | `maintenance`（版本 / 勘误 / 维护人） | Datasheet §7 | 同上 |
| `architecture` | `system_context`（外部系统与参与者） | C4 第 1 层 | 小项目可能真没有外部系统 |
| `architecture` | `runtime_units`（运行时/部署单元） | C4 第 2 层 | 单体项目常常只有一个 |
| `release` | `compatibility_impact`（不兼容与迁移影响） | PEP 1：不兼容变更必须单列 Backwards Compatibility，否则可能拒稿 | 不是每次发布都有破坏性变更 |

合计 **7 个字段，全部可选**——模板补字段不得悄悄抬高老文档的必填门槛。

**为何不补**：
- Model Card 的 `Distribution` / `Frontier Safety`：与"应用内嵌 AI"定位不同构，补了会变成凑数；
- C4 的 `Code` 层：SDD 不做类图，这是产品定位，不是遗漏；
- ISO 29148 条款级字段：没核到原文，不凭二手资料加字段。

**代价**：7 个**可选**字段 → 必填口径不变（校验条数仍 43），老文档完成度零变化；但字段总数、AI 提示词字段清单、导出对拍覆盖会变，需同步跑测试（已在 `b6d16cdc` 与本次提交中一并处理）。

---

## 四、仍未解决的问题

1. **ISO/IEC/IEEE 29148**：需购买标准；不做则 SRS 侧永远停在"粗核"。
2. **中文 PRD 真实模板**：不公开。替代方案是拿本项目用户的真实文档做样本（比再搜网页有效）。
3. **游戏 Art Bible / TDD 完整样本**：公开渠道稀缺。
4. **"每个行业 5 份真实项目文档"**：企业内部文档不公开，公开可得的只有模板、Model Card、System Card。**这一点不装作有**——能做到的是"每行业 5 份公开可核对样本"，性质不同。
