# 开发作业：AI 取消能力与「看着实现、实际有洞」的排雷

- **作业 ID**：ai-cancellation-and-guard-audit
- **创建日**：2026-10-18
- **状态**：主体完成（五轮迭代，提交 `3aa8553` → `d9517dc` → `d714c85`）
- **入口文档**：`desktop/docs/agent-architecture-review-2026-10-18.md`（§8–§10 为本次作业的详细技术记录）

---

## 1. 问题陈述

作业起点不是「要加功能」，而是**验证既有实现是否真的成立**。起因是上一轮重构（编排核心按包拆分）后
跑整包 e2e，出现 18 条红灯。最初的判断是「既有技术债、与本次重构无关」——这个判断经取证成立，
但**把它留着不修本身就是问题**：红灯常态化等于没有 e2e，下一次重构又会重演「白查一轮」。

于是把「挂账」的两笔当交付物做掉：**18 条 e2e 红灯** 与 **Agent 循环没有取消能力**。
做完后发现同类问题（形似策略、实则零守卫）在别处还有，遂继续按同一判据排查，最终收敛为五轮。

## 2. 判据：什么叫「有洞」

本次统一使用的判定标准，写下来供后续复用：

| 判据 | 含义 | 本次命中 |
| --- | --- | --- |
| **零引用** | `grep -rn "<常量/字段>" src/ \| wc -l == 1`（只有定义行）⇒ 死代码 | `LLM_REQUEST_TIMEOUT_MS`、`LLM_TIMEOUT_MS_MIN/MAX`、`INDUSTRIAL_CHAPTER_KEYS` |
| **只存不发** | 有 schema、有归一化、有文档承诺，唯独请求体里没有 | `stopWords` |
| **形似策略** | 字段存了、getter 也有，但执行路径从不读取 | 历史项 `maxAllowedRisk`（已修） |
| **无人监听** | 能力存在，但关键路径不消费它 | 取消信号 vs 等待答复的 promise |
| **断言错层** | 测试打的是下层计数或文案，不是行为差异 | 旧 e2e 的 `tools[].name` 打偏了 `tools[].type` |

**这五类共同点**：全绿测试不会报红。所以判定标准不是「测试过没过」，而是
**「有没有一条用例在它失效时会红」**。

## 3. 五轮迭代与结论

### 第一轮 · e2e 债清零（18 → 0）

先分类再修，分类错了就会去改没问题的实现。四类比例约 1:7:9:2：

- **真 bug 1 条**：`library:list` 只回条目数组，而切库会触发整页 `reload` ⇒ 重挂载后只能猜 `list[0]`
  （恒为初始库）⇒ 库条显示与数据不一致，且切不回原库。**改实现**：`res` 改为 `{ libraries, active }`。
- **路径过期 7 spec**：store 已迁到 `<userData>/libraries/<库名>/`，`ENOENT` 被误判成「没落盘」
  （比直接失败更危险：会去修不存在的持久化 bug）。
- **断言过期 9 条**：章节 18→17、结构分 3→3.1、两段式确认、文案变更等。
- **用例竞态 3 条**：零延迟桩、乐观更新抢在重载前、异步列表 + 默认全选。

### 第二轮 · 取消能力初版（四层同改）

`BrainLlmRequest.signal` → 循环内 controller + 墙钟 abort 在途请求 → 传输层 `fetch(signal)`
→ `agent:cancel` + 渲染层停止按钮。语义与三道计数闸一致：`completed: true` + `terminated` + 部分结果。

### 第三轮 · 继续排雷（三个新洞）

1. **取消打不断「等待用户答复」**：signal 只能 abort `fetch`，危险确认/提问走的是 promise，
   在「等待确认」态点停止要等交互超时（**120 秒**）才生效。
2. **`pumpLines` 提前退出不断流**：只 `releaseLock()`，连接还在 ⇒ 云端继续生成、继续计费。
3. **`LLM_REQUEST_TIMEOUT_MS` 是死代码**：注释写着「挂 AbortController」，从未写过。

> 第 3 条修复时没有直接套 30s：生成请求是 `stream:false` + `maxTokens=1000`，慢档上游需 100 秒，
> 30s 会误杀**正常但不快**的生成。故按用途拆两档（30s 探活 / 180s 生成）。

### 第四轮 · 测试地基（最严重的一条）

追「偶发 1 条失败」时发现**用例总数在 1936–2046 之间漂**：不是某条用例不稳，而是
**有的测试文件整份没跑、还不计入统计**。根因是 `isolate:true` 每文件起一个进程（134 个），
本机实时防护拖慢进程创建，超过 vitest 硬编码的 `START_TIMEOUT = 6e4`（**无配置项**）。

实测对照后改为 `isolate:false + maxWorkers:4`（6/6 全量、wall 7–8s；`maxWorkers:1` 最坏共享 2/2 全过，
证明无状态泄漏）。**关键认知**：该失败退出码非 0（CI 兜得住），但摘要照打「N passed」——
核对口径必须是括号里的总数。

### 第五轮 · 取消从 agent 专属重写为通用

前四轮把取消写成了**对话循环的私有设施**，单发 AI 想用只能再抄一遍。重写为：

| 层 | 位置 | 职责 |
| --- | --- | --- |
| 取消表 | `main/task/taskRegistry.ts` | `begin/end/cancel`，双索引 + 归属校验 |
| 通道 | `task:cancel` | 全应用一条；缺 `taskId` 按窗口兜底 |
| 生命周期 | `withTask` / `runSingleShotTask({ senderId })` | 配对逻辑只写一遍 |
| 请求层 | `LlmClient.generate({ signal })` | 与超时 `AbortSignal.any` 叠加 |
| 渲染层 | `hooks/useStopIntent.ts` | 本地意图判断，不靠错误文案 |

## 4. 设计决策与取舍

### 4.1 为什么用「窗口兜底」而不是让面板管理 taskId

面板上只有一个停止按钮。若要求渲染层生成、传递、回收 taskId，每个面板都要维护一份生命周期，
而其中任一处漏了就是「点了停止没反应」。兜底语义（`bySender`）把复杂度收进主进程一张表。

**代价**：同一窗口并发两个长任务时，兜底取消只能命中最后一个。当前产品形态不存在这种场景
（同一面板同时只允许一个生成），故接受；需要时传 `taskId` 即可精确取消。

### 4.2 为什么 `end` 要比对 signal

`byId` 允许同一 id 复用（连发）。若 `end` 只按 id 删，旧任务的收尾会注销掉新任务的登记
—— 表现正是「点了停止没反应」，且极难排查。比对 controller 身份是零成本的正确做法。

### 4.3 为什么「停止」不靠错误文案识别

主进程中断时抛 `TASK_CANCELLED_MESSAGE`，但同一个错误也可能来自上层取消整批或窗口关闭。
一律按文案吞掉会把真错误静默掉。故渲染层用 `useStopIntent` 记录**本地意图**，只在「我刚点了停止」
时降级为中性提示。

### 4.4 为什么本地 Ollama 改走 fetch

`ollama` SDK 的 `generate` / `list` 都不接受 `AbortSignal`。这导致本地档**既不能取消也没有超时**，
与云端行为不对称（用户点停止只有云端会停）。换成 `fetch` 后两条路径共享同一套信号、超时、
错误归一逻辑，且 `client.ts` 不再依赖 SDK。

### 4.5 明确没做

| 项 | 理由 |
| --- | --- |
| `runLlmJudge` 不接取消 | 跟在正文之后、通常几秒；中途停会留下「有正文没评分」的半态 |
| `schema:suggestFieldIds` / `llm:generate` 不接取消 | 调用很短，且无对应面板入口 |
| 取消不回滚已落盘产物 | 与既有语义一致：AI 只产候选，落盘由人决定 |
| `fuzzyMatch` 子串启发式 | 改它需真正的中文分词，收益不足 |

## 5. 验证矩阵

| 闸门 | 结果 |
| --- | --- |
| `tsc -p tsconfig.node.json` | 0 |
| `tsc -p tsconfig.web.json` | 0 |
| `eslint .` | 0 |
| `vitest run`（134 文件） | **2056 passed / 5 skipped（2061）** |
| `npm run build` | 成功 |
| 整包 e2e（77 例） | **75 passed / 2 skipped / 0 failed（exit 0）** |

新增测试的取向 —— **都打行为差异，不打文案**：

- `taskRegistry.test.ts` 14 例：归属校验、`end` 身份比对、同窗口连发、harness 登记/注销。
- `agentBrain.test.ts` +3：等确认中取消、等回答中取消、批量中取消后协议仍合法。
- `agentStream.test.ts` 10 例：行泵契约 + 异常时 cancel 底层流。
- `llmClient.test.ts` +9：signal 真挂上、超时/取消/连不上三类文案、本地 fetch、停止词两档下发。
- e2e +2：等待确认时点停止（4s 内生效）、数据生成中点停止（桩延迟 5s / 断言 4s）。

## 6. 遗留风险

1. **单发 AI 的超时是 180s 兜底，不是性能目标**。慢档模型 + 长章节仍可能触顶，
   届时用户看到的是「请求超时」而非部分产出（单发接口不返回中间态）。
2. **`isolate:false` 的共享状态风险未穷举**。已用 `maxWorkers:1` 最坏情况验证无泄漏，
   但新增测试若引入模块级可变状态，需自行清理；排查顺序依赖时用 `npm test -- --isolate`。
3. **e2e 仍有偶发时序抖动**（本次 `attr-formula-builder` 出现过一次，单跑 2/2 通过）。
   属既有问题，未在本作业范围内处理。

## 7. 破坏性操作守卫矩阵（「零守卫」专项 · 已清零）

按铁律「危险操作必须有契约层守卫，UX 二次确认框不算」逐个核对全部破坏性/覆盖类通道。

### 7.1 IPC 层

| 通道 | 破坏面 | 守卫 | 状态 |
|---|---|---|---|
| `data:clearAll` | 清空全部数据 | schema `confirm` + handler throw | ✅ |
| `ceshu:delete` | 删策划书 | schema `confirm` + handler throw | ✅ |
| `backup:restore` | 整库回滚 | schema `confirm` + handler throw | ✅ |
| `backup:delete` | 删备份 | schema `confirm` + handler throw | ✅ |
| `images:deleteImages` | 删图片 | schema `confirm` + handler throw | ✅ |
| `library:remove` | 删整库（rmSync 递归） | 本轮新增 schema `confirm` + handler throw | ✅ 本轮修 |
| `data:importLegacy`/`importCsv`/`importExcel` | 导入 | upsert 合并语义（`importRecords` 返回 imported/updated）；用户经文件对话框 | ✅ 非破坏 |
| `attrSystem:importJson` | 导入属性系统 | **只读解析**，返回 `{system,warnings}` 给编辑器预览；落盘另走 `attrSystem:save` | ✅ 非破坏 |
| `ceshu:applyPreset` | 应用预设 | `buildPresetApplication` 深拷贝后**仅**置 `enabled=true` / 填空 `game_type` | ✅ 合并 |
| `ceshu:templates:import` | 导入模板 | `overwrite` 默认 `false`（同 id 跳过），显式 opt-in | ✅ 安全默认 |
| `schema:save` | 保存字段结构 | 校验 + 原子写；**只改类型定义、不删数据条目** | ✅ 非破坏 |
| `library:rename` | 重命名 | 拒绝同名库 / 已存在目标目录 | ✅ 防覆盖 |
| `data:deleteItem`/`deleteMany` | 删条目 | 撤销栈（可 Ctrl+Z） | ✅ 可恢复 |
| `settings:deleteSecret` | 删密钥 | 可重新填 | ✅ 低危 |
| `schema:deleteFieldTemplate` | 删自定义模板 | 小且可重建 | ✅ 低危 |

### 7.2 Agent 技能层

| 技能 / 动作 | 风险档 | 守卫 | 状态 |
|---|---|---|---|
| `system.code` execute | SYSTEM | 调度器 `dangerConfirmed` 可信令牌 | ✅ |
| `system.game_data` delete | DATA_WRITE | 技能内 `params.confirm` → confirm 交互 | ✅ |
| `system.ceshu` delete | DATA_WRITE | 技能内 `params.confirm` → confirm 交互 | ✅ |
| `tool.rollback_ai_changes` | 未登记 → 默认 DATA_WRITE | 技能内 `params.confirm` → confirm 交互 | ✅ |
| `tool.ask_user` | READ_ONLY | — | ✅ |
| `system.ceshu` export | DATA_WRITE | **本轮新增路径沙箱** `resolveExportTarget` | ✅ 本轮修 |
| `system.ceshu` create/update | DATA_WRITE | 正常写（非删除） | ✅ |
| `system.game_data` batch_create/batch_update | 未登记 → 默认 DATA_WRITE | 正常写（有撤销） | ✅ |

### 7.3 已知设计级弱点（记录，本轮未改）

1. `delete`/`rollback` 的确认依赖**模型可见的** `params.confirm`（`fixParams` 还把 `confirmed`/`sure` 别名映射过去）
   ⇒ 理论上模型自带 `confirm:true` 可跳过询问。彻底修需改成 `ctx.dangerConfirmed` 式**可信令牌**（波及 `brain/loop.ts` + 多技能），另立。
2. `system.ceshu` 在 `TOOL_RISK_MAP` 是扁平 `DATA_WRITE`，未反映 `export` 的文件系统能力；
   改 per-action map 仅「诚实化」，默认上限（SYSTEM）下无行为差异，价值低。

### 7.4 静默吞异常扫描

空 `catch` / `catch → return null|false` 共 8 处（`backupStore.exists`、`logger`、`tray`、`memoryStore`×3、`sessionStore`）
全为「可选资源探测」（文件不存在 = 正常），**非关键写路径**，无「失败伪装成功」缺陷。

**结论：破坏性面已全部有守卫；两处真缺陷（`library:remove`、`system.ceshu export`）均已修并补守卫测试。**

