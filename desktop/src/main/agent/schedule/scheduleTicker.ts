/**
 * 定时提醒 ticker：每 30s 检查 `<库>/schedule.json`，到期弹系统通知。
 *
 * 独立成文件（不在 `scheduleStore` 里）：`Notification` 来自 electron，
 * 纯存储单测不应拉起 electron。切库时 `initScheduleTicker` 会清掉上一个 interval。
 */

import { join } from 'node:path'

import { ScheduleStore, type ScheduleTask } from './scheduleStore'

/** 轮询间隔（毫秒） */
export const SCHEDULE_TICK_MS = 30_000

let timer: NodeJS.Timeout | null = null

function defaultNotify(task: ScheduleTask): void {
  // 懒加载 electron：保持本模块图不依赖 electron（stores 的「无 electron」约定）
  void (async () => {
    try {
      const { Notification } = await import('electron')
      new Notification({ title: '墨白 · 定时提醒', body: task.prompt }).show()
    } catch {
      // 无通知能力（如无 GUI 环境）时静默
    }
  })()
}

/** 初始化（或切库重置）ticker：清旧 interval，起新的 */
export function initScheduleTicker(libDir: string, notify: (task: ScheduleTask) => void = defaultNotify): void {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
  const store = new ScheduleStore(join(libDir, 'schedule.json'))
  const interval = setInterval(() => {
    try {
      store.tick(Date.now(), notify)
    } catch {
      // 单次失败不打断 ticker
    }
  }, SCHEDULE_TICK_MS)
  // 不让 ticker 阻止进程退出（测试/关窗时不被挂住）
  interval.unref?.()
  timer = interval
}

/** 停止 ticker（切库/退出时调用） */
export function stopScheduleTicker(): void {
  if (timer !== null) {
    clearInterval(timer)
    timer = null
  }
}
