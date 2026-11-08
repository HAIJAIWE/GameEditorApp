# 真实 GDD 原文样本（GitHub + gamescrye，2026-11-08）

> 上一轮 `docs/game-doc-corpus-2026.md` 的 50 条里，多数是**模板**和**二手摘要**，
> 由此得出的「编号是多数派」结论其实是「模板多为编号」，不是「真实文档多为编号」。
> 本轮按你的要求去 GitHub 和公开资源站，**下载 PDF 原文并提取目录**，得到 7 份可读真实 GDD。
>
> 结论先说：**真实交付的 GDD 里，6/7 用不编号的主题式标题**；编号主要出现在
> **厂商模板与国内策划案模板**里。这与上一轮结论相反，原因见 §四。

## 一、核验方式（可复现）

- 下载：`curl` 直取 PDF（GitHub 的 `raw.githubusercontent.com` 在本机不可达，
  改用 `api.github.com/repos/<owner>/<repo>/readme` 带 `Accept: application/vnd.github.raw`）；
- 提取：`pypdf 7.0.0` 逐页 `extract_text()`，不做 OCR、不做人工润色；
- 判定「有无编号」：看目录/章节标题本身是否带 `1.` `第一章` `Chapter N` 这类前缀。
  正文里的步骤编号（如「1. Artists place markers…」）不算章节编号。

产物在 `.tmp-research/`（10 份 PDF + 8 份 README），未纳入版本库。

## 二、7 份可读真实 GDD 的目录原文

### 1. DOOM Bible（id Software，1992，79 页）

`siggraph`/id 时代原稿，ToC 带点线 + 页码，**标题本身不编号**，但正文用「Section N」引用：

| ToC 原文（去点线） | 页码 |
|---|---|
| Doom Command Line Parameters | 1 |
| Intro and Demo Loop | 2 |
| Control Panel | 3 |
| Play Loop | 4 |
| End of game | 5 |
| Characters | 6 |
| Episode 1（Story / Actors / Unique Bits / Maps） | 7 / 7.1–7.4 |
| Episode 2–6 | 8–12 |
| Commercial | 13 |
| Stuff: Weapons, Items, Etc. | 14 |
| DOOM Press release | 15 |
| Random Notes | 16 |
| DOOM Calendar | 17 |
| Appendices：Glossary / File Extensions / Utilities / Known and Unfixed Bugs | A–E |

值得注意：**正文里确实有 `1.DOOM Command Line Parameters`**，但 ToC 用的是主题名 +
页码。⇒ 「编号」在这种文档里是**引用手段**，不是标题格式。

### 2. Planescape: Torment — Last Rites（2007，47 页，产品评审包）

目录标题写的是 `TABLET OF CONTENTS`，条目用**方括号页码**，不编号：

```
QUICK INTRO [2]
VISION STATEMENT [4]
TEAM VISION STATEMENT [16]
THE MANGY CAST [18]
REALITIES [31]
DEVELOPMENT [35]
DA FUCKING PLOT [43]
GAMEPLAY ELEMENTS [56]
```

⇒ 没有美术 / 音频 / 数值 / 经济 / 测试章节。**愿景（Vision Statement）单独成节并占 12 页**。

### 3. An Ant's Life（2009，11 页，团队 GDD）

`Table of Contents` 共 **38 条**，全部主题式、无编号：

```
Overview / Introduction / Game Structure / Control / Scoring /
Health Points and Life Points / Task Points / Ant-Human Interface /
Perception / Chemical - Smell and Taste / Touch / Other senses and self-assessment /
Actions（Movement / Pick-up-drop / Fighting / Communication / Perception）/
Universe Simulation（Physical Universe / Surfaces / Particles / Terrain-Vegetation-Materials）/
Ant Colony（Trail Ants / AI Ants）/ Game Elements（Ants / Other Critter / Inanimate objects）/
Landscape / Levels（Nurse / Nest-keeper / Forager / Soldier phase）/
Sixty Seconds of Play / References
```

⇒ 层级深度到三级（章 → 节 → 子节），全靠缩进与命名，不靠数字。

### 4. Saints Row: Undercover（Volition，2008，122 页，商业工作室）

按页扫描出的顶级章节（正文标题行，**无编号**）：

| 章节 | 页 |
|---|---|
| Introduction / Understanding Saints Row PSP | 1 |
| Project Overview / Design Goals / Features | 1 |
| Functionality | 2 |
| Story | 8 |
| AI Systems | 27 |
| Missions | 45 |
| Reward Systems | 49 |
| Diversions | 69 |
| Audio | 75 |
| Interface | 77 |
| Controls / HUD | 80–81 |
| Co-Op | 112 |
| Appendix A: Story Missions | 92 |

⇒ 122 页商业 GDD **没有**美术章、技术章、排期章、风险评估章。
用大量嵌套项目符号写「有 / 没有」（`Motorcycles are NOT planned`、`(Wish List) Tattoo Shops`），
明确写「不做」比写「怎么做」更多。

### 5. BooH（2015，17 页）— 唯一编号派

`Contents` 是 **`1. / 2. / a. / b.`** 两级编号：

```
1. Game definition – mission statement
2. Core gameplay    a. Main game view  b. Core player activity  c. Controls
                    d. In-game UI: TOP view  e. In-game UI: First Person view
3. Contextual gameplay  a. Shell menus  b. Gameplay mechanics  c. Character background & game mood
                        d. Level design  e. Assets
4. Technical Design documentation  a. Main assumptions  b. Class diagram(s) & dependencies
                                   c. Helper libraries  d. Implementation  e. Coding standards  f. Tools
5. Game requirements
6. Major milestones
7. RISK analysis
```

⇒ 两个反直觉点：**TDD 是 GDD 的第 4 章（内嵌，不是独立文档）**；
**「Assets」是第 3 章的子节**，美术没有独立成章。

### 6. Zombie Island（2023，11 页，itch.io 独立游戏）

```
Team / Introduction / Game Analysis（Game Description）/ Logistics /
Game Atmosphere / Game Play / Key Features / GDD Design Document /
Game Matrix / Game Flow Chart / Player Properties /
User Interface (UI)/ Heads up Display (HUD) / Player View
```

⇒ 主题式、无编号；把「GDD 文档本身」「游戏矩阵」「流程图」当成章节名。

### 7. Metal Gear Solid 2 — Grand Game Plan（小岛工作室，38 页英译）

章节为提案式：`Creating a sequel / A look at trends found in other sequels /
Target Audience / Time setting / Characters / Game mechanics / Story / Finish development / Release`。

⇒ 这是**立项提案**而非完整 GDD：受众、时间设定、角色、机制、故事、排期、发行。
对应我们「产品愿景 + 市场分析 + MVP 规划」三章。

## 三、下载了但读不到正文的 8 份（如实标注）

| 文件 | 状态 |
|---|---|
| Diablo I pitch（3 页） | 扫描件，提取出 2 个字符 |
| Marble Madness（1984） | `PdfReadError`，结构损坏 |
| Silent Hill 设计文档 | `PdfStreamError` |
| Wipeout 设计文档 | 36 页，0 字符（图片型） |
| Iron Phoenix 设计文档 | 67 页，0 字符（图片型） |
| Prince of Persia 2 Design Bible | 链接返回 HTML 而非 PDF |
| Larry 7 设计文档 | 自定义字体编码，提取为乱码 |
| DOOM Bible 备用镜像 | 403 |

⇒ 这些**只登记「已下载」，不算已核**。要读需要 OCR。

## 四、编号派 vs 主题派：结论翻转及原因

| 口径 | 编号 | 不编号 |
|---|---|---|
| 真实交付 GDD（本轮 7 份原文） | 1（BooH） | **6**（DOOM Bible / Planescape / An Ant's Life / Saints Row / Zombie Island / MGS2） |
| 模板 / 厂商模板（上轮语料） | 多（openagenticgame 15 章、renrendoc、CSDN 2010、gamedesigning outline） | 少（Nuclino、GDD-template.pdf） |

**为什么两轮结论相反**：不是数据变了，是**样本类型不同**。

- **模板**要给不熟悉的人填空 → 编号 + 编号子条款（`3.1.1`）便于「第 3.2 条按这个填」；
- **真实文档**内部流转靠**目录 + 页码 + 主题名**检索 → 编号反而碍事（改了顺序要全文改引用）。

⇒ 所以「跟多数人习惯」这句话要看**对标谁**：
对标**策划案模板**，编号是多数；对标**已交付的真实 GDD**，主题式是多数。

## 五、对我们 23 章章表的直接结论

### 5.1 覆盖度：我们比任何单份真实 GDD 都全

| 主题 | DOOM | Planescape | Ant's Life | Saints Row | BooH | Zombie | MGS2 | 本档 |
|---|---|---|---|---|---|---|---|---|
| 愿景 / 立项 | ✅ | ✅✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 产品愿景 |
| 世界观与角色 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 世界观与角色 |
| 核心玩法 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 核心玩法 |
| 系统 / 机制 | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | 游戏系统设计 |
| 关卡 | ✅ | — | ✅ | ✅ | ✅ | — | — | 关卡与内容设计 |
| UI / HUD | ✅ | — | ✅ | ✅ | ✅ | ✅ | — | UI/UX |
| 音频 | — | — | — | ✅ | — | — | — | 音频设计 |
| 美术 | — | — | — | — | ⚠子节 | ✅氛围 | — | 美术设计 |
| 数值 | — | — | ✅ | — | — | — | — | 数值设计 |
| 经济 | — | — | — | ✅奖励 | — | — | — | 经济系统设计 |
| 技术 | ✅ | — | — | ✅AI | ✅ | ✅矩阵 | — | 技术规格 |
| 商业 / 发行 | ✅ | — | — | — | — | — | ✅ | 商业化 / 上线 |
| 风险 | ✅bugs | — | — | — | ✅ | — | — | 风险控制 |
| 里程碑 | ✅日历 | — | — | — | ✅ | — | ✅ | MVP / 资源 |

**没有一份真实 GDD 覆盖数值 / 经济 / 可访问性 / 埋点 / QA / 性能。**
这不是我们多写了，而是这些主题在真实项目里由**另一份专业文档**承担（见 5.2）。

### 5.2 真实文档印证了我们「独立交付物」的方向

- **美术**：7 份里只有 1 份有独立美术内容（Zombie 的「游戏氛围」），BooH 把 Assets 塞进子节
  ⇒ 说明美术规范通常是**单独的 Art Bible**。我们已做 `artbible` 导出，方向对。
- **技术**：BooH 把 TDD 内嵌成第 4 章，其余多不提 ⇒ 两种做法都存在。
  我们「技术规格章 + 独立 `system.tech_doc`」两边都覆盖，是对的。
- **音效**：只有 Saints Row 有 Audio 章，且极简（并列在 Interface 旁）
  ⇒ 真实项目里音效设计文档也是**独立文档**，我们目前只有「音频设计」一章，**这是真缺口**。
- **艺术/音频之外的缺口**：Saints Row 用「明确写不做」控制范围（`NOT planned`）。
  我们有「范围与非目标」，但没有「明确不做清单」这种强制口径 —— 值得补。

### 5.3 编号这件事，建议这样收口

证据是**分裂的**（真实文档 6:1 主题式；模板 多:少 编号），一刀切任一边都能被反例打。

最稳的产品解：**把它做成文档级选项**（默认编号，保持现状不回归），
在「交付模板覆盖层」里加 `numbering: 'numbered' | 'plain'`：
- 对齐策划案模板的人用编号；
- 对齐已交付 GDD 的人切成主题式；
- 导出与编辑视图同源（都走 `specForDoc`），不会两处不一致。

## 六、本轮边界

- 只读正文 **7 份**，另有 8 份只下载未读成（§三），**不冒充已核**；
- 样本偏欧美、偏 1990s–2010s 商业项目；国内真实项目文档仍拿不到（文库转存不算）；
- 未改任何代码（§5.3 的选项需你确认是否现在做）。

## 七、复现清单（下载 URL）

```
# 真实 GDD 原文（gamescrye 镜像，可直接 curl）
https://gamescrye.com//wp-content/uploads/2016/12/doombible.pdf                        DOOM Bible 1992
https://gamescrye.com//wp-content/uploads/2016/12/Planescape-CRPG.pdf                  Planescape Last Rites 2007
https://gamescrye.com/wp-content/uploads/2016/08/AnAntsLife-GameDesignDocument.pdf     An Ant's Life 2009
https://gamescrye.com//wp-content/uploads/2016/08/SR_Undercover_GDD.pdf                Saints Row Undercover 2008
https://gamescrye.com//wp-content/uploads/2016/12/booh-game-design-final.pdf           BooH 2015（唯一编号派）
https://gamescrye.com/wp-content/uploads/2023/02/Zombie-Island-Game-Design-Document-Template.pdf  Zombie Island 2023
https://gamescrye.com//wp-content/uploads/2016/12/Metal-Gear-Solid-2-Grand-Game-Plan.pdf          MGS2 Grand Game Plan

# 下载但未读成（§三）
https://gamescrye.com//wp-content/uploads/2016/08/diablo_pitch.pdf                     扫描件
https://gamescrye.com//wp-content/uploads/2016/12/marble-madness.pdf                  结构损坏
https://gamescrye.com//wp-content/uploads/2016/12/silent-hill-design-document.pdf     流错误
https://gamescrye.com//wp-content/uploads/2016/08/WipeoutDesignDocument.pdf           图片型
https://gamescrye.com//wp-content/uploads/2016/08/Iron-Phoenix-Design-Doc.pdf         图片型
https://gamescrye.com//wp-content/uploads/2016/12/Larry7-Design.pdf                   字体编码乱码

# 资源索引页（58 份 PDF 链接）
https://gamescrye.com/resources/game-design-documents/

# GitHub 仓库（README 经 api.github.com/repos/<owner>/<repo>/readme 取）
LazyHatGuy/GDDMarkdownTemplate                       64★ 模板本体
kosinaz/game-design-document-template-for-beginners  42★ 新手模板
mikewesthad/Game-Design-Document-Resources           20★ 真实 GDD 索引（14 份）
serenitystudio/GameDesignDocuments                   15★ 真实 GDD 索引（21 份）
MaxyBlack/gdd-template                                7★ 灵活模板
CiaraBurkett/game-design-document.md                  7★ Google Docs 转 Markdown
wanghaisheng/openagenticgame-gdd                     15 章编号体系 + 每章独立 md（MVP 先写 3/4/9 章）
```

> 本机实测：`raw.githubusercontent.com` 不可达（`http=000`），
> `api.github.com` 可达（core 限额 60/h）；PDF 提取用 `pypdf 7.0.0`，未装 OCR。
