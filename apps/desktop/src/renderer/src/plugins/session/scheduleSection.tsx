import { useCallback, useEffect, useState, type ReactElement } from 'react'

import { useT } from '@mobai/client-ui'
import type { ScheduleTaskView } from '@mobai/shared/agent/schedule'
import type { PluginHost } from '@mobai/shared/plugin/host'

/**
 * 「会话」页签的定时提醒分区（`ui-schedule` 的本土移植，只做**观测 + 删除**）。
 *
 * 为什么需要：`system.schedule` 技能早就能加提醒，但界面上完全看不到 ——
 * 用户不知道智能体给自己定了什么，想取消也只能再让智能体去删。
 *
 * 为什么不做「新增」表单：cron / 相对时间让模型算比让用户填表单更顺，
 * 而且技能本来就支持；这里补的是**可见性**，不是再造一套调度 UI。
 *
 * 无提醒时返回 `null`（与后台任务分区一致）：没有内容的空区块只会占版面。
 */

/** 渲染层只需要 list / remove；其余通道（chat 等）本分区不碰，故局部声明 */
interface ScheduleBridge {
  schedule?: {
    list(): Promise<{ tasks: ScheduleTaskView[] }>
    remove(req: { id: string }): Promise<{ ok: boolean }>
  }
}

function bridge(): ScheduleBridge['schedule'] {
  // 单测（jsdom 无 preload）与未来 Web 宿主都可能没有这条通道：缺了就静默跳过，
  // 不让一个可观测性分区把整页拖空。
  return (window as unknown as { mbApi?: ScheduleBridge }).mbApi?.schedule
}

/** 本地化触发时间；非法时间回落原串（不让一条坏数据把整个列表染红） */
function formatAt(at: string): string {
  const date = new Date(at)
  return Number.isNaN(date.getTime()) ? at : date.toLocaleString()
}

export function ScheduleSection(_props: { host: PluginHost }): ReactElement | null {
  const t = useT()
  const [tasks, setTasks] = useState<ScheduleTaskView[]>([])

  useEffect(() => {
    const api = bridge()
    if (api === undefined) return
    let alive = true
    void api
      .list()
      .then((res) => {
        if (alive) setTasks(Array.isArray(res.tasks) ? res.tasks : [])
      })
      .catch(() => undefined)
    return () => {
      alive = false
    }
  }, [])

  const remove = useCallback((id: string): void => {
    const api = bridge()
    if (api === undefined) return
    void api
      .remove({ id })
      .then((res) => {
        // 只有真的删掉了才从列表移除：`ok:false`（已被别处删掉）也一并移除，
        // 因为界面上它确实不该再出现。
        setTasks((prev) => prev.filter((task) => task.id !== id))
        return res
      })
      .catch(() => undefined)
  }, [])

  if (tasks.length === 0) return null

  return (
    <section className="session-block" data-testid="session-block-schedule">
      <h3 className="session-block-title">{t('session.schedule')}</h3>
      <ul className="session-schedule-list">
        {tasks.map((task) => {
          const meta: string[] = [formatAt(task.at)]
          if (task.cron !== undefined) meta.push(t('session.scheduleCron', { expr: task.cron }))
          if (task.repeatMs !== undefined) {
            const minutes = Math.round(task.repeatMs / 60_000)
            meta.push(
              minutes >= 1
                ? t('session.scheduleRepeatMinutes', { minutes })
                : t('session.scheduleRepeatSeconds', { seconds: Math.round(task.repeatMs / 1000) })
            )
          }
          if (task.firedAt !== undefined) meta.push(t('session.scheduleFired'))
          return (
            <li key={task.id} className="session-schedule-item" data-testid="session-schedule-item">
              <div className="session-schedule-body">
                <span className="session-schedule-prompt">{task.prompt}</span>
                <span className="session-schedule-meta">{meta.join(' · ')}</span>
              </div>
              <button
                type="button"
                className="session-schedule-delete"
                data-testid="session-schedule-delete"
                title={t('session.scheduleDelete')}
                onClick={() => remove(task.id)}
              >
                {t('session.scheduleDelete')}
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
