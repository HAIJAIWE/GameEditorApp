/**
 * `tool.rollback_ai_changes` 内置技能（E3-2）：撤销**当前会话**里 AI 造成的全部数据改动。
 *
 * 为什么做成技能而不是新 UI：能力经现有数字员工面板的对话即可触达（无需再做按钮/面板），
 * 且复用 A1-4b 已打通的 **confirm 交互**——破坏性动作必须用户明确确认，未确认一律不执行。
 *
 * 回滚范围（本刀）：**单次对话轮次**（一次 chat 调用内的全部数据变更）。
 * 跨轮次的会话级回滚需要会话 id 持久化，属后续工作；此处取最小爆炸半径，宁小勿大。
 */

import { executeRollbackPlan, type RollbackPort } from '../store/operationLogStore'
import type { OperationLogStore } from '../store/operationLogStore'
import type { SkillExecutionContext, SkillProtocol, SkillResult } from '@mobai/shared/agent/config'

/** 回滚所需的最小数据端口（从 `DataService` 取，便于单测注入替身） */
export interface RollbackDataPort {
  deleteItem: (id: string) => Promise<boolean>
  updateItem: (id: string, data: Record<string, unknown>) => Promise<unknown>
  /** 按原 id 写回（`importRecords` 为 upsert，可恢复被删条目） */
  importRecords: (records: Array<{ id: string; type: string; data: Record<string, unknown> }>) => Promise<unknown>
}

export interface RollbackSkillDeps {
  operationLog: OperationLogStore
  dataService: RollbackDataPort
}

export function createRollbackSkill(deps: RollbackSkillDeps): SkillProtocol {
  const port: RollbackPort = {
    removeItem: (id) => deps.dataService.deleteItem(id),
    updateItem: (id, data) => deps.dataService.updateItem(id, data),
    insertItem: async ({ id, type, data }) => {
      // 快照里为定位回滚目标而带了 id，写回时需从 data 里剔除（id 由参数单独承载）
      const { id: _ignored, ...payload } = data
      return deps.dataService.importRecords([{ id, type, data: payload }])
    }
  }

  function run(params: Record<string, unknown>, ctx: SkillExecutionContext): SkillResult | Promise<SkillResult> {
    const action = typeof params['action'] === 'string' ? params['action'] : 'rollback'
    if (action !== 'rollback') {
      return { success: false, error: `未知动作: ${action}`, message: '' }
    }

    const explicit = typeof params['session_id'] === 'string' ? params['session_id'].trim() : ''
    const fromContext = typeof ctx.sessionId === 'string' ? ctx.sessionId.trim() : ''
    const sessionId = explicit !== '' ? explicit : fromContext
    if (sessionId === '') {
      return { success: false, error: '没有可回滚的会话（缺少 session_id）', message: '' }
    }

    const plan = deps.operationLog.planRollback(sessionId)
    if (plan.steps.length === 0 && plan.skipped.length === 0) {
      return { success: true, message: '本次对话没有可回滚的数据改动', data: { count: 0 } }
    }

    if (params['confirm'] !== true) {
      const skipNote = plan.skipped.length > 0 ? `，另有 ${plan.skipped.length} 项无法恢复` : ''
      const prompt = `确认撤销本次对话的全部数据改动（${plan.steps.length} 项${skipNote}）？此操作不可撤销。`
      return {
        success: false,
        message: '',
        error: `[WARN] ${prompt}`,
        interaction: { kind: 'confirm', prompt }
      }
    }

    return rollback(sessionId)
  }

  async function rollback(sessionId: string): Promise<SkillResult> {
    const plan = deps.operationLog.planRollback(sessionId)
    const outcome = await executeRollbackPlan(plan, port)
    // 回滚后清除该会话记录，避免重复回滚把数据又改一遍
    deps.operationLog.clearConversation(sessionId)

    const parts = [`已撤销 ${outcome.count} 项数据改动`]
    if (outcome.errors.length > 0) parts.push(`${outcome.errors.length} 项失败：${outcome.errors.join('；')}`)
    if (outcome.skipped.length > 0) {
      parts.push(`${outcome.skipped.length} 项跳过：${outcome.skipped.map((item) => `${item.itemName}（${item.reason}）`).join('；')}`)
    }
    const hasProblem = outcome.errors.length > 0 || outcome.skipped.length > 0
    return {
      success: !hasProblem,
      message: parts.join('。'),
      data: outcome,
      ...(hasProblem ? { error: parts.join('。') } : {})
    }
  }

  return {
    id: 'tool.rollback_ai_changes',
    description: '撤销本次对话里 AI 对数据表做的全部改动（需用户确认）。',
    version: '1.0.0',
    parametersSchema: {
      type: 'object',
      properties: {
        action: { type: 'string', enum: ['rollback'], description: '操作类型: rollback=撤销' },
        session_id: { type: 'string', description: '要撤销的会话 id（缺省用当前会话）' },
        confirm: { type: 'boolean', description: '确认标记（由系统在用户确认后置为 true）' }
      },
      required: ['action']
    },
    execute: run
  }
}
