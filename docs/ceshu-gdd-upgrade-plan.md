# 策划书（GDD）改造方案 —— 按 game-designer-pro 方法论

> 目标：让策划书「**一页拿得出手 + 断言可校验 + 审阅更细**」，且不破坏现有 24 章骨架、守卫测试与老文档兼容。
> 原则：低风险优先；**只加字段不删章**；能复用就复用。

## 1. 现状对照（已核对代码）

| skill 要求 | 项目现状 | 结论 |
|---|---|---|
| 设计支柱 + 反例 | `vision.design_pillars` **已是 pipeList**，placeholder 就是「支柱\|裁决\|反例」，`aiHint` 也要求反例 | **概念已有**，只缺 `columns`（导出/表单没按列渲染） |
| 可复算断言 | `numeric.numeric_assertions` 是 pipeList，placeholder「断言\|表达式\|期望值\|容差\|接受条件」 | **概念已有**，同样缺 `columns` |
| 设计首页（叙事） | 字段散在 `meta`/`vision`/`gameplay`；`onepage` 导出是「字段完成度清单」 | **缺「首页叙事」导出** |
| 范围与非目标 | 无 `non_goals` 字段 | 缺 |
| 三层循环 + 传递物 | 只有 `gameplay.core_loop` | 缺 |
| 60–120 秒走读 | 有 `first_30_min`（首 30 分钟体验），不是连续片段 | 缺 |
| `ruleset_id` / 契约校验 | 无 | 缺（L2） |
| 7 条反审 | AI 审阅 5 个粗维度 | 缺（L3） |

> **关键发现**：支柱反例、可复算断言在字段层面**早就有了**，只是没有 `columns`，导出成 `a|b|c` 文本。补 `columns` 是「一行改动、零迁移」的纯收益。

## 2. L1 文档结构（低风险，先做）

### 2.1 给已有 pipeList 补 `columns`（零迁移）

- `vision.design_pillars` 加：
  ```ts
  columns: [
    { key: 'pillar', label: '支柱' },
    { key: 'ruling', label: '裁决' },
    { key: 'anti', label: '反例（明确不做）' }
  ]
  ```
- `numeric.numeric_assertions` 加：
  ```ts
  columns: [
    { key: 'claim', label: '断言' },
    { key: 'expr', label: '表达式' },
    { key: 'expected', label: '期望值' },
    { key: 'tolerance', label: '容差' },
    { key: 'accept', label: '接受条件' }
  ]
  ```
- 效果：导出（md / html / docx）自动渲染成表（上一轮 `pipeTable` 已支持）；表单 `FieldControl` 的 pipeList 列渲染自动生效。
- **迁移：无**——旧值 `a|b|c` 会被 `splitRow` 按列拆开。
- 文件：`src/shared/ceshuSchema/vision.ts`、`src/shared/ceshuSchema/numeric.ts`。
- 测试：`tests/unit/ceshuExport.test.ts` 加断言（支柱/断言渲染成表）。

### 2.2 新增「设计首页」导出（`homepage`）

- 现状：`export/onepage.ts` 是「字段完成度清单」，不是叙事首页。
- 改法：新增 `src/main/ceshu/export/homepage.ts`，`renderCeshuHomepage(doc): string`，按 skill 首页结构聚合：
  - 定位（`meta.positioning`）、目标玩家（`vision.user_personas.primary/secondary`）、核心幻想（`vision.design_vision`）、设计支柱（`design_pillars` 表格）、循环一句话（`gameplay.core_loop`）、范围与非目标（`meta.non_goals`）、关键结论（可选：从评分/审阅派生）。
- 接入：`CESHU_EXPORT_FORMATS` 加 `homepage`（标签「设计首页（Markdown）」、扩展名 `.md`）；`exporter.ts` 加 `case 'homepage'`。
- **不改**现有 `onepage`（避免破坏「同口径」）。
- 文件：`src/main/ceshu/export/homepage.ts`（新）、`src/shared/ceshuConstants.ts`、`src/main/ceshu/export/exporter.ts`。
- 测试：`tests/unit/ceshuExport.test.ts` 加 homepage 断言。

### 2.3 新增 3 个字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `meta.non_goals` | `stringList` | 范围与非目标（每行一条「明确不做」） |
| `gameplay.loop_three_layers` | `pipeList` + columns | 三层循环：层级 / 关注问题 / 玩家动作 / 系统变化 / 反馈 / 传递物 |
| `gameplay.playthrough_120s` | `textarea` | 60–120 秒连续走读（进入→第一眼→选择→代价→恢复） |

- 迁移：新字段默认空，老文档不受影响。
- **守卫更新**：`tests/unit/ceshuSchema.guard.test.ts` 的 `BASELINE_TOTAL_FIELDS` **337 → 340**，并更新 meta / gameplay 的每章字段数基线。
- 文件：`src/shared/ceshuSchema/meta.ts`、`gameplay.ts`、`tests/unit/ceshuSchema.guard.test.ts`。

## 3. L2 设计契约（机械保障，第二批）

### 3.1 `ruleset_id`

- `CeshuDocument` 加 `ruleset_id?: string`；默认派生 `ceshu-<ceshu_id>-v<version_label>`（不强制落盘，导出/Demo 引用）。
- 落盘：`config.json` 加 `ruleset_id`（`buildProjectFolder` / `projectFilesToDoc`）。
- 文件：`src/shared/ceshuConstants.ts`（类型）、`src/shared/ceshuModel.ts`（派生）、`src/shared/ceshuProjectFolder.ts`（config）。

### 3.2 契约校验器 `shared/ceshuContract.ts`

- `buildContract(doc)` → `{ ruleset_id, parameters, assertions, prototype, journeys }`（从 `numeric_assertions` / `prototype_acceptance` / `acceptance_journeys` / `test_case_list` 抽取）。
- `validateContract(contract)` → findings：必填、断言求值、原型检查需证据、旅程覆盖。
- **核心难点**：TS 侧**不能用 `eval`**。需写一个受限表达式求值器（只允许数字/参数名/`+ - * / ( )`/比较/`ceil/floor/min/max/round`），或复用现有 `attrSystem` 的公式解析器。
- 文件：`src/shared/ceshuContract.ts`（新）、`tests/unit/ceshuContract.test.ts`（新）。
- UI：`CeshuMachineDataPanel` 加「契约校验」按钮 + 结果列表。
- 风险：中-大（表达式求值是主要工作量）。

### 3.3 契约落盘

- `data/contract.json`（项目文件夹），`buildProjectFolder` / `projectFilesToDoc` 特判（像 `data/tasks.json`）。
- 风险：中（往返无损 + 特判）。

## 4. L3 成稿反审（第三批，已实施）

**实施结果（2026-10-26，偏离原方案）**：原方案拟「5 维度评分 → 7 维度评分」。落地时按用户判断改为：

1. **不打分**——1-10 分给不出「能不能交付」的结论，跨品类也不可比。改为**三级判定** `pass / suggestion / blocker`（通过 / 建议 / 阻塞）。
2. **7 项清单**直接采用 skill `game-designer-pro` 的 `references/adversarial-review.md` 权威条目：约束与事实 / 核心选择 / 数值与可达性 / 口径与单位 / 生命周期 / 生产责任 / 同一规则集。
3. **品类自适应**——「核心选择 / 数值与可达性」两项的追问按 `meta.game_type` 换档（`GENRE_PROFILE_BY_TYPE` 22 取值 → 13 档 `GENRE_REVIEW_PROFILES`）：动作类查 TTK，塔防查波次可达，放置查离线收益指数，视觉小说查分支代价（无战斗数值）。

- 常量单源：`src/shared/ceshuAiData.ts`（`ADVERSARIAL_CHECK_KEYS/LABELS/PROBES`、`ADVERSARIAL_LEVELS/LABELS`、`GENRE_PROFILE_BY_TYPE`、`GENRE_REVIEW_PROFILES`、`reviewProbeFor`、`genreReviewProfile`、`resolveGenreProfileKey`）。
- 逻辑：`ceshuAi.ts`（`buildReviewPrompts` 注入品类追问 + 规则集标识；`parseReviewResponse` 出 findings；**新增 `finalizeReview`** 回填品类 / 规则集 / 追问）。
- 面板：`AiReviewPanel.tsx`（清单行 `.review-check-*`，替代评分条 `.review-dim-*`）。
- 守卫/测试：`ceshuPrompts.registry.test.ts`（7 项 + 品类追问必须不同）、`ceshuAi.test.ts`、`ceshuAiChannels.test.ts`、`tests/unit/dom/ceshuReviewPanel.test.tsx`、`tests/e2e/ceshu-ai-review.spec.ts`。
- 验收达成：面板显示 7 项、每项三级判定 + 品类追问，报告含阻塞/建议分级。**（原「维度数量/顺序」守卫改为「检查项数量/顺序」）**

## 5. 风险与迁移总表

| 改动 | 迁移 | 影响的守卫/测试 |
|---|---|---|
| `design_pillars` / `numeric_assertions` 加 `columns` | 无（旧值自动按 `\|` 拆列） | `ceshuExport.test.ts`（新增断言） |
| 新增 `non_goals` / `loop_three_layers` / `playthrough_120s` | 无（新字段默认空） | `ceshuSchema.guard.test.ts`（337→340 + 每章计数） |
| `homepage` 导出 | 无 | `ceshuExport.test.ts` |
| `ruleset_id` | 老文档派生默认值 | `ceshuProjectFolder.test.ts`（config 往返） |
| `ceshuContract.ts` | 无 | 新测试 |
| 7 项反审（替代 5 维度评分） | 无（审阅结果不落库，仅面板/报告） | `ceshuPrompts.registry.test.ts`（项数 + 品类追问）、`ceshuAi.test.ts`、`ceshuAiChannels.test.ts`、`dom/ceshuReviewPanel.test.tsx`、`e2e/ceshu-ai-review.spec.ts` |

## 6. 执行顺序与验收

- **第一批 L1**（1–2 天）：2.1 加 columns → 2.2 homepage → 2.3 三个字段 + 守卫。
  - 验收：导出 homepage 可读、支柱/断言渲染成表、337→340 守卫更新、老文档不报错。
- **第二批 L2**（3–5 天）：`ruleset_id` → 断言结构化 → `ceshuContract.ts` → 面板。
  - 验收：契约校验 PASS/FAIL、老断言自动适配、**无 `eval`**。
- **第三批 L3**（1–2 天）：7 项反审 + 阻塞/建议分级（**已实施**，见 §4）。
  - 验收：反审面板显示 7 项、每项三级判定 + 品类追问、报告分级。✅
- 每批都跑：`tsc` 三套 / `eslint` / `vitest` / `build`。

## 7. Non-goals

- 不删 / 不改 24 章骨架（只加字段）。
- 不引入 skill 的「飞书交付」（项目有自己的 10 种导出）。
- 不做 `validate_design_contract.py` 的完整 Python 移植（TS 实现核心子集）。
- 不改现有 `onepage`（完成度清单）语义。
