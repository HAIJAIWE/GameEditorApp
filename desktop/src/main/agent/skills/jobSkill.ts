/**
 * `system.job` 内置技能（对齐 dsh `tool-jobs` 的读取/取消能力）。
 *
 * 让智能体在长回合里查看、检查、取消**后台子智能体任务**——不阻塞当前轮次即可
 * 掌握后台工作进度（list / status / cancel）。真正的「启动」由既有 `spawn_subagent`
 * 完成（异步 activation），本技能只做**观测与取消**，与 dsh 把「启动」交给生产者、
 * 把「读取/取消」交给 `tool-jobs` 的分工一致。
 *
 * 依赖由服务层经 `SkillExecutionContext` 注入：
 * - `jobRegistry`：进程内 `JobRegistry`（子智能体 start/done 事件喂入）
 * - `jobCancel(id)`：请求取消某任务（返回是否找到）
 */

import type { SkillExecutionContext, SkillProtocol, SkillResult } from '../../../shared/agent/config'
import {
  formatJobLine,
  type JobRecord,
  type JobRegistry
} from '../../../shared/agent/jobs/jobRegistry'

const ACTIONS = ['list', 'status', 'cancel'] as const

/** 技能运行时需要的注入面（服务层塞进 context） */
interface JobContext {
  jobRegistry?: JobRegistry
  jobCancel?: (id: string) => boolean
}

function renderDetail(job: JobRecord): string {
  const lines = [formatJobLine(job)]
  if (job.detail !== undefined) lines.push(`说明：${job.detail}`)
  if (job.output !== '') lines.push(`输出尾部：\n${job.output}`)
  return lines.join('\n')
}

export function createJobSkill(): SkillProtocol {
  function run(params: Record<string, unknown>, context: SkillExecutionContext): SkillResult {
    const ctx = context as unknown as JobContext
    const action = typeof params.action === 'string' ? params.action : ''
    if (!ACTIONS.includes(action as (typeof ACTIONS)[number])) {
      return { success: false, error: `未知 action: ${action}（支持 ${ACTIONS.join(' / ')}）`, message: '' }
    }
    const registry = ctx.jobRegistry
    if (registry === undefined) {
      return { success: false, error: '当前环境未提供后台任务注册表', message: '' }
    }

    if (action === 'list') {
      const jobs = registry.list()
      if (jobs.length === 0) return { success: true, message: '当前没有后台任务。', data: { jobs: [] } }
      return {
        success: true,
        message: `后台任务（${registry.runningCount()} 运行中 / 共 ${jobs.length}）：\n${jobs.map(formatJobLine).join('\n')}`,
        data: { jobs }
      }
    }

    const id = typeof params.id === 'string' ? params.id.trim() : ''
    if (id === '') return { success: false, error: `${action} 需要 id 参数`, message: '' }
    const job = registry.get(id)
    if (job === null) return { success: false, error: `未找到任务：${id}`, message: '' }

    if (action === 'status') {
      return { success: true, message: renderDetail(job), data: { job } }
    }

    // cancel
    if (job.status !== 'running') {
      return { success: true, message: `任务 ${id} 已处于终态（${job.status}），无需取消。`, data: { job } }
    }
    const cancelled = ctx.jobCancel?.(id) ?? false
    if (!cancelled) {
      return { success: false, error: `无法取消任务 ${id}（可能已结束）`, message: '' }
    }
    return { success: true, message: `已请求取消任务 ${id}。`, data: { job } }
  }

  return {
    id: 'system.job',
    description:
      '查看与管理后台任务（子智能体）：list=列出全部（运行中优先）/ status=查看某任务详情与输出尾部 / cancel=取消运行中的任务。'
      + '启动后台任务用 spawn_subagent（不阻塞当前轮次）。',
    version: '0.1.0',
    parametersSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: [...ACTIONS], description: '操作类型' },
        id: { type: 'string', description: 'status/cancel 时的任务 id' }
      },
      required: ['action']
    },
    tags: ['system', 'jobs'],
    execute: run
  }
}
