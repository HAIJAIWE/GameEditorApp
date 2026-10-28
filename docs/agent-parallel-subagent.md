# 并行工具执行 & 子智能体（Slice 19）

> 在**事件流架构**里原生实现（不是搬 dsh 代码）。两者都是 **opt-in**，默认关闭 → 既有行为 100% 不变。

## 1. 并行工具执行（`parallelToolCalls`）

### 问题
LLM 一轮里返回多个工具调用时，原实现是**逐个 `await`**（顺序执行）。虽然事件标签写着「并行N工具」，但并没有真并行。

### 做法
把批处理拆成「预启动 + 按序 await」：

1. 取消/上限闸通过后，把**能解析、且不需要审批**的工具**预启动**为并发 promise（信号量限流 `maxToolConcurrency`，默认 4）；
2. 仍按**原顺序**逐个 `await`（未预启动的 = 需审批的，走串行）；
3. `step_done` / tool 消息**顺序完全不变**（测试断言的事件序列不受影响）。

### 为什么审批/交互不并行
- 审批是**交互式**的（等用户点），并发会弹多个确认框；
- `context.dangerConfirmed` 是**单令牌**，并发执行会互相覆盖 → 只有「非审批工具」参与并行。

### 用法
```ts
runBrainLoop({ …, parallelToolCalls: true, maxToolConcurrency: 4 })
```
⚠️ **只对互不依赖、非数据写**的工具安全。数据写类工具并发会有竞态。

## 2. 子智能体（`tool.spawn_subagent`）

### 做法
- 注册一个**标记技能** `tool.spawn_subagent`（参数 `task`）——只为「能被解析 + 出现在工具面」；
- Brain 循环按**工具名**拦截（默认 `tool.spawn_subagent`），不调技能 `execute`，而是**递归跑一轮新的 `runBrainLoop`**（独立消息历史、相同工具面）；
- 子循环的最终答复包装成 `子智能体结果：…` 回灌给外层，作为该工具的结果。

### 防递归
`depth` 最多 1 层：子智能体内部再派子智能体会被拒绝（`[STOP] 子智能体嵌套已达上限`）。

### 用法
顶层调用方**不用传**（默认就拦截 `tool.spawn_subagent`）；要换名可传 `subAgentTool`，传空串可关闭。

## 3. 关键设计：共享 `runTool`

顺序路径与并行路径共用同一个 `runTool`（执行 → 交互结算 → 裁剪 → 失败计数），避免两份执行逻辑漂移。
`runTool` 只返回结果，**不 emit / 不 push 消息**——由调用方按顺序落事件与消息（保证顺序稳定）。

## 4. 验证

```bash
npx vitest run tests/unit/agentBrain.test.ts   # 55 条（含 3 并行 + 2 子智能体）
npx playwright test tests/e2e/agent-brain-chat.spec.ts tests/e2e/agent-execute-tool.spec.ts
```

## 5. 未做
- 并行执行目前只并行「执行阶段」，**审批/交互仍串行**（这是有意的安全取舍）。
- 子智能体**最多 1 层**（防递归）；更深的任务树需要显式的预算/深度策略。
