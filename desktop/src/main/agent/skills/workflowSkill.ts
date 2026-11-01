/**
 * `system.workflow` 内置技能：按顺序执行一组工具步骤（对齐 dsh `workflow` 的**有界子集**）。
 *
 * 与 agent 循环的区别：一次调用跑完固定步骤，确定性、省往返；适合「把已知的 N 步串起来」。
 *
 * **安全**：每一步都经 `executeGated`——风险 ≥ SYSTEM 的子步骤会**再问一次审批**，
 * 不会因为「包了一层 workflow」就绕过审批门。没有审批通道时 fail-closed。
 * 禁止嵌套 workflow（防递归）。
 */

import type { SkillExecutionContext, SkillProtocol, SkillResult } from '../../../shared/agent/config'

/** 单次 workflow 的步骤上限 */
export const WORKFLOW_MAX_STEPS = 20

export interface WorkflowStep {
  tool: string
  params?: Record<string, unknown>
}

export interface WorkflowSkillOptions {
  /** 带审批的子工具执行（由 dispatcher.executeGated 提供） */
  executeGated: (
    tool: string,
    params: Record<string, unknown>,
    ctx: SkillExecutionContext
  ) => Promise<SkillResult>
}

function fail(message: string, error: string): SkillResult {
  return { success: false, message: `workflow 失败：${message}`, error }
}

function parseSteps(raw: unknown): WorkflowStep[] | null {
  if (!Array.isArray(raw) || raw.length === 0 || raw.length > WORKFLOW_MAX_STEPS) return null
  const steps: WorkflowStep[] = []
  for (const item of raw) {
    if (item === null || typeof item !== 'object') return null
    const record = item as { tool?: unknown; params?: unknown }
    if (typeof record.tool !== 'string' || record.tool.trim() === '') return null
    const params =
      record.params !== null && typeof record.params === 'object'
        ? (record.params as Record<string, unknown>)
        : {}
    steps.push({ tool: record.tool.trim(), params })
  }
  return steps
}

export function createWorkflowSkill(options: WorkflowSkillOptions): SkillProtocol {
  async function run(params: Record<string, unknown>, ctx: SkillExecutionContext): Promise<SkillResult> {
    const action = typeof params.action === 'string' ? params.action : ''
    if (action !== 'run') {
      return fail(`未知 action: ${action}（当前仅支持 run）`, 'EBADACTION')
    }
    const steps = parseSteps(params.steps)
    if (steps === null) {
      return fail(`steps 必须是非空数组（最多 ${WORKFLOW_MAX_STEPS} 步，每步含 tool）`, 'EBADARG')
    }
    if (steps.some((step) => step.tool === 'system.workflow')) {
      return fail('禁止嵌套 workflow', 'ENESTED')
    }

    const continueOnError = params.continue_on_error === true
    const results: Array<{ index: number; tool: string; ok: boolean; message: string }> = []
    let failedAt: number | null = null

    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index]
      const result = await options.executeGated(step.tool, step.params ?? {}, ctx)
      results.push({ index: index + 1, tool: step.tool, ok: result.success, message: result.message })
      if (!result.success) {
        failedAt = index + 1
        if (!continueOnError) break
      }
    }

    const lines = results.map(
      (item) => `${item.index}. ${item.tool} ${item.ok ? '✓' : '✗'}\n   ${item.message.slice(0, 300)}`
    )
    const header =
      failedAt === null
        ? `workflow 完成（${results.length}/${steps.length} 步）`
        : `workflow 在第 ${failedAt} 步失败（已执行 ${results.length}/${steps.length} 步）`
    return {
      success: failedAt === null,
      message: `${header}\n${lines.join('\n')}`,
      ...(failedAt === null ? {} : { error: 'ESTEPFAILED' }),
      data: { results, failedAt }
    }
  }

  return {
    id: 'system.workflow',
    description:
      '按顺序执行一组工具步骤（一次调用跑完固定流程，确定性、省往返）。'
      + `steps: [{tool, params}]，最多 ${WORKFLOW_MAX_STEPS} 步；每步经审批门（SYSTEM 会再确认）；`
      + '默认遇错停止，continue_on_error=true 继续。禁止嵌套 workflow。',
    version: '0.1.0',
    parametersSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['run'], description: '操作类型: run=执行步骤' },
        steps: {
          type: 'array',
          description: '步骤列表，每步 { tool, params? }',
          items: {
            type: 'object',
            properties: {
              tool: { type: 'string', description: '工具 id（如 system.file_ops）' },
              params: { type: 'object', description: '该步参数' }
            },
            required: ['tool']
          }
        },
        continue_on_error: { type: 'boolean', description: '遇错是否继续（默认 false）' }
      },
      required: ['action', 'steps']
    },
    tags: ['system', 'workflow'],
    execute: run
  }
}
