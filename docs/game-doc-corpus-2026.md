# 游戏文档语料（国内 25 + 国际 25，2026-11-07 重收）

> 缘起：用户指出「上一轮去编号的依据全是软件/AI 文档，游戏侧没有原文证据」，要求重搜 50 个、国内国际都收、收到就真的看。
>
> **口径（重要）**：
> - `已读原文` = 实际抓到文档正文/PDF 文本，逐条看到分节标题；
> - `已读摘要` = 抓到页面但只拿到目录片段/搜索摘要，未逐节核对；
> - `线索` = 只拿到标题或二手转述，**不当独立证据**。
> - 中文文库/CSDN/原创力文档大量为**转存与贩售模板**，同质化严重，`线索` 居多，不冒充权威源。
> - 本文件只回答「游戏文档怎么写」，不做章表修改。

---

## 一、关键发现：章节编号这件事，游戏行业是**两种流派并存**

| 流派 | 证据 | 编号方式 |
|---|---|---|
| **传统/正式策划案（尤其国内）** | CSDN 2010 策划案（已读原文）、renrendoc 策划书模板（已读摘要）、百度文库目录模板（已读摘要）、bilibili《江山》策划案 | **「第一章…第八章」+ `1.1/5.3` 多级编号**；或「一、二、三」+ `1./2.` |
| **现代轻量 GDD（尤其国际/AI 时代）** | GDD Concept & Pitch Template（**已下载 PDF 并提取原文**）、Nuclino（已读原文）、Milanote、Notion 模板、gamedesigndocument.com | **主题式小标题，不编号** |
| **折中：编号但可拆分** | openagenticgame-gdd（已读原文）：`3_Game Overview.md`…`15_Game Type Adaptation.md`，15 章编号、每章独立文件 | 文件名编号 + 章内 `3.1.1` 多级 |

**结论**：我上轮说「网上不用章节命名」并据此把**游戏档也去编号**，是拿软件文档（RFC/KEP/Google/ADR/PEP/ModelCard）的结论外推，**证据不足**。真实游戏文档里「第 N 章」相当常见；Nuclino 那篇反而是明确反对**僵硬长文档**、主张 live wiki，两者谈的不是同一件事。
⇒ **去编号对应用档（SDD）有据；对游戏档属于产品取舍，不能说「符合行业惯例」。** 这条要回写进 `docs/ceshu-roadmap-status.md` 与 `docs/template-crosscheck-real-docs.md`。

---

## 二、另一个关键发现：真实 GDD 的「主题覆盖」与本项目 23 章高度重合

`gamedesigning.org`（已读原文，8 节）：Overview & Vision / Gameplay Core / Narrative & Characters / Art & Aesthetics / Audio Design / UX & UI / Technical & Tools / Project Planning。
`Nuclino`（已读原文）：Executive summary / Gameplay / Mechanics / Game elements / Assets。
`GDD Concept & Pitch Template`（**PDF 原文提取**）：Working title / Concept statement / Genre(s) / Target audience / Unique Selling Points / Player Experience & Game POV / Visual & Audio Style / Game World Fiction / Monetization / Platform, Technology & Scope / Core Loops / Objectives & Progression / Game Systems / Interactivity。

本项目游戏档三分区 23 章基本覆盖以上全部主题，且**多出**：数值设计、经济系统、战斗系统、UI/UX、关卡与内容、运营活动、数据埋点、QA、上线发行、性能与适配、可访问性与本地化、商业化、MVP、资源规划、风险控制。
⇒ **章表主题覆盖是够的、甚至偏全**；真正的问题不是「缺章」，而是 `docs/game-audit.md` 指出的顺序/开关一致性。

---

## 三、国际 25 条

| # | 来源 | 类型 | 分节/要点 | 核验度 |
|---|---|---|---|---|
| 1 | `gamedesigning.org/learn/game-design-document` | GDD 指南 | 1.Overview&Vision 2.Gameplay Core 3.Narrative 4.Art 5.Audio 6.UX/UI 7.Technical 8.Project Planning（**编号**）；另给 GDD/TDD 定义 | 已读原文 |
| 2 | `nuclino.com/articles/game-design-document-template` | 现代 GDD | Executive summary / Gameplay / Mechanics / Game elements / Assets（**主题式**）；反对 rigid 100+ 页 | 已读原文 |
| 3 | `gamedesigning.org/wp-content/uploads/2025/07/GDD-template.pdf` | 真实模板 PDF | Game Design Concept & Pitch Template：Working title / Concept statement / Genre / Target audience / USP / Player Experience / Visual&Audio Style / Game World Fiction / Monetization / Platform&Scope / Core Loops / Objectives&Progression / Game Systems / Interactivity（**主题式**） | **已下载+提取原文** |
| 4 | `github.com/wanghaisheng/openagenticgame-gdd` README-zh | 工业化 GDD 模板 | **15 章编号**：1_Copyright 2_Version History 3_Game Overview 4_Gameplay&Mechanics 5_Story/Setting/Character 6_Levels 7_Interface 8_Artificial Intelligence 9_Technical 10_Game Art 11_Secondary Software 12_Management 13_Appendices 14_AI-Assisted Design 15_Game Type Adaptation；自称参考天美/米哈游/腾讯公开资料 | 已读原文 |
| 5 | `github.com/LazyHatGuy/GDDMarkdownTemplate` | 上游 GDD 模板 | openagenticgame-gdd 的启发源，Markdown 分章 | 线索 |
| 6 | `opengdd.borninsea.com` (OpenGame) | GDD 协议站 | Protocol 层可替换；输出合法 OpenGame GDD markdown | 线索 |
| 7 | `gamedevs.org/uploads/grand-theft-auto.pdf` | **真实项目 GDD** | GTA 1995-03-22 原始设计文档（Mike Dailly 公开） | 已下载；扫描件未能提取文本 |
| 8 | `gamedesigning.org/.../BioShock-GDD.pdf` | 真实项目 GDD | BioShock GDD | 线索（链接可见） |
| 9 | `gamedesigning.org/.../GTA-GDD.pdf` | 真实项目 GDD | GTA GDD | 线索 |
| 10 | `gamedesigning.org/.../Diablo-GDD.pdf` | 真实项目 GDD | Diablo GDD | 线索 |
| 11 | Silent Hill 2 original design doc | 真实项目 GDD | 长篇、叙事向 GDD | 线索 |
| 12 | Fallout: Brotherhood of Steel 2 GDD | 真实项目 GDD | 被取消项目的 GDD | 线索 |
| 13 | Monaco original GDD | 真实项目 GDD | 独立游戏原始 GDD | 线索 |
| 14 | `gamescrye.com/resources/game-design-documents` | 真实 GDD 集合 | 汇总多个真实项目设计文档 | 线索 |
| 15 | `aeno.nl/uploads/Art-bible.pdf` | **Art Bible 原文** | art style / stylized 2D&3D / simple clear shapes / natural colors / saturated colors 等 | 已下载；编码型未能提取文本 |
| 16 | `gamedesigning.org` GDD vs TDD | 文档分工 | GDD=what(concept/gameplay/story/art)；TDD=how(code structure/APIs/system architecture) | 已读原文 |
| 17 | `nuclino.com` Real-life GDD examples | 实例索引 | 列出 GTA / Fallout BoS2 / Silent Hill 2 三份真实 GDD | 已读原文 |
| 18 | `gameindustrycareerguide.com/how-to-write-a-game-design-document` | 入门指南 | story→mechanics→art style→economy 概览 | 已读摘要 |
| 19 | `milanote.com/templates/game-design` | 模板 | concept / mechanics / overall vision | 已读摘要 |
| 20 | `gamedesigndocument.com` | 一页 GDD | one-page GDD + core loops / scope / systems / economies / living GDD | 已读摘要 |
| 21 | `abrarshop.com` GDD Kit | 模板套件 | one-page GDD / full GDD / mechanics&level specs / **character bible** / backlog / playtest forms | 已读摘要 |
| 22 | Notion GDD: Level Design 模板 | 专项模板 | 关卡设计专用 GDD | 已读摘要 |
| 23 | Milanote / GDD Creator (Steam) | 工具 | sections: story / gameplay / characters / levels / sound / art | 已读摘要 |
| 24 | `gamedevacademy.org/game-design-tutorial` | 教学 | 明确主张世界设定应**独立成文**，不塞进 GDD | 已读摘要 |
| 25 | `The Art of Game Design`(Schell) / `Game Engine Architecture`(Gregory) | 专业书 | 目录级参考；Art Bible 为多艺术家协作的一致性文档 | 线索 |

---

## 四、国内 25 条

| # | 来源 | 类型 | 分节/要点 | 核验度 |
|---|---|---|---|---|
| 1 | CSDN《游戏策划案的格式》(2010) | 策划案模板 | **第一章 游戏概述 … 第八章 功能操作** + `1.1/5.3` 多级编号 + 附录；含 AI/道具/角色/进程/界面 | **已读原文** |
| 2 | 百度文库《游戏策划文档目录模板》 | 目录模板 | 一、文档介绍 二、项目概述 三、游戏概念 四、游戏机制 五、游戏角色 六、关卡设计 七、游戏系统 八、用户界面 九、美术需求 十、音效需求 十一、开发计划（**中文序号**） | 已读摘要 |
| 3 | renrendoc《游戏策划书模板_1》 | 策划书 | **第一章:输入文件 第二章:标准规范 第三章:界面设定 第四章:系统设定 第五章:游戏规则 第六章:美工设定 第七章:音响设定** | 已读摘要 |
| 4 | 原创力《游戏设计策划书》 | 策划书 | 第一部分 游戏概述 / 第二部分 游戏背景 / 第三部分 游戏元素 / 第四部分 游戏规则…（`1.1/2.1` 多级） | 已读摘要 |
| 5 | bilibili《游戏策划案应该怎么写》/《江山》策划案 | 实例 | **第一章:游戏概述 1.1…**；强调少用专有名词 | 已读摘要 |
| 6 | bilibili《存档｜游戏设计文档 GDD》 | 结构清单 | 1.Introduction 2.Game Overview 3.Gameplay Mechanics 4.Story&Characters 5.Level Design 6.Sound&Music 7.UI&UX 8.Technical Specs 9.Marketing&Monetization 10.Production Plan | **已读原文** |
| 7 | bilibili《游戏开发文档(GDD) 模板》(2021) | 模板 | 游戏目标 / 亮点 / 目标玩家 / 玩法类型 / 剧情梗概 | 已读摘要 |
| 8 | 百度文库《游戏设计文档》 | 概述 | 玩法、系统、美术、技术、运营全覆盖；强调岗位对齐 | 已读摘要 |
| 9 | 原创力《游戏策划文档范例》(2026) | 范例 | 动态蓝图；核心创意/玩法机制/内容结构/技术需求/团队协作 | 已读摘要 |
| 10 | 百度文库《游戏策划书标准模板》等 15 篇合集 | 合集 | 同名模板大量转存（同质化，不重复计独立证据） | 线索 |
| 11 | 机核《别再盲目手搓游戏了》(2026-06) | 方法论 | **GDD**=世界观/全量核心机制/数值框架/关卡指南；**TDD**=状态管理/数据结构/网络同步；**SDD**=结构化规格驱动 AI 编码 | **已读原文** |
| 12 | 腾讯云《从零构建游戏:主循环、架构与网络同步》 | 技术文 | 主循环/FixedUpdate 与 Render 分离/钳制 elapsed/确定性是同步基础 | 已读摘要 |
| 13 | 腾讯云《从零构建 C++ 游戏引擎架构》 | 技术文 | 引擎子系统划分 | 已读摘要 |
| 14 | CSDN《大型多人在线游戏服务器引擎》 | 技术设计 | 第一章 引言与系统概述 `1.1 设计目标与挑战`…（**编号**） | 已读摘要 |
| 15 | 知乎《Game Engine Architecture 第1章》 | 译介 | 团队角色 / 运行时程序员 / 工具程序员（`1.1.1`） | 已读摘要 |
| 16 | 百度文库《游戏研发项目管理制度》 | 管理制度 | **ART Bible（美术圣经）：规定色彩体系、UI 组件库、角色设计规范**；SVN 版本管控 | 已读摘要 |
| 17 | CSDN《程序员做游戏美术，我用 AI 把成本压到接近 0》 | 实践 | 美术规范文档锁定风格基准，避免「拼凑感」 | 已读摘要 |
| 18 | 百度百科/教材《游戏美术设计》(2018) | 教材 | 目录含游戏概论与美术基础体系 | 线索 |
| 19 | 清华社《AIGC 游戏 UI 设计》 | 教材 | 第1章 游戏 UI 发展史 / 第2章 色彩组合与配色 / 第3章 图标设计（**编号**） | 已读摘要 |
| 20 | 豆瓣《游戏设计艺术》读书杂记 | 书评 | 美术 Bible：多名艺术家协作时保持一致性的文档 | 已读摘要 |
| 21 | 百度文库《游戏数值策划文档》 | 专项文档 | 一、总体目标与基本原则；成长曲线/战斗节奏/资源产销/复玩价值（**中文序号**） | 已读摘要 |
| 22 | CSDN《【游戏设计】数值设计》(2025) | 专项 | 数值=系统/经济/战斗/成长/付费的数学模型融合 | 已读摘要 |
| 23 | 原创力《游戏行业策划部数值策划手册》(2026) | 手册 | 第1章 数值基础与核心概念 `1.1 数值平衡理论`（**编号**） | 已读摘要 |
| 24 | 网易《休闲游戏立项规划》/ 百度文库《游戏立项计划书》 | 立项文档 | 目标市场/用户画像/竞品分析/核心需求 | 已读摘要 |
| 25 | CSDN《Claude Code Game Studios GDD 模板全解析》/ Gitee UPGRADING.md | AI 时代 GDD | 8 大必需章节、Game Feel 六大子结构、Cross-References 交叉引用表；art bible 作为阶段门禁产物 | 已读摘要 |

---

## 五、跨源频次（只数「已读原文/摘要」中明确出现的主题）

| 主题 | 命中源数（约） | 本项目对应章 |
|---|---|---|
| 概述/愿景/概念/卖点 | 20+ | 产品愿景 |
| 核心玩法/机制/循环 | 20+ | 核心玩法 / 游戏系统设计 |
| 世界观/故事/角色 | 18+ | 世界观与角色 |
| 美术/视觉风格 | 18+ | 美术设计（Art Bible 内容未独立成章） |
| 音频/音效 | 12+ | 音频设计 |
| UI/UX/界面 | 14+ | UI/UX 交互设计 |
| 技术/引擎/平台 | 15+ | 技术规格 / 性能与适配 |
| 关卡/内容 | 12+ | 关卡与内容设计 |
| 数值/经济/平衡 | 10+ | 数值设计 / 经济系统设计 |
| 商业化/盈利 | 10+ | 商业化设计 |
| 市场/用户/竞品 | 8+ | 市场分析 |
| 里程碑/制作计划/预算 | 10+ | MVP 规划 / 资源规划 |
| QA/测试 | 6+ | 测试与质量保障 |
| 运营/活动 | 5+ | 运营与活动 |
| 风险 | 5+ | 风险控制 |
| **Art Bible（色彩/组件库/角色规范）** | 4+ | **无独立章，散在 美术设计 里** |
| **交叉引用表 / 需求↔实现追踪** | 2+ | **无** |

⇒ 两处值得记的**真实缺口**（有跨源证据，不是我拍脑袋）：
1. **Art Bible 在行业里是独立交付物**（色彩体系 / UI 组件库 / 角色设计规范 / 资产命名与管线），本项目只用一个「美术设计」章装它；openagenticgame-gdd 甚至把「资产管线与命名规范」单列 `10.10`。
2. **Cross-References / 需求↔实现追踪表** 是 AI 时代 GDD 的新要求（Claude Code Game Studios 的 `tr-registry.yaml`），本项目没有。

---

## 六、诚实边界 & 别忘了的事

- **50 条里真正「已读原文」只有 7 条**（国际 3 + 国内 3 + PDF 1），其余是摘要或线索；中文文库多为转存，不能当权威源。
- 三份下载的真实 PDF 里，**GDD-template.pdf 成功提取全文**；`grand-theft-auto.pdf`（GTA 1995 真实 GDD）与 `Art-bible.pdf` 是扫描/编码型，环境无 `fitz` 且 pip 安装被终止，**没读到正文**，只标「已下载」。要真正核对需 OCR 或装 PyMuPDF。
- **本次结论不修改任何代码/章表**，只登记证据。
- **待办（别忘了）**：
  1. 把「去编号对游戏档证据不足」回写 `docs/ceshu-roadmap-status.md` 3.6 与 `docs/template-crosscheck-real-docs.md` 边界声明；
  2. 游戏档章表是否恢复编号 / 或改为「可选标签」，属产品决策，需用户拍板；
  3. 若拿到真实 GDD 样本，补做 `docs/template-crosscheck-game.md` 的逐章对拍；
  4. 补 Art Bible 独立章与交叉引用表的可行性评估（有跨源证据）。
