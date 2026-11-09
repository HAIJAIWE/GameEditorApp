# 策划书（双文档）路线与现状 —— 2026-11

> 用途：把这轮所有改动、关键决策、当前架构与待办收成一份可交接的现状说明。
> 配套文档：`docs/design-doc-templates-research.md`（调研）、`docs/template-corpus.md`（中 50 + 英 50 语料）、`docs/template-architecture-options.md`（6 项架构决策）。

---

## 一、一句话现状

**只有两种文档模式：游戏 / 应用。** AI 不是一个模式，而是「应用」里的可选模块（模型卡/数据表/系统卡/评测四章）。章节标签**按档位分派**：游戏档编号式「N. 名称」（跟游戏策划案多数派），应用档纯主题式（跟软件设计文档原文）；支持方向版/细节版，应用文档可一键生成可点击界面原型。规格注册表已升级为「模板体系」，加载即校验。

---

## 二、演进时间线（近期提交）

| 提交 | 内容 |
|---|---|
| 2026-11-09 | **看板「派这一份」：想先做哪份就派哪份，不必先选导出目录**：施工看板每一行加「派这一份」按钮，走编辑器桥 `editorStartAiDevFor(path)` → 主进程 `ceshu:workOrder` 接 `targetPath`；`bundleDir` 由必填改可选，缺省按 `<活跃库>/exports/<游戏名>-交接包` 反推、不存在时就地导出一次（`exported` 标记回传，提示语据此说「已就地导出」还是「沿用已导出的」）。`buildHandoffWorkOrder` 新增点名优先（`forced ?? readyRemaining[0] ?? remaining[0]`）：点名命中就不静默改派，点名不适用/已完成都会在正文首段写明原因。派工单仍**只预填不发送**；「不适用」的行不给按钮。派工单「收尾」还补了落地办法——点名 `system.file_ops` 先 read 再 write 追加 `进度.md`，并写明「这一行是下一轮的唯一依据」。e2e `ceshu-dispatch-doc.spec.ts` 断言点的是排最后那份、与自动选的下一份不同、包落盘在库里、消息列表没变 |：新增 `ceshuHandoffProgress.ts`——把 B 的机判结论按份汇总成看板（5 种状态 `done` / `rework` / `todo` / `blocked` / `skip`），选「下一份」与派工单共用同一判据（`pending.find(ready) ?? pending[0]`），避免看板说做 A、派工单说做 B；成绩单以 HTML 注释标记段幂等写回 `<工作区>/进度.md`，重跑覆盖。**机判不替人盖章**：`done` 只认进度.md 的施工记录，机判只能否决（fail ⇒ 降级 `rework`），`parseHandoffProgress` 先剥离快照段，机器写的成绩单不会被当成施工记录自我盖章。新增 IPC `ceshu:workOrderProgress` + 「更多」第 20 项菜单「施工看板」（挂载即自动核对，逐份 `data-state`，未过条目可展开看 evidence）。实测真实文档 dd66f593：26 份适用（未开工 8 / 门禁未就绪 18），机判未过 17 条、待人工或可执行用例 35 条，下一份 `00-架构/01-范围与平台.md`（`b52eb7cf`） |
| 2026-11-09 | **验收升级：99 条验收从 94 条「人工」降到机判为主**：`HandoffAcceptanceCheck` 由 3 种扩到 5 种（`assertion` / `data` / `field` / `test` / `manual`），38 份交接文档 + 7 卷全部改写成对象形态；新增 `ceshuHandoffAcceptance.ts` 把每条验收**真的判**（assertion 吃 `contract.json` 复算、data 吃设计↔数据表核对、field 吃策划书字段；test/manual 恒 unverified，绝不替 AI 盖章）。派工单逐条带「← 现状：已通过 / 未过 / 待补」，并在「让 AI 开工」提示里交代本次这份的验收现状。实测真实文档 dd66f593：88 条验收 → 机判 48 条（pass 15 / fail 29 / skip 4）、unverified 40 条，机判占比 54.5%；空白夹具 74.7% |
| 2026-11-08 | **对话生成带字段契约**：新增 `buildChapterContract`，在「改文档」模式把目标章字段目录（key/类型/列/必填/aiHint 摘要）注入上下文，让模型知道「符合的文档」长什么样；问答模式不动（`4c2eb988`） |
| 2026-11-08 | **对话写回堵数据丢失**：`system.ceshu update` 由整章替换改为「字段白名单 + 合并 + 前后 validateCeshu 对比」，拒脏键、保未传字段、回传校验变化（`c1ac7b89`） |
| 2026-11-08 | **主聊天 agent 也能取契约**：`system.ceshu` 新增只读 `schema` 动作（复用 `buildChapterContract`），update 前可先按章取字段契约（`6fb1b779`） |
| 2026-11-08 | **问答上下文按章分配预算**：`buildAgentContext` 由从头硬截断改为按章等分（长文档末章不再整段消失），导出并补 3 项单测（`72e5760c`） |
| 2026-11-08 | **实现契约 / 构建清单**：新增 `buildImplementationManifest` + Markdown 渲染，从 `state_machine`/`systems`/核心循环/`mvp` 验收派生「垂直切片优先」的构建清单，缺失项如实标 pending；附 `docs/samples/implementation-manifest-sample.md` 与 3 项单测（`cc324408`） |
| 2026-11-08 | **实测：契约→可玩切片**：仅按实现契约实现云海剑歌垂直切片（6 条状态转移 + 半即时战斗 + 伤害原式 + 验收自检），证明契约足以驱动编码 agent 做出可玩切片；见 `docs/samples/implementation-slice-demo.html`（`e421bbfa` / UX 重做 `9a0fbcc6`） |
| 2026-11-08 | **实现契约接入导出**：`CESHU_EXPORT_FORMATS` 新增 `manifest`，导出菜单/保存对话框/IPC 校验自动生效，用户可一键导出「实现契约/构建清单」（`b9bb6786`） |
| 2026-11-08 | **契约 JSON 机读格式**：新增 `manifest-json`（.json），给程序/agent 机读结构化契约（`069dfba9`） |
| 2026-11-08 | **契约喂厚（A）**：派生内容范围（mvp.core_features / level_design 首关）/ 数值约束（numeric 公式·平衡·断言）/ QA 验收准则 / 通用表现基线；构建顺序 4→5 步。并修「带 columns 的 pipeList 存对象行、toRows 漏读」的 bug（改 `toRowStrings`），验收不再丢失（`c8ed1bc1`） |
| 2026-11-08 | **厚契约实测 v3**：用喂厚后契约重做垂直切片（3 关 5 敌 + 数值约束 + 表现基线），对比薄契约的产出——内容量与手感均有可见提升（`2feb7895`） |
| 2026-11-08 | **换品类实测（塔防）**：另起一份塔防文档（烬土守望）派生契约，canvas 实现网格布防/波次/升级/结算；无头模拟验证「满塔赢、零塔输」——证明契约与管线跨品类通用，非只对 RPG 有效（`6c6fb6aa`） |
| 2026-11-08 | **真实客户端接入推理型模型，修 3 个线上故障**：Playwright 驱动真 Electron 客户端，接 custom/workbuddy-hy3 网关实测——修 `usage:null` 崩溃、推理耗尽 max_tokens 导致空内容、网关用 502 报长度截断；重试上限 16000。修完智能体对话与文档信息章真实生成成功（judge 合规 78 分）。另发现「应用跑构建产物，源码改动必须 build 后才生效」（`bf68f91b`） |
| 2026-11-08 | **gameplay 补「设计量化目标」**：`gameplay.design_targets`（指标/目标值/测量方法/验证节点），注册到机读数据层（与 `vision.design_assumptions` 同口径，不挤占叙述完成度、剥离出生成/导出）；补强 gameplay 章可度量短板（`7c30a411`） |
| 2026-11-08 | **品类适用性裁剪扩展**：`chapterApplicableToGenre` 由「仅剔 combat」扩为 `GENRE_INAPPLICABLE_CHAPTERS` 显式映射表（保守口径：视觉小说/派对剔 `economy`，休闲益智保留）；`e29aa3a0` |
| 2026-11-08 | **修复 vision 模板孤儿字段**：`vision.user_personas.potential` 此前模板写入却无字段定义（永不显示/导出/编辑），现补为正式第三类画像字段（`c0c1993b`） |
| 2026-11-08 | **可访问性章可验收化**：新增 `accessibility.acceptance_checks`（检查项/依据/判定方法/责任角色/阻断，optional）；来源为文档团队实跑样本 `docs/samples/ch16-accessibility-sample.md` |
| 2026-11-08 | **真实 GDD 原文对拍**：GitHub + gamescrye 下载 7 份可读原文，6:1 偏主题式；编号改为文档级可选（`numbering`） |
| 2026-11-08 | **P2 打磨**：编辑视图章名跟随覆盖层 / 覆盖层从文件加载 / 可选模块说明核实已完成 |
| 2026-11-08 | **两个新交付物**：Art Bible 独立导出格式 + TDD「从策划书生成草稿」入口（零 LLM、素材按 9 章映射汇入） |
| 2026-11-08 | **章节标签按档位分派**：游戏档恢复编号（跟游戏文档多数派 5:4 / 全量 10:3），应用档保持主题式；用户拍板「跟多数人习惯」 |
| 2026-11-07 | **修 stage/scope 叠乘 bug + 补一页立项预览**：onepage 渲染下沉 shared，立项阶段生成后显示 pitch |
| 2026-11-07 | **GDD→TDD 信息层串联**：TDD 9 章映射 GDD 素材章 + 回链要求；milestones 两章分工澄清；P1-4 误判作废 |
| 2026-11-07 | **游戏档一键生成改造**：三阶段（默认立项 7 章）/ 生成计划消费 enabled_modules 与品类 / 前文要点按生成顺序取前序 |
| 2026-11-07 | **AI 生成质量门落地 + 空字段重试**：净恶化章可见/一键重生成；JSON 截断自动重试 1 次（服务错误不重试） |
| 2026-11-07 | **AI 生成前文要点**：后章提示词带上前序章摘要（6 章/4 字段/80 字/1400 字四重上限），补跨章一致性 |
| 2026-11-07 | **章节标签去编号**：游戏/应用统一改纯主题式；导出标题、目录、覆盖层预览、校验文案同步；守卫测试反转 |
| `dc8102e4` | 真实文档对拍：6 个可溯源源交叉验证决策骨架成立（见 `docs/template-crosscheck-real-docs.md`） |
| `47d9908f` | 补 `usage_limits`，语料复核字段增至 7 个（全可选） |
| `b6d16cdc` | 按复核结论补 6 字段：C4 两层 / Datasheet 三组 / 不兼容影响（一律 optional） |
| 2026-11-07 | 模板语料 8 项待补源复核：4 已核 / 1 部分 / 3 核不到（见 `docs/template-corpus-verification.md`） |
| `2d2b2807` | 游戏章表默认收敛：市场分析/商业化/运营活动改为按需开启（老文档零回归） |
| `6100c517` | 分组标题去掉中文序号，与章标签「N. 名称」统一（含交接包/开发路线） |
| `8c59bae2` | 交付模板覆盖层编辑入口：章节导航「交付模板」+ JSON 面板（校验/预览/应用/清除） |
| `b6cabfc6` | JSON 模板覆盖层：zod 严格校验 + 标签/顺序/模块开关，`specForDoc` 文档感知应用 |
| `a32e003a` | 模板版本化：`meta.template_version` 写入/读盘补齐/读 API；AI 不生成系统字段 |
| `28bc8e8a` | 模块选择器加分组一键开关与「最小核心」预设 |
| `b40469bc` | 应用章表合并：data_model+api+integration→data_interface，security→横切关注点分区 |
| `4dab41bd` | 阶段轴：方向版(lite)/细节版(full) 泛化到应用与 AI |
| `23bdf032` | 新建时选游戏/应用（AI 不单列）；Excel 补 AI 模型层 sheet |
| `4b269032` | AI 档端到端接入（导出/提示词/岗位/UI） |
| `c2d13c64` | AI 作为第三档的地基（后被收回） |
| `934d29cf` | 章节标签统一「N. 名称」（游戏+应用）；校验文案与跳转同步 |
| `21479bd1` | **AI 并入应用，收回独立 AI 档位** |
| `852befcc` | 应用「试玩版」：一键生成可点击界面原型 |
| `f86f49cb` / `d0aae05c` | 模板调研 + 中 50/英 50 语料库 |
| `94a0c9fa` | 6 项架构决策选项对比 |
| `d4a005d6` | documentSpec 升级为模板体系（version/stage/module/roleChapters/metaHint + 校验） |
| `758ae066` → `0c205ffd` | 可选模块通用化，最终去掉 `ai_enabled` 双读，单一字段 + 读盘迁移 |
| `396683b5` | 应用章表重排（五节 + 附录），新增「替代方案」「术语表」 |
| `8f65a08f` | 字段改名 `optional_modules`，避免与游戏 `enabled_modules` 撞车 |
| `1a286d08` | 模板如实登记可选模块（游戏逐章 / 应用分组） |
| `fc9034a0` | 模块选择器按分区分组 |

---

## 三、当前架构

### 3.1 档位

```
meta.doc_kind: 'game' | 'application'   // 只有两种
meta.gdd_scope: 'lite' | 'full'         // 方向版 / 细节版
```

### 3.2 章表

- **游戏**：23 编号章 + meta，分区「核心设计 / 制作与商业 / 扩展设计」。方向版 = 前 9 章。
  - **新建默认**只启用 20 个模块章（`market_analysis` / `monetization` / `live_ops` 默认关，按需在模块选择器开启）；老文档无 `enabled_modules` 仍全开。
- **应用**：16 编号章 + meta，分区：
  - 定义与目标：概述 / 用户 / 范围与非目标
  - 方案设计：功能 / 流程 / 交互 / 架构 / **替代方案**
  - 数据与接口：数据与接口（合并原 数据模型 / 接口契约 / 第三方与集成 三章）
  - 质量与保障：非功能 / 测试
  - 横切关注点：安全与隐私
  - 交付与治理：发布 / 里程碑 / 风险
  - 附录：**术语表**
  - AI 模型层（可选，默认关）：模型卡 / 数据表 / 系统卡 / 评测与红队
- 应用方向版 = 6 章（概述/用户/范围/功能/里程碑/风险）+ 启用 ai_layer 时补模型卡。

### 3.3 可选模块（两套字段，语义分离）

| 含义 | 字段 | 值 |
|---|---|---|
| 游戏「启用哪些模块章」 | `meta.enabled_modules` | **章 key**（如 `combat`） |
| 应用「启用哪些可选模块组」 | `meta.optional_modules` | **模块 id**（如 `ai_layer`） |

> ⚠️ 不要混用。旧 `ai_enabled` 由 `normalizeCeshu` 读盘时迁移到 `optional_modules` 并删除。

### 3.4 模板体系（`packages/shared/src/documentSpec/`）

`DocumentSpec` 现含：`version / kind / parts / chapters`（每章带 `stage`、`module?`、`agentId`、`aiHint`、`requiredFields`）`/ chapterLabels / agentDisplay / agentPrompts / roles / roleChapters / modules(含 chapters) / hiddenMainViewIds / systemDocNoun / reviewRoleNoun / metaHint`。

- `GAME_SPEC.version = '2026.11'`；模块 = `MODULE_CHAPTERS` 逐章登记（`defaultOn: true`）。
- `APP_SPEC.version = '2026.11'`；模块 = `ai_layer`（4 章，`defaultOn: false`）。
- `validateDocumentSpec` 加载即校验（章唯一、分区覆盖、模块/岗位引用、agent 可查）。

### 3.5 原型（试玩版）

- 游戏：`buildDemoPrompt` → 单文件可玩 HTML。
- 应用：`buildAppPrototypePrompt` → 单文件**可点击多屏界面原型**。
- 统一落 `demo_html`（`prototype/demo.html`），交接包/项目文件夹自动携带。

### 3.6 小节显示（按档位分派）

> **术语（2026-11-08 起）**：用户可见处一律称「**小节**」（对齐真实文档的 Section），
> 不再用「章节」。分三层处理，别混：
> - **用户可见**：界面文案（中 26 / 英 90 条 i18n）、导出标题（`附录：小节完成度`、`## 来源小节`）、
>   报告表头（`| 小节 | 完成度 |`）、错误提示（`未知小节`）、TDD 大纲 —— 全部改为「小节 / section」。
> - **代码标识符**：`CHAPTER_KEYS` / `chapterLabelForDoc` / 锚点 `chN` **不动**——
>   重构成本高、用户看不见、收益为零。
> - **游戏内容语义**：`新章节 + 新角色`、`1个完整章节`、`章节通关` 等指游戏关卡，**保持原样**。
> - **AI 提示词内部**（`ceshuAi` / `ceshuBundlePrompt` / `qualityJudge`）：仍写「章节」，
>   属模型指令而非界面文案，改动会影响生成行为且无用户收益。



- **游戏档**：编号式「N. 名称」（如 `5. 战斗系统设计`），文档信息段无前缀。
- **应用档**：纯主题式（如 `功能规格`、`风险控制`），不带编号。
- 章号 `chapterNumber` 由数组位置派生，用于**锚点 `chN` / 目录顺序 / lite 范围**；
  导出标题直接取标签、**不再叠加 `entry.index`**（历史上叠加会产出「4. 4. 游戏系统设计」双号 bug）；
  导出目录为无序列表 `- [标签](#anchor)`。
- 游戏剧情数据里的「第一章·启程 / 云海篇」是内容，不是标签，保持原样。
- 模板覆盖层 `applyTemplateOverlay` 按 `base.kind` 分派标签，重排后重新派生。

> **决策依据（2026-11-07 模板口径，见 `docs/game-doc-corpus-2026.md`）**：
> 当初「两边都不编号」的依据是 6 个**软件/AI 文档**（RFC/KEP/Google/ADR/PEP/ModelCard），
> **没有一个游戏 GDD**，属把软件文档结论外推到游戏档。重收国内 25 + 国际 25 条游戏文档后：
> 逐字读过的 11 份里**编号派 5 / 主题派 4 / 同页并存 1 / 非模板 1**，全 50 条口径 **10:3**。
> 游戏策划案（正式交付物 / 可复制模板）多数用「第一章…第八章」或 `1./a./i.` 多级编号
> （CSDN 2010、renrendoc 6 套模板、gamedesigning.org 8 节、openagenticgame 15 章、B站 10 节清单）；
> 现代轻量 GDD 用主题式（Nuclino、GDD Concept & Pitch Template PDF 原文、gamedevacademy）。
>
> ⇒ 分流维度是**文档载体**而非地域：正式交付物/Word·PPT/可复制模板倾向编号，
> 活文档/Wiki/Notion/轻量 pitch 倾向主题式（`gameindustrycareerguide` 同一页两种并存）。
> 用户拍板「**跟多数人习惯**」⇒ 游戏档恢复编号，应用档保持主题式（软件文档依据充分）。

> **复核更正（2026-11-08，见 `docs/game-real-gdd-samples.md`）**：上一条统计的把子是**模板**，
> 不是真实文档。本轮去 GitHub + gamescrye 下载 PDF 原文并提取目录，7 份可读真实 GDD 里
> **6 份不编号**（DOOM Bible / Planescape Last Rites / An Ant's Life / Saints Row: Undercover /
> Zombie Island / MGS2 Grand Game Plan），**只有 BooH 一份编号（1./2./a.）**。
> ⇒ 结论应为：**真实交付物偏主题式，厂商模板偏编号**；两者都有真实理由
> （模板便于「按 3.2 条填」，交付物靠目录+页码检索，编号反而拖累改序）。
>
> 因此不再一刀切：`TemplateOverlay` 新增可选 `numbering: 'numbered' | 'plain'`，
> 缺省保持现状（游戏编号 / 应用主题式，零回归），要贴真实 GDD 写法就用 `plain`。
> 导出与编辑视图同走 `specForDoc`，不会两处不一致。守卫测试锁默认值 + 两向切换 + 非法值 fail-soft。

---

## 四、关键决策与理由

1. **AI 不是第三种模式**（用户拍板）：AI 产品属于应用；游戏里的 AI 走游戏系统章。
2. **不另造 `templates/` 目录**：`documentSpec` 已是注册表，再建会成第二事实源。
3. **消费方不直接读 spec**：`ceshuModel → documentSpec → gameSpec → prompts → ceshuAi → ceshuModel` 会成环，模块归属留 schema/model 层。
4. **单一事实源**：`ai_enabled` 不做长期双读，读盘一次性迁移。
5. **字段分离**：游戏 `enabled_modules`（章）与应用 `optional_modules`（模块组）不复用，避免切换文档时互相误读。
6. **章 key 稳定优先**：应用重排只改分区/标签/新增章，不改既有 key，零迁移。
7. **游戏可选不改默认**：`defaultOn: true` 与现状一致；改默认会让老文档章消失。

---

## 五、验证基线与命令

```bash
cd apps/desktop
npm run typecheck   # tsc ×3（node / web / test-dom）
npm run test        # vitest 全量
cd ../..
npm run lint
cd apps/desktop && npm run build
```

当前基线：**tsc×3 / lint / 4240 单测 / build 全绿**。

保护性测试（新增）：
- `documentSpec.test.ts`：模板结构校验、方向/细节分层、模块登记。
- `docScope.test.ts`：lite/full、AI 模块可见性、`ai_enabled` 迁移。
- `appPrototypePrompt.test.ts` + `ceshuPrototypePanel.test.tsx`：应用走界面原型提示词。
- `ceshuChapterLabelDrift.test.ts`：源码硬编码标签与模板一致。

---

## 六、待办

### P0（已完成）
- **合并章表**：`data_model + api + integration → 数据与接口`（单章 `data_interface`）；`security → 横切关注点`分区（提交 `b40469bc`）。
  - 字段合流为 `DATA_INTERFACE_FIELDS`；`normalizeCeshu` 读盘一次性把旧三章合流到 `data_interface` 并删除旧 key（单一事实源，无长期双读）；全消费方/测试同步。
  - 四道闸全绿：tsc×3 / lint / 4145 单测 / build。应用基础章 18→16，可见章 19/23→17/21（含 AI）。

### P1（体验/能力）
- ✅ 模块选择器：**一键分组开关** + 「最小核心」预设（提交 `28bc8e8a`）。
  - 分组/预设走新增的批量 `onSetModules(chapters)` 一次写盘，顺带修掉「逐章 `onToggle` 读旧 `doc.meta` 互相覆盖」的隐患。
- ✅ `meta.template_version` 写入与读取（模板版本化最小实现，提交 `a32e003a`）。
  - 新建写 `TEMPLATE_VERSION`（对齐 GAME_SPEC/APP_SPEC 的 `2026.11`）；老文档 `normalizeCeshu` 读盘补齐；读 API `templateVersionForDoc` 永不返回 undefined。
  - 作为**系统控制字段**：不进 meta 表单、AI 整章生成不列（`NON_AI_GENERATED_KEYS`）、`withChapter` 保存时保留旧值。
- 应用可选模块 UI 已在「文档信息」以 `optional_modules` 多选呈现；可再优化为带说明的开关。
- ✅ JSON 模板覆盖层（提交 `b6cabfc6`）：`meta.template_overlay` 携带一份 JSON，仅覆盖「标签 / 顺序 / 模块默认开关」。
  - `applyTemplateOverlay`：zod 严格模式（未知键拒绝）+ 顺序必须是原集合的排列 + 引用必须存在 + `kind` 必须匹配；不合法整份拒绝，绝不半应用；重排后章号/标签重新派生。
  - `specForDoc` 文档感知：有覆盖层则应用，损坏则 fail-soft 退回基础规格（导出/交接包不因坏 JSON 失败）。
  - ✅ 模板编辑 UI 已做（`8c59bae2`）；「从文件加载」已于 2026-11-08 补上（见 P2）。

### P2（打磨）
- ✅ 交付模板覆盖层编辑入口（提交 `8c59bae2`）：章节导航「交付模板」→ JSON 面板（实时校验 + 导出后预览 + 应用/清除）。
  - **作用域**：仅影响导出/交接包（`specForDoc` 消费方）；编辑视图的章节标题/顺序仍是模块级常量。
  - ✅ **编辑视图章名跟随覆盖层**（2026-11-08）：`CeshuView` 在渲染层直接调 `specForDoc(doc)`
    取 `chapterLabels` 注入章节导航，绕开「`ceshu/model` 不能 import documentSpec」的环，
    **无需下沉中性模块**。只跟随标签；顺序仍用默认模板（重排会牵动锚点/进度/activeChapter），留后续。
  - ✅ **从文件加载**（2026-11-08）：复用 `dialog:chooseTemplateJsonFile` + `fs:readFile`，
    填进 textarea 走既有实时校验；读取失败/取消选择都有明确提示。
  - ✅ 应用可选模块说明：`optional_modules` 字段自带 `reviewHint`，通用字段控件已渲染
    （「按需开启；开启后对应章节才会出现」），无需另做开关 UI。
- ✅ 分组标题去掉中文序号（提交 `6100c517`）：`partDisplayName` / `appPartDisplayName` 直接返回分区标签；交接包与开发路线的分区标题同步。
- ✅ 游戏章表默认收敛（提交 `2d2b2807`）：新建默认关「市场分析/商业化/运营活动」，与语料库 §D 判断一致。
- 按目标行业（SaaS / 游戏 / AI）各取 5 份真实项目文档二次核对章表。
  - ✅ 8 项待补源已逐条核过（4 已核 / 1 部分 / 3 核不到，见 `docs/template-corpus-verification.md`）；
    其中 3 处有原文直接支撑的缺口已补进字段（提交 `b6d16cdc`）。
  - ⚠️ 核不到的三项（ISO 29148 付费墙、中文大厂 PRD、游戏 Art Bible）**公开渠道拿不到原文**，
    必须由有真实文档的人提供；不要再拿文库转存当证据。
  - ✅ **真实文档对拍已完成（2026-11-07，见 `docs/template-crosscheck-real-docs.md`）**：
    取 6 个**可公开溯源**的真实决策文档模板/实例（Rust RFC / K8s KEP / Google 设计文档 / MADR ADR /
    PEP / Model Card），逐章节映射到应用档章表。结论：**决策骨架成立、无需改结构**——
    出现于 ≥5/6 源的核心关切（背景/方案/替代方案/影响/验收/目标）本档全部覆盖；
    唯一弱项「开放问题」记为可选候选、暂不实现。`compatibility_impact` / `system_context` /
    `runtime_units` / Datasheet 四组得到二次背书。
  - ⚠️ 对拍**不含游戏文档**（GDD/Art Bible 无公开原文），游戏章表仍待真实样本二次核对。
- 应用/游戏原型可加"导出为文件/预览大图"等体验。

---

## 七、已知风险与约束

- **导入循环**：任何 `ceshu/model` 层代码都不应 import `documentSpec`；如需规格数据，经 `chapterView`/常量层。
- **字段语义**：`enabled_modules`(游戏, 章) 与 `optional_modules`(应用, 模块 id) 不可混用。
- **覆盖层作用域**：`meta.template_overlay` 经 `specForDoc` 生效，当前只到导出/交接包；编辑视图的标签/顺序仍是模块级常量（`ceshu/model` 不得 import `documentSpec`，否则成环）。
- **章 key 稳定性**：合并/改名必须配套迁移，否则老文档丢数据；git 是兜底，不是免迁移。
- **模板版本化未落地**：`version` 已声明，但 `meta` 尚未写入，跨版本行为目前一律按当前模板解释。
- **数据语料局限**：中文模板同质化严重，部分分节来自国标/常识；定稿前建议按行业复核。

---

## 八、相关文档

- `docs/design-doc-templates-research.md` —— 40+ 模板调研与公共分母
- `docs/template-corpus.md` —— 中 50 + 英 50 语料清单与跨语言频次
- `docs/template-architecture-options.md` —— 6 项架构决策对比与推荐
- `docs/app-development-plan.md` —— 路线 A 应用档推进记录（历史）
- `docs/template-corpus-verification.md` —— 8 项待补源逐条复核（4 已核 / 1 部分 / 3 核不到）
- `docs/template-crosscheck-real-docs.md` —— 6 个可溯源真实文档章节对拍（决策骨架成立、无需改结构）
