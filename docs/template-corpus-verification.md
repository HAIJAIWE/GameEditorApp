# 模板语料复核：8 项待补源的逐条核验结果

> 复核时间：2026-11-07。目的：把 `design-doc-templates-research.md` §五「还不够」列的 8 项，
> 从「未逐条核」推进到**逐条给出真实分节 + 来源**，或明确标注**为什么核不到**。
>
> 口径与 `template-corpus.md` 一致：
> - `已核` = 实际读到分节标题（附来源 URL）；
> - `部分` = 读到一部分（如只有流程文档、或页面结构变了）；
> - `未核` = 拿不到原文（付费墙 / 仓库下线 / 无权威公开源），**不猜、不补写**。

---

## 一、逐条结论

| # | 待补项 | 结论 | 来源 |
|---|---|---|---|
| 1 | Python PEP 官方模板分节 | ✅ **已核** | https://peps.python.org/pep-0001/ ；https://peps.python.org/pep-0484/ |
| 2 | System Card / Model Card 真实结构 | ✅ **已核**（Google 侧） | https://deepmind.google/models/model-cards/gemini-3-1-pro/ |
| 3 | Datasheet for Datasets 7 节原文 | ✅ **已核**（含子问题） | https://arxiv.org/html/1803.09010v8 |
| 4 | ISO/IEC/IEEE 29148 SRS 条款结构 | ❌ **未核**（标准付费，公开页只有目录级描述） | — |
| 5 | C4 官方 4 层定义 | ✅ **已核** | https://c4model.com/ |
| 6 | 企业 RFC 实例（Oxide / HashiCorp / Sourcegraph / Squarespace） | ⚠️ **部分** | 见下 §二.6 |
| 7 | 中文行业惯例（国内 PRD / 技术方案评审） | ❌ **未核**（无权威公开源，文库/CSDN 转存不可当证据） | — |
| 8 | 游戏侧 Art Bible 完整样本 / TDD 模板 | ❌ **未核**（公开的多为二手总结，非可核对原文） | — |

**8 项里 4 项已核、1 项部分、3 项核不到。** 这比原来「8 项全未核」有实质推进，
但仍不足以宣称「语料完备」——§四 会写清哪些结论可以据此定稿、哪些不行。

---

## 二、已核项的原文分节

### 1. Python PEP（对应我们「决策记录」骨架）

PEP 1 给出的通用章节顺序（15 节，逐字）：

```
Preamble / Abstract / Motivation / Specification / Rationale /
Backwards Compatibility / Security Implications / How to Teach This /
Reference Implementation / Rejected Ideas / Open Issues /
Acknowledgements / Footnotes / Change History / Copyright/license
```

真实文档验证（PEP 484，16 节）：`Abstract / Rationale and Goals / … /
Rejected Alternatives / PEP Development Process / Acknowledgements / Copyright`。

**两条值得抄的约束**（PEP 1 原文措辞，不是我的总结）：
- `Backwards Compatibility`：引入不兼容变更的 PEP **必须**写，写不清「may be rejected outright」；
- `Reference Implementation`：必须在状态转为 Final **之前**完成。

**对我们章表的启示**：`alternatives` 章已有「被否决方案」，但**没有「不兼容/迁移影响」的独立位置**——
现在折叠在 `release`（灰度/回滚）与 `data_interface`（迁移与演进）里。PEP 把它单列，理由是
「不兼容影响」要能被单独评审，而不是埋在发布计划里。这是一处**真实缺口**（低优先，见 §三）。

### 2. Google Model Card（对应我们的 `model_card` 章）

Gemini 3.1 Pro 模型卡 8 节（逐字）：

```
Model Information / Model Data / Implementation and Sustainability /
Distribution / Evaluation / Intended Usage and Limitations /
Ethics and Content Safety / Frontier Safety
```

对照我们的 `model_card` 5 字段（`base_model` / `capabilities` / `limitations` /
`model_version` / `inference_cost`）：**能力、局限、版本、成本都覆盖了**；
缺 `Distribution`（分发渠道/许可）与 `Implementation and Sustainability`（算力/能耗/维护承诺）。
后者对国内项目基本不适用，**不建议补**；前者与 `data_sheet.data_license` 有重叠，也不建议重复补。

### 3. Datasheet for Datasets（对应我们的 `data_sheet` 章）

7 个顶层问题组（逐字）：`Motivation / Composition / Collection Process /
Preprocessing·Cleaning·Labeling / Uses / Distribution / Maintenance`。

对照我们的 `data_sheet` 4 字段：

| Datasheet 组 | 我们的字段 | 状态 |
|---|---|---|
| Motivation | `training_data`（部分） | 覆盖 |
| Composition | `training_data` / `pii_handling`（部分） | 覆盖 |
| Collection Process | — | **缺** |
| Preprocessing / Cleaning / Labeling | — | **缺** |
| Uses（含「不该用于什么」） | `bias_audit`（部分） | 弱覆盖 |
| Distribution | `data_license` | 覆盖 |
| Maintenance（版本/勘误/更新） | — | **缺** |

**这是本次复核发现的最实质缺口**：`data_sheet` 现在是「来源+许可+隐私+偏差」四件套，
而标准模板的重心其实是**采集过程可追溯**与**维护责任**。缺的三组恰好是「出了事能查」的部分。

### 5. C4 model（对应我们的 `architecture` 章）

4 层 + 3 类补充图（逐字）：

```
层级：software system → container → component → code
图：  system context / container / component / code
补充：system landscape / dynamic / deployment
```

对照我们的 `architecture` 3 字段（`modules` 模块划分 / `tech_choices` 技术选型 / `alternatives` 被否决方案）：
`modules` 相当于 **component 层**，但**缺 system context（外部系统与参与者）和 container（运行时/部署单元）**。
结果是「模块职责」写得清，但「系统边界在哪、跑在几个进程/容器里」无处落笔——
这两层恰恰是评审时最先被问的。

---

## 三、由此产生的章表级判断（可据此定稿的部分）

1. **决策骨架（PEP/ADR/RFC 一脉）确认无误**：非目标 → 方案 → 替代方案 → 影响 → 验收。
   这部分**可以定稿**，已有 4 个独立权威源（PEP 1、PEP 484、arc42、Google design doc）交叉印证。
2. **`data_sheet` 需要补 3 组**：采集过程、预处理/标注、维护与版本。这是**唯一有标准原文直接支撑**的结构性缺口。
3. **`architecture` 需要补 2 层**：系统上下文（外部系统/参与者）、运行单元（容器/部署单元）。
4. **「不兼容与迁移影响」** 建议在 `release` 或 `data_interface` 里显式成一个字段，而不是继续隐含。
5. **不建议为了对齐而补的**：`Implementation and Sustainability`（算力能耗）、`Distribution`（与许可重叠）。

---

## 四、核不到的部分（诚实边界）

- **ISO/IEC/IEEE 29148**：标准正文付费，公开页只到目录级。所以「SRS 七节」一直标 `粗核`，
  这次也没能升级。**不要引它当逐条证据。**
- **企业 RFC 实例**：`github.com/hashicorp/rfc` 已 404；Sourcegraph handbook 的 RFC 页已迁到 Notion 且无正文；
  Oxide 的 RFD 0001 打开后是**流程文档**（27 节全在讲生命周期、脚本、PR 流程），不是内容模板。
  所以「企业 RFC 的章节长什么样」我**只有流程证据，没有内容证据**。
- **中文行业惯例**：搜到的都是文库/CSDN 转存，无法核实原始出处。这类材料在 `template-corpus.md` 里
  已被标为「同类/常识」，**这次不再增加任何条数**——加了也只是把不可核的东西堆高。
- **游戏 Art Bible / TDD**：公开的多是「怎么写」的二手总结，没有可逐节核对的原文档。
  语料库里那几条本来就是按行业通行结构写的，**保持原核验度，不升级**。

---

## 五、结论

**能定稿的**：决策骨架、`data_sheet` 补 3 组、`architecture` 补 2 层。
**不能定稿的**：任何需要「ISO 条款级」或「中文大厂内部模板」背书的判断——公开渠道拿不到，
只能靠真实项目文档（这正是 P2 那条「各取 5 份」要解决的事，且**必须由有文档的人提供**）。

下一步若要动代码，优先级建议：
1. `data_sheet` 补 `collection_process` / `preprocessing` / `maintenance` 三字段（有标准原文支撑）；
2. `architecture` 补 `system_context` / `runtime_units` 两字段；
3. `release` 补 `compatibility_impact`（不兼容与迁移影响）。
