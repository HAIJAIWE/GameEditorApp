/**
 * 通用取消通道（`task:cancel`）。
 *
 * 只有一条 handler：把「哪个窗口点取消」翻译成「abort 哪一笔任务」。
 * 真正的登记/注销在 `main/task/taskRegistry.ts`，各业务 handler（对话循环、
 * 章节/数据/审校单发生成）在 `finally` 里注销自己。
 *
 * 为什么单独成文件而不塞进 agentIpc：取消已经**不是 agent 专属**了。
 * 放在 agentIpc 里会让人以为只有对话面能取消，下一处单发生成又会各自造轮子。
 */

import type { IpcHandlerDeps, IpcRegistrar } from '../ipc'
import { taskCancelInputSchema } from '../../shared/schema/core/schemas'
import { taskRegistry } from '../task/taskRegistry'

export function registerTaskIpc(_deps: IpcHandlerDeps, handle: IpcRegistrar): void {
  handle('task:cancel', taskCancelInputSchema, (req, event) => ({
    cancelled: taskRegistry().cancel(event.sender.id, req.taskId)
  }))
}
