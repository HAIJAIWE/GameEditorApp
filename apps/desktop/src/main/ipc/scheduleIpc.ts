/**
 * 定时提醒的界面通道（`schedule:list` / `schedule:remove`）。
 *
 * 为什么要有这两条：`system.schedule` 技能早就能加/删提醒，但**界面上完全看不到**——
 * 用户不知道智能体给自己定了什么提醒，想取消也只能再让智能体去删。
 * 这里只补**观测 + 删除**；新增仍走对话（cron / 相对时间让模型算比让用户填表单更顺）。
 *
 * 与技能、ticker 共用同一份 `<库>/schedule.json`：`ScheduleStore` 无内存缓存、
 * 每次现读现写，所以三处并发操作同一文件也安全（见 `scheduleStore.ts` 顶部说明）。
 */

import type { IpcHandlerDeps, IpcRegistrar } from '../ipc'
import { scheduleRemoveInputSchema } from '@mobai/shared/schema/adapters'

export function registerScheduleIpc(deps: IpcHandlerDeps, handle: IpcRegistrar): void {
  handle('schedule:list', undefined, () => ({
    // 存储层字段与 `ScheduleTaskView` 形状一致；显式映射是为了不让将来的内部字段漏到渲染层
    tasks: deps.scheduleStore.list().map((task) => ({
      id: task.id,
      prompt: task.prompt,
      at: task.at,
      ...(task.repeatMs !== undefined ? { repeatMs: task.repeatMs } : {}),
      ...(task.cron !== undefined ? { cron: task.cron } : {}),
      ...(task.firedAt !== undefined ? { firedAt: task.firedAt } : {})
    }))
  }))

  handle('schedule:remove', scheduleRemoveInputSchema, (req) => ({
    ok: deps.scheduleStore.remove(req.id)
  }))
}
