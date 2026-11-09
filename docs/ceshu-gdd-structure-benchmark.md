# GDD 结构行业对标与落地（「叫章节好吗？」）

> 触发：用户质疑「章节」这个词，要求看 GitHub / 知名社区怎么写、怎么训练，以及程序员侧要什么。
> 结论：**「章节」这个词没错，错的是一个词指了两样东西**。行业判死刑的是「装订成一本的大部头」，
> 不是「一章一个文件」。我们要补的不是改名，是工程文档三件套。

## 一、行业事实

| 来源 | 关键事实 | 对我们的含义 |
|---|---|---|
| [Stone Librande《One-Page Designs》GDC 2010](https://www.gdcvault.com/play/1012356/One-Page) | 把「Design Bible 设计圣经」与「一页纸设计」对立；灵感来自乐高说明书与建筑蓝图，目标是**信息流**不是文档 | 章节式大部头是旧范式；图/表 > 长文 |
| [Nuclino GDD 指南（2026-01）](https://www.nuclino.com/articles/game-design-document-template) | “Rigid, multi-page GDDs have no place in modern game development”；引 Jim Highsmith：「拥抱文档，但不是几百页从不维护的巨著」；建议一页起步 → 按主题拆独立文档 → wiki 化 | 不要装订成一本；按主题拆、持续更新 |
| [GitHub `openagenticgame-gdd`](https://github.com/wanghaisheng/openagenticgame-gdd) | **每个章节一个独立 Markdown 文件**，「避免传统 PDF/Word 在协作与迭代上的限制」；明说 md-first for AI agents | 我们 `design/<章>.md` 同路 |
| [Google 设计文档范式（Malte Ubl）](https://www.industrialempathy.com/posts/design-docs-at-google/) | Context & scope / **Goals and non-goals** / Actual design / **Alternatives considered** / **Cross-cutting concerns** / Length | 程序员读的是**决策文档**，不是叙事 |
| Jesse Schell《The Art of Game Design》 | 100+ 「透镜」= 提问清单，不是模板；文档是**思考工具** | 训练的是问对问题，不是填满章节 |
| [Charon 等数据编辑器](http://www.gamedevware.com/) | 设计数据进表格 → 生成源码/配置，与电子表格集成 | 数据要表格化，别写进散文 |

一句话：**「章」作为单位合法，非法的只有「装订成一本」。**

## 二、我们其实已经对了

- `design/<章>.md` + `data/<章>.json` —— 一章一文件（现代做法）
- 交接包 7 卷 / 二十多份编号文档 —— 按**开发顺序**重组（不是按阅读顺序）
- `schema.json` + `contract.json` + 门禁 —— 数据契约与验收

## 三、词汇纪律（本次修掉的真实冲突）

| 层 | 单位 | 面向 | 顺序 |
|---|---|---|---|
| 策划书 | **章**（24 个设计域，含文档信息） | 人读、填完成度 | 阅读序 |
| 交接包 | **卷 + 编号文档**（7 卷） | 工程师 / AI 施工 | 开发序 |

交接包 README 原先把 7 个**卷**写成「7 个章节文件夹」——同一个词两个意思，工程师会以为有 7 个设计章。
已改为「卷文件夹」，并在 `ceshuHandoff.test.ts` 锁死「不含『个章节文件夹』」。

## 四、落地：工程文档三件套

### 1. 来源章回链

每份交接文档头部新增：

```
> 来源：第十章·技术规格（gdd.md#ch11）
```

- 单源：`chapterAnchorOf(key)`（`shared/ceshuConstants.ts`），索引 = `CHAPTER_KEYS` 位置 + 1。
- **注意不等于 `chapterNumber`**：meta 章号是 0 但锚点是 `ch1`，编号章锚点也比章号大 1（第十六章 → `ch17`）。
- 守卫：`来源锚点在 gdd.md 里真实存在`——锚点与目录脱钩会立刻红。

### 2. 方案取舍（Alternatives considered）

新增 `meta.alternatives`（pipeList）：

| 决策 | 候选方案 | 为什么不选 | 结论 |
|---|---|---|---|
| 引擎 | Unity | 包体大 30%，首包超 200MB | Godot |

- 挂在 `arch-scope`（范围与平台），**不新增文档**：避免架构卷 8 份文档重排编号、打断「最后一份」断言。
- `CHAPTER_GENERATION_HINTS.meta` 已要求「一句话生成」路径产出它，否则 AI 只会写「经过考虑」。
- schema 守卫基线 347 → 348，meta 12 → 13。

### 3. 横切关注点（索引，不是第 6 份文档）

README 新增 `### 横切关注点（每个功能都要过一遍）`：

| 关注点 | 看哪份文档 | 每个功能都要问 |
|---|---|---|
| 性能预算 | `05-打磨/01-性能预算.md` | 最低配掉多少帧？预算里有没有它的份额？ |
| 存档与兼容 | `00-架构/05-存档与兼容.md` | 这个功能的状态存不存？旧档缺字段怎么读？ |
| 本地化与无障碍 | `05-打磨/03-本地化与无障碍.md` | 文案全走本地化表？色盲/字幕/按键重映射覆盖了吗？ |
| 服务端与联机 | `00-架构/08-服务端与联机.md` | 客户端判定还是服务端判定？掉线怎么恢复？ |
| 数据表与内容管线 | `00-架构/03-数据表与内容管线.md` | 数据进表了吗？还是硬编码？ |

**为什么不做成独立文档**：这些关注点已各有文档。再写一份汇总，同一字段就是第二个真源，
校验问题还会被重复归属到两份文档（`coveredFields` 判重会失真）。索引表只回答「去哪看 + 问什么」，
路径从真实规划派生——条件文档没触发就不出现，守卫「不给死链」。

## 五、验证

| 闸 | 结果 |
|---|---|
| `vitest run` | 225 文件 / **2978 测试通过**（新增来源回链 2 + 三件套 3） |
| `tsc --noEmit` × 3 配置 | 0 错 |
| `eslint`（改动文件） | 0 错 |
| `npm run build` | OK |

## 六、下一步（未做，等需求触发）

- **工程层模块号**（B 方案）：交接包文档改成 `M01…`，策划书 TOC 保留「第X章」。
- **全面去章节化**（C 方案）：不推荐——用户是「普通人一句话生成」，24 章是完成度脚手架，
  换成「模块 M01」是行业黑话，对他们是负资产。

## 七、学术侧证据（论文怎么说）

> 检索时间 2026-10-28。**先说没有的**：没有检索到「GDD 应该分几章 / 叫章节还是模块」的同行评审实证研究——
> 这个问题在学界没有定论，属于行业实践。但下面四组文献是真实的，且直接支撑或修正了我们的做法。

### 7.1 设计理由（Design Rationale）：为什么要写「为什么不选」

| 文献 | 结论 | 对我们的意义 |
|---|---|---|
| Burge & Brown, *Software Engineering Using RATionale*, Journal of Systems and Software, 2008（被引 98） | 记录决策理由对维护、复用、学习有直接价值；理由缺失时维护者只能靠猜 | 支撑 `meta.alternatives` 的存在 |
| Conklin & Begeman, gIBIS (1988)；MacLean et al., QOC (1991)；Buckingham Shum et al., *15 Years on from gIBIS and QOC* | QOC = Question / Options / Criteria：把「问题—候选—评价标准」显式化，比只记结论更能支撑后续修改 | 我们四列（决策/候选/为什么不选/结论）≈ QOC + 结论 |
| *Capturing Design Decision Rationale with Decision Cards*, Springer, 2017 | 轻量卡片式记录比重型 DR 系统更可能被真正使用 | 一行一条的 pipeList 是对的，别做复杂表单 |

### 7.2 架构决策记录（ADR）：我们漏了「后果」和「状态」

Nygard 2011 的 ADR 模板是 **Context / Decision / Status / Consequences**，常见变体再加
**Considered Options + Pros and Cons**；[arc42 §9](https://docs.arc42.org/section-9/) 明确说团队常见病是
「知道决策，但不知道决策背后的动机」。

对照我们的 `meta.alternatives`：

| ADR 要素 | 我们有吗 |
|---|---|
| Context（约束 / 上下文） | 部分（`meta.platform` / `meta.non_goals`） |
| Considered Options（候选方案） | ✅ |
| Pros and Cons（为什么不选） | ✅ |
| Decision（结论） | ✅ |
| **Consequences（选了的代价 / 后果）** | ❌ 缺 |
| **Status（提议 / 已接受 / 已废弃 / 被取代）** | ❌ 缺 |

→ 建议补两列：`cost`（代价/后果）与 `status`（状态）。没有「后果」，实现方只知道不能选什么，
不知道要为此承受什么；没有「状态」，决策被推翻后旧记录看起来仍然有效。

### 7.3 横切关注点：学界原意是「代码模块化」，不是「文档汇总」

Kiczales et al., *Aspect-Oriented Programming*, ECOOP 1997（被引 479）：横切关注点会在实现层被
「打散、缠绕」，应抽成独立模块（aspect）。

这支持「把横切关注点显式命名」，但**不构成「必须写一份汇总文档」的论据**——代码模块化与文档去重是两件事。
我们的选择（索引表 + 各自文档）符合单一真源原则，也与 Behutiye, Rodríguez & Oivo 2022
（敏捷下**质量需求**文档最容易被欠账）一致：性能 / 本地化 / 无障碍正是最容易被欠账的那类。

### 7.4 游戏侧：文本 GDD 传不动「手感」

- IADIS IJWI 2025《AI-Generated Video as a Prototyping Language for Game Design Communication》：
  明确指出「传统文本设计文档常常无法把细微的游玩体验传达给非游戏专家」，主张用 AI 生成视频做沟通媒介。
- arXiv 2105.14137《What Makes a Game High-rated? Towards Factors of Video Game Success》：
  把开发者复盘（postmortem）当研究数据源——说明**复盘文本**在业界是可信的一手材料。

→ 对我们的含义：文档不该是唯一载体，`prototype/demo.html` 与图表（`ceshuDiagrams`）要更靠前；
但「文档 + 可玩原型」的分工本身是对的。

## 八、面向智能体的接口补强（2026-10-28）

### 8.1 智能体为什么读 md / 文件

| 机制 | 说明 |
|---|---|
| 外部记忆 | 项目装不进 prompt；文件是磁盘上的工作记忆，agent 用 read_file 按需取 |
| 渐进披露 | 标题层级天然是检索边界（`##` 切块），RAG 与「只读这一份」都靠它 |
| 可 diff / 可回滚 | git 能看出改了哪一行，改坏能退；docx/pdf 做不到 |
| 人机同源 | 同一份文件既能给人审也能给模型读，避免两份真源 |
| 零工具依赖 | 任何 IDE / CLI / agent runtime 都能读纯文本 |

**md 负责意图，JSON 负责契约**——这正是双轨导出的分工。

### 8.2 智能体执行任务需要四样，本项目的覆盖

| 需要 | 产物 | 状态 |
|---|---|---|
| 意图（做什么 / 为什么 / 不做什么） | `gdd.md` + `meta.non_goals` + `meta.alternatives` | ✅ |
| 规格（怎么实现 / 模块边界 / 接口） | 交接包 7 卷 / 编号文档（每份 100–200 行） | ✅ |
| 数据（数值 / 内容） | `schema.json` + `data/snapshot.json` | ✅ 唯一内容源 |
| 验收（怎么算做完） | `contract.json` + 文档验收（带 id 与判定方式） | ✅ |

### 8.3 本次补的四个缺口

**① `index.json`（机读清单）** — schema `mb-handoff-index/1`

与 README 同源派生（同一份 `planHandoffDocs` + `buildHandoffPlan`），README 给人、清单给机器。
含 `game / genre / precedence / files / volumes / docs`；每份文档带
`path / volume / number / layer / 门禁(fieldFilled/fieldTotal/ready/blockers) / dependsOn / minimalContext / roles / acceptance[]`。
**智能体不必再解析 Markdown 表格**——解析失败就退回「凭感觉挑一份」，是长任务跑偏的常见起点。

**② 顺序开发（不是通读）**

交接包是**一条开发队列**，不是一本要读完的书。`index.json` 里写死：

```json
{
  "readingPolicy": "sequential",
  "start": "00-架构/01-范围与平台.md",
  "sequence": ["00-架构/01-范围与平台.md", "00-架构/02-引擎与技术栈.md", "…"],
  "docs": [{ "path": "…", "next": "00-架构/02-引擎与技术栈.md", "minimalContext": ["contract.json"] }]
}
```

`next` 是**全局链**（跨卷也串起来），agent 做完一份直接拿下一份，不用自己找。

开工只读 **1–2 份**（不是 3 份）：

```
- 开工只读：本文档 + `contract.json`（上游是上一轮刚做完的，不必重读）
```

进入新卷的第一份时多读一次卷目录做定位。上下文窗口有限，20+ 份全读会爆，注意力也会被无关内容稀释。

**③ 验收可机判（2026-11-09 升级：判定方式从 3 种扩到 5 种，且真的跑）**

```ts
type HandoffAcceptanceCheck = 'assertion' | 'data' | 'field' | 'test' | 'manual'
type HandoffAcceptance =
  | string
  | { text: string; check?: HandoffAcceptanceCheck; match?: string; fields?: ReadonlyArray<{ chapter: ChapterKey; field: string }>; how?: string }
```

字符串 = 人工判定（老包渲染逐字不变、不用改）；对象 = 显式标注。
`index.json` 里每条验收都有稳定 id（`<docId>-a1`）与 `check`。

**为什么从 3 种扩到 5 种**：只有 `assertion` 能覆盖数值，而原来的 99 条验收里 94 条是自然语言
（`manual`）——编码智能体只能「觉得自己做完了」。实测把判定方式扩到五种后，机判占比约 **75%**：

| `check` | 谁来判 | 判什么 | 结论口径 |
|---|---|---|---|
| `assertion` | 机器 | 拿 `contract.json` 的断言按 `match` 关键词命中后复算 | pass / fail / skip |
| `data` | 机器 | 拿「设计 ↔ 数据表核对」比设计里声明的表（在不在、条数、字段） | pass / fail / skip |
| `field` | 机器 | 拿策划书字段本身核对「这条设计到底写没写」（支持点路径） | pass / fail / skip |
| `test` | 人/CI | 必须真跑自动化测试 | 恒 `unverified` |
| `manual` | 人 | 人工判定（`how` 写清怎么验） | 恒 `unverified` |

`test` / `manual` **永不**由机器盖章——否则整条「让 AI 开发」的链路又回到「AI 自述完成」。
`field` 的 pass 只证明**设计层面**写了，不等于代码按它实现（evidence 里会写明这一点）。
`match` 用关键词而非断言 id：断言 id（A1/A2）按行序算，插一行就整体错位，写进文档会一改就失效。


**④ 冲突裁决优先级**

`HANDOFF_PRECEDENCE`（README 与 index.json 共用）：

1. `contract.json` —— 规则 / 参数 / 断言 / 验收旅程
2. `data/snapshot.json`（结构见 `schema.json`）—— 内容行唯一来源
3. 交接文档 —— 施工步骤与验收
4. `gdd.md` —— 背景与理由；与上面冲突时以上面为准
5. `prototype/demo.html` —— 手感参考；代码结构不照抄

### 8.4 一个可测的质量指标

**零上下文交接成功率**：找一个没参与设计的 agent，只给交接包，看它实现出来的东西与设计意图差多少。
这比「文档写了多少字」有用得多，而且直接检验产品核心价值——不是「生成了一份文档」，
而是「**换一个 agent 也能照着做对**」。

### 8.5 验证

| 闸 | 结果 |
|---|---|
| `vitest run` | 225 文件 / **2984 测试通过**（新增清单守卫 6 条） |
| `tsc --noEmit` × 3 | 0 错 |
| `eslint` | 0 错 |
| `npm run build` | OK |

## 九、2025–2026 热点与实证（补检索）

### 9.1 三个热词

| 概念 | 是什么 | 代表 |
|---|---|---|
| **Spec-Driven Development（SDD）** | 先写结构化规格，再拆成设计 / 任务；规格是 agent 的真相源 | [Thoughtworks Radar 2025-11](https://www.thoughtworks.com/en-au/radar/techniques/spec-driven-development)（评级 **Assess**）、[GitHub Spec Kit](https://github.com/github/spec-kit)、Amazon Kiro、Tessl |
| **Context Engineering** | 决定「哪些信息进上下文」：写 / 选 / 压 / 隔 | 《A Survey of Context Engineering for LLMs》(2025-07)、Anthropic《Context Engineering for Agents》 |
| **AGENTS.md** | 仓库级上下文文件的事实标准（60k+ 仓库，Linux Foundation AAIF 托管） | OpenAI / Anthropic / Google 联合推动 |

Thoughtworks 对 SDD 的评级是 **Assess**（不是 Adopt），并提醒：工作流仍繁琐且强观点、
容易生成难以评审的长规格、PRD/用户故事的目标读者常不明，可能在重蹈「bitter lesson」
（手工给 AI 写细规则最终不 scale）。

### 9.2 一篇直接打靶的实证

**《Evaluating AGENTS.md: Are Repository-Level Context Files Helpful for Coding Agents?》**
（[arXiv 2602.11988](https://arxiv.org/html/2602.11988v1)）

- 规模：12 个仓库 / 138 个真实 issue（从 5,694 个 PR 筛出）/ 4 组 agent（Claude Code+Sonnet-4.5、Codex+GPT-5.2、Codex+GPT-5.1 mini、Qwen Code）/ 三组对照（无文件、LLM 生成、人写）
- **LLM 生成的文件**：成功率 **-0.5%**（SWE-bench Lite）/ **-2%**（AGENTbench），成本 **+20~23%**，步数 +2.45~3.92
- **人写的文件**：**+4%** 边际提升，但步数 +3.34、成本最高 +19%
- agent **确实照做**（文件里提到 `uv`，平均用 1.6 次/实例；没提则 <0.01），所以不是「不听话」；
  是**过度探索 + 推理负担**变重（跑更多测试、grep 更多文件、思考更多）
- 上下文文件**没有加快**定位相关文件的速度
- **反转实验**：把仓库所有文档删掉、让上下文文件成为唯一文档来源后，LLM 生成的文件反而 **+2.7%**
  ⇒ 它的价值是**补文档空缺**，不是加额外指引
- 作者建议：别用 LLM 自动生成的上下文文件；人写也只写**最小必要**（如必须用的工具），
  不要写文件概览与探索提示

### 9.3 对我们产品的含义（关键）

| 我们的东西 | 属于哪一类 | 论文怎么说 |
|---|---|---|
| `contract.json` / `data/snapshot.json` | 可执行的**内容与契约** | 不是「上下文文件」，是规格本体 → 不受这条负收益影响 |
| 交接包 20+ 份文档 | **要实现的内容**（施工图） | 若被当成「给 agent 的行为指引」，就会落进 -2% 区间 |
| `index.json` + README 5 条规则 + 优先级链 | 行为指引（**薄**） | 越薄越好；别把 348 个字段的细节塞进指引层 |
| 24 章策划书 | **补文档空缺** | 正是论文里 +2.7% 的那种价值 |

**结论**：把「指令层」保持薄（`index.json` + 5 条全局约束 + 优先级链），把「内容层」做厚
（章节 / 数据 / 契约）。一旦把 20+ 份施工文档当成「agent 行为守则」来读，就会重演论文里的负收益。
这也是「一次只读一份、开工只读本文档 + contract.json」的实证依据。

## 十、游戏开发侧：技术面与论文地图

### 10.1 这个项目实际碰到的游戏技术

| 层 | 具体实现 | 对应岗位 |
|---|---|---|
| 设计规格 | 24 章 / 348 字段（系统、数值、关卡、剧情、UI、运营、埋点…） | 系统 / 数值 / 关卡 / 剧情策划 |
| 数值 | 参数表 + 断言复算（表达式求值、容差、验收条件） | 数值策划 |
| 经济 | 货币 sources / sinks、掉落表、生产链、通胀控制 | 经济系统设计 |
| 数据 | SQLite 行数据 + Excel/CSV 导入导出 + 分桶（skills / roles / monsters / equips / items） | 技术策划 / 数据管线 |
| 引擎集成 | Unity（`.cs`）/ Unreal（`.h`）/ Godot（`.gd`）/ Cocos2d（`.json`）/ Lua | 客户端 / 技术策划 |
| 原型 | 单文件 HTML（`RULES` 常量 = 参数表，零外部依赖、离线可玩） | 原型验证 |
| 验收 | 验收旅程、测试用例、机读 `contract.json` | QA |
| AI | LLM 编排、提示词、双轨 bundle、交接包 | AI 工程 |

**没碰的（别对外宣称）**：引擎内运行时、PCG 算法（WFC / MCTS / RL）、自动化试玩、真机性能 profiling。

### 10.2 论文地图

| 论文 | 一句话 | 对我们的意义 |
|---|---|---|
| Gallotta et al., *Large Language Models and Games: A Survey and Roadmap*, **IEEE ToG 2024**（arXiv 2402.18659，被引 255） | LLM×游戏的第一份系统综述；点出幻觉、长会话记忆、成本/延迟、IP 四大限制；roadmap 明确要「procedural assistance：AI 解释它为什么这样设计」 | **我们的 `meta.alternatives` 正好是这条 roadmap**；「长会话记忆」限制 = 交接包分片 + `index.json` 的动机 |
| Serra et al., *PromptingGameCraft*, SBGames 2025 | 把 GDD 自动转成游戏代码 | 与我们的链路同构；差异化在**中间那层**：可机判契约 + 分卷施工图 |
| *Synergizing Code Coverage and Gameplay Intent*（arXiv 2512.12706） | LLM 引导 RL 做覆盖感知的试玩测试 | 我们的验收旅程还是自然语言；可执行化是下一步 |
| Beau & Bakkes, *Automated game balancing of asymmetric video games*, 2016 | Monte Carlo 模拟自动平衡非对称游戏 | 我们只做断言复算，不做平衡搜索——**别把「断言通过」说成「数值平衡」** |
| Zook & Riedl, *MCTS for Simulation-based Strategy Analysis*, FDG 2015 | 用 MCTS 模拟试玩分析策略 | 同上：我们没有模拟器 |
| *Game Description Generation*（IEEE 2025） | 自然语言 → 游戏描述语言（GDL） | 「一句话生成」的学术近邻 |
| PCGRLLM（arXiv 2502.10906） | LLM 设计 PCG 的奖励函数 | 内容生成侧，我们未涉及 |

### 10.3 结论

- 我们站在 **「设计 → 规格 → 数据 / 契约」** 这一段，不碰运行时与 PCG。
- Gallotta 的 roadmap（让 AI 解释设计选择）与我们的 `alternatives` 撞上了，说明方向对；
  但他们也提醒：LLM 在游戏里最大的坑是**幻觉与长会话记忆**——这正是「契约可机判 + 一次一份」要解的。
- **话术纪律**：能说「数值可复算、契约可机判」，不能说「自动平衡」；能说「生成可玩原型」，
  不能说「生成游戏」。

### 10.4 引用纪律（哪些能对外讲）

用户 2026-10-28 追问「论文是不是近期的、知名的」——诚实分级如下。**只有 3 篇同时满足「近期 + 知名」**。

| 论文 | 年份 | 出处 | 知名度 | 能不能对外引 |
|---|---|---|---|---|
| Gallotta et al.《Large Language Models and Games: A Survey and Roadmap》 | 2024 | **IEEE ToG** | 高（被引 255；Togelius / Yannakakis / Liapis 是游戏 AI 头部） | ✅ 首选锚点 |
| Voyager（NVIDIA, Jim Fan 等） | 2023 | arXiv 2305.16291 | 极高 | ✅ 讲「LLM 在游戏里自主学技能」 |
| GameNGen《Diffusion Models Are Real-Time Game Engines》 | 2024 | arXiv 2408.14837（Google） | 极高（媒体广泛报道） | ✅ 讲「生成式游戏引擎」 |
| Generative Agents | 2023 | UIST | 极高 | ✅ 讲 NPC 社会模拟 |
| ReAct | 2022 | ICLR | 极高 | ✅ 讲 agent 基本范式 |
| A Survey on LLM-Based Game Agents | 2024/2025 | arXiv 2404.02039 | 中高 | ⚠️ 可引，作补充 |
| Evaluating AGENTS.md | 2026 | arXiv 2602.11988 | **未知**（新 preprint） | ⚠️ 只作内部决策依据 |
| PromptingGameCraft | 2025 | SBGames | **低**（且只看到二手转述） | ❌ 不要引 |
| 自动平衡 / MCTS 试玩 / PCGRLLM / GDG | 2015–2025 | 各会议 | 低—中 | ⚠️ 只在专业语境提 |

**原则**：对外只引「高知名度 + 读过摘要」的；小圈子论文可以指导自己的决策，
但别拿来当「研究证明」。本文件第九、十节里标了「未读原文 / 二手」的，都属于后者。

## 十一、附录：游戏开发知识地图（哪些该读、哪些别碰）

### 11.1 八块内容与权威来源

| 领域 | 核心内容 | 权威来源（热门/经典） | 类型 |
|---|---|---|---|
| **设计** | 核心循环、系统、数值、关卡、叙事、UI/UX、手感 | **MDA**（Hunicke / LeBlanc / Zubek, 2004，引用极广）；Jesse Schell《The Art of Game Design》（100+ 透镜）；Tracy Fullerton《Game Design Workshop》；Steve Swink《Game Feel》 | 学术 + 行业圣经 |
| **程序** | 引擎架构、渲染、物理、动画、网络、AI、工具链、性能 | Jason Gregory《Game Engine Architecture》（引擎圣经）；Robert Nystrom《Game Programming Patterns》（免费在线）；《Real-Time Rendering》；Glenn Fiedler《Fix Your Timestep!》/ Gaffer on Games | 行业圣经 |
| **美术** | 概念、建模、贴图、动画、特效、UI | Richard Williams《The Animator's Survival Kit》（动画圣经）；GDC Art Track；Substance / Unreal 官方文档 | 行业 |
| **音频** | 音乐、音效、动态音频、空间音频 | Wwise / FMOD 官方文档；《The Essential Guide to Game Audio》；GDC Audio Track | 行业 |
| **生产** | 敏捷、里程碑、风险、外包、范围控制 | 《The Game Production Handbook》(Heather Chandler)；GDC Production Track；《Blood, Sweat, and Pixels》（纪实） | 行业 |
| **QA** | 功能、兼容、性能、自动化、试玩 | ISTQB 游戏测试；GDC QA Track；学术：automated playtesting（MCTS / RL / LLM） | 行业 + 学术 |
| **运营/商业化** | 留存、付费、活动、赛季、数据分析 | Will Luton《Free-to-Play》；Deconstructor of Fun；GDC Free-to-Play Summit | 行业 |
| **AI × 游戏（当前最热）** | LLM NPC、PCG、生成式引擎、AI 辅助生产 | **Gallotta et al. 2024 IEEE ToG 综述**（被引 255）；Voyager 2023；GameNGen 2024；Generative Agents 2023；ReAct 2022 | 学术 + 行业 |

**注意**：游戏开发的大部分权威知识在**书和 GDC 演讲**里，不在论文里。
论文强在 AI / PCG / 渲染，弱在设计 / 生产 / 运营。别指望用论文覆盖全栈。

### 11.2 2026 年在热的三件事（有数据）

| 趋势 | 数据 | 来源 |
|---|---|---|
| **AI 工具普及，但从业者反感上升** | 2,300+ 从业者中 **52%** 认为生成式 AI 对行业有负面影响；**视觉美术 / 技术美术高达 64%** | GDC《2026 State of the Game Industry》(2026-01) |
| **做小体量、降风险** | 工作室普遍缩小规模、用 AI 提效但避免玩家污名与流程疲劳 | Unity《2026 Game Development Report》 |
| **AI 玩法真正落地** | 中国收入 TOP50 游戏企业 **80%** 已布局 AI；美术/设计类工具占 57.4%；TOP100 手游 **15%** 接入 AI 玩法，流水占比 42.6% | 伽马数据《2026 中国游戏产业 AI 发展报告》(2026-07) |

### 11.3 对本项目的取舍

- **要覆盖**：设计（第 1 块）、生产（第 5 块）、QA（第 6 块）——这正是「设计 → 规格 → 数据/契约」的位置。
- **不要碰**：渲染 / 物理 / 网络 / 音频实现（第 2、4 块的实现层），读了也用不上。
- **必读三样**：MDA（设计语言）、Schell 的透镜（提问清单）、Gallotta 综述（AI×游戏唯一权威地图）。
- **必须知道的反方数据**：GDC 2026 的 52% / 64%。做 AI 辅助设计工具，这个数字绕不过去，
  产品话术要正面回答——不是「AI 替代策划」，而是「AI 干掉重复劳动，判断仍归人」。

### 11.4 实现层四条底线（2026-10-28 落地）

原则：**只加设计侧该定的约束，不加实现方案**。判断标准仍是「换引擎/换程序后这条规格是否还成立」。

| 层 | 底线 | 载体 |
|---|---|---|
| 渲染 | 目标机型帧率 + **画质档位**（各档降什么） | `performance.performance_budget`（含 `method`）+ **新增** `performance.quality_tiers` |
| 物理 | **判定形状 / 无敌帧 / 霸体**（游戏里的「物理」多数是判定） | **新增** `combat.hit_detection` |
| 网络 | **同步模型 / 权威端 / 回滚 / 断线恢复** | **新增** `tech.sync_model` + `tech.net_protocol`（含 `authority`） |
| 音频 | 事件→音效 + **并发上限** | `audio.sfx_events`（含 `concurrency`） |

每块至少一条**可机判验收**（`check: 'test'`）：

| 层 | 验收 |
|---|---|
| 渲染 | 按预算表的测量方法实测，各画质档位达到对应帧率目标 |
| 物理 | 同类攻击同输入在无头模拟中判定结果一致（可复现） |
| 网络 | 弱网（200 ms RTT / 5% 丢包）下能重连并续局，不刷资源 |
| 音频 | 同屏并发音效数不超过 `sfx_events` 的并发上限，无爆音 |

**不加**：物理引擎参数、shader 方案、混音总线、同步算法——这些实现层。
字段总数 348 → **351**；`CHAPTER_GENERATION_HINTS` 已点名新字段（AI 全量生成时会产出）。

### 11.5 并行度（2026-10-28 落地）

卷依赖图**不是链**：

| 波次 | 卷 | 文档数 |
|---|---|---|
| 第 1 波 | `00-架构` | 7 |
| 第 2 波 | `01-核心玩法` | 4 |
| 第 3 波 | **`02-内容` / `03-系统` / `04-界面`** | 12 |
| 第 4 波 | `05-打磨` | 3 |
| 第 5 波 | `06-研发` | 1 |

**内容 / 系统 / 界面三卷可以同时开工**——它们都只依赖核心玩法，彼此无依赖，
而且**没有跨卷共享字段**。串行做完等于把工期拉长近一倍。

判据：

- **卷级**：`requires` 为空 = 第 1 波；否则 = 依赖里最深的波 + 1。同波可并行。
- **文档级**：同波**跨卷**文档若共享字段（`章.字段`），并行前必须先约口径，否则两边各写一套。
  同卷内共享字段是顺序关系的预期行为，不报（第一版筛漏了，会把 `00-架构` 内部的顺序对误报成并行冲突）。
- **最长链**按文档数计——**没有工时数据，不叫关键路径**，别对外吹「关键路径分析」。

已进 `index.json` 的 `parallelism{waves, parallelGroups, conflicts, longestChain}`，
README 也有「### 并行机会（同波可同时开工）」段。

### 11.6 UI 入口（2026-10-28 落地）

| 入口 | 位置 | 回答什么 |
|---|---|---|
| **影响面** | 字段头按钮（只给被交接文档引用的字段） | 改这个字段会波及哪些文档 / 断言 / 同源字段 / 数据侧 / 验收 |
| **开发路线** | 「更多 ▸」菜单 | 几波、每波能并行做什么、每份文档门禁过没过 |

实现纪律：**面板在宿主（`CeshuView`）渲染，表单只发信号**（`onShowImpact(chapter, field)`）。
`ChapterForm` 不接收整份 `doc`——它只需要当前章的数据；把整份文档塞进去会让 props 膨胀，
也会让表单测试被迫构造完整文档。

### 11.7 可开发性检查（字段联动，2026-10-28 落地）

完备度只回答「填了没」，但**填了也可能没法实现**。用声明式规则表达「A 填了，B 就不能空」：

| 填了这个 | 就必须填 | 缺了会怎样 |
|---|---|---|
| `combat.damage_formula` | `combat.hit_detection` | 攻击「打没打中」只能由程序自己拍 |
| `performance.performance_budget` | `performance.quality_tiers` | 低端机该降什么没有依据，掉帧时临时砍 |
| `gameplay.core_loop` | `gameplay.state_machine` | 核心循环落不到场景流程 |
| `economy.currency_types` | `economy.source_sink` | 经济无法闭环，通胀只能事后救火 |
| `audio.sfx_list` | `audio.sfx_events` | 程序不知道「什么操作播哪个音」 |
| `art.art_style` | `art.asset_spec` | 交付与导入会乱 |
| `level_design.level_table` | `level_design.content_estimate` | 工期与人力没法排 |
| `tech.online_mode`（非 none） | `tech.net_protocol` + `tech.sync_model` | 联机一致性无法保证，改架构等于重写 |

挂在 `CESHU_CHECKS` 最后一项（`fieldCoupling`），产出「可开发性缺口」文案，校验面板直接可见。

**为什么用声明式规则而不是解析散文**：规则本身就是可评审的（谁都能读、能改），
不依赖措辞，不会因为「命中判定」写成「打击判定」就漏报；改规则只改 `COUPLING_RULES` 一处。
轻量档不催没显示的章（`visibleChaptersForDoc` 过滤）。

**连带修的两处**：`EXPECTED_IDS` 补 `fieldCoupling`；Excel 测试的 `makeCleanDoc`
补上联动字段——「干净文档」必须真的是能开工的文档，不是「必填都填了」的文档。
