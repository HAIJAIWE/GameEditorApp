/**
 * 通用「可取消任务」注册表（主进程）。
 *
 * ## 为什么要有它（而不是各自留一张 Map）
 * 取消最初只服务对话智能体（`agent:cancel` + `agentIpc` 里的两张 Map）。随后发现
 * **单发 AI**（章节生成 / 数据生成 / 审校）根本没法中断：只有 fetch 超时兜底，面板上
 * 没有停止入口，用户只能等或重启。若给每条业务线各写一遍「登记 / 注销 / 按窗口兜底取消」，
 * 就是臭名昭著的「复制出来的漂移」（本项目已踩过：两份行泵实现，一份漏了锁释放）。
 * 故把**取消这层关注点**收敛成一处：任何长任务（对话循环、单发生成、将来的批量导出）
 * 都向本表登记，渲染层只面对**一个**通道 `task:cancel`。
 *
 * ## 两个索引各解决什么
 * - `byId`：渲染层带着自己生成的 id 取消 ⇒ 精确命中某一次调用（连发两次也不会串）。
 * - `bySender`：渲染层没带 id（或懒得生成）⇒ 取消**这个 window 当前活跃的一笔**。
 *   这是「面板上只有一个停止按钮」的天然语义，也让面板不必管理 taskId 生命周期。
 *
 * ## 归属校验（改前是个漏洞）
 * 旧实现里 `activeRuns.get(runId)` **不校验 sender** —— 注释写着「多窗口也不会串」，
 * 但任一窗口只要猜到/复用同一个 id 就能取消别人的任务。现在 `byId` 记录 `senderId`，
 * 显式 id 与兜底路径都要求**同一个 window** 才放行。
 *
 * ## 生命周期纪律
 * 登记后**必须**在 `finally` 里 `end(taskId)`：否则取消一个已结束的任务会命中
 * 陈旧的 controller（静默无效，且内存里留一条永不释放的记录）。`end` 按 controller
 * 身份比对，避免「注销 A 却把刚登记的 B 删掉」。
 */

/** 一次登记产生的句柄：`signal` 交给下层（fetch / 循环），`taskId` 用于注销 */
export interface TaskTicket {
  taskId: string
  signal: AbortSignal
}

interface TaskEntry {
  controller: AbortController
  senderId: number
}

export class TaskRegistry {
  private seq = 0
  private readonly byId = new Map<string, TaskEntry>()
  private readonly bySender = new Map<number, string>()

  /**
   * 登记一次任务。
   * @param senderId `event.sender.id`（webContents id）；用于归属校验与兜底取消
   * @param taskId 渲染层指定的 id（可选）；缺省由本表生成
   */
  begin(senderId: number, taskId?: string): TaskTicket {
    const id = taskId !== undefined && taskId !== '' ? taskId : `task_${++this.seq}`
    const controller = new AbortController()
    this.byId.set(id, { controller, senderId })
    this.bySender.set(senderId, id)
    return { taskId: id, signal: controller.signal }
  }

  /** 注销（在 `finally` 里调用）。按 controller 身份比对，不误删后登记的同名任务 */
  end(taskId: string, signal?: AbortSignal): void {
    const entry = this.byId.get(taskId)
    if (entry === undefined) return
    // 传了 signal 就严格比对：同一 id 被新任务复用时，旧任务的 finally 不得注销新任务
    if (signal !== undefined && entry.controller.signal !== signal) return
    this.byId.delete(taskId)
    if (this.bySender.get(entry.senderId) === taskId) this.bySender.delete(entry.senderId)
  }

  /**
   * 取消。
   * @returns 是否真的命中了一笔在运行的任务（`false` = 已结束 / 不存在 / 不属于该窗口）
   */
  cancel(senderId: number, taskId?: string): boolean {
    const id = taskId !== undefined && taskId !== '' ? taskId : this.bySender.get(senderId)
    if (id === undefined) return false
    const entry = this.byId.get(id)
    if (entry === undefined) return false
    // 只允许取消自己窗口的任务
    if (entry.senderId !== senderId) return false
    entry.controller.abort()
    return true
  }

  /** 当前在跑的数量（测试/排障用） */
  get size(): number {
    return this.byId.size
  }
}

let shared: TaskRegistry | undefined

/** 进程级单例（与 `sharedRateLimiter()` 同款约定：全局只应有一张取消表） */
export function taskRegistry(): TaskRegistry {
  if (shared === undefined) shared = new TaskRegistry()
  return shared
}

/**
 * 语法糖：登记 → 执行 → **必定**注销。
 *
 * 给「一整块代码可取消」的场景用：对话循环（`agentIpc`）直接包住 `agentBrain.chat`，
 * 单发 AI 则走 `runSingleShotTask({ senderId })`（它内部同样只用本表的 begin/end，
 * 只是还要顺带做预算确认与观测累计）。
 *
 * ⚠️ 为什么值得抽：手写 `begin` + `try/finally { end }` 时，最容易漏的是
 * 「`end` 忘了传 signal」—— 那会让同一窗口连发时，旧任务的收尾注销掉新任务，
 * 表现为「点了停止没反应」。把配对收进一个函数，调用点就没有漏传的机会。
 *
 * @param taskId 渲染层指定的 id（可选，缺省由表生成）
 */
export async function withTask<T>(
  senderId: number,
  body: (signal: AbortSignal) => Promise<T>,
  taskId?: string
): Promise<T> {
  const ticket = taskRegistry().begin(senderId, taskId)
  try {
    return await body(ticket.signal)
  } finally {
    taskRegistry().end(ticket.taskId, ticket.signal)
  }
}
