# 应用开发：双文档规格规划（2026-11-06，路线 A）

> **口径（用户 17:40 拍板，覆盖早先「一个游戏一个应用 / 档位」的理解）**：
> **游戏与应用是两套体系，不是同一副骨架上打个标签。**
> 选「应用」就进应用相关的**窗口 + 内容 + AI**；选「游戏」就进游戏相关的。
> 用户原话：「选择应用开发那就是应用相关的窗口和内容吧，如果是游戏那就是游戏相关的不是么」。
>
> **路线 A = 统一内核 + 双文档规格（DocumentSpec 注册表）**。
> 内核（存取 / 版本链 / 项目文件夹 / UI 外壳 / 进度 / 校验 / 导出机制）只有一套；
> 章表、标签、字段、AI 角色与提示词、岗位、窗口集合由规格注册，按 `meta.doc_kind` 分派。
>
> ⚠️ **当前进度：第 1–6 步已完成，第 7 步「首页按档位筛选」已落地（新建时直接选档位待产品决策）**。
> 应用档 16 章数据、读写、可见章/标签、AI 分派、岗位任务、全量导出（Markdown/docx/html/pptx/Excel/叙事/交接包）、
> 窗口分派均已按 `doc_kind` 分派；游戏侧 4100+ 单测逐字节零回归。第 8 步（原型语义）及零散收尾仍待做。
> 勿把本文档当作「已完成」。

---

## 一、决策链（方向性决策归用户，实现细节归 LLM）

| 决策点 | 选定 | 排除 | 理由 |
|---|---|---|---|
| 是否真分开 | **两套体系** | 「只藏游戏章」「只加 doc_kind 档位」 | 档位做法里内容仍是游戏 GDD，应用文档不成立 |
| 技术路线 | **A 统一内核 + 双规格** | B 并列双轨（游戏零改动、应用另起一套 UI/存取） | 长期只维护一套内核，第三种文档只注册一份 spec；代价是 196 个消费方要改章表来源 |
| 章号呈现 | **由规格自己的 parts 派生** | 沿用全局 `CHAPTER_PARTS` 静态章号 | 应用档独立章表必须连续；全局章号跳号是仓库注释记过的「目录像缺页」历史缺陷 |
| 应用内容范围 | **通用软件设计 SDD** | 轻量 PRD / 用户自定章表 | 需求 → 功能 → 架构 → 接口/数据 → 非功能 → 测试 → 发布 → 风险 |

**硬约束：游戏侧零回归**（4014 单测 + 24 章成熟内容）。编译期 `CHAPTER_KEYS` /
`CHAPTER_SCHEMAS` / `CESHU_CHAPTER_FIELDS` 原样保留，只在「读文档的边界」按档位分派规格。

### 领域常识审查
- **最大工程鸿沟：只换章表不换 AI 提示词 = 假分开**。`ceshuAi.ts` 写死「游戏策划助手」、
  `GENRE_PROFILE_BY_TYPE`（RPG/SLG…）、角色/掉落/伤害公式关键词；应用档必须换成
  产品经理/架构师/前后端/测试角色 + 接口与数据模型生成要求。
- 岗位任务 `CESHU_ROLE_ORDER`（程序/美术/测试/数值/音频）是游戏岗位，应用档换成
  产品/前端/后端/测试/运维。
- 起步点：先立**规格注册表骨架 + 应用章表**，跑通「游戏规格与既有常量一致」的守卫，
  再逐层接分派；不先搭抽象层再填内容。
- **局限声明**：SDD 章表依据通用软件工程常识拟定，用户尚未逐章校验覆盖面。

---

## 二、已落地

### 2.1 入口与档位（`3f2c41b6`）

- `meta.doc_kind`（game/application，缺省 game，人定 + optionLabels）。
- `getDocKind()` / `needsGameDataEditor()`：只有显式 `application` 降级，脏值/缺省按 game。
- `withChapter(meta)` 保护档位：AI 整章生成漏写或写非法值时保留旧值。
- `meta.platform`（PC / 移动端 / 主机）显性化到首页卡片徽标，随项目文件夹往返。
- 应用档隐藏 `data.mainView`：页签条 / App / ⌘K 命令面板共享同一份隐藏清单
  （`plugins/context/mainViewVisibility.ts`），避免假入口。

### 2.2 DocumentSpec 骨架（本轮新增）

`packages/shared/src/documentSpec/`：

| 文件 | 职责 |
|---|---|
| `types.ts` | `DocumentSpec` / `SpecChapter` / `SpecPart` / `SpecRole` 契约 |
| `gameSpec.ts` | **游戏规格 = 既有常量的适配视图（零复制）**；直接引用 `CHAPTER_*`、`CHAPTER_AGENT_MAP`、`CESHU_ROLE_*` |
| `appSpec.ts` | **应用 SDD 独立章表**：16 章 + 文档信息段、5 个分区、10 个 AI 子智能体、5 个岗位 |
| `index.ts` | 注册表 `DOCUMENT_SPECS` + `specForKind` / `specForDoc` / `hiddenMainViewIdsForKind` / `specChapterNumber` |

**应用章表**（章号由 `APP_PARTS` 派生，1..16 连续）：

| 分区 | 章 |
|---|---|
| 定义与范围 | 项目概述 · 用户与场景 · 范围与非目标 |
| 产品设计 | 功能规格 · 核心流程与状态 · 交互与界面 |
| 技术设计 | 技术架构 · 数据模型 · 接口契约 · 第三方与集成 |
| 质量与保障 | 非功能需求 · 安全与隐私 · 测试与质量 |
| 交付与治理 | 发布与运维 · 里程碑与资源 · 风险与取舍 |

AI 角色：产品经理 / 交互设计师 / 系统架构师 / 前端 / 后端 / 数据 / 安全 / 测试 / 运维 / 技术负责人。
岗位：产品 / 前端 / 后端 / 测试 / 运维。

**规则单点**：`mainViewVisibility.hiddenMainViewIdsForDocKind` 已改为委托规格层，
避免渲染层与规格层各写一套隐藏规则。

### 2.3 应用章表字段 schema（`appSchema/`）+ 构造分派（第 1、2 步）

- `packages/shared/src/appSchema/chapters.ts`：16 章 + 文档信息段的字段定义，
  每字段带 `aiHint` / `reviewHint` / `aiDraftable`，必填用 `required: true` 标记。
  `combo` / `multiCombo` 一律带 `optionLabels`（沿用游戏侧守卫口径）。
- **`requiredFields` 单一事实源**：`appSpec.ts` 不再手写必填清单，改由
  `appRequiredFields(key)` 从字段表派生；模块加载时还会校验「规格每一章都有字段定义」。
- `createDefaultCeshu({ scope, name?, docKind? })`：`docKind` 缺省 game ⇒ 73 个调用方
  **逐字节零回归**；显式 application 时挂上 16 章默认值并写 `meta.doc_kind`。
  游戏 24 章仍作为兼容底座保留（196 个消费方假设它们存在）。
- `normalizeCeshu` 读盘：应用档靠「顶层未知键保留」带回 16 章，并对磁盘里缺失的章
  补空默认值（只补不覆盖，`meta` 不覆盖）。游戏档完全不走这段。
- `appSchema.test.ts` 11 项守卫：游戏档零回归、显式 game 与不传一致、应用档章表齐全、
  必填与 schema 一致、字段 key 唯一、读盘往返不丢、游戏档不误带应用章。

### 2.4 结构守卫（`documentSpec.test.ts`，12 项）

- 游戏规格逐项等于既有常量（章表 / 章名 / 标签 / 必填 / 分区 / AI 角色 / 岗位）——
  这条最重要：规格一旦变成第二份真相源，游戏侧行为会悄悄漂移。
- 应用章 key 除 `meta` 外与游戏章表**零重叠**（守卫当场抓到 `uiux` 撞名，已改 `interaction`）。
- 应用章号 1..N 连续、分区覆盖无重复、每章都有 AI 角色与生成要求。
- 应用 AI 角色/岗位/章名不含「策划/数值/美术/关卡/战斗/掉落/伤害」等游戏语义。
- 分派正确（默认/显式 game → 游戏，显式 application → 应用，脏值回落游戏）。
- 规格层与渲染层隐藏规则一致（防漂移）。

---

## 三、怎么用（**当前**）

1. 首页「新建空白」→ 编辑器「文档信息」章 → **文档类型**选「应用」；平台勾
   `电脑软件（桌面）` / `手机软件（移动）` / `Web`。
2. 保存后：首页卡片显示平台徽标；主区「数据编辑」页签消失，⌘K 里也不再列出。
3. 切回「游戏」即恢复数据编辑。

> ✅ **第 1–5 步已落地**（`2fcd6129` → `fb9420c4`）：应用档界面显示并编辑 SDD 16 章，
> AI 生成（单章 / 单字段 / 一键全篇 / 成稿反审）走 SDD 角色与措辞，岗位任务为
> 产品 / 前端 / 后端 / 测试 / 运维，主 Markdown 与 docx / html / pptx / excel / narrative 导出按档位分派。
> 游戏档全程逐字节零回归（4100+ 单测锁定）。
>
> ⚠️ 仍需用户复核：交接包 SDD 分卷覆盖面、SDD 16 章逐章校验；第 6–8 步见第六节。
> **SDD 16 章的覆盖面用户尚未逐章校验**。

**数据落盘**：`<userData>/libraries/<库名>/ceshu/`（`userData` 默认 Windows
`%APPDATA%/<应用名>`，可用 `MB_USER_DATA_DIR` 覆盖）。导出项目文件夹：
`config.json`（含 `doc_kind` / `platform`）+ `design/<章>.md` + `data/<章>.json`
+ `tasks/<岗位>.md` + `prototype/demo.html`。老导出缺 `doc_kind` 回落 `game`。

---

## 四、验收基线

| 项 | 状态 |
|---|---|
| tsc ×3 / eslint 全量 / styleRatchet 15 / i18n 棘轮 2 | ✅ |
| 全量单测 | ✅ 见提交记录 |
| `documentSpec.test.ts` 12 项 + `appSchema.test.ts` 11 项结构守卫 | ✅ |
| `ceshuSchema.guard` 字段总数 352、`meta` 14 | ✅ |

---

## 五、耦合面（决定分阶段推进的节奏）

| 面 | 数量 |
|---|---|
| `ceshuSchema` 章节文件 | 31 |
| ceshu 消费方 ts/tsx | 196 |
| ceshu 相关测试文件 | 115 |
| 导出模板 | 16 |

`visibleChaptersForDoc(doc)` 是 **12+ 消费方的统一入口**（导出 / 校验 / 进度 / AI 生成 /
岗位任务 / 机读包 / 项目文件夹 / 原型指纹…），是接入分派的最佳收口点。

---

## 六、逐层接入计划（**未做**）

按「每步可独立验证、游戏侧零回归」排序：

| # | 事项 | 收口点 | 说明 |
|---|---|---|---|
| 1 | ~~应用章表落 schema~~ | ✅ `appSchema/` | 已完成：16 章字段定义 / 契约 / 默认；与 `ceshuSchema` 并列 |
| 2 | ~~文档读写分派~~ | ✅ `createDefaultCeshu` / `normalizeCeshu` | 已完成：按档位生成 16 章、读盘补齐；游戏侧逐字节零回归 |
| 3 | ~~可见章 / 章号 / 标签分派~~ | ✅ `visibleChaptersForDoc` + `chapterView` | 已完成：12+ 消费方走规格化查表；UI 章导航与表单按档位渲染 |
| 4 | ~~AI 分派~~ | ✅ `buildChapterPrompt` / 反审 / 全量生成 | 已完成：应用 AI 角色、SDD 措辞、一键全篇、成稿反审；游戏档零回归 |
| 5 | ~~岗位任务 / 导出模板分派~~ | ✅ `ceshuTasks` / `export/*` | 已完成：SDD 5 岗；主 Markdown / docx / html / pptx、项目文件夹、交接包按档位分派 |
| 6 | ~~窗口分派~~ | ✅ `appSpec.hiddenMainViewIds` + `MainViewMount`/`commandPalette`/`App` 三处消费 | 应用档主区隐藏 `data.mainView`（数据编辑），命令面板同步过滤；断言锁定于 `mainViewVisibility.test.ts` / `documentSpec.test.ts`。**新增应用专属视图（接口契约/数据模型）为待定增强，需产品确认** |
| 7 | **创建与查找体验** | 新建表单 / 首页筛选 | ✅ **首页按档位筛选已落地**：`CeshuCardView.docKind` + `filterCeshuCards(docKind)`（默认 `'all'` 保兼容）+ 全部/游戏/应用三档位按钮，复用「只看待审」交互模式，UI/逻辑双测锁定（`ceshuHomePanel.test.tsx` / `ceshuHome.test.ts`）。⏳ **新建时直接选档位未做**——`ceshu.create({name,scope})` 尚无 `docKind` 入参，且需先定「默认档位 + 新建表单是否显式选档」的产品决策 |
| 8 | **原型语义** | `prototype/demo.html` | 游戏是「可玩原型」，应用应是「可交互界面原型」 |

> **第 5 步的刻意取舍**：应用档交接包**没有复刻**游戏的「7 卷 11 文档 + 品类裁剪 +
> 11 个游戏角色」分卷施工图（软件设计没有「品类 / 核心循环」，硬套会产出假内容），
> 改为按 SDD 分区 + 章表 + `APP_ROLES` 组织的章节式交接包（`appHandoff.ts`）。
> 若产品上仍要「分卷派工」，需先确认 SDD 分卷划分再实现。
> 另 `excel.ts` 与 `content/narrative.ts` 已按档位分派：应用档导出 SDD 七表（概览 / 功能清单 / 用户角色 / 接口契约 / 里程碑 / 风险 / 校验报告）与 SDD 叙事（概述 → 用户 → 范围 → 功能设计 → 技术架构 → 质量保障 → 交付治理 → 变更），游戏档逐字节零回归。

> **不做**：新建独立的 `AppDocument` 存储与 UI 双轨（那是已排除的路线 B）；
> **不复用**游戏章 key（已由结构守卫挡住）。

---

## 七、AI 文档的定位（最终：并入应用，不单列档位）

> **最终决定（2026-11-07 晚，用户拍板）**：AI **不是第三种开发模式**——它是「应用」里的一类功能（做 AI 产品），游戏里的 AI 也走游戏系统章。此前把 AI 做成独立档位的实现已**收回**：`DocKind` 回到 `game / application` 两种；AI 独有的「模型层四章」（模型卡 / 数据表 / 系统卡 / 评测与红队）并进**应用**，作为**可选章节**——文档信息勾选「含 AI 模型层」（`meta.ai_enabled`）才出现在导航 / 导出，排在 16 章之后（不挤占现有章号）。以下为当时的调研与中间态，留作记录。

调研结论（AI / 应用 / 游戏三领域文档体系）支持把 AI 作为**第三档位**：AI 产品本质是软件产品，软件设计部分沿用应用 SDD 的字段语义，但独有「模型层四章」（模型卡 / 数据表 / 系统卡 / 评测与红队）——Model Cards / Data Sheets / System Cards / Eval 是 ML 界标准化产物，应用 SDD 装不下。

**矩阵口径**：文档 = 领域（游戏 / 应用 / AI）× 阶段（方向 / 细节 / 试玩）。领域决定章表（`DocKind`）；阶段决定范围与产出形态（`gdd_scope` 的 lite/full、`prototype`）。AI 档先把「领域」这一列立起来。

**第 1 步（已完成）——章表与分派地基**：
- 新增 `aiSchema/`（20 章 = meta + 软件 16 + 模型层 4）与 `documentSpec/aiSpec.ts`；
- `DOC_KINDS` / `DocumentSpecKind` / `DOCUMENT_SPECS` / `specForKind` 均已含 `ai`；
- `getDocKind` / `needsGameDataEditor` 认 `ai`；`chapterView` 六个 `xxxForDoc` 函数按 `ai` 分派；
- `ceshuModel`：新建 / 读盘补默认章、`visibleChaptersForDoc`、进度（不分阶段）、`withChapter` 均接 `ai`；
- `CeshuSummary.docKind` 放宽到含 `ai`；`documentSpec.test.ts` 补 AI 独立性守卫（7 项）；
- 游戏 / 应用：全量 4128 单测零回归。

**第 2 步（已完成）——端到端接入**：
- 新增 `isSoftwareDoc(doc)`（判据统一为「非游戏」），导出层 9 个文件（docx / html / pptx / markdown / excel / narrative / onepage / handoff / tasks）与 `export/common` 全部改用它，AI 文档按 SDD 口径导出；
- `appHandoff.ts` 由写死 `APP_*` 改为按 `specForDoc(doc)` 取分区 / 标签 / agent / 岗位章，AI 交接包带上模型层四章，`index.json` 标 `docKind: ai`；
- AI 提示词（`ceshuAi.ts` 的 agent / 单章 / 全量 / 反审、`ceshuTaskPrompt.ts`）按 `ai` 取 `AI_*` 元数据（角色、措辞、章序）；
- 岗位（`ceshuTasks`）用 `AI_ROLES` / `AI_ROLE_CHAPTERS`；机读包 / 项目文件夹 / 完备度同按档位分派；
- 首页档位筛选加「AI」按钮 + i18n；`AiFullGeneratePanel` / `CeshuOverview` / `CeshuView` 档位判断改「非游戏」；
- 新增 `aiDoc.test.ts` 6 项端到端守卫（章表 / 章号 / 必填 / 读盘 / 保存保持档位 / 交接包含模型卡）；
- 全量 **4134** 单测零回归。

**第 3 步（已完成）——创建入口与 Excel 专列（2026-11-07）**：
- 首页「空白策划书」点开先选**游戏 / 应用**两种模式；用户拍板「AI 不单列，归在这两个模式内」。`ceshu:create` 入参加 `docKind`（限 game/application，缺省 game），工具栏「＋」仍走游戏快速新建；
- Excel 导出对 AI 档补模型层四章独立 sheet（模型卡 / 数据表 / 系统卡 / 评测与红队），走 `writeAiModelSheet`；
- `templateChapterLabel` 补 `isChapterKey` 守卫（去掉未窄化 cast）；
- 新增 `aiDoc.test.ts`（7）+ `ceshuHomePanel.create.test.tsx`（3）守卫；全量 **4138** 单测零回归。

**第 4 步（已完成）——阶段轴：方向版 / 细节版泛化到三档（2026-11-07）**：
- `visibleChaptersForDoc` 对应用 / AI 也识别 `gdd_scope`：lite → 方向版子集，full → 全章表。游戏沿用既有 `visibleChapterKeys`（零回归）；
- 方向版子集：应用 6 章（概述 / 用户 / 范围 / 功能 / 里程碑 / 风险）、AI 7 章（同上 + 模型卡——方向阶段至少要说清用什么模型）；
- 新增 `APP_LITE_KEYS` / `AI_LITE_KEYS`；`contentChapterCountsForDoc(doc)` 按档给出「方向/完整」章数（游戏 9/23、应用 6/16、AI 7/20）；
- 首页「新建」选择器加「方向版 / 细节版」深度选择（默认细节版），选中后随 `scope` 一并建文档；
- 工具栏「范围」文案改为按档取章数（游戏零回归）；
- 新增 `docScope.test.ts`（7）+ 首页新建深度选择用例；全量 **4146** 单测零回归。

**仍待（后续）**：**试玩版**（原型产出）——游戏已有「可玩 Demo」，应用 / AI 的「可交互界面原型 / 可跑 demo」属原型语义改造（需产品定义），未做；应用专属视图（接口契约 / 数据模型）待产品确认。

---

## 八、相关文档

- `docs/ceshu-project-folder.md` —— 项目文件夹规范
- `docs/window-map.md` —— 窗口职责与入口矩阵（假入口判据）
- `docs/ceshu-user-guide.md` —— 策划书使用指南
- `docs/ui-polish-plan.md` —— 前端窗口 UI 打磨计划
