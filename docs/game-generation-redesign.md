# 游戏档「一键生成」改造方案（2026-11-07）

> 依据：`docs/game-doc-corpus-2026.md`（重收 50 条游戏文档、11 个独立文档逐字读过原文）
> + `docs/game-audit.md`（代码一致性 5 条问题）+ `docs/ai-generation-audit.md`（生成配置诊断）。
>
> **2026-11-07 实施状态**：
> - 第 1–3 步 **已实施**（默认范围拍板为立项 7 章，全量/制作仍可选）。
> - 第 4 步 **已做信息层串联**：`TECH_DOC_GDD_INPUTS` 把 TDD 9 章映射到 GDD 素材章，
>   并要求「GDD 已写清的只引用不重抄」「冲突需注明回写 GDD 的章节」「末尾写来源章节回链」。
>   **未做**的是 UI 入口与 Art Bible 独立交付物（新交付物，属产品形态决策）。
> - P1-4 判定**作废**（我误判为单向依赖，实为双向一致性约束，且阶段化后顺序本就如此）。
> - P2-5 已用零数据风险方式处理（只改 aiHint/reviewHint 明确分工，不删字段不改必填）。
>
> 每条改造都挂「搜到的哪份文档这么说」与「代码里哪处不符」。
> 四道闸 tsc×3 / lint / **4214 单测** / build 全绿。
>
> **追加修复（同日）**：
> - 阶段与档位**不可叠乘**：`lite` 的基础 9 章不含 `mvp`，与立项 7 章取交集会把
>   「先做什么」砍掉只剩 6 章。已改为 stage 非 full 时以阶段为准，full 保持旧 lite 行为。
> - 补齐方案第 3 步承诺的**一页 pitch 预览**：`renderOnePageSummary` 从 main 下沉到
>   `@mobai/shared/ceshu/export/onePage`（纯逻辑、单一事实源，main 侧 re-export 保持既有 import 零改动），
>   面板在立项阶段把生成草稿 `mergeChapterDraft` 合成后渲染预览，**不写盘**。

---

## 一、你的生成与搜到的文档，差在哪（逐条对照）

| # | 搜到的文档怎么说（证据） | 本项目现状（代码） | 判定 |
|---|---|---|---|
| 1 | **GDD 是 living document、分阶段长出来**：Nuclino「keep the initial documentation to a minimum… fit it on a single page and let it evolve」；gamedesigning.org 举 Undertale 两页 GDD 起步 vs Witcher 3 200+ 页；`GDD-template.pdf` 原文写「This is a skeleton… Your full design documents will be much longer!」；openagenticgame-gdd 建议 MVP **先只写 3/4/9 章**，分四阶段补全 | **一次性铺满 24 章**：`buildFullGeneratePlan` full 档 `buildChapterOrder` 返回 24 章，`AiFullGeneratePanel` 一次 `runChapters(plan.order)` 全跑完，每章 `onlyEmpty:false` 整章全字段生成 | ❌ **最大不符合**：把「最终交付物形态」当成「第一步就该生成的东西」 |
| 2 | **按项目裁剪**：gameindustrycareerguide「pick and choose whichever sections make sense (or don't)」；openagenticgame-gdd 做 8 大品类专门化适配；`chapterApplicableToGenre` 规定无战斗品类剔除 combat | `buildFullGeneratePlan` **完全不看 `enabled_modules` 与 `gameType`**；`monetization`/`live_ops`/`combat` 无条件进生成顺序 ⇒ 默认关闭的章照样生成、视觉小说照样生成战斗系统 | ❌ 与用户的章开关、品类设定自相矛盾 |
| 3 | **GDD / TDD 分工**：gamedesigning.org「GDD=what，TDD=how(code structure/APIs/architecture)」；机核 2026 明确三分；B 站《通关游戏设计之道》书摘原文「技术需求…这里的很多内容会包含在游戏的技术设计文档（TDD）里」 | 项目**其实有分层**：独立 `system.tech_doc` 技能（9 节 TDD）+ 游戏档内 `tech` 章。但一键生成只写游戏档 23 章，**不触发/不产出 TDD**，两者也没有回链 | ⚠️ 地基有、链路没接（不是缺功能，是没串起来） |
| 4 | **Art Bible 是独立交付物**：百度文库《游戏研发项目管理制度》「ART Bible：规定色彩体系、UI组件库、角色设计规范」；openagenticgame-gdd 把「资产管线与命名规范」单列 `10.10`、另有资产元数据 schema 与分镜/序列帧指南 | 全项目 grep 无 `artBible/art_bible/美术圣经` 独立文档；色彩/字体/特效/角色/场景全塞在 `art` 一章（8 个字段） | ⚠️ 真实缺口，但属产品取舍 |
| 5 | **world-building 独立成文**：gamedevacademy 原文「A Game Design Document is not a place where you do your world-building. This should be a separate document」 | `story` 章含 architecture/main_plot/protagonist/main_npc_count，作为 GDD 一章 | ⚠️ 行业有两种做法，非硬缺陷 |
| 6 | **真实项目文档差异极大**：gameindustrycareerguide 同一页正文主题式、附给复制的 outline 用 `1./a./i.` 三级编号；7 份真实 GDD 从 pitch deck 到 design bible 形态各异；gamedevacademy「formats are fluid rather than rigid」 | 本项目**一套 23 章固定章表** + 模板覆盖层（只能改标签/顺序/模块开关） | ⚠️ 灵活性不足，但覆盖层已留口子 |
| 7 | **前后一致靠交叉引用/追踪**：Claude Code Game Studios 有 `tr-registry.yaml` 把 GDD 需求与开发故事关联、Cross-References 表 | 章间一致性靠 `validateCeshu` 事后校验 + 我上轮加的「前文要点」摘要 | ⚠️ 已有兜底，但缺显式追踪表 |

### 一句话结论

**生成配置的技术骨架（字段契约、质量门、重试、前文摘要）不差；真正的问题是「生成策略」——它假设用户要的是一份一次成型的完整 24 章文档，而搜到的文档一致表明 GDD 是从一页 pitch 分阶段长出来的活文档。**

更关键的是：**项目里其实已经有分阶段的资产，只是没接进生成流程**——
`CESHU_STAGE_CHAPTERS`（concept 7 章 / production 9 章 / release 8 章，注释写着「真实 5 页 GDD 的体量」）、
`onepage` 一页 pitch 导出、`CLONE_CONCEPT_CHAPTERS`（复刻只拆立项 7 章）。
目前 `ceshuStages` **只被复刻拆解引用**，一键生成面板完全没用它。改造不需要新造概念，是把已有资产接上。

---

## 二、改造方案（按依赖顺序，分 4 步）

### 第 1 步｜生成计划统一到「文档感知的可见章」（P0，修 game-audit P0-2）

- **改什么**：`buildFullGeneratePlan(input, options)` 增加 `doc` 入参（或传入 visible chapter 集合），
  生成章集合 = `visibleChapterKeys(scope, gameType, enabledModules)` ∩ 生成顺序；
  `buildChapterOrder` 不再无条件 push `monetization/live_ops/combat`。
- **解决**：默认关闭的 3 章不再生成；视觉小说不再生成战斗系统；生成结果与用户设定一致。
- **依据**：gameindustrycareerguide「pick and choose」、openagenticgame 品类适配、项目自己的 `chapterApplicableToGenre`（本来就是设计，只是生成没消费）。
- **验收**：新建默认文档（关 3 章）一键生成 ⇒ 不出现 market/monetization/live_ops；`gameType='视觉小说'` ⇒ 不出现 combat。

### 第 2 步｜前文要点改按「生成顺序」取前序（P0，修我上轮引入的回归）

- **改什么**：`buildPriorChaptersDigest` 不再用 `visibleChaptersForDoc`（章表顺序），
  改为接收 `plan.order` 作为显式参数（经 `fullGenerate.draft` 的键顺序或新增 `generationOrder` 字段传到主进程）；
  只取「本次已生成」的章，不取「章表上排在前面但还没生成」的章。
- **解决**：生成 `market_analysis` / `combat` 时不再把未生成章节当参照。
- **依据**：纯代码正确性，与语料无关（见 `docs/game-audit.md` P0-1）。
- **验收**：单测构造「生成顺序 ≠ 章表顺序」的场景，断言摘要只含已生成章。

### 第 3 步｜把三阶段接进一键生成（P1，本次改造的核心）

- **改什么**：面板增加「生成阶段」选择（立项 / 制作 / 全量），默认**立项**：
  - 立项 = `chaptersUpToStage('concept')` 7 章 + 一页 pitch 预览（`renderOnePageSummary` 已有）；
  - 制作 = 累加 `production` 9 章；全量 = 24 章。
  - 每阶段生成完先给人看 pitch / 完成度，再决定要不要继续下一阶段。
- **为什么这么做**：Nuclino「单页起步、随项目演进」、gamedesigning「Undertale 两页」、
  openagenticgame「MVP 先 3/4/9 章、四阶段补全」——**三份独立来源同一个意思**，且项目自己已有同名资产。
- **附带收益**：一次性调用从 24 次降到 7 次，成本、失败率、跨章矛盾都下降；
  用户能在花钱铺满之前先纠偏（这对应你问的「LLM 能不能生成完整文档」——先生成对的 7 章，比生成全但互相矛盾的 24 章有用）。
- **验收**：立项档生成 7 章 + 一页 pitch；不出现 production/release 章；可一键「继续生成下一阶段」。

### 第 4 步｜打通 GDD → TDD / Art Bible 的交接（P2，可选）

- **改什么**：立项或制作阶段完成后，提供「生成技术设计文档」入口，调用已有 `system.tech_doc` 技能，
  把 GDD 的 `tech`/`numeric`/`systems` 作为输入，产出 `<库>/tech/<name>.md`，并在 GDD 里留回链。
  Art Bible 同理：从 `art` 章 + 资产规范导出独立文档（色彩体系 / UI 组件库 / 角色规范 / 资产命名管线）。
- **依据**：gamedesigning GDD/TDD 定义、机核三分、B 站书摘「技术需求归 TDD」、百度文库 ART Bible 定义、openagenticgame `10.10`。
- **注意**：这是**新交付物**，涉及产品形态，建议在第 1–3 步落地后再定。

---

## 三、先修哪些（建议顺序）

1. **第 1 步 + 第 2 步**：都是纯 bug 修复、无产品决策、改动小、可测，建议一次性做掉。
2. **第 3 步**：核心改造，但要你拍一个板——**默认生成范围改成「立项 7 章」还是维持「全量 24 章」**。
   我倾向前者（三份来源一致 + 项目已有阶段表 + 降本增效），但这会改变现有用户习惯，属产品决策。
3. **第 4 步**：等前两步稳了再说。

## 四、不在本方案内、但别忘的事

- 游戏档是否恢复可选编号标签（见 `docs/ceshu-roadmap-status.md` 3.6 更正）——属产品决策，与生成改造独立。
- `tech_doc` 技能自身用 `## 1. 概述与目标` 编号，而游戏档/应用档已改主题式；若要统一，需单独一轮。
- Art Bible / Cross-References 追踪表是真实缺口，但优先级低于上面 3 步。
- `docs/game-audit.md` 的 P1-3（lite 顺序颠倒）、P1-4（combat 先于 systems）、P2-5（milestones 重复）
  会在第 1 步统一章集合时顺带暴露，建议一并复核。

---

## 五、诚实边界

- 上表 1–7 条的「文档怎么说」均来自 `docs/game-doc-corpus-2026.md` 中**标为已读原文的 11 个独立文档**；
  标「已读摘要/线索」的 39 条**没有**用作判定依据。
- 第 3、4 条（Art Bible、world-building 独立成文）在行业里是**常见做法但非唯一做法**，
  方案里按「可选增强」处理，不宣称必须。
- **本轮未改任何代码**。
