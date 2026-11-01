/**
 * `system.present_plan` 内置技能（对齐 dsh `plan-mode` 的 `exit_plan_mode` 审阅流）。
 *
 * 目的：让智能体在**动手前**把完整计划交给用户审阅，避免「直接开干、方向跑偏」。
 *
 * 语义（对照 dsh）：
 * - dsh 在 plan 模式进入时注入 `plan:policy` 只读提示段，并用 `exit_plan_mode` 工具把完整
 *   markdown 计划交给 `user-questions` 走 AskUserQuestion 审阅（approve / keep planning）。
 * - 我们用一个**按需审阅技能**替代：不引入会话级「只读 plan 模式」开关（产品已有独立的
 *   Plan 工作模式，再做一套会冲突），而是让模型在关键节点主动调用 `present_plan` 求批准。
 * - 计划正文通过 `SkillInteraction.detail` 传给渲染层（等宽块展示，不解析为富文本），
 *   对齐 dsh `user-questions` 的 `detail` 字段。
 *
 * 与 dsh 的差异：dsh 的批准会改变会话投影状态（退出 plan 模式）；我们这里批准后只是把
 * 「用户回答：批准并执行」作为工具结果回灌，模型据此开始执行——审阅是**轻量门禁**而非
 * 会话状态机。这符合产品「计划是建议/门禁」而非「强制只读」的定位。
 */

import type { SkillProtocol, SkillResult } from '../../../shared/agent/config'

/** 选项：批准后立即执行 / 需要修改（模型据此修订后再次 present_plan） */
const OPTIONS = [
  { label: '批准并执行' },
  { label: '需要修改' }
] as const

/** dsh 同款校验：计划必须是非空 markdown，且以 `# 标题` 起头（否则拒绝提交审阅） */
function validatePlan(raw: unknown): string {
  if (typeof raw !== 'string') {
    throw new Error('plan 必须是字符串（完整计划的 markdown）')
  }
  const plan = raw.trim()
  if (plan === '') {
    throw new Error('plan 不能为空')
  }
  if (!/^#\s+\S/.test(plan)) {
    throw new Error('plan 必须以 `# 标题` 起头（如 `# 重构登录流程`）')
  }
  return plan
}

export function createPresentPlanSkill(): SkillProtocol {
  return {
    id: 'system.present_plan',
    description:
      '在动手前把完整计划提交用户审阅。plan 必须是 `# 标题` 起头的 markdown。'
      + '用户「批准并执行」后请立即开始按计划执行；「需要修改」会把反馈写回，请据此修订后再次 present_plan。',
    version: '0.1.0',
    parametersSchema: {
      type: 'object',
      properties: {
        plan: {
          type: 'string',
          description: '完整计划（markdown），以 # 标题起头'
        }
      },
      required: ['plan']
    },
    tags: ['system', 'planning'],
    execute(params): SkillResult {
      let plan: string
      try {
        plan = validatePlan(params.plan)
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error)
        return { success: false, message: `present_plan 校验失败：${message}`, error: message }
      }
      return {
        success: true,
        message: '',
        data: null,
        interaction: {
          kind: 'question',
          prompt: '请审阅以下计划。批准后将按计划开始执行；如需修改请选择「需要修改」并给出反馈。',
          detail: plan,
          options: OPTIONS.map((option) => ({ label: option.label }))
        }
      }
    }
  }
}
