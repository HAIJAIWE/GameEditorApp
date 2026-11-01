/**
 * `system.schedule` 内置技能（对齐 dsh `schedule` 的**提醒**子集）：到点弹系统通知。
 *
 * 不是 cron 任务调度器——不会自动跑 agent（无头运行无法处理审批）。用户收到提醒后可自行发起。
 * 存储 `<库>/schedule.json`，由 `scheduleTicker` 每 30s 检查并通知。
 *
 * 风险：add/remove = DATA_WRITE；list = READ_ONLY。
 */

import type { SkillProtocol, SkillResult } from '../../../shared/agent/config'
import { ScheduleStore } from '../schedule/scheduleStore'

const ACTIONS = ['add', 'list', 'remove'] as const

export interface ScheduleSkillOptions {
  /** `schedule.json` 的绝对路径（`<库>/schedule.json`） */
  filePath: string
}

function fail(message: string, error: string): SkillResult {
  return { success: false, message: `schedule 失败：${message}`, error }
}

function formatTask(task: { id: string; prompt: string; at: string; repeatMs?: number; firedAt?: string }): string {
  const repeat = task.repeatMs !== undefined ? `，每 ${Math.round(task.repeatMs / 1000)}s` : ''
  const fired = task.firedAt !== undefined ? '（已触发）' : ''
  return `${task.id}｜${task.at}${repeat}${fired}｜${task.prompt}`
}

export function createScheduleSkill(options: ScheduleSkillOptions): SkillProtocol {
  const store = new ScheduleStore(options.filePath)

  async function run(params: Record<string, unknown>): Promise<SkillResult> {
    const action = typeof params.action === 'string' ? params.action : ''
    if (!ACTIONS.includes(action as (typeof ACTIONS)[number])) {
      return fail(`未知 action: ${action}（支持 ${ACTIONS.join(' / ')}）`, 'EBADACTION')
    }

    if (action === 'list') {
      const tasks = store.list()
      if (tasks.length === 0) return { success: true, message: '当前没有定时提醒。', data: { tasks: [] } }
      return {
        success: true,
        message: `定时提醒（${tasks.length}）：\n${tasks.map(formatTask).join('\n')}`,
        data: { tasks }
      }
    }

    if (action === 'remove') {
      const id = typeof params.id === 'string' ? params.id.trim() : ''
      if (id === '') return fail('缺少 id', 'EBADARG')
      return store.remove(id)
        ? { success: true, message: `已删除 ${id}` }
        : fail(`未找到 ${id}`, 'ENOTFOUND')
    }

    // add
    const prompt = typeof params.prompt === 'string' ? params.prompt : ''
    const at = typeof params.at === 'string' ? params.at : undefined
    const delayRaw = params.delay_ms
    const delayMs = typeof delayRaw === 'number' ? delayRaw : undefined
    const repeatRaw = params.repeat_ms
    const repeatMs = typeof repeatRaw === 'number' ? repeatRaw : undefined
    try {
      const task = store.add({
        prompt,
        ...(at !== undefined ? { at } : {}),
        ...(delayMs !== undefined ? { delayMs } : {}),
        ...(repeatMs !== undefined ? { repeatMs } : {})
      })
      return { success: true, message: `已添加提醒 ${task.id}（${task.at}）`, data: { task } }
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error), 'EADD')
    }
  }

  return {
    id: 'system.schedule',
    description:
      '定时提醒（到点弹系统通知，不自动跑 agent）：add=新增 / list=列出 / remove=删除。'
      + 'add 用 at(ISO 时间) 或 delay_ms(相对毫秒)，可选 repeat_ms 重复。存 <库>/schedule.json。',
    version: '0.1.0',
    parametersSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: [...ACTIONS], description: '操作类型' },
        prompt: { type: 'string', description: 'add 时的提醒内容' },
        at: { type: 'string', description: 'add 时的 ISO 时间（如 2026-11-02T09:00:00+08:00）' },
        delay_ms: { type: 'integer', description: 'add 时的相对延迟（毫秒），与 at 二选一' },
        repeat_ms: { type: 'integer', description: '重复间隔（毫秒），可选' },
        id: { type: 'string', description: 'remove 时的任务 id' }
      },
      required: ['action']
    },
    tags: ['system', 'schedule'],
    execute: run
  }
}
