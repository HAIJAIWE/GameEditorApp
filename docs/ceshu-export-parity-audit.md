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

实测：**335 个字段全部命中**，`missing = []`、`misplaced = []`。

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

## 四、验证记录

| 闸 | 结果 |
|---|---|
| `vitest run` | 225 文件 / **2973 测试通过**（新增对拍 2 例 + 残缺文档守卫 2 例） |
| `tsc --noEmit`（node / web / test-dom） | 0 错 |
| `eslint`（改动文件） | 0 错 |
| `npm run build` | OK |

## 五、给后续维护者的两条不变式

1. **导出侧任何新增过滤条件，必须同步附录**——否则「编辑器里写了、文档里没有」会再次出现。
   `ceshuExportFieldParity.test.ts` 会在第一时间变红。
2. **校验器永不抛异常**——`validateCeshu` 对残缺输入只报告、不崩溃。新增检查若读 `doc.<章>.<字段>`，
   一律用可选链；`ceshuValidation.test.ts` 的「残缺文档不抛错」守卫会兜底。
