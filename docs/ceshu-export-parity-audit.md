# 策划书导出字段对拍审计（编辑器 ↔ 生成设计文档）

> 触发：用户反馈「前端和生成后的内容不太一样」，明确指**策划书设计文档**（非数据表 / 交接包 / AI 对话）。
> 结论先行：**没有任何字段被静默丢弃**。看起来的差异来自两条**设计内**行为。

## 一、结论

| 现象 | 是 bug 吗 | 原因（单源） |
|---|---|---|
| 文档里「少了」空字段 | 否（设计） | `export/common.ts` 的 `orderedFieldEntries` 跳过空值，不输出 `—` 空行 |
| 某章正文看不到「账本 / 数值断言 / 用例 / 原型验收」 | 否（设计） | 机读字段统一搬到「## 附录：验收与机读数据」（`renderMachineAppendix`） |
| 字段值被改写 / 截断 | 否 | 编辑器与导出读**同一份 `doc`**，导出只做人类可读格式化 |
| 章节整章不见了 | 需分情况 | 按 `gdd_scope`（lite 只导 9 章）与 `enabled_modules` 裁剪——**档位决定**，非丢内容 |

## 二、验证方法（可复跑）

守卫测试：`tests/unit/ceshuExportFieldParity.test.ts`

1. 把除 `meta` / `systems` 外**每个 schema 字段**填成唯一标记 `MARK_<章>_<字段>`；
2. 渲染 `renderCeshuMarkdown(doc)`；
3. 逐条断言：标记必须出现（不漏字段）；**机读字段必须在附录标题之后、人读字段必须在之前**（位置正确）；
4. 另测：空字段不输出（设计行为）。

实测：字段全部命中，`missing = []`、`misplaced = []`。`fillEveryField` 遍历 `CESHU_CHAPTER_FIELDS` × `CHAPTER_KEYS` 并断言 `> 300`，**动态覆盖当前基线 351**（非写死旧数），后续新增字段会自动纳入。

## 三、顺带修掉的真实缺陷（防御性）

`validateCeshu` 在**半成品文档**上会抛异常，导致 `renderCeshuMarkdown` 整条崩掉——
这不是「内容不一样」，而是**直接没有输出**（比不一致更糟）。

| 位置 | 原写法 | 触发条件 |
|---|---|---|
| `ceshuValidation.systemConfig` | `doc.systems[systemId]` | 缺 `systems` 章 |
| `ceshuValidation` 系统依赖检查 | `Object.entries(doc.systems)` | 缺 `systems` 章 |
| `ceshuNumericAssert.evaluateAssertions` | `doc.numeric.numeric_parameters` / `.numeric_assertions` | 缺 `numeric` 章 |
| `ceshuNumericAssert.checkDesignClaimsWith` | `doc.numeric.design_claims` | 缺 `numeric` 章 |
| `ceshuNumericAssert.buildPrototypeResults` | `doc.qa.prototype_acceptance` | 缺 `qa` 章 |
| `ceshuEvidence`（3 处） | `doc.qa.*` / `doc.economy.ledger` | 缺章 |
| `ceshuValidation` 跨章一致性（12 处） | `doc.combat.*` / `doc.story.*` / `doc.art.*` … | 缺章 |

生产加载路径（`projectFilesToDoc` 从 `createDefaultCeshu` 起手）保证 24 章齐全，**正常流程不会触发**；
但 `validateCeshu` 是共享纯函数（导出 / 完备度 / 质量门 / 机读轨都调它），
半成品文档不该让校验器崩掉——校验器只报告问题，不制造崩溃。

已全部改为可选链 + 空数组兜底（共 22 处），并加守卫测试：
残缺文档返回「章节数据格式异常」，而不是抛异常。

### 3.x narrative 导出静默丢字段（真实缺陷，2026-11-03 修复）

`renderCeshuNarrative` 把 `vision` 列为**正文主章**（`NARRATIVE_CHAPTERS`），但只通过 `renderHome`
抽取 `user_personas.primary/secondary`、`design_vision`、`design_pillars` 4 个字段；
`differentiation`、`business_model`、`competitive_analysis` 三个**非机读**字段没有任何渲染段
——正文没有，模块附录也因 `vision ∈ NARRATIVE_CHAPTERS` 被 `continue` 跳过——被彻底丢弃。

把对拍守卫扩到 narrative 后该测试**立刻变红**，精准定位到缺口。修复：新增 `renderVision` 段，
用 `orderedFieldEntries('vision', …)` 渲染 vision 全章、跳过首页已展示的 4 个字段（避免重复，
与 gameplay 段「选择性段 + 全章段」的既有先例一致）。

> 教训：narrative 是「全量重组」格式，**不是** curated 子集——它必须保全所有非机读字段。
> 把它和 onepage/tasks/homepage 混为一谈会掩盖这类真丢字段。第 六 节已更正分类。

## 四、验证记录

> 以下数字是**本次审计当日**的记录，不是全仓当前基线；当前基线见
> `docs/dsh-alignment-status.md` 第五节（2026-11-05：单测 3980 / 6 跳过，e2e 85 / 2 跳过）。

| 闸 | 结果 |
|---|---|
| `vitest run` | 346 文件 / **3843 测试通过**（含对拍 4 例：markdown 2 + narrative/deliverable 2；残缺文档守卫 2 例） |
| `tsc --noEmit`（node / web / test-dom） | 0 错 |
| `eslint`（改动文件） | 0 错 |
| `npm run build` | OK |

## 五、给后续维护者的两条不变式

1. **导出侧任何新增过滤条件，必须同步附录**——否则「编辑器里写了、文档里没有」会再次出现。
   `ceshuExportFieldParity.test.ts` 会在第一时间变红。
2. **校验器永不抛异常**——`validateCeshu` 对残缺输入只报告、不崩溃。新增检查若读 `doc.<章>.<字段>`，
   一律用可选链；`ceshuValidation.test.ts` 的「残缺文档不抛错」守卫会兜底。

## 六、补充：curated / derived 格式刻意只展子集（非丢字段）

对拍守卫覆盖三类「全量」格式 + 其余「curated 子集」格式，分类如下：

**全量保全格式（必须一个不漏，丢字段即 bug）**

| 格式 | 性质 | 字段保全方式 |
|---|---|---|
| `markdown`（生成设计文档本体） | 24 章平铺 | 人读进正文、机读进「## 附录：验收与机读数据」 |
| `deliverable`（交付版） | 24 章平铺 | 复用 `orderedFieldEntries` 全章渲染 |
| `narrative`（叙事版） | 24 章重排 | 正文选择性段 + 全章段（含 `renderVision`，见 3.x 修复） |

这三类由 `ceshuExportFieldParity.test.ts` 守卫：非机读字段必须全部出现（narrative/deliverable）、
机读字段必须进附录（markdown）。

**curated / derived 子集格式（按设计只展子集，非丢字段）**

| 格式 | 性质 | 为什么只展子集 |
|---|---|---|
| `onepage` | concept 阶段摘要 | 只列必填 / 已填字段（`visibleChaptersForDoc` + `chaptersUpToStage('concept')`） |
| `tasks` | 派生产物 | 岗位任务清单，源自 `ceshuTasks.ts`，非逐字段导出 |
| `homepage`（L1-2，2026-11-03 新增） | 立项 pitch | 只聚合定位 / 目标玩家 / 核心幻想 / 设计支柱 / 循环 / 非目标 |

机读字段（账本 / 数值断言 / 用例 / 原型验收）统一进 markdown 的「## 附录：验收与机读数据」，
narrative / deliverable 复用同一路径保全；curated 格式本就只面向人读摘要，机读字段不在其职责内。
