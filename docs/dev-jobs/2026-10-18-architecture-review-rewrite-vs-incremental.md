# 架构评估：整体重写 vs 渐进式优化

> 评估对象：`desktop/`（Electron 44 + React 19 + TS 6 + 四层 typed IPC）
> 评估日期：2026-10-18
> 方法：**以实测取证为准，不采信文档自述**。规模/引用面用命令重算，结论逐条对照 `desktop/docs/` 下的既定路线文档。
> 性质：**提案，未执行**。按铁律「涉及结构改动必先确认 scope」，本文只出结论与步骤，不擅自改结构。

---

## 0. 结论（TL;DR）

**推荐「渐进式架构优化」，否决「整体重写」。**

这不是一个新判断，而是对既定裁定的延续与细化——`docs/dev-jobs/2026-10-18-refactor-scope-proposal.md` 已把护栏写死：

> 架构范式 = **模式二 分层架构型**（agent 子系统已达标，**只加固不重建**）。

真正需要新增的只有一条：**把当前并行的两套 AI 编排栈收口成一套共享 harness**。这是 `agent-architecture-review-2026-10-18.md` §0 已指出的**唯一结构性不一致**，也是「每加一个 AI 功能就重造一遍防护」的根因。

其余动作都是**减法与补测**，不涉及重排目录。

---

## 1. 评估基线（实测）

### 1.1 规模

| 层 | 文件 | 行数 | 占比 |
|---|---:|---:|---:|
| `src/shared/` | 135 | 24,272 | 44.4% |
| `src/renderer/src/` | 76 | 18,359 | 33.6% |
| `src/main/` | 89 | 11,836 | 21.6% |
| `src/preload/` | 1 | 204 | 0.4% |
| **合计** | **301** | **54,671** | 100% |

测试：**137 个 unit 测试文件 + 55 个 e2e spec**。当前基线 `vitest` 2075 passed · 5 skipped；e2e 75 例 = 73 passed / 2 skipped。

### 1.2 已经做对的部分（重写的最大反证）

| 机制 | 状态 | 取证 |
|---|---|---|
| 四层 IPC 契约 | 完整 | `schemas.ts` → `ipc.ts` → `api.ts` → `preload`，漏一层 tsc 即红 |
| 分层边界 | 机器可校验 | `eslint.config.mjs` 4 条 `no-restricted-imports`，实测 4/4 `FIRES` |
| 依赖方向 | 单向 | `shared` 反向 import `main`/`electron` = **0 处** |
| 单一写者 | 已落地 | `DataService` 串行写队列 + 原子写 |
| 迁移台账 | 已对账 | 118 已迁 / 15 部分 / 166 有意不迁 / **0 未迁**（299 文件 91,164 行） |
| 覆盖基线 | 已立 | Stmts 94.04% / Branches 83.86% / Lines 95.65% |

**结论**：这不是一个"烂到需要重写"的代码库，而是一个**结构正确、局部失焦**的代码库。

---

## 2. 当前架构的主要问题

按"是否影响后续每一次改动"排序。

### P0-1 两套并行的 AI 编排栈（结构性，唯一需要动架构的问题）

- 证据：`brainService.runBrainLoop` 只服务数字员工对话面板；而 `ceshu:aiGenerateChapter` / `aiGenerateData` / `aiReview` 三个能力在 `ceshuIpc.ts` 里**各自 inline** 地接确认门（DD-17）与质量门（DD-19），**不经同一套 harness**。
- 后果：每新增一个 AI 功能 = 重造一遍「预算估算 + 取消 + 计费观测 + 质量门」。三处已经开始出现参数漂移（`taskType` / `bulk` / `confirmed` 各写各的）。
- 参照：`agent-architecture-review-2026-10-18.md` §0、§1.2。

### P0-2 产品主线失焦：旁路报告占了大量体量

- 实测：`校验/打分/diff/字数/清单/字段依赖/迁移` 七项共 **3,301 行**模块 + **1,044 行**面板，对应 8 个测试文件。
- 关键事实：**`main/ceshu/manager.ts` 的保存路径里没有任何 `validateCeshu`/`scoreCeshu` 调用** ⇒ 这七项**没有任何一项能拦住任何操作**，全部是"人主动点开才消费"的报告。
- 其中真正进 AI 主循环的只有 `validate` + `score`（经 `qualityGate`）；`diff`/`字数`/`清单`/`字段依赖` 是纯旁路。
- 后果：维护面积与产品价值不匹配；新人读代码时无法判断哪条是主线。

### P1-1 `shared/` 过厚（44.4%），且部分下沉被架构锁死

- 根目录仍平铺 28 个文件，其中 **27 个是 rule 4 倒逼**（main 的 store/ipc 直接消费确定性逻辑）。
- 这不是欠账：`shared-layering-design.md` §5.1 已证明 `shared` 的位置被 `tsconfig.node.json`(含 tests) 与 `tsconfig.web.json`(不含 tests) **双向锁死**，下放 renderer 会立刻 TS6307。
- 结论：**只能靠"减内容"而非"搬目录"解决**——见 P0-2。

### P1-2 渲染层测试覆盖 ≈ 0（风险最大的空白）

- 实测：node 套件只覆盖 renderer 的 1 个文件；React UI 无 jsdom 设施。
- 后果：`CeshuView.tsx`(926) / `App.tsx`(838) 这两个最该拆的组件，**恰恰是最不敢动的**——拆了没有回归网，只能靠 e2e 兜底（而 e2e 跑的是 `out/` 产物，反馈慢）。

### P2-1 单文件过大

最大文件 930 行（`ceshuChecklistItems.ts`，纯数据）、`CeshuView.tsx` 926、`App.tsx` 838。无千行以上文件，但 800+ 的三个都是"编排 + 展示"混合体。

### P2-2 重复符号残余

`toErrorMessage`(21 份) / `isPlainObject`(5) / `readText`(7) 已收敛；但跨文件重复导出名仍有 **46 处**，主要是 `*_LABELS` 常量族。另有 1 个已确认死模块：`shared/domain/ceshu/ceshuOptionLabels.ts`（38 个常量，全局 0 引用）。

---

## 3. 优化目标（可度量）

| # | 目标 | 当前 | 目标 | 度量方式 |
|---|---|---|---|---|
| G1 | 可维护性：AI 能力新增成本 | 每个功能重造一遍 harness | 新增 AI 能力只写"提示词 + gate" | 新增一个 AI 通道需改的文件数 ≤ 4 |
| G2 | 可维护性：主线可辨识 | 旁路 4,345 行与主线混排 | 旁路归零或明确标注 | `shared/` 净减 ≥ 2,500 行 |
| G3 | 性能：不退化 | 5000 条 × 20 轮基线已立 | 不劣于基线 10 倍阈值 | `MB_PERF=1` 用例 |
| G4 | 可扩展性：分层可校验 | 4 条规则 FIRES | 新增代码不破坏规则；harness 层纳入规则 | eslint 0 违规 |
| G5 | 回归安全：渲染层 | 1 文件覆盖 | 两个大组件各有组件测试 | 新增测试文件数 ≥ 2 |
| G6 | 功能不回退 | e2e 73 passed / 2 skipped | 每波结束保持该基线 | e2e 整包 |

> 明确**不设**的目标：不追求目录重排、不追求行数减少本身、不引入新框架。依据 `shared-layering-design.md` §5.2——"拆分不改变任何单文件行数，只是重新排列"。

---

## 4. 两个方案的评估

### 4.1 方案 A：整体重写

**做法**：保留产品语义与测试资产，重搭 `main`/`preload`/`renderer`，以"正确架构"重新实现。

| 维度 | 评估 |
|---|---|
| 收益 | 能一次性消除双 AI 栈、shared 过厚、大组件混合；可自由选型 |
| 成本 | 54,671 行重写 + 137 个单测 + 55 个 e2e 重写；保守估计 3–5 个月 |
| 风险 | **极高**：① 仓库**无远程、仅 1 个本地分支**，重写没有安全网（`MEMORY.md` 铁律）② 55 个 e2e spec 就是行为契约，重写期它们全部失效 ⇒ 无法判断"功能有没有丢" ③ 166 个"有意不迁"的产品决策会在大重写中被无声推翻 |
| 适配度 | 差。当前问题里只有 P0-1 是结构性的，其余是**减法与补测**——用重写解决减法问题，等于用手术刀削苹果 |

**结论：否决。** 唯一能支持重写的理由是"架构已经不可维护"，但实测证据（分层 FIRES、依赖 0 违规、覆盖 94%）不支持这个前提。

### 4.2 方案 B：渐进式架构优化

**做法**：不动分层骨架，只做四件事——① 减内容（砍旁路）② 收口（统一 AI harness）③ 补网（渲染层测试）④ 拆大件（按需）。

| 维度 | 评估 |
|---|---|
| 收益 | 直击 4 个真实痛点；每波独立可交付、可回滚；既有 4 道闸全程有效 |
| 成本 | 4 个 wave，合计约 2–3 周（不含大组件拆分） |
| 风险 | 中低：每波都有明确的"净删除/净新增上限"与复验口径 |
| 适配度 | 高。与既定护栏（只加固不重建）、既有纪律（四道闸 + e2e + tag 锚点）完全兼容 |

**结论：推荐。**

### 4.3 方案 C（备选）：只做产品收口，不碰 AI 栈

只做 P0-2（砍旁路）+ P2-2（清重复），**不动** `ceshuIpc` 的三个 AI 通道。

- 优点：成本最低（约 3–5 天），零架构风险。
- 缺点：双 AI 栈的债继续滚；下一个 AI 功能仍然要重造一遍防护。
- 适用：如果近期不打算再加 AI 能力，这是性价比最高的选择。

### 4.4 方案 D（备选）：什么都不做

边界会继续退化：旁路功能会随需求继续膨胀（已有 7 项），双栈会让第三个、第四个 AI 功能各写一套确认门。

### 4.5 决策矩阵

| 方案 | 成本 | 风险 | 解决 P0-1 | 解决 P0-2 | 解决 P1-2 | 推荐 |
|---|---:|---|---|---|---|---|
| A 整体重写 | 极高 | 极高 | ✅ | ✅ | ✅ | ❌ |
| **B 渐进式（四波）** | 中 | 中低 | ✅ | ✅ | ✅ | ✅ **推荐** |
| C 仅产品收口 | 低 | 低 | ❌ | ✅ | ❌ | ⚠️ 备选 |
| D 不动 | 0 | — | ❌ | ❌ | ❌ | ❌ |

---

## 5. 推荐的模块与分层划分

**关键决定：不新增物理层，只在 `main/` 内部新增一个编排目录 `main/ai/`。** 理由：分层规则已机器可校验，加一层要同步改 4 条 eslint 规则 + `shared/README.md`，收益不抵成本。

### 5.1 目标态

```
src/
  shared/                    ← 三端共享，零环境依赖（现状不动）
    ipc.ts / schemas.ts      ← 契约（不动）
    service/api.ts           ← MbApi（不动）
    domain/ceshu/**          ← 策划书纯逻辑
    domain/attr/**           ← 属性纯逻辑
    util/**                  ← 通用工具
  main/
    index.ts                 ← 组合根（不动）
    ipc.ts + ipc/*.ts        ← 注册器（薄转发，不动）
    ai/                      ← ★ 新增：统一 AI 编排（本次唯一结构新增）
      runner.ts              ← AiTaskRunner：预算/取消/观测/质量门 的唯一入口
      gate.ts                ← 质量门适配（复用 shared/agent/qualityGate）
      tasks/ceshu.ts         ← 四类策划书 AI 任务，只写提示词 + gate
    data/ ceshu/ attr/ ...   ← 领域服务（不动）
  renderer/src/
    App.tsx                  ← 只做路由壳 + 全局状态 + 通知
    components/ceshu/        ← 按域拆分后的面板
```

### 5.2 分层职责与依赖方向

| 层 | 职责 | 允许依赖 | 禁止 |
|---|---|---|---|
| contract | 契约 + 校验 | — | 业务、electron |
| domain | 纯业务规则 | util | electron、main、zod |
| util | 无业务通用函数 | — | domain、业务 |
| **ai/orchestration** | 编排 AI 任务：预算、取消、观测、门 | contract、domain、llm client | 直接写存储 |
| adapter | 存储/文件/IPC 落地 | contract、domain、ai | 被 renderer 直接 import |
| renderer | 展示 + 交互 | contract、api | main、electron、fs |

**新增一条可校验规则**：`main/ai/**` 不得 import `main/data/**`、`main/ceshu/**`（编排不碰存储，产出由调用方落盘）。这条规则让"AI 只出候选、不写盘"从**约定**变成**机器校验**。

---

## 6. 关键接口设计

### 6.1 AiTaskRunner（收口的核心）

把现有 `runSingleShotTask` 的职责（预算/取消/观测）与散落各处的质量门合并成一个入口：

```ts
export interface AiTask<T> {
  kind: 'chapter' | 'field' | 'datagen' | 'review' | 'chat'
  /** 批量任务需二次确认；单字段不需要 */
  bulk: boolean
  /** 预算估算（token） */
  estimate: () => number
  /** 实际调用；signal 由 runner 注入，调用方不得自建 */
  call: (signal: AbortSignal) => Promise<{ value: T; model: string; usage?: Usage }>
  /** 可选质量门：纯函数，不调 LLM */
  gate?: (value: T) => QualityVerdict
  senderId: number
}

export interface AiTaskRunner {
  run<T>(task: AiTask<T>): Promise<{ value: T; quality?: QualityVerdict; usage?: Usage }>
}
```

**收益**：三个 `ceshu:ai*` 通道从"各自 60–80 行的内联编排"退化成"构造一个 `AiTask`"。新增 AI 能力只写提示词与 gate。

**不变量**：`gate` 只做判定，**不阻断**——失败降级为 `null`（沿用 `applyJudge` 的既有语义），避免"质量门挂了导致生成失败"。

### 6.2 QualityGatePort

```ts
export interface QualityGatePort<T> {
  evaluate(before: unknown, after: T): QualityVerdict
}
```
现有 `evaluateChapterDraft` / `evaluateDataCandidates` 直接适配，**签名不改**——避免动 `shared/agent/qualityGate.ts` 这个被 6 处消费的模块。

### 6.3 IPC 契约

**不动** `IpcContract` 的现有键。收口发生在主进程内部，渲染层与 preload 零改动——这是本方案能做到"不回退功能"的关键。

---

## 7. 分阶段迁移步骤

每波独立可交付、可回滚，波内不允许跨波改动。

### Wave 0：产品收口（减法，零架构风险）

| 项 | 动作 | 净变化 |
|---|---|---|
| 删旁路报告 | `ceshuWordStats` / `ceshuChecklist`(+`ceshuChecklistItems`) / `ceshuFieldDeps`(+Data)：模块 + 面板 + 通道 + 测试 | −约 2,100 行 |
| 删死模块 | `shared/domain/ceshu/ceshuOptionLabels.ts`（0 引用） | −约 100 行 |
| 删死通道 | `ceshu:versions`（渲染层零调用，`changelog`/`derive` 仍在用） | −1 通道 |
| 合并重复 | `STATUS_WARNING` / `STATUS_META` 两处定义 | 收敛 2 常量 |
| **暂不动** | `validate` / `score`（进 qualityGate）、`diff`（与版本机制绑定）、`migration`（存量数据依赖） | — |

**复验**：tsc 0 / eslint 0 / vitest 全绿 / build OK / e2e 73 passed。
**对齐**：`refactor-scope-proposal.md` 的 Wave 1（P1+P2）与 Wave 3（P4 判定"纯数据、建议不动"——本波直接删除而非拆分，因为已确认是旁路）。

### Wave 1：统一 AI harness（唯一结构改动）

1. 新增 `main/ai/runner.ts`（`AiTaskRunner` 实现，内部复用 `runSingleShotTask`）；
2. 新增 `main/ai/gate.ts`（适配 `qualityGate`，签名不改）；
3. 新增 `main/ai/tasks/ceshu.ts`，把 `aiGenerateChapter` / `aiGenerateField` / `aiGenerateData` / `aiReview` 四段内联编排搬进来；
4. `ceshuIpc.ts` 退化为"构造 AiTask + 调 runner"；
5. eslint 新增 1 条规则：`main/ai/**` 不得 import `main/data/**`、`main/ceshu/**`。

**复验**：四道闸 + e2e（`ceshu-ai-datagen.spec.ts` 必须过，它用 Ollama 桩服务打通全链路）+ 手工核对三条 AI 通道的 `usage`/取消行为不变。
**对齐**：`agent-architecture-review-2026-10-18.md` §3「🔴 必须改」的第一条；`agent-framework-design.md` v1.7 的 DD-17/DD-19 契约不变。

### Wave 2：渲染层测试地基

1. 引入 jsdom + 组件测试（唯一可能新增的 devDependency）；
2. 先给 `App.tsx` / `CeshuView.tsx` 补**行为级**测试（面板开关、错误条、模式切换），不追求覆盖率；
3. 建立"改渲染层先跑组件测试"的本地习惯。

**复验**：新增测试文件 ≥ 2，且能在 `vitest` 默认运行中通过。
**对齐**：`code-quality-assessment.md` P1#7 的遗留项（"针对 renderer 补组件测试"）；`ts-migration-roadmap.md` §4 已记录"typecheck/eslint/vitest 都抓不到 UI 布局问题"，本波正是补这个洞。

### Wave 3：大组件拆分（按需，需单独确认拆法）

- `CeshuView.tsx`(926) → 章节导航 / 字段编辑 / AI 区 / 面板宿主；
- `App.tsx`(838) → 路由壳 / 全局状态 / 通知；
- 拆分前必须先有 Wave 2 的测试网。

**复验**：e2e 整包（`ceshu-*.spec.ts` 全量）+ 渲染截图抽查。
**对齐**：`refactor-scope-proposal.md` P3（原文即"列为 wave 2，先确认拆法再动手"）。

### 波次依赖

```
Wave 0 ──→ Wave 1 ──→ Wave 3
              └─────→ Wave 2 ──┘
```
Wave 0 与 1 可并行（改动面不重叠）；Wave 3 必须在 Wave 2 之后。

---

## 8. 风险控制措施

| 风险 | 措施 | 依据 |
|---|---|---|
| 删错东西导致功能丢失 | 每个删除项先 grep 三处：`IpcContract` 键、`preload` 映射、渲染层调用点 | 本次已对 7 个模块执行过 |
| 无远程仓库，改坏无法恢复 | 每波开始前打 tag 锚点（`pre-waveN`） | `MEMORY.md` 铁律：仅 1 本地分支 |
| 大 diff 混入无关改动 | 只 `git add <显式文件>`；每波一个提交 | 同上 |
| e2e 反馈慢且跑 `out/` | 每波结束先 `npm run build` 再跑 e2e | `roadmap §4` 已记录该坑 |
| 并行子代理互相踩接线文件 | 沿用禁改清单（`shared/ipc.ts`/`schemas.ts`/`api.ts`/`preload`/`main/ipc.ts`/`main/index.ts`/`CeshuView.tsx`/`App.tsx`/`styles.css`） | `roadmap §5` |
| 收口时静默改变 AI 行为 | Wave 1 前后各跑一次三条 AI 通道，比对 `usage`/`quality`/取消行为 | 新增 |
| 范围蔓延 | 每波设"净变化上限"，超出即停并重新确认 | 新增 |

**兜底判据**：任何一波结束时，若 e2e 出现**新增**红灯（相对 73 passed / 2 skipped 基线），立即回滚该波，不带病前进。

---

## 9. 关键取舍与备选方案

| 取舍点 | 选项 | 建议 | 理由 |
|---|---|---|---|
| 是否重写 | 重写 / 渐进 | **渐进** | 结构已达标；重写失去 55 个 e2e 契约与唯一历史副本 |
| AI 收口深度 | 只合并质量门 / 合并全编排 | **合并全编排** | 只合并门，预算与取消仍会各写各的 |
| 新增 `main/ai/` 还是并入 `main/agent/` | 新目录 / 并入 agent | **新目录** | `agent/` 是对话式编排，与"单发任务"语义不同；并入会让 agent 层被迫承担两种模式 |
| 旁路报告处置 | 删除 / 折叠进"更多"菜单 / 保留 | **删除**（除 diff/migration） | 折叠仍要维护；保留等于继续付维护费 |
| `shared` 减重方式 | 搬目录 / 减内容 | **减内容** | 位置被 tsconfig 双向锁死，搬不动 |
| 渲染层测试选型 | jsdom+组件测试 / 只靠 e2e | **jsdom** | e2e 跑产物、反馈慢，挡不住组件级回归 |

---

## 10. 与既定路线的对齐说明

| 本文动作 | 对齐的既定路线 | 说明 |
|---|---|---|
| 否决整体重写 | `refactor-scope-proposal.md` 护栏「只加固不重建」 | 同一裁定的延续 |
| Wave 0 删旁路 | 同上 Wave 1 / Wave 3 | 原提案按"死代码/重复"处理，本文升级为"产品主线失焦"，范围更大但方向一致 |
| Wave 1 统一 harness | `agent-architecture-review-2026-10-18.md` §0 + §3🔴 | 该报告点名的唯一结构性问题 |
| 不动 `IpcContract` | `ts-migration-roadmap.md` §3「IPC 接线固定 5 处」 | 收口在主进程内部，5 处接线零改动 |
| 不动 166 个"有意不迁" | `migration-audit.md` 台账 | 重写会无声推翻这些决策，渐进不会 |
| 保留两条不变量 | `MEMORY.md`：`skills/**` 零 import 编排层、`shared/agent/**` 零 import main/electron | 本方案不触碰 |
| 每波四道闸 | `roadmap §3` 验证命令 + `§5` 子代理禁改清单 | 原样沿用 |

---

## 11. 需要主理人裁决的三点

1. **旁路报告的最终去留**：`字数` / `清单` / `字段依赖` 确认删除？`diff` 与版本机制一起定，`migration` 需确认是否存在 v4 存量文档。
2. **AI 收口是否纳入本批**：涉及三个 AI 通道的内部重构（对外行为不变），但不做的话双栈债会继续滚。
3. **大组件拆分粒度**：只拆 `CeshuView`/`App`，还是把 >600 行的组件一并理。

---

## 附：本文的取证命令（可复算）

```bash
# 规模
find src -name "*.ts*" | wc -l
for d in main shared renderer preload; do find src/$d -name "*.ts*" | xargs wc -l | tail -1; done
# 七项确定性模块的角色
grep -rl "ceshuValidation" src --include=*.ts --include=*.tsx
grep -rho "mbApi\.ceshu\.[a-zA-Z]*" src/renderer | sort | uniq -c
# 保存路径是否校验（空 = 纯建议）
grep -n "validateCeshu\|scoreCeshu" src/main/ceshu/manager.ts
# 死通道
grep -rn "mbApi.ceshu.versions" src/renderer
```

---

## 12. 执行状态（滚动更新）

| 波次 | 状态 | 提交 | 净变化 | 复验 |
|---|---|---|---|---|
| 锚点 | ✅ | tag `with-side-reports`（@`89ba8cd`） | — | 回滚：`git checkout with-side-reports -- desktop/` |
| Wave 0 | ✅ | `356ce2b` | 21 文件 / +21 −3,636 | tsc×2 · eslint · vitest 2013/5 · build |
| Wave 1 | ✅ | 见下 | 见下 | tsc×2 · eslint · vitest 2028/5 · build；e2e 三条 AI 规格 6/6 |
| Wave 2 | ✅ | 见下 | 10 文件 / 见下 | typecheck×3 · eslint · vitest 2042/5 · build；**e2e 整包 73/2** |
| Wave 3 | 🟡 分析完成，未动代码 | — | — | 依据见 `2026-10-19-ceshuview-app-split-analysis.md` |

### Wave 1 实做与文档原计划的偏差

1. **`runSingleShotTask` 早已存在**（`main/agent/runTask.ts`），文档把它当成待建的东西。
   实际缺的不是 harness，而是**四路通道里有一路（单字段）整段绕过了它** ——
   无预算门、无取消、无观测。这才是「双编排栈」的具体病灶。
2. 因此新增的 `main/ai/runner.ts` 定位为**「单发任务的唯一入口」**而非「harness 实现」：
   内部仍调 `runSingleShotTask`，对外收敛 `callOpts → isCloud → estimate → 生成 → 加工 → 观测` 这段前导。
3. `runSingleShotTask` 增一个可选字段 `skipBudgetConfirm`（默认 false）。
   **只有单字段通道用它**：该通道入参没有 `confirmed`，渲染层没有确认回路，
   若照样触发预算门，超大文档下会抛出一个用户无法确认的错误 ⇒ 行为回退。
4. **先写特征测试再重构**（文档未要求，本次补上）：`tests/unit/ceshuAiChannels.test.ts`
   15 条，钉住四路通道的现有行为（短路、确认门、usage 透传、取消穿透、数据错误路径）。
   重构后这 15 条**一字未改**全绿 —— 期间它抓到了一处真实差异（短路分支多出 `usage: null` 键），
   已按「改代码不改测试」的原则修正。
5. **e2e 曾一度报「不可用」，后已查明并修复**：报错是 `Process failed to launch!`，
   连无关规格同样失败。根因不是代码 —— 宿主 IDE 给子进程注入了 `ELECTRON_RUN_AS_NODE=1`，
   Electron 退化成纯 Node 进程（确诊方法：`electron.exe --version` 只打印 Node 版本号）。
   修复落在共享启动器 `tests/e2e/helpers/app.ts::launchApp`（启动前剔除
   `ELECTRON_RUN_AS_NODE` / `NODE_OPTIONS`），55 个规格一次生效、且跨平台
   （`env -u` 是 bash 专属写法，Windows 的 npm script 用不了）。
   复验：三条 AI 规格 6/6 通过（含「生成中点停止」的取消链路）。

### Wave 2 实做

1. **只引入 `jsdom` 一个 devDependency**（文档原话「唯一可能新增」），未引入 `@testing-library/*`：
   组件测试只需要「挂载 / 点击 / 按 testid 找节点 / 读文本」，用 React 自带 `createRoot` + `act`
   足够，少一个库就少一份 React 19 版本约束。辅助封装在 `tests/unit/dom/render.tsx`。
2. **DOM 测试用独立 tsconfig**（`tsconfig.test-dom.json`，extends web）：
   没有给 `tsconfig.node.json` 加 `DOM` 到 lib —— 那等于允许主进程代码在类型层面使用
   `document`/`window`，而主进程没有 DOM，这类代码只会在运行时炸（eslint 的 `no-undef` 对 TS 关闭，抓不到）。
   `typecheck` 脚本因此从 2 个 tsc 变 3 个。
3. **`vitest.config.ts` 两处改动**：`include` 增加 `tests/unit/**/*.test.tsx`；
   显式 `esbuild.jsx: 'automatic'` —— 根 `tsconfig.json` 是纯 references 文件，
   esbuild 读不到 `jsx: react-jsx`，否则 `.tsx` 报 `React is not defined`。
4. 测试文件 2 个 / 14 条：`ceshuView.behavior.test.tsx`（加载、错误条、空状态、更多菜单、
   补全入口、面板开关）、`menuBar.behavior.test.tsx`（展开/收起、Escape、动作派发、撤销置灰）。
5. **e2e 整包复验通过**：73 通过 / 2 跳过 / 0 失败（与文档基线一致；2 条跳过是
   「功能已移除」的历史规格，非本次引入）。这一轮同时验证了 W0 删规格、W1 改 AI 编排、
   W2 改错误路径都没有破坏既有行为契约。
6. **测出一个真实缺陷并修掉**：`CeshuView` 在 `get` 失败时只 `setError`，但渲染层在
   `!doc` 时提前 return 到「正在加载策划书…」—— 错误条在主界面里，永远到不了。
   用户会永久停在加载态，既无原因也无返回。已改为：`doc` 为空且有 error 时渲染错误条 + 返回按钮。
   （顺带修掉该文件里因 W0 而失真的注释：它还写着「补全空白字段没有入口、能力在 ChecklistPanel」。）
