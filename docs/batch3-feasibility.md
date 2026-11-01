# 批次 3 可行性评估（ptc-runtime / workflow / browser-use / computer-use / schedule）

> 结论先行：**这 5 项都不是「加个技能」能解决的**。其中 `ptc-runtime` / `workflow` 卡在**审批架构**，
> `schedule` 缺调度后端，`browser-use` / `computer-use` 缺运行时且风险最高。
> 建议：要么做产品决策后单独立项，要么不做；**不建议**用半成品硬塞。

## 0. 共同前提：审批门在循环层，不在 dispatcher

当前架构里，**危险操作的审批发生在 agent 循环调用 `dispatcher.execute` 之前**（`needsConfirmation` → 审批 → 执行）。
`SkillDispatcher.execute()` 本身是**裸执行**，不过审批。

因此，任何「技能内部再去调用别的工具」的能力（PTC、workflow），
如果直接 `dispatcher.execute('system.shell', ...)`，就会**绕过审批**——等于给模型开了一个后门。

这不是实现细节，是**安全边界**。要做，必须先把审批门下沉到 dispatcher（或提供一个「带审批的 executeTool」给技能用），
这是对核心链路的改造，不是加技能。

## 1. `ptc-runtime`（Programmatic Tool Calling / run_code）

- **dsh 做什么**：模型写一段代码，代码里以编程方式调用工具（循环、条件、聚合），一次执行多步。
- **我们的现状**：`system.code` 是 QuickJS WASM 沙箱，**默认零宿主能力**（无 require/fs/网络/工具）。
- **阻塞**：
  1. QuickJS 是**同步**执行，工具调用是**异步**——需要同步桥（复杂）；
  2. 即使桥通，工具调用会**绕过审批**（见 §0）；
  3. 放开宿主能力 = 放弃 `system.code` 的安全模型。
- **结论**：**不建议做**。真要做，先解决「异步工具桥 + 审批下沉」两个前置。

## 2. `workflow`（多步工作流引擎）

- **dsh 做什么**：声明式多步流程（节点/边/条件），一次跑完。
- **阻塞**：同样会「技能内调工具」→ 绕过审批（§0）。
- **替代**：agent 循环本身就能顺序调工具；确定性多步可以用「计划 + todo」表达。
- **结论**：**不建议做**（与循环重复 + 安全阻塞）。

## 3. `schedule`（定时任务）

- **dsh 做什么**：cron 式定时触发任务。
- **我们的现状**：应用内**没有调度后端**（只有 `TOOL_RISK_MAP` 里的 `system.scheduler` 占位，无实现、无持久化、无 UI）。
- **需要**：常驻调度器 + 持久化存储 + 启停/查看 UI + 与 agent 循环的衔接。**多日工作量**。
- **结论**：**暂不做**。若产品真需要「定时生成策划书」，应作为独立功能立项。

## 4. `browser-use`（浏览器自动化）

- **dsh 做什么**：Playwright 驱动浏览器（导航/点击/填表/截图/取文本）。
- **我们的现状**：有内嵌 `BrowserPanel`（webview，供人看），但**没有运行时 Playwright**（`@playwright/test` 只在 devDeps，且仅用于 e2e）。
- **需要**：把 Playwright 提为运行时依赖 + 浏览器二进制 + 主进程驱动 + 与面板联动。体积与启动成本都不小。
- **有界替代**（若只要「让 agent 打开网页给人看」）：给 `BrowserPanel` 加一个「导航请求」总线，
  由 agent 发 URL → 面板跳转。这是**产品原生小功能**，不是 dsh 的 browser-use。
- **结论**：完整 browser-use **暂不做**；「打开 URL」可作为小功能单独做。

## 5. `computer-use`（桌面 GUI 控制）

- **dsh 做什么**：截屏 + 鼠标键盘控制，操作任意桌面应用。
- **风险**：最高（可操作任意窗口/输入密码）。桌面产品里收益不明确。
- **结论**：**不做**。

## 汇总

| 项 | 结论 | 关键原因 |
|---|---|---|
| ptc-runtime | 不做 | 同步/异步桥 + 审批绕过 |
| workflow | 不做 | 审批绕过 + 与循环重复 |
| schedule | 暂不做 | 缺调度后端（多日） |
| browser-use | 暂不做（可做「打开 URL」小功能） | 缺运行时 Playwright |
| computer-use | 不做 | 风险最高、收益不明 |

## 如果一定要推进，建议顺序

1. **先做「审批下沉」**（把审批门从循环层移到 dispatcher 层）——这是 ptc/workflow 的共同前置，且对整体安全模型是升级；
2. 再做 **PTC 的同步桥**（或改用「异步脚本 + await 工具」的独立运行时）；
3. `schedule` 单独立项（调度器 + UI）；
4. `browser-use` 视产品需要再评估。
