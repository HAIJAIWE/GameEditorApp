# 真实公开策划书结构横评（4 份，跨品类/跨年代）

> 目的：别再拿我们自造的合成样例自说自话——去看**真实、公开、可查证**的策划书到底怎么写，
> 再对照我们的 24 章 / 334 字段 schema。以下 4 份均来自公开渠道（可点开原链接核对）。

## 一、四份样本

| # | 文档 | 年份 | 品类 | 公开性 / 许可 | 它其实是「什么」 |
|---|---|---|---|---|---|
| 1 | **The Doom Bible**（Tom Hall） | 1992 | FPS | 公开分发（WPI 课程托管 PDF） | 叙事/关卡**设计圣经** + 媒体稿 |
| 2 | **Scrapbots** | 2019–20 | 桌游卡牌 | GitHub，CC BY-NC-SA 4.0 | **规则书式 GDD**（含数值） |
| 3 | **Cryptic** gamedesign | 2019–20 | 社区黑客游戏 | GitHub，AGPL | **里程碑功能清单** + 规格表 |
| 4 | **downflux/docs** | 2020–21 | RTS | GitHub，MIT | **技术架构文档**（无玩家向 GDD） |

## 二、各自的真实章节结构（照抄标题）

**1. Doom Bible** — `1. 命令行参数 / 2. 开场与演示循环 / 3. 控制面板 / 4. 玩法循环 / 5. 结束游戏 /
6. 角色 / 7–12. 第 1–6 章（剧情·演员·独特桥段·地图）/ 13. 商业版 / 14. 武器·物品 / 15. 媒体稿 /
16. 杂记 / 17. DOOM 日历 / 附录（术语·文件扩展名·工具·Bug）`
- 典型「叙事圣经」：**七成篇幅在剧情/角色/关卡**；`4. 玩法循环`只有一句「New 3-D engine」；武器只有定性描述，护甲值写成「?」；**没有经济、没有数值公式、没有平衡原则**。媒体稿里反而有最好的定位与差异化（对标 Wolfenstein 3-D）。

**2. Scrapbots** — `Summary / Design Goals / Feedback / Full Rules / Card List / Building`；规则正文：
`Gameplay / Setup / Turn Phases / Actions（买卡·组件·资源·造机器人·攻击）/ Dealing Damage（溅射·摧毁·创伤）/ Winning`
- 典型「规则书 GDD」：**几乎全在规则与数值**（每 10 点伤害一张创伤、溅射打相邻道、20 张创伤牌结束），定位/差异化只有两句（灵感来自 Dominion / Star Realms）；**没有美术/音频/技术/经济/市场/排期**。

**3. Cryptic** — 顶层是**按版本分的文件夹**（Pre-Alpha 1…4），每个版本一个 `Spielelemente.md`（德文「游戏元素」）：
`Pre-Alpha 1.0` 一张表：`状态 | 功能 | 后端 | 前端` + `Release: 27.05.2019`
- 典型「里程碑清单」：GDD 就是一串**带发布日期的功能条目**（登录、桌面、终端、Morphcoin 币、钱包、爆破攻击…）；愿景/剧情在另一份 Google Docs「概念规格表」里，代码库里**没有叙事 GDD**。

**4. downflux** — `design/{client, fsm, network, server}.md` + `api/` + `brainstorm/` + `blog/`
- 典型「技术设计档案」：**全是客户端/服务器/状态机/网络**，压根**没有玩家向 GDD**（无定位、无玩法、无关卡）。

## 三、横向覆盖矩阵（●有实质内容 / ◐沾边 / —没有）

| 我们的章 | Doom | Scrapbots | Cryptic | downflux |
|---|:--:|:--:|:--:|:--:|
| meta 文档信息 | ● | ● | ● | ◐ |
| vision 愿景/差异化 | ● | ● | ◐ | — |
| gameplay 核心玩法 | ◐ | ● | ◐ | — |
| combat 战斗 | ◐ | ● | ◐ | — |
| economy 经济 | — | ● | ◐ | — |
| numeric 数值/平衡 | — | ● | — | — |
| mvp 首个可玩范围 | ● | ◐ | ● | — |
| story 叙事 | ● | — | ◐ | — |
| systems 系统 | ◐ | ● | ● | ◐ |
| art 美术 | ◐ | ◐ | — | — |
| audio 音频 | ◐ | — | — | — |
| tech 技术 | ◐ | — | ● | ● |
| monetization 商业化 | — | — | ◐ | — |
| uiux 交互 | ◐ | ◐ | ● | ◐ |
| level_design 关卡 | ● | ◐ | — | — |
| qa / resources / market / risk / a11y / live_ops / analytics / publishing / performance | 基本全 — | — | — | — |

**一句话：四份真实文档，没有一份覆盖超过我们 24 章的三分之一；它们各自只填了不同的「一片」。**

## 四、由此得到的 5 条结论

1. **真实 GDD 高度异质，不存在「标准 24 章」。** 叙事游戏写剧情/关卡（Doom），规则游戏写规则/数值（Scrapbots），社区项目写里程碑清单（Cryptic），工程向项目写技术架构（downflux）。我们那张 24 章表是**现代生产型 GDD 的超集**，不是行业通用模板。

2. **四份文档的共同交集只有三样：概念/定位 + 核心规则/玩法 + 内容/范围清单。** 这恰好约等于我们的 **`concept` 立项阶段 7 章**——**这反过来验证了阶段分层是对的**：真实早期文档就是「短」的，逼用户一上来面对 24 章本来就不对。

3. **现代 release 章（market/risk/a11y/live_ops/analytics/publishing/performance）在真实老文档里几乎为零。** 说明机读/发行相关章应继续**分层、后置、非必填**——我们已经这么做了（机读分区 + 发行阶段），方向对。

4. **「必填」比真实文档重。** 真实文档里 economy（Doom 完全没有）、combat（非战斗品类没有）都是空的。→ 继 combat 之后，**economy 这类章也应考虑「按品类条件必填」**（叙事/纯规则品类可免），否则立项稿会被伪必填压低。

5. **早期文档的「MVP」往往就是一张功能表（Cryptic）**，不需要长文。→ 我们的 `mvp_scope`（pipeList）方向对，但**不该要求叙事长文**；轻量清单即可。

## 五、对我们 schema 的具体建议（按性价比排序）

| 建议 | 依据 | 动作 |
|---|---|---|
| ✅ 保留阶段分层 | 真实早期文档只覆盖 concept 7 章 | 已做，继续 |
| ✅ 机读/发行章后置、非必填 | 真实文档几乎不含 | 已做，继续 |
| ⬜ 把 **economy** 也做成「按品类条件必填」 | Doom 无经济；Scrapbots 有 | 与 combat 同机制，扩展 `NON_ECONOMY_GAME_TYPES` |
| ⬜ concept 阶段「必填」再降一档 | 真实文档连 core_loop 都可能不写 | 评估 concept 必填是否过重（如 mvp_timeline 常缺） |
| ⬜ 文档里明示「24 章是菜单不是清单」 | 真实文档各取一片 | UI 文案/引导说明 |

> 结论：**我们的 schema 不是「错」，而是「按现代生产型 GDD 设计的超集」**。真实文档是它的子集，且各取所需——
> 这正是为什么必须有阶段分层与条件必填，而不是把 334 字段一次糊到用户脸上。

## 六、来源与许可（可核对）

1. Doom Bible — Tom Hall, 1992；公开 PDF：`https://www.cs.wpi.edu/~imgd1001/a08/projects/proj2/doomBible.pdf`
2. Scrapbots — `https://github.com/david-torres/scrapbots`（README.md / RULES.md），CC BY-NC-SA 4.0
3. Cryptic gamedesign — `https://github.com/cryptic-game/gamedesign`（`Pre-Alpha 1/Spielelemente.md`），AGPL
4. downflux/docs — `https://github.com/downflux/docs`（`design/*.md`），MIT
