/**
 * `system.ceshu` 内置技能（对应 Python `core/agent/skills/ceshu_skill.py` 的**只读子集**）。
 *
 * A1-1 只实现「读策划书」：`list` / `get`。
 * **未移植**（属 A1-5 业务接线范畴）：`create` / `update` / `delete` / `export` / `import`
 * 以及全部 `ai_*` 动作 —— 它们已在 `shared/ceshuAi.ts` / `shared/ceshuDataGen.ts` 以纯函数存在，
 * A1-5 只需把它们「注册进协议」，不搬家（见 `docs/a-tier-plan.md` §2.5）。
 */

import type { SkillExecutionContext, SkillProtocol, SkillResult } from '../../../shared/agent/protocol'
import type { CeshuManager } from '../../ceshu/manager'

const ACTIONS = ['list', 'get'] as const

export function createCeshuSkill(deps: { ceshuManager: CeshuManager }): SkillProtocol {
  const { ceshuManager } = deps

  function fail(error: string): SkillResult {
    return { success: false, error, message: '' }
  }

  /** 空名回退「未命名」（与首页卡片一致） */
  function withFallback(gameName: string): string {
    return gameName === '' ? '未命名' : gameName
  }

  function listCeshu(params: Record<string, unknown>): SkillResult {
    const rawKeyword = params.keyword
    const keyword = typeof rawKeyword === 'string' ? rawKeyword.trim().toLowerCase() : ''
    const all = ceshuManager.list()
    const matched =
      keyword === ''
        ? all
        : all.filter((summary) => withFallback(summary.gameName).toLowerCase().includes(keyword))
    return {
      success: true,
      message:
        keyword === ''
          ? `共 ${matched.length} 份策划书`
          : `找到 ${matched.length} 份匹配「${rawKeyword as string}」的策划书`,
      data: matched
    }
  }

  function getCeshu(params: Record<string, unknown>): SkillResult {
    const id = typeof params.ceshu_id === 'string' ? params.ceshu_id.trim() : ''
    if (id === '') return fail('缺少 ceshu_id 参数')
    try {
      const doc = ceshuManager.get(id)
      const name = typeof doc.meta.game_name === 'string' ? withFallback(doc.meta.game_name) : '未命名'
      return {
        success: true,
        message: `已获取策划书「${name}」（${doc.version_label}）`,
        data: doc
      }
    } catch (error) {
      return fail(error instanceof Error ? error.message : String(error))
    }
  }

  function run(params: Record<string, unknown>, _ctx: SkillExecutionContext): SkillResult {
    const action = typeof params.action === 'string' ? params.action : ''
    switch (action) {
      case 'list':
        return listCeshu(params)
      case 'get':
        return getCeshu(params)
      default:
        return fail(`未知动作: ${action}`)
    }
  }

  return {
    id: 'system.ceshu',
    description: '策划书管理（只读）: list=列表, get=获取策划书详情。',
    version: '1.0.0',
    parametersSchema: {
      type: 'object',
      properties: {
        action: {
          type: 'string',
          enum: ACTIONS,
          description: '操作类型: list=列出全部策划书, get=按 ceshu_id 获取详情'
        },
        ceshu_id: { type: 'string', description: '策划书 ID（get 时必填）' },
        keyword: { type: 'string', description: '按名称过滤的关键词（list 时使用）' }
      },
      required: ['action']
    },
    execute: run
  }
}
