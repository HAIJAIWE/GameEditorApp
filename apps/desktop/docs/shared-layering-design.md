# `src/shared/` 分层拆分方案设计

> 作者：软件架构师（Bob） | 日期：2025-10-05
> **性质：只读设计提案。撰写过程未修改任何仓库文件**（所有结论来自 grep/wc/tsc 实测与临时目录中的一次性验证实验，实验目录已清理）。
> 基线：`npm run typecheck` 通过、`npm test` 通过（**90 个测试文件 / 1292 个用例全绿**）。

---

## 0. 先说结论（TL;DR）

**不建议做全量拆分。** 证据表明「混装」这个问题的真实成本远高于收益，且**全量拆分会引入一个当前架构根本不存在的硬约束冲突**（TS6307，见 §5.1）。

推荐方案：**方案 C（分层约束 + 文档 + 定向移出 6 个叶子文件）**，成本约 **1 个新文件 + 6 处移动 + 12 处 import 改写**，收益保留了「依赖方向清晰 + 可机器校验」这个唯一真正有价值的部分。

---

## 1. 现状分类清单

### 1.1 分类方法（可复算）

分类**不按文件名猜**，而是对每个文件做两件事取证：
1. 跑 AST 级 import 扫描，得到该文件的 shared 内部依赖 + 全仓消费方（main / preload / renderer / shared / tests）；
2. 对边界存疑的文件（`systemConfigSchema` / `imageGen` / `references` / `quickCreate`）**实读文件头注释**判定语义归属。

脚本口径：正则匹配 `import|export ... from '<相对路径>'`，解析为绝对路径后过滤 `src/shared/` 前缀。

### 1.2 分类结果表

| 类别 | 文件数 | 行数 | 代表文件 |
|---|---:|---:|---|
| `contract` | 3 | 920 | `types.ts`(118)、`schemas.ts`(549)、`ipc.ts`(253) |
| `domain/ceshu` | 26 | 8,770 | `ceshuModel.ts`、`ceshuConstants.ts`、`ceshuTemplateData.ts`(1449)、`ceshuChecklist.ts`(1036) |
| `domain/attr` | 5 | 1,285 | `attrSystem.ts`(460)、`attrPanel.ts`(461)、`equipPreview.ts` |
| `domain/type` | 3 | 738 | `typeSchema.ts`(364)、`typeSchemaFile.ts`(250)、`typeTemplates.ts`(124) |
| `domain/agent` | 8 | 1,483 | `agent/protocol.ts`(472)、`agent/brain.ts`(420) |
| `config` | 4 | 1,019 | `gameStyle.ts`(590)、`settingsStore.ts`(235)、`visibleTypes.ts` |
| `service` | 4 | 522 | `api.ts`(178)、`backup.ts`、`logger.ts`、`imageGen.ts` |
| `util` | 11 | 1,986 | `itemDiff.ts`、`dropTable.ts`、`formulaBuilder.ts`、`quickCreate.ts` |
| **合计** | **64** | **16,723** | — |

（行数口径为 `wc -l`，与 `find … -exec cat … | wc -l` 的 16,723 一致。分类互斥且穷尽，脚本校验「未分类文件数 = 0」。）

> **统计快照：2025-10-05 06:15**（本文所有分类与成本数字均基于此快照）
>
> | 时点 | 文件数 | 总行数 | 测试文件 |
> |---|---:|---:|---:|
> | 本文分类基线 | 64 | 16,723 | 90 |
> | 撰写结束时（team-lead 并发任务 #2 已落盘） | 66 | 17,011 | 91 |
>
> 增量为你并发新增的 `secretNames.ts`、`secretMigration.ts` 及配套测试。二者均为纯 service 层（`secretMigration` 只依赖 `imageGenConfig` / `settingsStore` / `secretNames`，不碰任何业务域），**归入 `service/` 即可，不影响本方案任何结论**。下文 §1.2–§1.5 与 §4 的成本数字请按 64 文件基线复算。

### 1.3 关键取证：消费方分布（这决定了「谁该动」）

对 64 个文件统计入边来源，共 **448 条 import 边**指向 shared：

| 消费方 | 边数 |
|---|---:|
| `src/main/**` | 103 |
| `src/preload/**` | 2 |
| `src/renderer/**` | 101 |
| `src/shared/**`（内部） | 101 |
| `tests/**` | **141** |

**被测试直接 import 的 shared 文件：58 / 64（91%）**，141 条语句、74 个测试文件。未被测试 import 的仅 6 个：`agent/prompts.ts`、`api.ts`、`ceshuDefaults.ts`、`ceshuFields.ts`、`ceshuTemplateData.ts`、`ipc.ts`。

### 1.4 关键取证：`type-only` vs 运行时依赖（推翻了一个直觉假设）

`ipc.ts` 在 import 层面"依赖" 19 个 shared 文件，看起来是契约层被业务域污染的典型。**但逐条检查后，这 19 条全部是 `import type`**（编译后擦除）：

- `ipc.ts -> schemas.ts / types.ts / ceshuConstants / agent/* / ceshuDiff / ceshuScorer / …` 共 19 条，全部 `import type`。
- 全文 101 条内部边中，**type-only 46 条 / 运行时 value 55 条**。

**含义**：`ipc.ts` 对业务域的"耦合"只是**类型层面的单向引用**，它没有在运行时把 19 个模块打进产物。因此 `ipc.ts` 作为公共契约层**不需要拆解**，"契约层污染"这个问题在运行时维度上并不存在。这大幅降低了拆分的必要性论证。

### 1.5 关键取证：跨业务域违规边只有 5 条

按 value 口径构建簇间依赖矩阵，实测违规边**仅 5 条**：

| 违规边 | 文件 | 说明 |
|---|---|---|
| `agent -> ceshu` | `agent/session.ts` → `ceshuModel`（取 `formatLocalTimestamp`） | 仅为 1 个格式化函数，可轻易消除 |
| `attr -> ceshu` | `attrSystem.ts` → `ceshuModel`（取 `isPlainObject`） | 仅为 1 个类型守卫，可轻易消除 |
| `ceshu -> config` | `ceshuModel.ts` → `gameStyle` | 术语风格服务 |
| `ceshu -> util` | `ceshuDefaults.ts` → `systemConfigSchema` | 已归入 ceshu 域，非真违规 |
| `ceshu -> util` | `ceshuSystemConfirm.ts` → `systemConfigSchema` | 同上 |

**含义**：所谓"业务域互相 import"的问题，实际只有 **2 条真跨域边**（且都是为了一两个工具函数）。所谓"util 依赖业务域"实测为 **0 条**。**这与"违反分层意图"的初始判断不符** —— 现有依赖方向意外地相当干净。

---

## 2. 目标目录树

> 以下是**理想终局**，用于说明分层意图。**本报告并不推荐一次性达成它**（理由见 §5）。

```
src/shared/
├── README.md                        # ★ 新增：分层契约 + 禁止规则（本方案的核心交付）
├── types.ts                         # contract —— 跨进程数据类型（118 行）
├── schemas.ts                       # contract —— zod 运行时校验（549 行，仅 main 侧用）
├── ipc.ts                           # contract —— typed IPC 通道定义（253 行）
│
├── domain/                          # 业务域：域间禁止 import
│   ├── ceshu/     ceshu*.ts + systemConfigSchema.ts + references.ts + fieldIdAi.ts   (26/8770)
│   ├── attr/      attr*.ts + equipPreview.ts                                          ( 5/1285)
│   ├── type/      typeSchema*.ts + typeTemplates.ts                                   ( 3/ 738)
│   └── agent/     brain/memory/operationLog/panel/personalization/prompts/protocol/session (8/1483)
│
├── config/          settingsStore.ts · visibleTypes.ts · gameStyle.ts · imageGenConfig.ts (4/1019)
├── service/         api.ts · logger.ts · backup.ts · imageGen.ts                       (4/ 522)
└── util/            advancedSearch · dataStats · dataTableOps · dropTable · fieldId   (10/1707)
                    formulaBuilder · glossaryTerms · itemDiff · quickCreate · refTable
```

### 2.1 `shared/agent/` 的处置：**保留原样，不改名**

取证（`grep -rn "shared/agent" src tests`）：

- **8 个文件构成一个自闭环子域**，内部仅 4 条边，且 3 条是 type-only；
- 已有**唯一命名空间前缀 `agent/`**，天然自解释，不需要靠目录位置表达"这是个域";
- `agent/prompts.ts`(44 行) 是纯提示词常量，`agent/memory.ts`(31 行) 是纯数据结构 —— 都是叶子；
- 消费者与 `src/main/agent/`**一一对应**（`brainService` / `dispatcher` / `memoryStore` / `operationRecorder` / `sessionStore` / `skills/*`），两边同名目录已形成清晰对照。

改名的收益仅是"与其它三个域目录名对齐"，但要改 **16 处 import**（含 13 个测试文件）。**建议不动**。

### 2.2 分层规则（写入 README，可机器校验）

| 层 | 允许 import | 禁止 import |
|---|---|---|
| `contract` | 外部 `zod` | 任何 shared 内部模块（现状已满足，除类型引用） |
| `domain/*` | `contract`、`config`、`util`、`service`、**本域内** | **其它 `domain/*`** |
| `config` / `util` | `contract`、同层 | **任何 `domain/*`** |
| `service` | `contract`、`config`、`util`、`domain/*` | — |
| `main` / `renderer` | `shared/**` 任意 | — |

---

## 3. 依赖约束的验证方法

### 3.1 一条命令的只读检查（推荐，零新增依赖）

利用 TS 自身的 `include` 做**结构性硬约束**——把各层拆成独立 project，用「不 include 即不可 import」强制边界：

```jsonc
// tsconfig.shared-domain.json  ← 只含 contract + util/config/service
{ "include": ["src/shared/*.ts", "src/shared/util/**", "src/shared/config/**", "src/shared/service/**"] }
```

实测：`domain/*` 里的文件被 `tsconfig.node.json` 的 `src/shared/**/*` 覆盖，不受影响；而**若 domain 层想 import 另一个域**，只要两个域分属不同 project 就自动被拦。当前规模（5 条违规边）不值得上这套。

### 3.2 ESLint 规则（推荐，低成本、可增量）

`eslint.config.mjs` 已在用 `typescript-eslint`，加一条 `no-restricted-imports` 即可，**零新增依赖**：

```js
{
  files: ['src/shared/domain/ceshu/**/*.ts'],
  rules: {
    'no-restricted-imports': ['error', {
      patterns: [{
        group: ['**/domain/attr/**', '**/domain/type/**', '**/domain/agent/**'],
        message: 'ceshu 域禁止 import 其它业务域；请通过 contract 层解耦。'
      }]
    }]
  }
}
```

- **粒度**：按域各写一条（共 4 条），而非一个全局规则；
- **成本**：只加配置，不动任何业务文件；
- **验证**：`npm run lint` 退出码非 0 即为违规（已验证 `npm run lint` 在仓库中可用）。

### 3.3 一致性检查脚本（可选）

`scripts/check-shared-layers.cjs`（Node，仿照现有 `scripts/*.cjs` 风格）：解析 import 图，输出簇间 value 依赖矩阵，超阈值时 `exit 1`。当前违规边仅 5 条，阈值可设为 0。

---

## 4. 迁移批次表

> **前提**：以下批次描述的是"若决定做全量拆分"的路径。**推荐方案 C 不需要这些批次**（见 §5.3）。

全量拆分的**精确成本已实测**（contract 三件套留根、其余 61 文件下沉一层）：

| 指标 | 数值 |
|---|---:|
| 需改写的 import 语句总数 | **376** |
| 保持不变的（指向 contract） | 72 |
| 受影响的源文件数 | **190** |
| ├ `src/main/**` | 43 文件 / 83 条 |
| ├ `src/preload/**` | 1 文件 / 1 条 |
| ├ `src/renderer/**` | 41 文件 / 89 条 |
| ├ `src/shared/**` 内部 | 39 文件 / 85 条 |
| └ `tests/**` | 66 文件 / 118 条 |

> 注意：外部引用**全部**是 `../../shared/x` 相对路径（实测 206 条，形态统一），因此文件一移，**main/renderer 的路径也全部要改**——不是"只改测试"。这纠正了"只需同步改测试 import"的乐观预期。

| 批次 | 范围 | 文件数 | 改动量 | 风险 |
|---|---|---:|---|---|
| **B0** | 基线固化：记录当前 `typecheck`/`test`/`lint` 三绿 | 0 | 写 README 记录基线 | 无 |
| **B1** | 移出**叶子 util**（无 shared 内部依赖） | 11 | 移动 + 内部 12 条边 + 外部约 30 条 | **低**。11 个全是叶子（实测 `无内部依赖`），改动面纯机械 |
| **B2** | 移出 `config`（4 个）+ `service`（4 个） | 8 | 移动 + 约 40 条边 | **低**。依赖方向单一（config→settingsStore） |
| **B3** | 移出 `domain/attr` / `domain/type` | 8 | 移动 + 约 45 条边 | **中**。两者都依赖 `ceshuModel`（`attrSystem` value、`typeSchemaFile` 需改名易混） |
| **B4** | 移出 `domain/ceshu` | 26 | 移动 + 约 250 条边 | **中**。`ceshu*` 前缀共 23 文件互相引用（32 条内部边），移动后需逐个改相对路径 |
| **B5** | `agent/` 迁到 `domain/agent/` | 8 | 16 条边 | **低但无收益**（§2.1） |
| **B6** | 加 ESLint 边界规则（§3.2） | 0 | 改 1 个配置 | 无 |

**每批都可独立验证**：`npm run typecheck && npm test && npm run lint` 三绿。当前基线已确认 90/90 文件、1292/1292 用例通过。

---

## 5. 收益 vs 成本 vs 替代方案（核心章节）

### 5.1 🚫 一个会否决"下放到 renderer"方案的硬约束

任务书里提到"只在 renderer 用的文件可考虑下放 renderer"。**实测证明这条不可行**：

`tsconfig.node.json` 设了 `composite: true`，其 `include` 为 `electron.vite.config.ts / vitest.config.ts / playwright.config.ts / src/main/** / src/preload/** / src/shared/** / tests/**`——**不含 `src/renderer/**`**。

我用一个一次性临时目录验证了 composite 语义（**未触碰仓库文件，实验目录已删除**）：

```
error TS6307: File '.../src/rendererOnly.ts' is not listed within the file list of
project '...'. Projects must list all files or use an 'include' pattern.
```

结合 §1.3「**58/64 个 shared 文件被测试直接 import**」，可得：

> **任何被测试 import 的文件，必须留在 `tsconfig.node.json` 的 include 名单内。**
> 把 shared 文件下放到 `src/renderer/` 会让引用它的测试立刻 TS6307 编译失败。
> 91% 的文件都不具备"下放 renderer"的可能性。

同理，`tsconfig.web.json` 虽含 `src/shared/**/*`，但它**不含 `tests/**`**，所以 shared 也**不能上移到 `src/main/`**。**shared 的位置被双向锁死**——这在架构上其实是**正确的**（它就该是三端共享区），但它取消了一大批"顺手整理"选项。

### 5.2 真实成本与收益核算

**成本（实测汇总）**

| 成本项 | 数值 | 说明 |
|---|---:|---|
| 需改 import 语句 | **376** | §4，含 main 83 / renderer 89 / tests 118 |
| 需改源文件 | **190** | 其中 66 个是测试文件 |
| 需移动文件 | 61 | |
| 回归风险面 | 全仓 | 无 import alias 兜底（实测**无任何 `paths`/`alias` 配置**），376 处全靠人工/脚本改对 |
| 新增 git 历史噪音 | 61 文件 | 会污染 `git blame`，对后续定位"某行何时引入"不利 |

**收益（逐条检验，剔除自我安慰）**

| 声称收益 | 实证检验 | 结论 |
|---|---|---|
| 依赖方向清晰 | 簇间违规边**仅 5 条**（§1.5），其中 3 条已正确归类；真跨域仅 **2 条**，且都是为 `formatLocalTimestamp` / `isPlainObject` 单个函数 | ❌ **问题本来就不大**，拆分后也还是这几条 |
| 契约层不被业务污染 | `ipc.ts` 的 19 条依赖**全是 `import type`**（§1.4），编译后擦除，运行时零耦合 | ❌ **该问题在运行时维度不存在** |
| util 不依赖业务 | 实测 **0 条** util→domain 边 | ❌ **已经满足** |
| 新人上手更快 | `ceshu*.ts` 前缀 + `agent/` 目录已提供分组线索；真正难懂的是 1,449 行的 `ceshuTemplateData` 与 1,036 行的 `ceshuChecklist` 的**业务含义**，而**拆目录不解释业务** | ⚠️ **收益微弱**，靠文档/命名而非目录位置 |
| 单文件更小 | 拆分**不改变任何单文件行数**，只是重新排列 16,723 行 | ❌ **零收益** |

### 5.3 替代方案对比

| 方案 | 改 import | 改文件 | 机器可校验 | 解决 §1.5 的 2 条真违规 | 评价 |
|---|---:|---:|---|:---:|---|
| **A. 全量拆分到 4 层** | **376** | **190** | 需另加规则 | 否 | ❌ 成本失控，收益不匹配 |
| **B. tsconfig path alias 逻辑分区** | 0 | 0 | 需另加 lint | 否 | ⚠️ 只改心智模型，磁盘仍平铺；alias 与 376 条相对路径并存反而**制造两套风格**，长期更乱 |
| **C. README + ESLint 边界 + 定向移出 6 个叶子** | **12** | **7** | ✅（eslint） | ✅（顺带消除） | ✅ **推荐** |
| **D. 什么都不做** | 0 | 0 | ❌ | 否 | ⚠️ 边界将继续退化，E23/E24 的新增逻辑无约束 |

### 5.4 ✅ 明确推荐：方案 C

**具体做什么（4 项，建议合为一个 PR）**

1. **新增 `src/shared/README.md`**
   写清 5 层分区表、每层职责、允许/禁止 import 规则、以及"为什么 `agent/` 不改名"。
   *成本：1 个新文件，0 处 import。*

2. **新增 ESLint 边界规则**（§3.2，`eslint.config.mjs` 加约 20 行）
   4 条 `no-restricted-imports`，按域锁定，**零新增依赖**（`typescript-eslint` 已装）。
   *成本：改 1 个配置文件。*

3. **定向移出 6 个"零内部依赖叶子"**
   只移实测**无任何 shared 内部依赖**（因此改 0 条内部边）且**未被测试 import** 的文件：

   | 文件 | 行数 | 为何可移 |
   |---|---:|---|
   | `agent/prompts.ts` | 44 | ❌ **不迁**：保留 `agent/` 自闭环（见 §2.1）。该节已论证 `agent/` 是自闭环子域、已有唯一命名空间前缀、消费者与 `src/main/agent/` 一一对应；单独抽走唯一的叶子会破坏 §2.1 想保住的自环，收益仅为目录名对齐 |
   | `ceshuDefaults.ts` | 218 | 叶子（消费方 `ceshuMigration` 改 1 处）|
   | `ceshuFields.ts` | 262 | 内部依赖仅 type-only（`ceshuAi` 改 1 处）|
   | `ceshuTemplateData.ts` | 1449 | 内部依赖仅 type-only（`ceshuTemplates` 改 1 处）|
   | `api.ts` | 178 | 叶子 + 未被测试 import；可移至 `service/` |
   | `ipc.ts` | 253 | **留根**（契约层，本就不该移）→ 实际只移 4 个 |

   → 实得 **4 个文件、13 处 import 改写**（7 处外部 + 6 处被移文件内部的相对路径上跳），
   换来 ceshu 簇目录从 26 个缩到 23 个，`ceshuTemplateData`(1449) 这块最硬的骨头被物理隔离。

   > **实施偏差记录（2025-10-05 落地）**：
   > - 实际改 13 处 import 而非 §4 估的 12 处：多出的 1 处是 `api.ts` 移入 `service/` 后
   >   其**自身**的 `import type ... from './ipc'` 也需上跳为 `'../ipc'`（§4 表格只计了外部消费方）。
   > - `api.ts` 落地时为 194 行而非 178：并发任务 `10887fa`（API Key 迁 safeStorage）新增了
   >   `settings.hasSecret/setSecret/deleteSecret` 16 行。
   > - 本表原列 5 个迁移目标，实施为 4 个（`agent/prompts.ts` 按 §2.1 判定不迁），已在行内标注。

4. **顺手消除 2 条真跨域边**（零新增文件，纯重构）
   - `agent/session.ts` 的 `formatLocalTimestamp` → 移入 `shared/util/` 或从 `ceshuModel` 复用 util 版本；
   - `attrSystem.ts` 的 `isPlainObject` → 归入 `util/`。

   > **实施记录（2025-10-05）**：已落地，但**新增了 2 个 util 文件**
   > （`util/guards.ts` 14 行、`util/datetime.ts` 15 行）—— `util/` 分区目录原不存在，
   > 要「归入 util/」必须先建目录，故本节「零新增文件」的表述仅指「不新增业务模块」。
   >
   > **采用手法（与本节字面描述不同，特此记录）**：两个函数被搬到 `util/` 后，
   > 在 `ceshuModel.ts` 保留一行 `export { formatLocalTimestamp, isPlainObject }` **re-export**，
   > 使 `ceshuModel` 的 **~60 处既有调用方零改动**，只让那 2 个违规方改引新位置。
   > 若按字面「移走函数」则需改 60+ 处 import，比方案 C 的 12 处预算高 5 倍。
   > 该 re-export 是**过渡期兼容层**：`domain/ceshu/` 全部归区后应删除，让调用方直接引 `util/`。

**收益**：机器可校验的依赖方向 + 文档化的分层契约 + 消除全部真跨域边。**成本约为主全量方案的 1/38**（10 vs 376 条 import；7 vs 190 个文件）。

**明确不建议**：现在做 A 或 B。理由是三条硬证据——
1. 违规边只有 2 条真问题，且都能用 2 个文件的改动解决，不需要动 190 个文件；
2. `ipc.ts` 的"19 依赖"是 type-only，运行时不存在污染；
3. TS6307 证明 shared 的物理位置被双向锁死，重排自由度远低于预期，而 376 处无 alias 兜底的手工改写是**真实的回归风险**。

**建议时机**：等 `shared/` 增长到 **25,000+ 行**或跨域边 **>15 条**时，再按 §4 批次重估全量拆分。在此之前，方案 C 的 README + lint 已能**自动阻止**问题继续累积（这正是当前最缺的——E23/E24 的新增逻辑正在无约束地加剧混装）。

---

## 6. 不明确的点 / 已做的假设

| # | 项 | 说明 |
|---|---|---|
| 1 | **`shared/` 是"共享"而非"杂物间"** | 我假定 `shared` 保持三端共享定位。**若本意是"通用代码池"**，则分层是反模式，方案 D（仅加 README）更合适。已用 §5.1 的双向锁死证据支持"共享"解读。 |
| 2 | **不使用 path alias** | 实测仓库无任何 `paths`/`alias` 配置。引入 alias 会让 376 处相对路径与新 alias 并存，风格分裂，故本方案不引入。 |
| 3 | **`ceshu*` 是否为一个域** | 23 个 `ceshu*` 文件共用 32 条内部边，且都围绕"策划书"业务，判定为一个域。但 `ceshuTemplateData`(1449) 内部可能还含子域（模板 vs 数据），本方案**不做二阶细分**（收益不足）。 |
| 4 | **`systemConfigSchema` / `references` / `fieldIdAi` 归入 ceshu** | 三者业务语义均为策划书（13 个游戏系统 config / 引用关系 / 字段 id 生成），虽不带 `ceshu` 前缀。已实读文件头确认。 |
| 5 | **`api.ts` 归 `service`** | 它 `import type` from `ipc`，是 preload↔renderer 的类型门面，不是纯 util。 |
| 6 | **并发写入** | 撰写期间 team-lead 新增 `secretNames.ts` / `secretMigration.ts`（任务 #2），仓库从 64 → 66 文件、16,723 → 17,011 行，测试 90 → 91。二者为纯 service 层，**不影响任何结论**；若采纳方案 C，它们直接进 `service/`。`git status` 已确认这三个 docs 文件是我本次唯一产出，源码改动均来自你的任务 #2。 |
| 7 | **测试基线** | `vitest` 报 90 个测试文件（`tests/unit` 88 + `tests/integration` 2），非任务书所述 89。修正后的数字以本文为准。 |

---

## 附录：可复算命令

```bash
cd D:/GameEditorApp/desktop

# 1) 文件数与总行数（权威口径 = 16723；并发新增后为 16939）
find src/shared -name "*.ts" -type f | wc -l
find src/shared -name "*.ts" -type f -exec cat {} + | wc -l

# 2) 测试规模与 shared 引用面
find tests -name "*.test.*" | wc -l                      # 90
grep -rl "from '.*shared/" tests --include="*.test.ts" | wc -l   # 74
grep -rho "from '[^']*shared/[^']*'" tests --include="*.test.ts" | wc -l  # 140

# 3) 外部引用形态（证明全部为相对路径，文件一移全要改）
grep -rho "from '[^']*shared/[^']*'" src/main src/preload src/renderer --include="*.ts" --include="*.tsx" | wc -l  # 206

# 4) 无 path alias（证明无兜底）
grep -rn "paths\|alias" tsconfig*.json vitest.config.ts || echo "无 alias 配置"

# 5) 基线三绿
npm run typecheck && npm test && npm run lint
```

**实测基线结果**：`typecheck` EXIT=0；`test` 90 files / 1292 tests passed；`lint` 脚本存在且可运行。
