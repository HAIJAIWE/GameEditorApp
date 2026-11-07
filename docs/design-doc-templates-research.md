# 设计文档模板调研（2026-11-07）

> 目的：为「游戏 GDD / 应用 SDD」的章表打磨提供真实依据，避免拍脑袋定章数。
> 方法：抓取公开、具名的模板/标准，逐份核对分节；只记录**可核对的结构**，不臆造。
> 结论先行：**没有任何一份"标准 16/24 章"**；真正一致的是 9 个"必有内核"，其余按项目裁剪。

---

## 一、来源清单（40+ 套具名结构）

| 类别 | 具名来源 | 数量 | 备注 |
|---|---|---|---|
| ADR | Nygard、Tyree & Akerman、arc42、EdgeX、Alexandrian、Business case、MADR（简/详）、Planguage、Gareth Morgan、NHS Wales、ITD、Paulo Merson、Olaf Zimmermann（Y-Statement） | 13 | Nygard 最流行：Context / Decision / Status / Consequences；MADR 详版强调 options + pros/cons |
| 架构文档 | arc42（12 节）、C4 模型（Context/Container/Component/Code） | 2 | arc42 12 节已核对 |
| RFC / 提案 | Rust RFC（10 节）、Kubernetes KEP（10 节）、Python PEP、IETF RFC、W3C | 5 | Rust RFC / KEP 分节已逐条核对 |
| 设计文档 | Google《Design Docs at Google》（5 节 + 设计子项）、tech spec 模板若干 | 5+ | Google 明说「无严格模板」 |
| 需求文档 | PRD 经典模板、Product Brief、ISO/IEC/IEEE 29148 SRS | 3 | ISO 结构仅粗核 |
| 游戏 | gdad.wiki **16 种游戏文档**（HCD/Pitch/Pillar Posters/Mood Board/GDD/Feature Spec/Art Reference/Art Bible/Story Bible/Storyboard/TDD/Content Doc/Hotlist/Post-Project…） | 16+ | GDD 7 节已核对 |
| AI | Model Card（HF：YAML + 描述/用途/局限/训练/数据/评测）、Datasheet for Datasets、System Card、EU AI Act 技术文档、NIST AI RMF | 5 | Model Card 已核对 |

---

## 二、已核对的关键分节

**arc42（12 节）**：1 引言与目标 / 2 约束 / 3 上下文与范围 / 4 解决方案策略 / 5 构建块视图 / 6 运行时视图 / 7 部署视图 / 8 横切概念 / 9 架构决策 / 10 质量需求 / 11 风险与技术债 / 12 术语表。

**Rust RFC（10 节）**：Summary / Motivation / Guide-level explanation / Reference-level explanation / Drawbacks / Rationale and alternatives / Prior art / Unresolved questions / Future possibilities。

**Kubernetes KEP（10 节）**：Release Signoff Checklist / Summary / Motivation（Goals、Non-Goals）/ Proposal（User Stories、Notes/Constraints、Risks and Mitigations）/ Design Details（Test Plan、Graduation Criteria、Upgrade-Downgrade、Version Skew）/ Production Readiness Review / Implementation History / Drawbacks / Alternatives / Infrastructure Needed。

**Google 设计文档（5 节）**：Context and scope / Goals and non-goals / The actual design（系统上下文图、APIs、数据存储、代码、约束程度）/ Alternatives considered / Cross-cutting concerns。原文：「第一条规则是没有严格模板」。

**gdad GDD（7 节）**：游戏概述与愿景 / 核心机制与系统 / 关卡结构与目标 / 角色与敌人 / UI-UX 准则 / 经济与成长 / 胜负条件与难度。另推荐「Good/Bad/Ugly」三档实现分层。

**Model Card**：YAML 元数据（language/license/datasets/base_model/library/pipeline/model-index…）+ 文本（模型描述 / 预期用途与局限 / 训练参数 / 数据集 / 评估结果）。

---

## 三、高频章节（跨模板的公共分母）

1. 背景与范围 / 上下文
2. 目标与非目标
3. 方案 / 设计本体
4. 替代方案与被否理由
5. 风险 / 取舍 / 后果
6. 测试 / 验收
7. 发布 / 回滚 / 迁移
8. 横切关注点（安全 / 隐私 / 可观测）
9. 术语表

---

## 四、提议模板（**待定稿**，非最终）

### 应用 SDD：12 核心 + 4 可选
核心：概述与目标 / 目标与非目标 / 背景与技术上下文 / 用户与场景 / 方案设计 / 数据与接口 / 替代方案 / 横切关注点 / 质量属性 / 测试与验收 / 发布与回滚 / 风险与技术债。
可选：架构决策记录(ADR) / 术语表 / 里程碑 / AI 模型层（已在应用里做成 `ai_enabled` 开关）。

### 游戏 GDD：12 核心 + 可选
核心：概述与愿景 / 目标与非目标 / 核心循环与系统 / 关卡与内容 / 角色与敌人 / 经济与成长 / UI-UX / 胜负与难度 / 美术方向 / 叙事 / 音频 / 技术设计。
可选：测试与验收 / 风险取舍 / 里程碑 / 商业化与市场 / 运营。

### 与现状差异
- 应用 16 章大体可对，需**补**「替代方案 / 横切关注点 / 发布回滚 / 术语表」，**合并**过细章节；
- 游戏 23 章偏多，「市场/商业化/运营」宜转可选；
- 分组标题「一、二、」应去掉中文序号。

---

## 五、数据充分性评估（诚实）

> **2026-11-07 复核**：本节 8 项待补源的逐条核验结果见 `template-corpus-verification.md`
> ——4 项已核（1 PEP / 2 Google 模型卡 / 3 Datasheet / 5 C4）、1 项部分（6 企业 RFC 只有流程证据）、
> 3 项核不到（4 ISO 付费墙 / 7 中文惯例无公开源 / 8 游戏 Art Bible 无原文）。

**够用**：做**方向判断**（哪些是核心、哪些可选、别做固定大本）。ADR / arc42 / Rust RFC / KEP / Google / GDD 分节均已逐条核对，公共分母可靠。

**还不够**（做最终章表前建议补）：
1. ✅ Python PEP 官方模板分节（**已核**：15 节通用清单 + PEP 484 实证 16 节）；
2. ⚠️ System Card 真实结构（**部分**：Google 模型卡已核 8 节；OpenAI / Anthropic 未取到）；
3. ✅ Datasheet for Datasets 7 组原文（**已核**，含子问题）；
4. ❌ ISO/IEC/IEEE 29148 条款结构（**付费墙**，仍只到目录级，勿当逐条证据）；
5. ✅ C4 官方 4 层 + 3 类补充图（**已核**）；
6. ⚠️ 企业 RFC 实例：HashiCorp 仓库 404、Sourcegraph 迁 Notion 无正文、Oxide RFD 0001 是**流程**文档
   ⇒ 只有流程证据，**没有内容模板证据**；
7. ❌ **中文行业惯例**：国内 PRD / 技术方案评审的常见结构——公开渠道只有文库/CSDN 转存，**无权威源**，本轮不增加条数；
8. ❌ 游戏侧：Art Bible / TDD 无可核对原文（公开多为二手总结）。

> 判断（2026-11-07 更新）：**决策骨架可以定稿**（PEP 1 / PEP 484 / arc42 / Google design doc 四源交叉）；
> `data_sheet` 缺 3 组、`architecture` 缺 2 层有标准原文直接支撑，可据此改字段；
> 4 / 7 / 8 三项**公开渠道拿不到**，只能靠真实项目文档——这必须由有文档的人提供，不是搜索能解决的。

---

## 六、待思考的架构问题（下一步，不在本文结论内）

1. **固定章表 vs 核心+可选模块**：可选章如何表达（沿用 `ai_enabled` 式布尔？还是通用 `enabled_modules` 列表）？
2. **向后兼容**：章 key 合并/改名/删除时，老文档数据怎么办（迁移映射？保留 key 只改标签？）。
3. **游戏与应用是否共用内核**：章表差异大，是否共享「核心+可选」机制而不是共享章名？
4. **模板版本化**：模板演进后，老文档按生成时的模板解释，还是跟最新模板？
5. **文档标识**：是否引入 RFC/PEP/KEP 式编号（如 `SDD-0001`）作为文档 ID，而非仅靠文件名。
6. **可选章的默认值与校验**：未启用的可选章不参与进度/校验/导出（现有 `ai_enabled` 已是这个模式，可推广）。
