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

### 3.6 章节显示（按档位分派）

- **游戏档**：编号式「N. 名称」（如 `5. 战斗系统设计`），文档信息段无前缀。
- **应用档**：纯主题式（如 `功能规格`、`风险控制`），不带编号。
- 章号 `chapterNumber` 由数组位置派生，用于**锚点 `chN` / 目录顺序 / lite 范围**；
  导出标题直接取标签、**不再叠加 `entry.index`**（历史上叠加会产出「4. 4. 游戏系统设计」双号 bug）；
  导出目录为无序列表 `- [标签](#anchor)`。
- 游戏剧情数据里的「第一章·启程 / 云海篇」是内容，不是标签，保持原样。
- 模板覆盖层 `applyTemplateOverlay` 按 `base.kind` 分派标签，重排后重新派生。

> **决策依据（2026-11-07，见 `docs/game-doc-corpus-2026.md`）**：
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
> 两档分派是有意为之，不是漂移；守卫测试按此口径锁定。

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

当前基线：**tsc×3 / lint / 4216 单测 / build 全绿**。

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
  - 未做（留 P2）：模板编辑 UI 与「从文件加载」入口；当前覆盖层只能经文档 JSON 导入携带。

### P2（打磨）
- ✅ 交付模板覆盖层编辑入口（提交 `8c59bae2`）：章节导航「交付模板」→ JSON 面板（实时校验 + 导出后预览 + 应用/清除）。
  - **作用域**：仅影响导出/交接包（`specForDoc` 消费方）；编辑视图的章节标题/顺序仍是模块级常量。
  - 未做：让编辑视图也跟随覆盖层——需先把覆盖层下沉到中性模块（两侧共用），因为 `ceshu/model` 被架构约束禁止 import `documentSpec`。
  - 未做：从文件加载（目前为粘贴/编辑 JSON）。
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
