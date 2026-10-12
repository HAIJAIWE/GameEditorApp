# 代码质量评估（2026-10-11）

> 评估对象：`desktop/`（Electron 44 + React 19 + TypeScript 四层架构）
> 评估方式：**以可复现的命令取证为准，不采信文档自述**。凡引用文档结论处，均已回到代码/工具复验。
> 评级口径：**优** = 有机制且已实测生效；**良** = 整体健康但有明确落地缺口；**待改进** = 发现确凿问题。

---

## 0. 规模基线

| 项 | 数 |
|---|---|
| 源码 | 281 文件 / **52,757 行** |
| ├ `src/shared/` | 126 文件 / 23,923 行（**45%**） |
| ├ `src/renderer/src/` | 75 文件 / 18,028 行（34%） |
| ├ `src/main/` | 79 文件 / 10,607 行（20%） |
| └ `src/preload/` | 1 文件 / 199 行 |
| 测试 | 186 文件 / 31,866 行（unit 129 + e2e 53） |
| 测试/源码行数比 | 0.60 |
| 依赖 | runtime 15 / dev 19 |

> ⚠️ `shared` 占 45%、比 `main` 大一倍——这不是典型的分层比例，见 §1 的分析。

---

## 1. 架构分层与模块划分 —— **良**

### 优点（有机制，且已实测生效）

- **分层契约被写成了文档 + lint 规则**：`src/shared/README.md`（206 行）定义了 5 个分区
  （contract / domain / config / service / util）与依赖方向图，并一一对应
  `eslint.config.mjs` 的 4 条 `no-restricted-imports` 规则。
- **4 条规则实测全部 `FIRES`，不是死规则**。用 README §3.2 的「无文件探针」复验：

  ```
  FIRES  rule1 ceshu->attr
  FIRES  rule2 util->domain
  FIRES  rule3 config->domain
  FIRES  rule4 main->domain
  ```

- **依赖方向实测单向**：`src/shared/` 反向 import `main/` 或 `electron` = **0 处**；
  `src/renderer/` 直接 import `../main/` = **0 处**。
- **IPC 四层契约齐备**：`shared/schemas.ts`(zod) → `shared/ipc.ts`(`IpcContract`) →
  `shared/service/api.ts`(`MbApi`) → `preload/index.ts`，漏任一层 tsc 即红。
- **没有巨型单体**：最大文件 930 行（`src/shared/ceshu/ceshuChecklistItems.ts`），
  渲染层最大 916 行（`CeshuView.tsx`）、856 行（`App.tsx`），无千行以上文件。

### 缺口（执行只落地了一部分）

> **2026-10-12 更新（归区批次 2a–2g，`cd78e02`…`741f2f1`）**：本节原描述的「61 个平铺 +
> 无 lint 覆盖」已大幅缓解——根目录平铺 61 → 28 个（17 个定案留根，理由见
> `shared/README.md` §4.1）；`domain/`（ceshu 14 + attr 6）、`config/`（14）、`util/`（32）
> 均已有真实文件，规则 1/3 实际生效；`shared` 层占比随迁入分区下降。
> 下文为当时的取证记录，保留作历史对照。

- **分层只归区了 3 个文件，61 个仍在根目录平铺**。
  `src/shared/README.md:110-115` 自己承认这个盲区：

  > 「`src/shared/` 根目录下尚未归区的历史平铺文件（…等 50 余个）**当前完全不受任何规则约束**」

  实测复核：`domain/` 下只有 `ceshu/`（3 文件 + 模板数据目录）；`config/` **目录不存在**；
  `util/` 只归了 3 个（datetime / guards / undoStack）；根目录平铺 **61 个** `.ts`。
  ⇒ 「attr 域不能 import ceshu 域」这类约束目前**靠 code review 而非 lint**保证。
- **`shared` 层过厚（45%）**：业务逻辑（`ceshu*` 系列）大量驻留 shared，
  而非按文档设计的下沉到 `domain/`。

---

## 2. 命名与代码风格一致性 —— **待改进**

### 确凿问题：`ceschu` 目录错拼

| 位置 | 现状 |
|---|---|
| 业务域本名 | `ceshu`（策划书） |
| `src/main/ceshu/` | ✅ 正确 |
| `src/shared/ceshu/` | ❌ 错拼（多一个 `c`） |

代价是全仓 **165 处** import 被迫跟着错拼（`grep -rn "shared/ceshu/" src tests | wc -l` → 165）。
这不是美观问题：本会话内已多次因 `ceshu`/`ceschu` 混淆产生「文件不存在」的误判告警，
排查成本实打实。

### 其他

- **无 prettier**（`node_modules/prettier` 不存在），且 eslint 不管缩进
  （2026-10-12 量测：实际代码缩进漂移为 0，故未引入，见 P1#9）
  ⇒ 缩进漂移可以长期不可见地存在。
- 命名主体是统一的：函数 camelCase、组件 PascalCase、常量 SCREAMING_SNAKE、
  定义层拆分用 `*Data.ts` 后缀（`ceshuScorerData` / `gameStyleData` / `schemasData`）。

---

## 3. 错误处理与边界情况 —— **优**

- **IPC 入口统一校验 + 统一包装**：`src/main/ipc.ts:133` 用 zod `schema.parse` 后统一包成
  `IpcResult`（`ok:false` 分支见 `:140`），118 个 handler 全部走这条路径。
- **`undefined` schema 的 handler 都是无入参 getter**，非漏配：
  `app:info` / `ceshu:list` / `data:listAll` / `backup:list` / `attrSystem:get` + 5 个 `agent:*`。
- **空 catch 仅 1 处**（全仓 `catch {}` 计数 = 1）。
- **危险操作有契约层 `confirm`**：`data:clearAll`（`clearAllInputSchema` + handler
  `if (req.confirm !== true) throw`）；`ceshu:delete` 本会话补齐同一范式。
- **有防静默腐化的守卫型测试**，且带「自证非空转」断言：
  `ipcRegistrationDrift.test.ts`（IPC 注册完备性 + 双向 diff + 空转自证）、
  `ceshuChapterLabelDrift.test.ts`、`ceshuOptionLabels.test.ts`。

---

## 4. 重复代码与坏味道 —— **待改进**

### 确凿问题：`toErrorMessage` 被复制了 21 份

```
src/renderer/src/appUtils.ts:3                        (export)
src/renderer/src/components/ceshuViewUtils.ts:3       (export，第二份)
src/renderer/src/components/AgentEditorPanel.tsx:48   (私有副本)
src/renderer/src/components/AiDataGenPanel.tsx:31
src/renderer/src/components/AiFullGeneratePanel.tsx:583
… 其余 16 个组件各一份
```

即：已有 2 份 export 版，却仍有 **19 个组件各自定义私有副本**，而 `src/shared/util/`
里根本没有 error 相关工具。改一处错误文案口径要动 21 个文件。

### 其他重复（同名函数多文件定义）

| 函数 | 定义处数 |
|---|---|
| `toErrorMessage` | 21 |
| `readText` | 7 |
| `isPlainObject` | 6 |
| `defaultStorage` | 4 |
| `readString` / `field` / `emit` | 各 3 |

（`isPlainObject` 按 `shared/README.md` §6 已被下沉到 `util/guards.ts`，剩余应为历史 re-export
或未迁移调用点，需逐个确认。）

---

## 5. 测试覆盖与可测性 —— **良**

### 优点

- 体量大：unit 129 文件 / e2e 53 文件，测试代码 31,866 行。
- **守卫型测试设计质量高**：不只断言结果，还断言「守卫自身有效」
  （如 `ceshuChapterLabelDrift` 会喂入已知缺陷样例，期望必须报出 1 条）。
- 可测性基础好：纯函数集中在 `shared/`，同步 IO 全在 `main/`（见 §6）。

### 缺口

- **覆盖率基线已补（P1#4，`a03f43f`）**：已装 `@vitest/coverage-v8` 并加 `coverage` 配置与
  `test:coverage` 脚本，首次基线见 §8。**结论**：逻辑层覆盖高（`shared` 95.8% / `main` 91.0% st），
  但 **React/renderer UI 层在 node 套件下几乎零覆盖**（呼应 §8 e2e 本地跑不了的缺口），
  且 **分支覆盖率偏弱**（整体 83.9%、`main` 76%）。
- **e2e 本地跑不了（留 CI）**，反馈链路过长：本会话实测 `tests/e2e/ceshu-*.spec.ts` 有
  **32 处**断言停留在旧章节模型（含 1 处会取到 `undefined` 的真失效），
  在章节模型重构后长期无人察觉——因为本地根本不会红。

---

## 6. 性能与安全风险 —— 安全 **优** / 性能 **良**

### 安全（Electron 侧基线扎实）

- 主窗口 `src/main/index.ts:57-62`：`contextIsolation: true` + `nodeIntegration: false`
  + `sandbox: true`（三重隔离）；PDF 导出窗口同样配置（`src/main/ceshu/export/pdf.ts:18-19`）。
- 外链管控 `src/main/index.ts:109-115`：
  `setWindowOpenHandler` 仅 `https://` 走系统浏览器、其余 `deny`；
  `will-navigate` 白名单 `file://` + dev server URL，否则 `preventDefault()`。
- 依赖面小（runtime 15），未发现未使用依赖（`react-dom` 经复核为误报，实际用 `react-dom/client`）。

### 性能

- **同步 IO 分布正确**：`readFileSync/writeFileSync/existsSync/readdirSync` 共 **78 处，全部在
  `src/main/`**；`src/shared/` 与 `src/renderer/` 各 **0 处**。
- 写入路径有串行队列（`enqueueWrite`）与原子写（`runAtomicTask`）。
- ⚠️ 但**无任何性能基准/压测**，无法量化。见 §8。

---

## 7. 依赖管理与文档完整性 —— 依赖 **优** / 文档 **待改进**

### 依赖：优

runtime 15 / dev 19，全部在用；有 `lint` / `typecheck` / `test` / `test:e2e` 标准脚本。

### 文档：待改进 —— 存在两套结论相反的架构文档

| 文档 | 实际描述的技术栈 | 状态 |
|---|---|---|
| `docs/architecture.md` | Electron 44 + React 19 + TypeScript | ✅ 准确 |
| **`docs/wiki/01-architecture.md`** | **PyQt6 + Python ≥3.14 + pytest + ruff/mypy + PyInstaller** | ❌ **完全过期** |

`docs/wiki/` 共 7 篇，整体是 Python 时代产物（`02-modules.md` 含 **125 处** `.py`/PyQt 引用、
`03-key-classes.md` 58 处），且**全目录没有任何「已过期 / 已归档 / DEPRECATED」标记**
（`grep "已过期\|已废弃\|DEPRECATED\|历史归档" docs/wiki/ docs/archive/` → 0 命中）。

⇒ 新人按目录浏览文档时，会读到一套与现状完全相反的技术栈说明，且无从判断哪份有效。

其余 18 篇含 py 引用的文档（如 `ts-migration-roadmap.md`、`migration-audit.md`）属**有意的历史说明**，不计为问题。

---

## 8. 无法评估的部分（需补充信息）

| 维度 | 为什么无法评估 | 需要补充什么 |
|---|---|---|
| **测试覆盖率** | ✅ **已补基线（P1#4，`a03f43f`；2026-10-12 归区后重测刷新）**：Statements 94.04% / Branches 83.86% / Functions 96.40% / Lines 95.65%（全量 2012 用例、仅 1 例已知 in-flight 失败 `agentQualityGate`）。分层实测：`shared` 125 文件 Stmts **95.82%** / Funcs 98.98% > `main` 57 文件 Stmts **90.98%** / Funcs 92.74% ≫ `renderer` **仅 1 文件**被 node 套件覆盖（≈0%，React UI 无 jsdom 设施）。薄弱点：`main/ceshu/export/pdf.ts` 0%、`main/agent/brainService.ts` 48%、`main/ceshu/export/common.ts` 62% 语句覆盖；分支覆盖整体偏弱 | 后续：暂不设门禁；针对 `renderer` 补组件/e2e 测试（P1#7）、给 `brainService`/`export/common` 补分支用例 |
| **运行时性能** | 无任何基准/压测/profiling 数据 | 大库（数千条数据）下的列表渲染、导入导出耗时基线 |
| **e2e 真实性** | 本地跑不了（留 CI），本会话刚修的 32 处断言未经验证 | 一次 CI 全量 e2e 结果 |
| **UI / 视觉质量** | 无截图比对或视觉回归 | 若需要，补 render-harness 或视觉快照 |
| **领域正确性** | 策划书章节模型、数值公式等需产品口径确认 | 主理人对「章节顺序 / 档位命名」等的产品裁定 |

---

## 9. 改进建议清单（按优先级）

### P0 · 快速修复（小时级，收益/成本极高）

| # | 事项 | 位置 | 说明 |
|---|---|---|---|
| 1 | **给 `docs/wiki/` 加过期警告或移入 `docs/archive/`** | `docs/wiki/`（7 篇） | ✅ **已完成**：整目录移入 `docs/archive/wiki-python-era/`，每篇加 Python/PyQt6 时代归档警告块，指向 `docs/architecture.md` 与 `shared/README.md` |
| 2 | **消除 `toErrorMessage` 的 21 份副本** | 19 个组件 + `appUtils.ts` + `ceshuViewUtils.ts` | ✅ **已完成**：收敛到 `src/shared/util/errors.ts`（`c76804c`），原位置 re-export 保持兼容 |
| 3 | **`ceschu` → `ceshu` 目录改名** | `src/shared/ceshu/`，165 处 import | ✅ **已完成**：物理目录改名 + 全仓 215 处机械替换（`a70779e`），git 检测为 25× R100；`tsc`/`vitest ceshu`/`eslint` 全绿，消除路径误判 |

### P1 · 中期（天级）

| # | 事项 | 说明 |
|---|---|---|
| 4 | **补覆盖率基线** | ✅ **已完成（`a03f43f`）**，归区后重测：Statements 94.04% / Branches 83.86% / Functions 96.40% / Lines 95.65%；分层 `shared` 95.82% > `main` 90.98% ≫ `renderer` 仅 1 文件；暂不设门禁，薄弱点 `pdf.ts` 0% / `brainService.ts` 48% / `export/common.ts` 62% |
| 5 | **推进 shared 归区** | ✅ **已完成（2a–2g，`cd78e02`…`741f2f1`）**：分批迁移 + 每批四门验证（tsc 5/6、eslint 0、vitest 2010/1）。根目录平铺 **61 → 28 个**，其中 17 个为 rule 4 倒逼的定案留根（README §4.1）。规则 1/3 从「预挂/不存在」变为对 domain/ceshu(14) + domain/attr(6) + config(14) + util(32) 真实生效；2a 批顺带清掉 cd78e02 遗留的 12 条 rule 4 违规（main 对 domain/ceshu 的 import 归零）；2e 批解掉 references/relationGraph 对 ceshuModel 的最后依赖 |
| 6 | **收敛 `readText` / `isPlainObject` / `defaultStorage` 的多处定义** | ✅ **已完成（`2195481`）**：16 处私有副本全收敛——`isPlainObject`(5) → 既有 `shared/util/guards.ts`；`readText`(7) → 新增 `shared/util/readText.ts`；`defaultStorage`(4) → `settingsStore.ts` 增设 canonical（紧邻 `defaultSettingsStorage()`）。均字节一致、纯机械替换，vitest 2011/1 基线不变 |
| 7 | **让 e2e 至少能本地 smoke** | ◐ **已解锁（2026-10-12）**：设施一直在（playwright + `tests/e2e/` 下 **53 个 spec / 70 条**），此前「本地不可跑」实为两个环境问题——① `ELECTRON_RUN_AS_NODE=1` 泄漏 ⇒ Electron 以 node 模式启动（`Process failed to launch`）；② 缺 GPU/sandbox 参数 ⇒ 渲染目标崩溃（`Target crashed`）。修法：`tests/e2e/helpers/app.ts` 的 `launchApp()` 补 `--disable-gpu --no-sandbox --disable-gpu-sandbox --disable-software-rasterizer`，跑时前置 `env -u ELECTRON_RUN_AS_NODE`。**实跑**：`undo-redo` 1 passed、`advanced-search` + `type-field-id` 2 passed；`attr-formula-builder` 2 条失败经新旧产物对照判定为**既有失败**（期望 `.notice-banner` 未出现），与本次归区无关。⚠️ 注意：**e2e 跑的是 `out/` 构建产物**（`main` = `./out/main/index.js`），验证当前代码前必须先 `npm run build`（本次就是因为 out 停在 10-10 才误以为改动被测到） |

### P2 · 长期重构

| # | 事项 | 说明 |
|---|---|---|
| 8 | **给 shared 层减重** | ◐ **随 #5 基本达成（2a–2h 批）**：domain/ceshu（5 个纯 renderer 向）+ domain/attr（6 个）已立，util/config 完成归区；根目录剩余 39 个中 27 个为 rule 4 倒逼（main store/ipc 直接消费的确定性逻辑）——除非把 main store 重构成走 api.ts 门面（更大工程，见 README §4.1 判据），否则这部分是架构约束而非欠账 |
| 9 | **引入 prettier（或至少让 eslint 管缩进）** | ✅ **量测后判定无需引入（2026-10-12，`probe-indent-drift.mjs`）**：扫描 `src/` 下 285 个 .ts/.tsx——**tab 缩进 0 个文件**、**行尾 CRLF/LF 混用 0 个文件**、奇数空格缩进 4 文件 9 行且逐行核验**全部是块注释正文与 1 行 SQL 模板字符串内的合法对齐**（非代码缩进）⇒ 实际代码缩进漂移为 0。为 0 处漂移引入 prettier 会制造全仓 reformat 大 diff（且与 chronic dirt 混杂难审），收益远小于成本。**决策：关闭本项，维持现状** |
| 10 | **性能基线** | 大库场景的列表/导入导出耗时基线，作为后续重构的对照 |
