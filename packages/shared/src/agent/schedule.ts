/**
 * 定时提醒的**只读视图**（IPC 与 UI 共用）。
 *
 * 为什么单独一份而不直接用 `agent-core` 的 `ScheduleTask`：`shared` 是零 node 依赖的
 * 契约层，`ScheduleTask` 住在 agent-core（与存储实现同处）。这里只保留**能过 IPC 的**
 * 字段子集，形状一致但归属清晰 —— 存储层加内部字段时不会漏到渲染层。
 */

/** 一条定时提醒的展示数据 */
export interface ScheduleTaskView {
  id: string
  /** 提醒内容 */
  prompt: string
  /** 下次触发时间（ISO 字符串；渲染层自行本地化） */
  at: string
  /** 重复间隔（毫秒）；缺省 = 一次性 */
  repeatMs?: number
  /** cron 表达式（5 字段）；提供时按 cron 推进 */
  cron?: string
  /** 一次性任务已触发的时间（ISO）；有值表示这条已经响过 */
  firedAt?: string
}
