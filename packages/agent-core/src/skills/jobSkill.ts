/**
 * `system.job` 内置技能（对齐 dsh `tool-jobs` 的读取/等待/取消能力）。
 *
 * 让智能体查看、等待、取消**后台子智能体任务**。真正的「启动」由既有 `spawn_subagent`
 * 完成（异步 activation），本技能只做**观测与取消**，与 dsh 把「启动」交给生产者、
 * 把「读取/取消」交给 `tool-jobs` 的分工一致。
 *
 * `wait` 是唯一会阻塞的动作：等到任务终态或超时（默认 30s，上限 120s）。
 * 超时**不算失败**，会带着当前快照如实返回，供模型决定继续等还是先做别的 ——
 * 这样「派出去再收结果」不必靠反复轮询 list/status 猜。
 *
 * 依赖由服务层经 `SkillExecutionContext` 注入：
 * - `jobRegistry`：进程内 `JobRegistry`（子智能体 promise 完成时即时结算）
 * - `jobCancel(id)`：请求取消某任务（返回是否找到）
 * - `signal`（可选）：本轮取消信号，用户点停止时立刻打断等待
 */

import type { SkillExecutionContext, SkillProtocol, SkillResult } from '@mobai/shared/agent/config'
import {
  formatJobLine,
  JOB_STATUS_LABELS,
  JOB_WAIT_DEFAULT_MS,
  type JobRecord,
  type JobRegistry
} from '@mobai/shared/agent/jobs/jobRegistry'

const ACTIONS = ['list', 'status', 'wait', 'cancel'] as const
/** 等待上限：不让一次工具调用把整轮对话无限挂住 */
const WAIT_MAX_MS = 120_000
const WAIT_MIN_MS = 500

/** 技能运行时需要的注入面（服务层塞进 context） */
interface JobContext {
  jobRegistry?: JobRegistry
  jobCancel?: (id: string) => boolean
  signal?: AbortSignal
}

function renderDetail(job: JobRecord): string {
  const lines = [formatJobLine(job)]
  if (job.detail !== undefined) lines.push(`说明：${job.detail}`)
  if (job.output !== '') lines.push(`输出尾部：\n${job.output}`)
  return lines.join('\n')
}

export function createJobSkill(): SkillProtocol {
  async function run(params: Record<string, unknown>, context: SkillExecutionContext): Promise<SkillResult> {
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

    if (action === 'wait') {
      const signal = ctx.signal instanceof AbortSignal ? ctx.signal : undefined
      const raw = typeof params.timeout_ms === 'number' && Number.isFinite(params.timeout_ms)
        ? params.timeout_ms
        : JOB_WAIT_DEFAULT_MS
      const timeoutMs = Math.min(WAIT_MAX_MS, Math.max(WAIT_MIN_MS, Math.trunc(raw)))
      const outcome = await registry.waitFor(id, {
        timeoutMs,
        ...(signal !== undefined ? { signal } : {})
      })
      if (outcome.kind === 'missing') {
        return { success: false, error: `任务 ${id} 已不在注册表中（可能被裁剪）`, message: '' }
      }
      if (outcome.kind === 'aborted') {
        return { success: false, error: `等待任务 ${id} 已取消`, message: '' }
      }
      const settled = outcome.job
      const label = JOB_STATUS_LABELS[settled.status]
      if (outcome.kind === 'timeout') {
        return {
          success: true,
          message: `等待 ${(timeoutMs / 1000).toFixed(0)} 秒后任务 ${id} 仍未结束（当前${label}）。\n`
            + `${renderDetail(settled)}\n可再次 wait 继续等，或先做别的事。`,
          data: { job: settled, timedOut: true }
        }
      }
      return {
        success: true,
        message: `任务 ${id} 已结束（${label}）\n${renderDetail(settled)}`,
        data: { job: settled }
      }
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
      '查看与管理后台任务（子智能体）：list=列出全部（运行中优先）/ status=查看某任务详情与输出尾部 / '
      + 'wait=阻塞等待任务结束（默认 30 秒，timeout_ms 可调，超时不算失败、返回当前进度）/ '
      + 'cancel=取消运行中的任务。启动后台任务用 spawn_subagent（不阻塞当前轮次）；'
      + '需要它的结果时用 wait，不要反复轮询 list。',
    version: '0.2.0',
    parametersSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: [...ACTIONS], description: '操作类型' },
        id: { type: 'string', description: 'status/wait/cancel 时的任务 id' },
        timeout_ms: {
          type: 'number',
          description: 'wait 的最长等待毫秒数（默认 30000，上限 120000）',
          minimum: WAIT_MIN_MS,
          maximum: WAIT_MAX_MS
        }
      },
      required: ['action']
    },
    tags: ['system', 'jobs'],
    execute: run
  }
}
