# 策疏（ceshu）子系统改造规划

> 范围：最近亲手堆出的「校验 / 数值断言 / 证据 / Demo」链路 + 字段定义体系。
> 目标：在不改变任何校验消息文案、不破坏 2546 单测的前提下，消除重复、收敛 god-function、收口架构债。
> 实证依据：本文件中的行数 / 文件数 / import 关系均来自 `desktop/src/shared` 实测。

---

## 总览与排序

| 档 | 内容 | 收益 | 风险 | 工作量 | 建议时机 |
|---|---|---|---|---|---|
| 1 | 管道行解析收口 | 高 | 零 | S | 立刻 |
| 2 | 校验不修改入参的防御测试 | 高 | 零 | S | 立刻（与 1 同批） |
| 3 | `ceshuValidation` 改为 CHECKS 注册表 + 去重 `evaluateAssertions` | 中 | 中 | M | 1/2 之后 |
| 4 | 字段定义 4 套目录合并为按章 schema | 战略 | 高 | L | 单独规划、单独评审 |

原则：**先锁安全网（1+2），再动消息文案相关的（3），最后动 schema（4）。每一档结束都跑全量 `npx vitest run` + 三套 `tsc` + `eslint`。**

---

## 档 1：管道行（`row.split('|')`）解析收口  ⭐ 零风险

### 现状（实测）
`row.split('|').map(trim)` 在 4 个文件各自重写：
- `ceshuNumericAssert.ts`：第 66、80、396、475、483 行（含自带 `toRows` 第 351 行返回 `unknown[]`）
- `ceshuEvidence.ts`：自带 `splitRow`（45）、`toRows`（41，返回 `string[]`），第 142 行用 `EPSILON`
- `ceshuDemoPrompt.ts`：自带 `column`（22）、`rowsOf`（27）
- `ceshuValidation.ts`：第 285 行 `entry.split('|')` 内联
- `EPSILON = 1e-9` 重复定义：`ceshuNumericAssert.ts:45` 与 `ceshuEvidence.ts:17`

列位置的约定散落各处，改一处列结构容易漏改另一处。

### 方案
新建 `desktop/src/shared/ceshuPipeRows.ts`（纯函数工具，无副作用）：
```ts
export const EPSILON = 1e-9
export function toRows(value: unknown): string[]            // 过滤非字符串与空串
export function splitRow(row: string): string[]             // split('|') + trim
export function column(row: string, index: number): string  // 取第 N 列（越界空串）
```
4 个文件改为 import 这三个符号，删除本地重复定义：
- `ceshuNumericAssert.ts`：`toRows` 返回 `string[]` 后，`evaluateAssertions` 里的 `typeof row !== 'string'` 守卫可去掉（已是 string）；`EPSILON` 删本地定义。
- `ceshuEvidence.ts`：删 `toRows` / `splitRow` / `EPSILON` 本地定义。
- `ceshuDemoPrompt.ts`：`rowsOf` 直接替换为 `toRows`；`column` 改为 import。
- `ceshuValidation.ts`：`topRiskName` 内联 `split('|')` 改用 `splitRow`（可选，收益小但统一）。

### 验收
- 全量单测绿（行为零变化，纯机械抽取）；
- `grep -rn "function toRows\|function splitRow\|function column\|const EPSILON" desktop/src/shared` 只剩 `ceshuPipeRows.ts` 一处；
- `eslint` 无未使用变量残留。

---

## 档 2：校验不修改入参的防御测试  ⭐ 零风险

### 现状
之前踩过 `ceshuDefaults` 的 `structuredClone` 浅拷贝污染（测试互相污染）。`validateCeshu` 名义纯读，但无测试保证它不 mutate 入参——一旦有人为方便就地改了 `doc`，调用方（main / AI 生成）会拿到被污染的文档，且只在多步流水线里才暴露。

### 方案
新增 `desktop/tests/unit/ceshuValidation.noMutation.test.ts`：
- 取一份非空样例文档（可复用 `slg-ceshu-patch` 反序列化的 doc），深拷贝快照；
- 跑 `validateCeshu(doc)`；
- 断言 **入参结构与跑前逐字节相等**（递归比对 key/值/数组顺序）；
- 额外断言 `validateCeshu` 对同一 doc 连跑两次输出稳定（幂等）。
顺带给 `evaluateAssertions` / `checkLedger` / `checkTestCaseList` 也加一条「入参不被改」微测（它们同样纯读）。

### 验收
- 新测试通过；人为在 `validateCeshu` 里加 `doc.x.y = 1` 时该测试变红（证明守卫有效）。

---

## 档 3：`ceshuValidation` 改为 CHECKS 注册表  ⚠️ 中风险（消息文案不可变）  ✅ 已实施（2026-10-24）

### 现状
`ceshuValidation.ts` 308 行，18 项检查是平铺顺序块（必填 → 一致性 1~11 → 重叠 → 术语 → 质量 → 数值断言 → 设计主张 → 用例 → 账本）。每加一项就往里塞一个 `for` 循环。两大问题：
1. **可读性 / 可测性**：单测只能整体跑 `validateCeshu` 后按 fragment 匹配消息；单项无法独立测。
2. **重复计算**：`checkNumericAssertions`（→ `evaluateAssertions`）与 `checkDesignClaims`（内部又 `evaluateAssertions(doc)`）对同一 doc 各算一遍断言。

### 实施结果（实际落地形态）
- 抽出 `CeshuCheckContext { doc, assertionResults, prototypeResults }` 与 `CeshuCheck { id, run(ctx) }` 接口；`validateCeshu` 退化为「建一次 ctx → `CESHU_CHECKS.flatMap(check => check.run(ctx))`」。
- `CESHU_CHECKS` 按**逻辑分组**为 7 项（非 18 个微条目，避免不必要的代码膨胀、降低转录风险）：`requiredFields` / `crossChapterConsistency`(原 1~13) / `contentQuality` / `numericAssertions` / `designClaims` / `testCaseList` / `ledger`。顺序与重构前逐字节一致（消息总数 full=49、lite=22 的精确计数测试即守卫）。
- **去重**：`buildCheckContext` 只算一次 `evaluateAssertions(doc)` 与 `buildPrototypeResults(doc)`，并新增导出的 `checkDesignClaimsWith(doc, assertionResults, prototypeResults)` 与 `buildPrototypeResults(doc)`；`numericAssertions` / `designClaims` 两项检查复用 ctx 里的预计算结论。公共入口 `checkDesignClaims(doc)` / `checkNumericAssertions(doc)` 保留为「内部复算一次」的薄包装，现有单测不受影响。
- 消息文案**零变化**（原 18 块 body 逐字节搬入各 `run`，只把 `doc` 换成 `ctx.doc`）。

### 验收
- 全量 2555 过 / 5 跳（2546+档1 的 4+本档 5）；tsc 三套 0 错；eslint 0。
- 新增 `tests/unit/ceshuValidation.checks.test.ts`：断言 `CESHU_CHECKS` id 列表稳定、每项可独立 `run`、逐项长度之和 == `validateCeshu` 总长（无重复无遗漏）、`validateCeshu` 只复算一次 `evaluateAssertions`、单查 `designClaims` 可独立产出预期消息。

---

## 档 4：字段定义 4 套目录合并为按章 schema  🏗️ 战略（高工作量 / 高收益）

### 现状（实测）
字段元数据被拆进 4 套平行目录 + 1 个大文件，keying 一致（章节 + 字段名）但形态各异：
- `ceshuFields.ts`（现 128 行）：BASE 17 章字段表（meta + 16 编号章；economy 在其中内联）+ **唯一 merge point**（import `FIELD_HINTS` / `NEW_CHAPTER_FIELDS` / `FIELD_SPLITS` 并在此合并）
- `ceshuChapterFields/`（9 文件 / 491 行）：P2 扩展 7 章（`index.ts` 聚合为 `NEW_CHAPTER_FIELDS`）+ 类型
- `ceshuFieldHints/`（23 文件 / 1280 行）：`Record<field,{aiHint,reviewHint}>`
- `ceshuFieldSplits/`（24 文件 / 325 行）：`string[]`（三件套拆分清单）
- `ceshuTemplateData/`（18 文件 / 1476 行）：章节模板内容

**消费方只有 4 个文件**（`ceshuDefaults` / `ceshuFields` / `ceshuTemplateData.ts` / `ceshuTemplates`），没散到全 app——这是好消息：合并风险被收口在 schema 子系统内部。

**痛点**：改一个字段的 hint 要碰 `ceshuFieldHints/<章>`；新增字段可能要碰 `ceshuFields`（或 `ceshuChapterFields`）+ hint 文件 + 可能 split + template，共 4+ 文件。

### 方案（增量式，旧模块 re-export 兜底，零行为变更）
1. 新目录 `ceshuSchema/`，每章一个文件导出统一形态：
   ```ts
   export const ECONOMY_SCHEMA: ChapterSchema = {
     currency_types: { def: {...}, aiHint: '...', reviewHint: '...' },
     production_chain: { def: {...}, aiHint: '...', reviewHint: '...', split: true },
     // ...
   }
   ```
   `ChapterSchema` 聚合：字段定义 + hint + 是否拆分 + 模板片段。
2. **兼容层**：旧的 `ceshuFieldHints/economy.ts` 改为 `export const ECONOMY_FIELD_HINTS = toHints(ECONOMY_SCHEMA)`、`ceshuFieldSplits/economy.ts` 改为从 schema 派生 `ECONOMY_FIELD_SPLITS`、`ceshuChapterFields/economy.ts`（如有）同理。这样 `ceshuFields.ts` 的 merge point **一行都不用改**，聚合器无感。
3. 按章逐个迁移（24 章），每迁一章删掉对应的 1~4 个旧文件、保留 re-export 兜底；单测全绿。
4. 全部迁完后，可选：让 `ceshuFields.ts` 直接从 `ceshuSchema/*` 取数，删除兼容层。

### 风险与对策
- 被 2555+ 单测间接依赖（字段数、契约、hint 都在测里断言）→ 每步全量单测 + 加一条结构守卫测试（`tests/unit/ceshuSchema.guard.test.ts`）：断言全表字段总数 === 334、每章字段数、每章拆分数均为迁移前基线，并对试点章（economy）做合并后字段数组的**深度相等**断言。防漏迁 / 错迁 / 重复迁。
- 三件套拆分语义（`ceshuFieldSplits`）与字段定义耦合，合并时要保证拆分派生的 `_points` / `_notes` 字段数量与现有一致 → 由 `ceshuFieldSplits.test.ts` 的「被拆字段必有配套要点/补充且带契约」守卫兜底。
- 用 re-export 兜底层把「行为变更风险」压到零；真正的文件删除放在最后一轮。

### 实施进度（全量完成，2026-10-24）✅

**落地形态**（试点验证后全量推广，零行为变更）：沿用试点思路——`CeshuFieldDef` 本就带 `aiHint`/`reviewHint`/`aiDraftable`，旧架构只是把它们放另一文件再合并；合并 = 把契约**内联回 field def**、把 `_points`/`_notes` 拆分契约放进 `splitHints`，由 `toFieldHints(schema)` 派生 hint map。真正单源，改一个字段只碰一个文件。

- 新目录 `ceshuSchema/`：24 章全部落地（`types.ts` + `economy.ts` 手工试点 + 其余 23 章由代码生成脚本从合并产物反推，保证与现状逐字节一致）。每章导出 `<NAME>_FIELDS`（字段定义 + 内联契约）、可选 `<NAME>_SPLIT_HINTS`、`<NAME>_SCHEMA`。
- `ceshuFieldHints/*`（23 文件）、`ceshuFieldSplits/*`（24 文件）全部改为从 schema 派生（re-export 兜底，`ceshuFields.ts` 合并点零改动）；`ceshuChapterFields/*`（P2 7 章）改为 `import <NAME>_FIELDS` + 保留 `defaults`（字段单源，默认数据暂留原处，后续批次迁入）。
- `ceshuFields.ts`：删除 `f` 助手与 `import * as OPT`（OPT 的 optionLabels 已内联进 schema 字段）；`BASE_CHAPTER_FIELDS` 由 17 段内联 `f(...)` 块缩减为 17 条 schema 引用。
- 守卫测试 `ceshuSchema.guard.test.ts`：总字段数 334、25 章字段数、24 章拆分数、economy 合并数组深度相等——全量迁移后仍通过，证明零行为变更。

**验证**：全量单测 2559 通过 / 5 跳过、三套 `tsc` 0 错、eslint 0（`--fix` 时修正了生成文件里 4 处带空格的 `optionLabels` key 漏加引号的语法错误：`tech.ts` 的 `Unreal Engine`、`audio.ts` 的 `CRI ADX` / `Unity Audio` / `Unreal Audio`）。

**收尾（同日完成，2026-10-24）✅**：`defaults` / `templates` 已由生成脚本从运行态 `createDefaultChapters()` / `CHAPTER_TEMPLATES` 提取并注入 24 个 schema（`<NAME>_SCHEMA.defaults/templates` + 新增 `<NAME>_DEFAULTS` / `<NAME>_TEMPLATES` 导出；story 模板池为 worldview+characters 合并态、P2 七章 `[]`）。随后：
- 新增 `ceshuSchema/index.ts`：`CHAPTER_SCHEMAS: Record<ChapterKey, ChapterSchema>` 唯一聚合入口 + `FIELD_SPLITS` 再导出（由各 `schema.splits` 派生，覆盖全部 24 章）；
- 类型收口：`FieldHint` / `ChapterFieldHints` / `ChapterFieldSplits` 移入 `ceshuSchema/types.ts`（`ExpansionChapterKey` / `ChapterDefinition` 随旧目录消亡，不再保留）；
- 三个消费方改为直接消费 `CHAPTER_SCHEMAS`：`ceshuFields.ts`（schema 取字段 → applySplits → `toFieldHints` 叠加契约）、`ceshuDefaults.ts`（遍历克隆 `schema.defaults` + meta.date/version / systems 动态覆盖）、`ceshuTemplates.ts`（从 schema 构建 `CHAPTER_TEMPLATES`）；
- 删除 4 个旧目录与聚合器：`ceshuFieldHints/`（23）、`ceshuFieldSplits/`（24）、`ceshuChapterFields/`（9）、`ceshuTemplateData/`（18）+ `ceshuTemplateData.ts`。

**行为零变更的实证**：改写 `ceshuFields.ts` 前用临时脚本逐字段对比「旧合并产物」与「schema 派生产物」的解析契约（required / aiDraftable / aiHint / reviewHint）——初版漏叠加 `splitHints` 时抓到 82 处 `_points`/`_notes` 契约回退为通用兜底，改用 `toFieldHints(schema)` 叠加后 0 差异；全量单测 2559 通过 / 5 跳过、三套 `tsc` 0 错、eslint 0。

### 验收
- 全量单测绿；`CESHU_CHAPTER_FIELDS` 字段总数、各章 required 集合与改造前一致（守卫测试）；
- `grep -rn "ceshuFieldHints\|ceshuFieldSplits\|ceshuChapterFields\|ceshuTemplateData" desktop/src` 无任何 import（旧目录已物理删除，仅文档与历史注释提及）；
- 新增 / 修改一个字段只需改 `ceshuSchema/<章>.ts` 一处（达成核心目标）。

---

## 附：不在本次范围（观察项）
- **提示词散落**：`ceshuAi` / `ceshuBundlePrompt` / `ceshuDataGen` / `ceshuDemoPrompt` 各自持有提示词。Demo 提示词单独放合理；其余是否集中优先级低，可后续单列。
- ~~**`checkDesignClaims` 的「未通过含通过」否定词启发式**~~（✅ 已根治，2026-10-24）：`qa.prototype_acceptance` 的结果列收敛为受控枚举「通过 / 未通过 / 部分通过」——`ceshuEvidence.normalizeAcceptanceResult` 白名单归一（受控三值 + 英文等价 + 「待确认」合法中间态；旧自由文本兜底归一，模糊写法一律**不判通过**），`checkDesignClaimsWith` 实测分支改用归一结果判定（`部分通过` 不再被旧启发式放过、`待确认` 报「尚未执行」而非「未通过」）；另注册 `prototypeAcceptance` 校验项，即使没有设计主张也独立提醒无法识别的写法。qa 字段补 aiHint/reviewHint 契约。附带修复：24 个 schema 文件 `splitHints:` 行的 `\r,` 行中控制字符污染（生成器在 CRLF 文件上插逗号位置所致）。
