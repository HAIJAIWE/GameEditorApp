# 策划书「底层骨架 + 生成栈」审计（2026-10-26）

> 用户担心：底层骨架（schema/生成栈/配置）可能搞错了。本报告逐项核对，结论：**骨架没搞错**，
> 但审出**一个真配置问题**（机读字段被塞进生成），已修其一、其二待拍板。

## 一、结论先说

- **底层骨架没搞错**：24 章齐全、字段全存在、契约（aiHint/reviewHint）全齐、24 章 agent 提示词全覆盖。
- **生成栈基本对**，但有一处**语义配置错位**：机读字段（账本/断言/主张/用例）被塞进了"生成"，
  与"机读数据不计入完成度 / 立项不需要写账本"矛盾。

## 二、逐项审计结果

| 检查项 | 结果 | 证据 |
|---|---|---|
| 机读字段是否都存在 | ✅ 是 | `economy.ledger` 用辅助函数 `f('ledger',…)` 定义（economy.ts:53），其余用 `key:` |
| 24 章 agent 映射 | ✅ 全覆盖 | `CHAPTER_KEYS=24`；missing map `[]` |
| 24 章 agent 提示词 | ✅ 全覆盖 | missing/empty prompt `[]`（`combat` 与 market_analysis 写在同一行，grep 会漏） |
| 单字段生成喂契约 | ✅ 是 | `buildChapterPrompt` 用 `resolveFieldMeta` 注入 aiHint/reviewHint |
| 整章生成喂契约 | ⚠️ 不喂 | 刻意为之（避免提示词膨胀），非 bug |
| 整章生成字段清单 | ⚠️ 含机读字段 | `chapterGenerationKeys` 不筛 `isMachineDataField` |
| 克隆（立项一页）骨架 | ❌ 曾含机读字段 | `buildSkeleton` 用全字段 → **已修为剔除** |
| schema 写法一致性 | ⚠️ 不统一 | `economy.ts` 用 `f()`，其余章用 `key:` |

## 三、唯一真问题：机读字段进了生成

**表现**：
- 生成 `economy` 章 → 会顺带要求 AI 写「经济账本」；
- 生成 `numeric` 章 → 会要「数值断言 / 设计主张」；
- 「复刻/立项一页」骨架 → 也要账本、断言。

**矛盾**：这些字段是"机读数据，不计入完成度"，立项阶段本就不该写账本。

**处理**：
- ✅ **已修**：克隆骨架 + 解析都剔除机读字段（`ceshuClonePrompt.ts`），并加守卫（提示词不含 `ledger`/`numeric_assertions`；解析丢弃机读）。
- ⏳ **待你拍板**：整章生成（单章/一键）要不要也剔除机读？
  - 剔除 → 生成更聚焦；但"一键生成"可能不再产出账本/断言（此前"追平豆包"演练是包含它们的）；
  - 不剔除 → 保持现状，AI 会生成机读数据（可能多余）。

## 四、schema 写法不一致（小问题）

`economy.ts` 用 `f('ledger', …)` 辅助函数，其余章用 `key: '…'` 直写。
**影响**：工具/grep 容易漏（本次审计我就被误导过一次：以为 ledger 不存在，其实是 `f()` 定义）。
**不是 bug**，但建议：统一写法，或改用 `resolveFieldMeta` 遍历的守卫，别靠 grep。

## 五、建议

1. ✅（已做）克隆骨架剔除机读字段。
2. ⏳（待定）整章生成是否剔除机读字段 —— 你定。
3. （可选）schema 写法统一 / 加遍历守卫。
4. 生成栈其余部分（提示词单源、契约、agent 覆盖）健康，**不需要动**。

## 六、涉及文件

`src/shared/ceshuAi.ts`（buildChapterPrompt / chapterGenerationKeys）、`src/shared/ceshuAiData.ts`（agent 提示词单源）、
`src/shared/ceshuClonePrompt.ts`（已修）、`src/shared/ceshuDemoPrompt.ts`、`src/main/ai/tasks/ceshu.ts`（编排）。
