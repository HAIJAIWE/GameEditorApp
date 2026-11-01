/**
 * `system.goal` 内置技能（对齐 dsh `goal` + `tool-goal` 的目标生命周期管理）。
 *
 * 让智能体在**长任务**里维护一个明确目标：创建 → 推进 → 完成/暂停/阻塞/清除，
 * 并把阶段与轮次进度显式化（防目标漂移）。目标状态作为工具结果进 `messages`，
 * 模型下一轮天然可见（与 dsh 不同：dsh 用 session 投影持久化，我们 v1 内存态）。
 *
 * 能力（action）：
 * - create：创建目标（objective + 可选 maxRounds；一会话同时只一个）
 * - edit：改 objective / maxRounds（仅 active/paused）
 * - pause / resume：暂停 / 恢复
 * - complete：标记完成（终态）
 * - block：标记阻塞并附 reason（code + message）
 * - clear：清除
 *
 * 与 dsh 的差异：① 内存态非事件溯源；② 轮次上限由服务层钳到循环 maxTurns（安全闸），
 * 不引入 goal-round-driver 自动续跑；③ 不强制只读，目标只是意图锚点。
 */

import type { SkillProtocol, SkillResult } from '../../../shared/agent/config'
import {
  DEFAULT_GOAL_MAX_ROUNDS,
  formatGoalStatus,
  goalStore,
  GoalError,
  type GoalState
} from '../../../shared/agent/goal/goalStore'

const ACTIONS = [
  'create',
  'edit',
  'pause',
  'resume',
  'complete',
  'block',
  'clear'
] as const

/** 把成功结果格式化为工具文本（含最新状态） */
function ok(state: GoalState | null): SkillResult {
  if (state === null) {
    return { success: true, message: '目标已清除，当前无活跃目标。', data: { goal: null } }
  }
  return {
    success: true,
    message: `目标状态更新成功。\n${formatGoalStatus(state)}`,
    data: { goal: state }
  }
}

export function createGoalSkill(): SkillProtocol {
  function run(params: Record<string, unknown>, ctx: { sessionId?: string }): SkillResult {
    const sessionId = ctx.sessionId
    if (sessionId === undefined || sessionId.trim() === '') {
      return { success: false, error: '缺少 sessionId，无法定位目标', message: '' }
    }
    const action = typeof params.action === 'string' ? params.action : ''
    if (!ACTIONS.includes(action as (typeof ACTIONS)[number])) {
      return { success: false, error: `未知 action: ${action}（支持 ${ACTIONS.join(' / ')}）`, message: '' }
    }
    try {
      switch (action) {
        case 'create': {
          const max =
            typeof params.maxRounds === 'number' ? params.maxRounds : DEFAULT_GOAL_MAX_ROUNDS
          return ok(goalStore.create(sessionId, params.objective as string, max))
        }
        case 'edit':
          return ok(goalStore.edit(sessionId, { objective: params.objective, maxRounds: params.maxRounds }))
        case 'pause':
          return ok(goalStore.pause(sessionId))
        case 'resume':
          return ok(goalStore.resume(sessionId))
        case 'complete':
          return ok(goalStore.complete(sessionId))
        case 'block': {
          const code = typeof params.code === 'string' ? params.code : ''
          const message = typeof params.message === 'string' ? params.message : ''
          return ok(goalStore.block(sessionId, code, message))
        }
        case 'clear':
          goalStore.clear(sessionId)
          return ok(null)
        default:
          return { success: false, error: `未实现的 action: ${action}`, message: '' }
      }
    } catch (error) {
      const message = error instanceof GoalError ? error.message : String(error)
      return { success: false, message: `goal 操作失败：${message}`, error: message }
    }
  }

  return {
    id: 'system.goal',
    description:
      '管理当前会话的目标生命周期：create（建目标，可带 maxRounds）/ edit / pause / resume / complete / block（附原因）/ clear。'
      + '目标状态会在回复中回显，便于长任务保持方向。',
    version: '0.1.0',
    parametersSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: [...ACTIONS], description: '目标操作' },
        objective: { type: 'string', description: 'create/edit 时的目标描述（非空）' },
        maxRounds: { type: 'number', description: 'create 时的轮次上限（正整数，默认 10）' },
        code: { type: 'string', description: 'block 时的机器可读原因码（非空）' },
        message: { type: 'string', description: 'block 时的人类可读原因（非空）' }
      },
      required: ['action']
    },
    tags: ['system', 'planning'],
    execute: run
  }
}
