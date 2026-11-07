# 真实文档对拍：决策骨架是否成立（2026-11-07）

> 目的：上一轮 `docs/template-corpus-verification.md` 把 8 项待补源逐条核过（4 已核 / 1 部分 / 3 核不到）。
> 其中 3 项（ISO 29148 / 中文大厂 PRD / 游戏 Art Bible）公开渠道拿不到原文，已明确标注不可核。
> 本文件在「**可公开核对**」的边界内，取 6 个真实、可溯源的决策文档模板/实例，
> 把它们的真实章节逐一映射到本项目应用档章表，验证「非目标 → 方案 → 替代方案 → 影响 → 验收」骨架是否成立。
>
> 边界声明：企业/游戏内部文档不公开，本对拍**不含**游戏 GDD/Art Bible 原文（那是用户需提供的样本）。
> 因此结论对 SaaS/基础设施/AI 文档强，对游戏文档是「待补真实样本」状态，不冒充已验证。

---

## 一、参与对拍的 6 个真实源（均可公开溯源）

| # | 源 | 性质 | 来源 |
|---|---|---|---|
| A | Rust RFC（含真实 RFC 2394 async/await） | 开源社区标准提案模板 | `github.com/rust-lang/rfcs` 0000-template + `text/2394-async_await.md` |
| B | Kubernetes KEP（含真实 KEP 4381 DRA） | 大型基础设施项目的增强提案模板 | `github.com/kubernetes/enhancements`（0000-template + `keps/sig-node/4381`） |
| C | Google 设计文档（Malte Ubl 等公开文章 + 多份 skill 模板互证） | 一线大厂工程实践 | `sefism.com/resources/design-docs-at-google`；`hld.handbook.academy/.../design-doc-authoring` |
| D | MADR 架构决策记录（官方完整模板） | 架构决策记录标准 | `adr.github.io/madr/` |
| E | Python PEP（PEP 1 + PEP 484，上一轮已核） | 语言标准提案 | `peps.python.org`（见 `template-corpus-verification.md`） |
| F | Model Card（Gemini 3.1 模型卡 + Mitchell 等人原论文，上一轮已核） | AI 模型发布文档 | 见 `template-corpus-verification.md`（arXiv 1803.09010） |

> 取数口径：凡取自 GitHub 官方仓库、标准组织官网、作者本人公开文章的，视为**可核对**；
> 凡来自 CSDN/博客转存的，只作线索、不当证据（与 `template-corpus-verification.md` 一致）。

---

## 二、6 个源的真实章节（原文级）

- **A. Rust RFC**：`Summary / Motivation / Guide-level explanation / Reference-level explanation / Drawbacks / Rationale and alternatives / Prior art / Unresolved questions / Future possibilities`
- **B. Kubernetes KEP**：`Summary / Motivation (Goals / Non-Goals) / Proposal (Notes/Constraints, User Stories, Risks) / Design Details / Alternatives / Test Plan / Graduation Criteria / Security / ...`
- **C. Google 设计文档**：`TL;DR / Context and Scope / Goals and Non-Goals / The Design (system-context diagram, APIs, data storage) / Alternatives Considered / Cross-Cutting Concerns (security, privacy, observability) / Risks & mitigations / Rollout Plan / Open Questions`
- **D. MADR ADR**：`Context and Problem Statement / Decision Drivers / Considered Options / Decision Outcome (Consequences, Confirmation) / Pros and Cons / More Information`
- **E. Python PEP**：`Abstract / Motivation / Specification / Rationale / Backwards Compatibility / Security Implications / Reference Implementation / Rejected Ideas / Open Issues / ...`
- **F. Model Card**：`Model details / Intended use / Factors / Metrics / Evaluation data / Training data / Ethical considerations / Caveats`

---

## 三、映射到本项目应用档章表

本项目应用档章（来自 `docs/ceshu-roadmap-status.md` 3.2）：

```
定义与目标：概述 / 用户 / 范围与非目标
方案设计：功能 / 流程 / 交互 / 架构 / 替代方案
数据与接口：数据与接口
质量与保障：非功能 / 测试
横切关注点：安全与隐私
交付与治理：发布 / 里程碑 / 风险
附录：术语表
AI 模型层（可选）：模型卡 / 数据表 / 系统卡 / 评测与红队
```

逐源覆盖矩阵（✅ 该源有此关切且被本档覆盖；⚠️ 该源有此关切但本档无独立章节；— 该源不涉及）：

| 核心关切 | A RFC | B KEP | C Google | D MADR | E PEP | F ModelCard | 本档落点 | 命中率 |
|---|---|---|---|---|---|---|---|---|
| 背景/上下文 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅(details) | 概述 | 6/6 |
| 目标 | ✅ | ✅ | ✅ | — | — | ✅(intended use) | 用户 + 范围 | 5/6 |
| **非目标** | — | ✅ | ✅ | — | — | — | **范围与非目标** | 2/6（明确单列） |
| 方案/设计 | ✅ | ✅ | ✅ | ✅ | ✅ | — | 功能/流程/交互/架构 | 5/6 |
| **替代方案** | ✅ | ✅ | ✅ | ✅ | ✅(Rejected) | — | **替代方案** | **5/6** |
| 影响/Drawback | ✅ | ✅ | ✅ | ✅ | ✅(BackCompat) | ✅(Ethical) | 风险 + 发布.兼容 | 6/6 |
| 验收/测试 | — | ✅ | ✅(Rollout) | ✅(Confirmation) | ✅(RefImpl) | ✅(Eval) | 测试 + 发布 | 5/6 |
| 安全 | — | ✅ | ✅ | — | ✅ | — | 安全与隐私 | 3/6 |
| 数据 | — | — | ✅(storage) | — | — | ✅ | 数据与接口 | 2/6（独立章） |
| 术语/版本 | — | — | — | — | ✅(History) | — | 术语表 | 1/6（独立章） |
| 开放问题 | ✅ | — | ✅ | ✅(MoreInfo) | ✅ | — | ⚠️ 无独立章 | 3/6 |

---

## 四、结论

### 4.1 决策骨架成立（强证据）
出现于 **≥5/6** 个真实源的关切，本档**全部覆盖**：

- **背景/上下文**（6/6）→ `概述`
- **方案/设计**（5/6）→ `功能 / 流程 / 交互 / 架构`
- **替代方案**（5/6）→ `替代方案` ✅ 这是最有价值的一条：RFC、KEP、Google、MADR、PEP 五个独立源都强制或强烈建议写「被否决/考量的备选」，本档已单列成章，与共识一致。
- **影响/Drawback**（6/6）→ `风险` + `发布.不兼容与迁移影响`（后者即上一轮按 PEP 补的 `compatibility_impact`）
- **验收/测试**（5/6）→ `测试` + `发布`
- **目标**（5/6）→ `用户` + `范围`

### 4.2 单列成章有依据
- **`范围与非目标`**：虽然只有 KEP + Google 两个源显式单列「Non-Goals」，但二者都是大型协作项目的硬约束（防 scope creep），本档单列合理，且与上一轮语料库 §D「目标行业明确非目标」判断一致。
- **`安全与隐私`**：KEP / Google / PEP 三源都要求显式写安全，本档独立成章（横切关注点分区），覆盖到位。

### 4.3 唯一值得记一笔的弱项
- **`开放问题 / Unresolved`**：RFC、Google、PEP、MADR 四源都有「未决问题」类章节（3 源显式标题），本档**没有独立章**。
  - 但这点**不构成必填缺口**：`风险`（已知风险）、`里程碑`（待办）、评审 `Open Issues` 已部分承接「已知未知」。
  - 若将来要补，建议作为**可选**字段/模块，而非必填——不强行抬高门槛（与上一轮「补字段一律 optional」原则一致）。

### 4.4 诚实边界（与上一轮一致，不重复踩坑）
- 本对拍**不含游戏文档**：GDD / Art Bible 公开渠道无原文，需用户或团队提供真实样本才能二次核对。
- 不把 CSDN/文库转存当证据；凡是「企业内部模板」一律标注「需真实样本」。
- 结论强度：**SaaS / 基础设施 / AI 文档强验证；游戏文档待补样本**。

---

## 五、对章表改动的启示

- **不改结构**：本次对拍确认决策骨架成立，无需新增必填章。
- **`compatibility_impact`（上一轮已加，optional）** 在本次对拍中得到二次背书——PEP 的 `Backwards Compatibility` 与 KEP 的 `Graduation/Risks` 都要求写不兼容影响。
- **`system_context` / `runtime_units` / Datasheet 四组**（上一轮已加，optional）在 Google `The Design` 的 system-context diagram / data storage、KEP 的 Design Details 中均有对应，得到二次背书。
- **`开放问题`**：记为「可选候选」，暂不实现（避免无依据扩必填）。

> 综上：2026-11-07 的两轮工作（逐条核源 + 真实文档对拍）相互印证，应用档章表骨架可定稿；
> 后续只应做「可选增强」与「游戏真实样本补齐」，不再以搜索方式补必填项。
